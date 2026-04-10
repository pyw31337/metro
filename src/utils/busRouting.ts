import { BusStop } from "@/types/metro";

/** 노선 번호 기반 색상 분류 (서울 간선/지선/광역/야간 기준) */
export const getBusRouteStyle = (r: string): { bg: string; text: string } => {
    if (/^N/i.test(r)) return { bg: '#1d2b55', text: '#93c5fd' };   // 야간
    if (/^M/i.test(r)) return { bg: '#7c0000', text: '#fca5a5' };   // 광역급행
    const num = parseInt(r.replace(/\D/g, ''));
    if (!isNaN(num) && num > 0) {
        if (num >= 9000) return { bg: '#d97706', text: '#fff' };     // 공항/특수
        if (num >= 5000) return { bg: '#dc2626', text: '#fff' };     // 광역
        if (num >= 1000) return { bg: '#16a34a', text: '#fff' };     // 지선
        if (num >= 100)  return { bg: '#1d4ed8', text: '#fff' };     // 간선
        return { bg: '#ca8a04', text: '#fff' };                       // 순환/마을
    }
    return { bg: '#52525b', text: '#e4e4e7' };
};

export interface BusPathResult {
    type: 'direct' | 'transfer';
    commonRoutes: string[];
    startStop: BusStop;
    endStop: BusStop;
    transferStop?: BusStop;
    transferRoutes?: string[];
    distanceWeight: number;
}

const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Finds optimized bus paths including transfers and nearby stop discovery.
 * High-fidelity implementation using spatial candidate search and optimized transfer discovery.
 */
export const findBusPath = (
    startName: string,
    endName: string,
    busStops: BusStop[],
    userLocation?: [number, number] | null   // [lat, lng] — GPS fallback for "내 위치"
): BusPathResult | null => {
    // 1. Helper to normalize input (handling "내 위치 : 강남역 (내 위치)" etc)
    const normalize = (s: string) => {
        if (!s) return "";
        let clean = s.includes(' : ') ? s.split(' : ')[1] : s;
        clean = clean.replace(/\(.*\)/g, '').trim();
        // Keep up to 4 chars for Korean station names (don't split on space aggressively)
        return clean.split(' ')[0].replace(/역$/, '');
    };

    const isMyLocation = (s: string) => s.includes('내 위치') || s.includes('(내 위치)');
    const nStart = normalize(startName);
    const nEnd = normalize(endName);

    // 2. GPS 좌표 추출 — "내 위치" 입력이면 userLocation 사용
    const getCoords = (s: string): [number, number] | null => {
        const match = s.match(/\[([\d.]+),\s*([\d.]+)\]/);
        if (match) return [parseFloat(match[1]), parseFloat(match[2])];
        if (isMyLocation(s) && userLocation) return userLocation; // [lat, lng]
        return null;
    };

    const startCoords = getCoords(startName);
    const endCoords   = getCoords(endName);

    // 3. Find candidate stops
    // We look for stops matching the name OR near the coordinates (within ~500m)
    const findCandidates = (name: string, coords: number[] | null) => {
        return busStops.filter(s => {
            if (name && (s.name === name || s.name.includes(name))) return true;
            if (coords) {
                const dist = getDistance(coords[0], coords[1], s.lat, s.lng);
                return dist < 0.5; // 500m
            }
            return false;
        }).sort((a, b) => {
            if (coords) {
                return getDistance(coords[0], coords[1], a.lat, a.lng) - getDistance(coords[0], coords[1], b.lat, b.lng);
            }
            return 0;
        }).slice(0, 10); // Take top 10 candidates
    };

    const startCandidates = findCandidates(nStart, startCoords);
    const endCandidates = findCandidates(nEnd, endCoords);

    if (startCandidates.length === 0 || endCandidates.length === 0) {
        return null;
    }

    // 4. Try DIRECT route
    let bestDirect: BusPathResult | null = null;

    for (const sStop of startCandidates) {
        for (const eStop of endCandidates) {
            const startRoutes = new Set(sStop.routes);
            const common = eStop.routes.filter(r => startRoutes.has(r));
            if (common.length > 0) {
                const dist = getDistance(sStop.lat, sStop.lng, eStop.lat, eStop.lng);
                const result = {
                    type: 'direct' as const,
                    commonRoutes: common,
                    startStop: sStop,
                    endStop: eStop,
                    distanceWeight: dist * 5
                };
                if (!bestDirect || result.distanceWeight < bestDirect.distanceWeight) {
                    bestDirect = result;
                }
            }
        }
    }
    if (bestDirect) return bestDirect;

    // 5. Try 1-TRANSFER route (Optimized)
    // We map all routes from start candidates and all routes from end candidates
    const startRouteMap = new Map<string, BusStop>(); 
    startCandidates.forEach(s => s.routes.forEach(r => { if(!startRouteMap.has(r)) startRouteMap.set(r, s); }));

    const endRouteMap = new Map<string, BusStop>();
    endCandidates.forEach(e => e.routes.forEach(r => { if(!endRouteMap.has(r)) endRouteMap.set(r, e); }));

    const startRoutes = Array.from(startRouteMap.keys());
    const endRoutes = Array.from(endRouteMap.keys());

    // Search for any stop that has both a route from startRoutes and a route from endRoutes
    let bestTransfer: BusPathResult | null = null;

    // To prevent massive loops, we only check stops that belong to candidate routes
    // But since we don't have a route->stop index here, we iterate over stops.
    // Optimization: Only check stops that have AT LEAST ONE route from startRoutes AND endRoutes
    for (const tStop of busStops) {
        const tRoutes = new Set(tStop.routes);
        
        let foundStartRoute: string | null = null;
        for (const r of startRoutes) { if (tRoutes.has(r)) { foundStartRoute = r; break; } }
        if (!foundStartRoute) continue;

        let foundEndRoute: string | null = null;
        for (const r of endRoutes) { if (tRoutes.has(r)) { foundEndRoute = r; break; } }
        if (!foundEndRoute) continue;

        // Validation: Ensure they aren't the same route (that would be direct)
        if (foundStartRoute === foundEndRoute) continue;

        const sStop = startRouteMap.get(foundStartRoute)!;
        const eStop = endRouteMap.get(foundEndRoute)!;
        
        const dist = getDistance(sStop.lat, sStop.lng, tStop.lat, tStop.lng) + 
                     getDistance(tStop.lat, tStop.lng, eStop.lat, eStop.lng);
        
        const weight = dist * 6 + 10; // Extra penalty for transfer

        if (!bestTransfer || weight < bestTransfer.distanceWeight) {
            bestTransfer = {
                type: 'transfer',
                commonRoutes: [foundStartRoute],
                transferRoutes: [foundEndRoute],
                startStop: sStop,
                transferStop: tStop,
                endStop: eStop,
                distanceWeight: weight
            };
        }
        
        // If we found a very good transfer (< 5km total), we can stop early to save time
        if (bestTransfer && bestTransfer.distanceWeight < 30) break;
    }

    return bestTransfer;
};
