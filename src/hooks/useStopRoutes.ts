import { useState, useEffect } from 'react';

export interface StopRoute {
  no: string;
  id: string;
  cityCode: string;
}

// Module-level cache: loaded once, reused across all hook instances
let cache: Record<string, StopRoute[]> | null = null;
let loadingPromise: Promise<Record<string, StopRoute[]>> | null = null;

async function loadStopRoutes(): Promise<Record<string, StopRoute[]>> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch('./data/stop-routes.json')
    .then(r => r.json())
    .then(data => {
      cache = data;
      return data;
    })
    .catch(err => {
      loadingPromise = null;
      console.warn('useStopRoutes: failed to load stop-routes.json', err);
      return {};
    });

  return loadingPromise;
}

export function useStopRoutes(stopId: string | null): { routes: StopRoute[]; loading: boolean } {
  const [routes, setRoutes] = useState<StopRoute[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stopId) {
      setRoutes([]);
      return;
    }

    // If already cached, resolve synchronously
    if (cache) {
      setRoutes(cache[stopId] ?? []);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadStopRoutes().then(data => {
      if (!cancelled) {
        setRoutes(data[stopId] ?? []);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [stopId]);

  return { routes, loading };
}
