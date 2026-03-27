/* ─── Premium API Client with TTL Caching ────────────────────────────────── */

type CacheItem<T> = {
    data: T;
    timestamp: number;
};

const CACHE_TTL = 30 * 1000; // 30 seconds default TTL
const cache = new Map<string, CacheItem<any>>();

/**
 * Enhanced fetch with caching and error handling
 */
export async function fetchWithCache<T>(url: string, ttl: number = CACHE_TTL): Promise<T | null> {
    const now = Date.now();
    const cached = cache.get(url);

    if (cached && (now - cached.timestamp < ttl)) {
        console.log(`[Cache Hit] ${url.substring(0, 50)}...`);
        return cached.data;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        
        const data = await response.json();
        cache.set(url, { data, timestamp: now });
        return data;
    } catch (error) {
        console.error(`[API Fetch Failed] ${url}:`, error);
        return null;
    }
}

/**
 * Standardized Transit Data URLs
 */
export const API_ENDPOINTS = {
    SUBWAY_POSITION: (key: string, line: string) => 
        `https://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeSubwayPosition/1/100/${encodeURIComponent(line)}`,
    
    SUBWAY_ARRIVAL: (key: string, station: string) => 
        `https://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeStationArrival/0/20/${encodeURIComponent(station)}`,
    
    SUBWAY_SCHEDULE: (key: string, stationCode: string, dayTag: string, direction: string) =>
        `https://swopenapi.seoul.go.kr/api/subway/${key}/json/SearchSTNTimeTableByIDService/1/500/${stationCode}/${dayTag}/${direction}`,

    TAGO_BUS_ARRIVAL: (key: string, cityCode: string, nodeId: string) =>
        `https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearnBusList?serviceKey=${key}&cityCode=${cityCode}&nodeId=${nodeId}&_type=json`
};
