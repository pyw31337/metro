/**
 * Seoul realtime subway proxy (Cloudflare Worker, optional)
 *
 * 왜 필요한가
 *  - swopenapi.seoul.go.kr 는 http 전용 + CORS 헤더 없음 → GitHub Pages(https)에서 직접 호출 불가
 *  - 정적 번들에 넣은 NEXT_PUBLIC_* 키는 누구나 볼 수 있음 → 키를 이 Worker 의 secret 으로만 보관
 *  - 짧은 edge 캐시(기본 15초)로 일일 호출 한도(실시간 API 1,000회/일) 소모를 줄임
 *
 * 요청 형식 (앱의 NEXT_PUBLIC_SUBWAY_PROXY_URL 뒤에 붙는 경로)
 *   GET /KEY/json/realtimePosition/0/150/2호선
 *   GET /KEY/json/realtimeStationArrival/0/40/강남
 *   첫 세그먼트(KEY)는 무시하고 env.SEOUL_API_KEY 로 교체한다.
 *
 * 배포
 *   npx wrangler deploy
 *   npx wrangler secret put SEOUL_API_KEY
 *   (선택) wrangler.toml 의 ALLOWED_ORIGINS 수정
 */
const ALLOWED_SERVICES = new Set(['realtimePosition', 'realtimeStationArrival']);

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://pyw31337.github.io')
      .split(',').map(s => s.trim()).filter(Boolean);
    const allowOrigin = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
    if (!env.SEOUL_API_KEY) return json({ status: 500, code: 'PROXY-NOKEY', message: 'SEOUL_API_KEY secret is not set' }, 500, cors);

    const url = new URL(request.url);
    // ['', KEY, 'json', service, start, end, ...rest]
    const parts = url.pathname.split('/');
    const [, , type, service, start, end, ...rest] = parts;
    if (type !== 'json' || !ALLOWED_SERVICES.has(service) || !/^\d+$/.test(start || '') || !/^\d+$/.test(end || '') || Number(end) - Number(start) > 200) {
      return json({ status: 400, code: 'PROXY-BADREQ', message: 'unsupported path' }, 400, cors);
    }

    const upstream = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(env.SEOUL_API_KEY)}/json/${service}/${start}/${end}/${rest.join('/')}`;
    const ttl = Number(env.CACHE_TTL_SECONDS || 15);

    // 캐시 키에는 키를 넣지 않는다
    const cacheKey = new Request(`https://cache.local/${service}/${start}/${end}/${rest.join('/')}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) {
      const res = new Response(hit.body, hit);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      res.headers.set('X-Proxy-Cache', 'HIT');
      return res;
    }

    let upstreamRes;
    try {
      upstreamRes = await fetch(upstream, { headers: { Accept: 'application/json' } });
    } catch (e) {
      return json({ status: 502, code: 'PROXY-UPSTREAM', message: String(e) }, 502, cors);
    }
    const body = await upstreamRes.text();
    const res = new Response(body, {
      status: upstreamRes.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}`, ...cors },
    });
    // 정상 응답만 캐시 (한도 초과/키 오류는 캐시하지 않음)
    if (upstreamRes.ok && /"INFO-000"/.test(body)) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
