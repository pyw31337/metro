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

// 실시간 지하철 API 호출은 키 풀·오류 분류·프록시 체인을 갖춘
// '@/services/seoulApi' 의 callSeoulSubway 를 사용한다. (인증키는 소스에 두지 않음)
