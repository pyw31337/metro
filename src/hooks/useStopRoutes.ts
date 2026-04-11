import { useState, useEffect } from 'react';
import { MetropolitanBusService } from '@/services/busApi';

export interface StopRoute {
  no: string;
  id: string;
  cityCode: string;
}

// Module-level cache for static stop-routes.json
let staticCache: Record<string, StopRoute[]> | null = null;
let staticLoadingPromise: Promise<Record<string, StopRoute[]>> | null = null;

// Module-level cache for Seoul live API results
const seoulCache: Record<string, StopRoute[] | null> = {};

async function loadStaticStopRoutes(): Promise<Record<string, StopRoute[]>> {
  if (staticCache) return staticCache;
  if (staticLoadingPromise) return staticLoadingPromise;

  staticLoadingPromise = fetch('./data/stop-routes.json')
    .then(r => r.json())
    .then(data => {
      staticCache = data;
      return data;
    })
    .catch(err => {
      staticLoadingPromise = null;
      console.warn('useStopRoutes: failed to load stop-routes.json', err);
      return {};
    });

  return staticLoadingPromise;
}

export function useStopRoutes(stopId: string | null, cityCode?: string | null): { routes: StopRoute[]; loading: boolean } {
  const [routes, setRoutes] = useState<StopRoute[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stopId) {
      setRoutes([]);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      // Seoul: try live API first (getRouteByStation), fall back to static data
      if (cityCode === "11") {
        if (seoulCache[stopId] !== undefined) {
          // Cache hit (could be [] if API returned nothing)
          if (!cancelled) setRoutes(seoulCache[stopId] ?? []);
          return;
        }

        setLoading(true);
        const liveRoutes = await MetropolitanBusService.fetchSeoulRoutesByStation(stopId);

        if (liveRoutes.length > 0) {
          seoulCache[stopId] = liveRoutes;
          if (!cancelled) { setRoutes(liveRoutes); setLoading(false); }
          return;
        }

        // API returned nothing — fall through to static data
        seoulCache[stopId] = null; // mark as tried
      }

      // Static data (non-Seoul, or Seoul fallback)
      if (staticCache) {
        if (!cancelled) { setRoutes(staticCache[stopId] ?? []); setLoading(false); }
        return;
      }

      if (cityCode !== "11") setLoading(true); // only show spinner if not already set above

      loadStaticStopRoutes().then(data => {
        if (!cancelled) {
          setRoutes(data[stopId] ?? []);
          setLoading(false);
        }
      });
    };

    resolve();
    return () => { cancelled = true; };
  }, [stopId, cityCode]);

  return { routes, loading };
}
