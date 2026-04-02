import { BusStop } from "@/types/metro";

export interface BusPathResult {
    commonRoutes: string[];
    startStop: BusStop;
    endStop: BusStop;
    distanceWeight: number; // For UI consistency
}

/**
 * Finds direct bus routes between two stops.
 */
export const findBusPath = (startName: string, endName: string, busStops: BusStop[]): BusPathResult | null => {
    // 1. Find the stops (Names might contain line info, so normalize)
    const normalize = (s: string) => s.split(' : ').pop()?.replace(/\(.*\)/g, '').trim().split(' ')[0] || s;
    const nStart = normalize(startName);
    const nEnd = normalize(endName);

    const startStop = busStops.find(s => s.name === nStart || s.name.includes(nStart));
    const endStop = busStops.find(s => s.name === nEnd || s.name.includes(nEnd));

    if (!startStop || !endStop) return null;

    // 2. Intersect routes
    const startRoutes = new Set(startStop.routes);
    const commonRoutes = endStop.routes.filter(r => startRoutes.has(r));

    if (commonRoutes.length === 0) return null;

    // 3. Simple weight (Euclidean distance for now)
    const dist = Math.sqrt(
        Math.pow(startStop.lat - endStop.lat, 2) + 
        Math.pow(startStop.lng - endStop.lng, 2)
    ) * 111; // Approx km

    return {
        commonRoutes,
        startStop,
        endStop,
        distanceWeight: dist * 3 // Approx 3 mins per km in traffic
    };
};
