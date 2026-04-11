"use client";

import { useState, useEffect } from "react";
import { MetropolitanBusService } from "@/services/busApi";

export interface BusRouteInfo {
  no: string;
  startName: string;
  endName: string;
  firstBus: string;    // "05:00"
  lastBus: string;     // "23:30"
  headwayPeak: number;  // minutes, 0 = unknown
  headwayOffPeak: number;
}

// Per-request API cache (keyed by cityCode:routeId or 11:routeId:arsId)
let apiCache: Record<string, BusRouteInfo | null> = {};

// Static route-schedules.json — loaded once, used for all non-Seoul routes
let staticCache: Record<string, Omit<BusRouteInfo, 'no' | 'headwayOffPeak'>> | null = null;
let staticLoading: Promise<typeof staticCache> | null = null;

async function loadStaticSchedules() {
  if (staticCache) return staticCache;
  if (staticLoading) return staticLoading;
  staticLoading = fetch('./data/route-schedules.json')
    .then(r => r.json())
    .then(d => { staticCache = d; return d; })
    .catch(() => { staticLoading = null; staticCache = {}; return {}; });
  return staticLoading;
}

/**
 * @param routeId  Bus route ID
 * @param cityCode City code (e.g. "11" for Seoul, "41" for Gyeonggi)
 * @param arsId    Seoul bus stop arsId — required for Seoul schedule (getBustimeByStation)
 */
export function useBusRouteInfo(routeId: string | null, cityCode: string | null, arsId?: string | null) {
  const [info, setInfo] = useState<BusRouteInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!routeId || !cityCode) { setInfo(null); return; }

    // Seoul: use getBustimeByStation (needs arsId)
    if (cityCode === "11") {
      if (!arsId) { setInfo(null); return; }
      const key = `11:${routeId}:${arsId}`;
      if (apiCache[key] !== undefined) { setInfo(apiCache[key]); return; }

      setLoading(true);
      MetropolitanBusService.fetchSeoulBustimeByStation(arsId, routeId)
        .then(data => {
          if (data) {
            const result: BusRouteInfo = {
              no: "", startName: "", endName: "",
              firstBus: data.firstBus,
              lastBus: data.lastBus,
              headwayPeak: data.headway,
              headwayOffPeak: 0,
            };
            apiCache[key] = result;
            setInfo(result);
          } else {
            apiCache[key] = null;
            setInfo(null);
          }
        })
        .catch(() => { apiCache[key] = null; setInfo(null); })
        .finally(() => setLoading(false));
      return;
    }

    // Non-Seoul: check static route-schedules.json first, then fall back to API
    const key = `${cityCode}:${routeId}`;
    if (apiCache[key] !== undefined) { setInfo(apiCache[key]); return; }

    let cancelled = false;
    setLoading(true);

    loadStaticSchedules().then(schedules => {
      if (cancelled) return;
      const s = schedules?.[routeId];
      if (s) {
        const result: BusRouteInfo = { no: "", headwayOffPeak: 0, ...s };
        apiCache[key] = result;
        setInfo(result);
        setLoading(false);
        return;
      }

      // Static miss → fall back to live API
      const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";
      if (!apiKey || apiKey === "sample") { setLoading(false); setInfo(null); return; }

      const isGBIS = cityCode === "41";
      const url = isGBIS
        ? `https://apis.data.go.kr/6410000/busrouteservice/getBusRouteInfoItem?serviceKey=${encodeURIComponent(apiKey)}&_type=json&routeId=${routeId}`
        : `https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteInfoIem?serviceKey=${encodeURIComponent(apiKey)}&_type=json&cityCode=${cityCode}&routeId=${routeId}`;

      fetch(url, { signal: AbortSignal.timeout(8000) })
        .then(r => r.json())
        .then(json => {
          if (cancelled) return;
          const item = isGBIS
            ? json?.response?.body?.busRouteInfoItem
            : json?.response?.body?.items?.item;

          if (!item) { apiCache[key] = null; setInfo(null); return; }

          const fmt = (s: string) => {
            if (!s || s.length < 4) return "";
            return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
          };

          const result: BusRouteInfo = {
            no:           String(item.routeNo || item.ROUTE_NM || ""),
            startName:    String(item.startnodenm || item.startNodeNm || item.ORIGIN_STN_NM || item.startVehicleNodeName || ""),
            endName:      String(item.endnodenm   || item.endNodeNm   || item.DEST_STN_NM   || item.endVehicleNodeName   || ""),
            firstBus:     fmt(String(item.startvehicletime || item.firstBusTm || item.START_TM || "")),
            lastBus:      fmt(String(item.endvehicletime   || item.lastBusTm  || item.END_TM  || "")),
            headwayPeak:    parseInt(item.intervaltime || item.peekAlloc || item.WEEKDAY_HH_TM || "0") || 0,
            headwayOffPeak: parseInt(item.offPeekAlloc || "0") || 0,
          };

          apiCache[key] = result;
          setInfo(result);
        })
        .catch(() => { if (!cancelled) { apiCache[key] = null; setInfo(null); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    });

    return () => { cancelled = true; };
  }, [routeId, cityCode, arsId]);

  return { info, loading };
}
