"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");

const POSITION_API_KEYS = [
  process.env.SEOUL_SUBWAY_API_KEYS,
  process.env.NEXT_PUBLIC_SEOUL_API_KEY,
  "634179436a7079773730786f4d5445",
  "53517344677079773531694a786f6a",
  "434f7275707079773537687a507658",
  "sample",
]
  .flatMap((value) => String(value || "").split(","))
  .map((value) => value.trim())
  .filter(Boolean);

const CACHE = new Map();
const EXHAUSTED_UNTIL = new Map();
const POSITION_TTL_MS = 12_000;
const ARRIVAL_TTL_MS = 6_000;
const ALERTS_TTL_MS = 60_000;
const SEOUL_SUBWAY_BASE = "https://swopenapi.seoul.go.kr/api/subway";
const SEOUL_OPEN_DATA_BASE = "https://openapi.seoul.go.kr:443";

function getMidnightTs() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

function isKeyExhausted(key) {
  const until = EXHAUSTED_UNTIL.get(key);
  if (!until) return false;
  if (Date.now() > until) {
    EXHAUSTED_UNTIL.delete(key);
    return false;
  }
  return true;
}

function normalizeString(value, maxLength = 64) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.length > maxLength) return "";
  return trimmed;
}

function getCache(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > hit.ttl) {
    CACHE.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key, data, ttl) {
  CACHE.set(key, { data, ttl, timestamp: Date.now() });
  return data;
}

async function fetchJson(url, timeoutMs = 3500) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  try {
    return JSON.parse(text);
  } catch (error) {
    logger.warn("Realtime proxy received a non-JSON payload", { url, text: text.slice(0, 160) });
    throw new Error("non-JSON response");
  }
}

async function fetchSeoulSubway(servicePath, ttl) {
  const cached = getCache(servicePath);
  if (cached) return cached;

  const keys = [...new Set(POSITION_API_KEYS)];
  let lastError = null;

  for (const key of keys) {
    if (!key || isKeyExhausted(key)) continue;

    const url = `${SEOUL_SUBWAY_BASE}/${key}/json/${servicePath}`;

    try {
      const data = await fetchJson(url);
      if (data?.code === "ERROR-337" || data?.code === "ERROR-500" || data?.status === 500) {
        EXHAUSTED_UNTIL.set(key, getMidnightTs());
        lastError = new Error(data?.message || data?.code || "API quota exhausted");
        continue;
      }
      if (data?.errorMessage?.code === "INFO-000" || data?.errorMessage?.status === 200 || data?.RESULT?.CODE === "INFO-000") {
        return setCache(servicePath, data, ttl);
      }
      if (data?.realtimePositionList || data?.realtimeArrivalList || data?.realtimeTrainCongestionList) {
        return setCache(servicePath, data, ttl);
      }
      lastError = new Error("invalid realtime payload");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("all realtime keys failed");
}

async function fetchSeoulOpenData(servicePath, ttl) {
  const cached = getCache(`open:${servicePath}`);
  if (cached) return cached;

  const keys = [...new Set(POSITION_API_KEYS)];
  let lastError = null;

  for (const key of keys) {
    if (!key || key === "sample" || isKeyExhausted(key)) continue;

    const url = `${SEOUL_OPEN_DATA_BASE}/${key}/json/${servicePath}`;
    try {
      const data = await fetchJson(url);
      if (data?.code === "ERROR-337" || data?.code === "ERROR-500" || data?.status === 500) {
        EXHAUSTED_UNTIL.set(key, getMidnightTs());
        lastError = new Error(data?.message || data?.code || "OpenData quota exhausted");
        continue;
      }
      return setCache(`open:${servicePath}`, data, ttl);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("all opendata keys failed");
}

async function routeRealtimeRequest(reqPath, reqQuery) {
  if (reqPath.endsWith("/position")) {
    const lineName = normalizeString(reqQuery.lineName, 32);
    if (!lineName) return { status: 400, data: { error: "lineName is required" } };
    return {
      status: 200,
      data: await fetchSeoulSubway(`realtimePosition/0/100/${encodeURIComponent(lineName)}`, POSITION_TTL_MS),
    };
  }

  if (reqPath.endsWith("/arrivals") || reqPath.endsWith("/probe")) {
    const stationName = normalizeString(reqQuery.stationName, 48);
    if (!stationName) return { status: 400, data: { error: "stationName is required" } };
    return {
      status: 200,
      data: await fetchSeoulSubway(`realtimeStationArrival/1/50/${encodeURIComponent(stationName)}`, ARRIVAL_TTL_MS),
    };
  }

  if (reqPath.endsWith("/alerts")) {
    return {
      status: 200,
      data: await fetchSeoulOpenData("CardSubwayAlertInfo/1/100/", ALERTS_TTL_MS),
    };
  }

  return { status: 404, data: { error: "Unsupported realtime path" } };
}

exports.realtimeProxy = onRequest(
  {
    region: "asia-northeast3",
    cors: true,
    memory: "256MiB",
    timeoutSeconds: 20,
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const result = await routeRealtimeRequest(req.path, req.query);
      res.set("Cache-Control", "public, max-age=3, s-maxage=12");
      res.status(result.status).json(result.data);
    } catch (error) {
      logger.error("Realtime proxy request failed", {
        path: req.path,
        message: error instanceof Error ? error.message : String(error),
      });
      res.status(502).json({
        error: "Realtime upstream unavailable",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);
