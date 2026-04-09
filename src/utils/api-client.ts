/* ─── Premium API Client with TTL Caching & Error Handling ───────────────── */

type CacheItem<T> = {
    data: T;
    timestamp: number;
};

const CACHE_TTL = 30 * 1000; // 30 seconds default TTL
const cache = new Map<string, CacheItem<any>>();

/**
 * Standardized API Fetcher with Caching and Fallbacks
 */
export async function fetchWithCache<T>(url: string, ttl: number = CACHE_TTL): Promise<T | null> {
    const now = Date.now();
    const cached = cache.get(url);

    if (cached && (now - cached.timestamp < ttl)) {
        console.log(`[Cache Hit] ${url.substring(0, 60)}...`);
        return cached.data;
    }

    try {
        let data: T | null = null;

        // Use fetchWithFallbacks in browser to handle CORS via proxy
        if (typeof window !== 'undefined') {
            const { fetchWithFallbacks } = await import('@/services/arrivalApi');
            data = await fetchWithFallbacks(url);
        } else {
            const response = await fetch(url);
            if (!response.ok) {
                console.debug(`[API Warning] ${url}: ${response.status}`);
                return null;
            }
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                console.debug(`[API Warning] ${url}: Expected JSON but got ${contentType}`);
                return null;
            }
            data = await response.json();
        }

        if (!data || Object.keys(data as any).length === 0) {
            console.debug(`[API Empty Response] ${url}`);
        }
        cache.set(url, { data, timestamp: now });
        return data as T;
    } catch (error: any) {
        console.debug(`[API Silenced Failure] ${url}: ${error?.message || error}`);
        return null;
    }
}

/**
 * Standardized Transit Data URLs
 */
export const API_ENDPOINTS = {
    SUBWAY_POSITION: (key: string, name: string) =>
        `https://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimePosition/0/100/${encodeURIComponent(name)}`,
    
    SUBWAY_ARRIVAL: (key: string, station: string) =>
        `https://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeStationArrival/0/20/${encodeURIComponent(station)}`,
    
    SUBWAY_CONGESTION: (key: string, subwayId: string, trainNo: string) =>
        `https://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeTrainCongestion/0/5/${subwayId}/${trainNo}`,

    TRANSFER_PLATFORM: (key: string, station: string, fromLine: string, toLine: string) =>
        `https://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeTransferPlatform/0/10/${encodeURIComponent(station)}/${encodeURIComponent(fromLine)}/${encodeURIComponent(toLine)}`,

    SUBWAY_ALERTS: (key: string) =>
        `https://openapi.seoul.go.kr:443/${key}/json/CardSubwayAlertInfo/1/100/`,

    TAGO_BUS_ARRIVAL: (key: string, cityCode: string, nodeId: string) =>
        `https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearnBusList?serviceKey=${key}&cityCode=${cityCode}&nodeId=${nodeId}&_type=json`
};

const USER_APPROVED_KEYS = [
    "634179436a7079773730786f4d5445",  // 지하철인증키 (2026/03/30) ✅
    "53517344677079773531694a786f6a",  // 지하철인증키 (2026/03/27) ✅
    "434f7275707079773537687a507658",  // 지하철인증키 (2026/03/27) ✅
];

/**
 * High-level API Handlers
 */
export const subwayApi = {
    getPositions: async (lineName: string) => {
        let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY || USER_APPROVED_KEYS[0];
        const keysToTry = Array.from(new Set([apiKey, ...USER_APPROVED_KEYS, 'sample']));
        
        for (const key of keysToTry) {
            const result = await fetchWithCache<any>(API_ENDPOINTS.SUBWAY_POSITION(key, lineName), 15000);
            if (result && (result.realtimeSubwayPositionList || result.realtimePositionList)) return result;
            // If error-338 or similar, try next key
        }
        return null;
    },
    getArrivals: async (stationName: string) => {
        let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY || USER_APPROVED_KEYS[0];
        const keysToTry = Array.from(new Set([apiKey, ...USER_APPROVED_KEYS, 'sample']));
        for (const key of keysToTry) {
            const result = await fetchWithCache<any>(API_ENDPOINTS.SUBWAY_ARRIVAL(key, stationName), 15000);
            if (result && result.realtimeArrivalList) return result;
        }
        return null;
    },
    getCongestion: async (subwayId: string, trainNo: string) => {
        const key = process.env.NEXT_PUBLIC_SEOUL_API_KEY || USER_APPROVED_KEYS[0];
        return fetchWithCache<any>(API_ENDPOINTS.SUBWAY_CONGESTION(key, subwayId, trainNo), 60000);
    },
    getTransferPlatform: async (station: string, from: string, to: string) => {
        const key = process.env.NEXT_PUBLIC_SEOUL_API_KEY || USER_APPROVED_KEYS[0];
        return fetchWithCache<any>(API_ENDPOINTS.TRANSFER_PLATFORM(key, station, from, to), 3600000);
    }
};
