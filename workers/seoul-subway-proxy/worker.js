/**
 * metro 전용 서울 실시간 지하철 프록시 (Cloudflare Worker)
 *
 * 왜 필요한가
 *  - swopenapi.seoul.go.kr 는 http 전용 + CORS 헤더 없음 → GitHub Pages(https)에서 직접 호출 불가
 *  - 인증키는 이 Worker 의 secret 에만 둔다 (클라이언트 번들에 넣지 않음)
 *  - URL 별로 짧게(기본 12초) 캐시해서 모든 사용자가 같은 호출을 공유 → 일일 호출 한도 절약
 *
 * 요청 형식 (앱의 NEXT_PUBLIC_SUBWAY_PROXY_URL 뒤에 붙는 경로)
 *   GET /KEY/json/realtimePosition/0/150/2호선
 *   GET /KEY/json/realtimeStationArrival/0/40/강남
 *   첫 세그먼트(KEY)는 무시하고 secret 의 키로 교체한다. 이 두 서비스 외에는 거부(열린 프록시 아님).
 *   GET /health → 상태 확인 (키 노출 없음)
 *
 * secret
 *   SEOUL_API_KEY   : 기본 키 (필수)
 *   SEOUL_API_KEYS  : (선택) 쉼표로 구분한 예비 키 — 기본 키가 한도 초과(ERROR-337)/키 오류일 때 순서대로 사용
 *
 * vars (wrangler.toml)
 *   ALLOWED_ORIGINS   : 허용할 Origin (쉼표 구분). http://localhost:* / 127.0.0.1:* 는 개발용으로 항상 허용
 *   CACHE_TTL_SECONDS : 캐시 시간 (초)
 *   RATE_LIMIT_PER_MIN: IP 당 분당 요청 수 (isolate 단위의 느슨한 제한)
 */
const ALLOWED_SERVICES = new Set(['realtimePosition', 'realtimeStationArrival']);
const UPSTREAM = 'http://swopenapi.seoul.go.kr/api/subway';
const UPSTREAM_TIMEOUT_MS = 8000;

// isolate 메모리 캐시 (Cache API 보조) 와 간단한 IP 레이트 리밋
const memCache = new Map();   // key → { exp, body, status }
const hits = new Map();       // ip → { windowStart, count }
const exhausted = new Map();  // key index → until(ms)

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://pyw31337.github.io').split(',').map(s => s.trim()).filter(Boolean);
    const originOk = !origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk && origin ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Expose-Headers': 'X-Proxy-Cache, X-Proxy-Colo',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const colo = request.cf?.colo || '';
    const base = { ...cors, 'X-Proxy-Colo': colo };

    if (!originOk) return json({ status: 403, code: 'PROXY-ORIGIN', message: 'origin not allowed' }, 403, base);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: base });
    if (request.method !== 'GET') return json({ status: 405, code: 'PROXY-METHOD', message: 'method not allowed' }, 405, base);

    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/') {
      return json({ ok: true, colo, hasKey: Boolean(env.SEOUL_API_KEY), backupKeys: splitKeys(env.SEOUL_API_KEYS).length }, 200, base);
    }

    // 느슨한 IP 레이트 리밋 (isolate 단위)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const limit = Number(env.RATE_LIMIT_PER_MIN || 240);
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now - h.windowStart > 60_000) hits.set(ip, { windowStart: now, count: 1 });
    else if (++h.count > limit) return json({ status: 429, code: 'PROXY-RATE', message: 'too many requests' }, 429, { ...base, 'Retry-After': '30' });
    if (hits.size > 5000) hits.clear();

    // 경로 검증: ['', KEY, 'json', service, start, end, name]
    const parts = url.pathname.split('/');
    const [, , type, service, start, end, ...rest] = parts;
    const name = rest.join('/');
    if (type !== 'json' || !ALLOWED_SERVICES.has(service) || !/^\d{1,4}$/.test(start || '') || !/^\d{1,4}$/.test(end || '')
        || Number(end) < Number(start) || Number(end) - Number(start) > 200 || !name || rest.length !== 1 || name.length > 120) {
      return json({ status: 400, code: 'PROXY-BADREQ', message: 'unsupported path' }, 400, base);
    }

    const keys = [env.SEOUL_API_KEY, ...splitKeys(env.SEOUL_API_KEYS)].filter(Boolean);
    if (keys.length === 0) return json({ status: 500, code: 'PROXY-NOKEY', message: 'SEOUL_API_KEY secret is not set' }, 500, base);

    const ttl = Math.max(1, Number(env.CACHE_TTL_SECONDS || 12));
    const cacheId = `${service}/${start}/${end}/${name}`; // 키는 캐시 키에 넣지 않는다
    const cacheKey = new Request(`https://seoul-subway-proxy.cache/${cacheId}`);

    // 1) isolate 메모리 캐시
    const m = memCache.get(cacheId);
    if (m && m.exp > now) return respond(m.body, m.status, base, ttl, 'HIT-MEM');
    // 2) Cache API (같은 colo 의 다른 isolate 와 공유)
    try {
      const hit = await caches.default.match(cacheKey);
      if (hit) {
        const body = await hit.text();
        memCache.set(cacheId, { exp: now + ttl * 1000, body, status: hit.status });
        return respond(body, hit.status, base, ttl, 'HIT');
      }
    } catch { /* Cache API 미지원 환경 */ }

    // 3) 원본 호출 — 한도 초과/키 오류면 예비 키로 넘어간다
    let body = '', status = 502, code = '';
    for (let i = 0; i < keys.length; i++) {
      const until = exhausted.get(i);
      if (until && until > now && i < keys.length - 1) continue;
      const upstream = `${UPSTREAM}/${encodeURIComponent(keys[i])}/json/${service}/${start}/${end}/${name}`;
      try {
        const r = await fetch(upstream, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
        body = await r.text();
        status = r.status;
      } catch (e) {
        return json({ status: 502, code: 'PROXY-UPSTREAM', message: `upstream fetch failed (${e && e.name || 'error'})`, colo }, 502, base);
      }
      code = extractCode(body);
      if (code === 'ERROR-337') { exhausted.set(i, nextMidnightKst()); continue; } // 일일 한도 초과
      if (code === 'INFO-100') { exhausted.set(i, now + 6 * 3600_000); continue; }  // 키 오류
      break;
    }
    if (!/^\s*[{[]/.test(body)) {
      // 서울시가 HTML/XML 오류 페이지를 준 경우 (키가 들어간 내용이 있을 수 있어 그대로 넘기지 않는다)
      return json({ status: 502, code: 'PROXY-UPSTREAM-FORMAT', message: `unexpected upstream response (HTTP ${status})`, colo }, 502, base);
    }

    // 정상/데이터 없음만 캐시 (한도 초과·키 오류는 캐시하지 않고 그대로 전달)
    if (status === 200 && (code === 'INFO-000' || code === 'INFO-200')) {
      memCache.set(cacheId, { exp: now + ttl * 1000, body, status });
      if (memCache.size > 500) memCache.clear();
      ctx.waitUntil(caches.default.put(cacheKey, new Response(body, {
        status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` },
      })).catch(() => {}));
    }
    return respond(body, status, base, ttl, 'MISS');
  },
};

function respond(body, status, headers, ttl, cacheState) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${Math.min(ttl, 10)}`, ...headers, 'X-Proxy-Cache': cacheState },
  });
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

function splitKeys(v) {
  return String(v || '').split(',').map(s => s.trim()).filter(Boolean);
}

function extractCode(body) {
  const m = /"code"\s*:\s*"([A-Z]+-\d+)"/.exec(body);
  return m ? m[1] : '';
}

function nextMidnightKst() {
  const kst = new Date(Date.now() + 9 * 3600_000);
  kst.setUTCHours(24, 0, 0, 0);
  return kst.getTime() - 9 * 3600_000;
}
