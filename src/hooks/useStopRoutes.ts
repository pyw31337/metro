import { useState, useEffect } from 'react';
import { MetropolitanBusService } from '@/services/busApi';

export interface StopRoute {
  no: string;
  id: string;
  cityCode: string;
}

// Per-shard module-level caches
const shardCache: Record<string, Record<string, StopRoute[]> | null> = {
  '11': null, '23': null, gg: null, etc: null,
};
const shardLoading: Record<string, Promise<Record<string, StopRoute[]>> | null> = {
  '11': null, '23': null, gg: null, etc: null,
};

function shardKey(cityCode: string | null | undefined): string {
  if (!cityCode) return 'etc';
  if (cityCode === '11') return '11';
  if (cityCode === '23') return '23';
  if (cityCode.startsWith('31')) return 'gg';
  return 'etc';
}

const SHARD_FILES: Record<string, string> = {
  '11': './data/stop-routes-11.json',
  '23': './data/stop-routes-23.json',
  gg:   './data/stop-routes-gg.json',
  etc:  './data/stop-routes-etc.json',
};

async function loadShard(key: string): Promise<Record<string, StopRoute[]>> {
  if (shardCache[key]) return shardCache[key]!;
  if (shardLoading[key]) return shardLoading[key]!;

  shardLoading[key] = fetch(SHARD_FILES[key])
    .then(r => r.json())
    .then(data => {
      shardCache[key] = data;
      return data as Record<string, StopRoute[]>;
    })
    .catch(err => {
      shardLoading[key] = null;
      console.warn(`useStopRoutes: failed to load shard ${key}`, err);
      shardCache[key] = {};
      return {} as Record<string, StopRoute[]>;
    });

  return shardLoading[key]!;
}

// Module-level cache for Seoul live API results
const seoulCache: Record<string, StopRoute[] | null> = {};

export function useStopRoutes(stopId: string | null, cityCode?: string | null): { routes: StopRoute[]; loading: boolean } {
  const [routes, setRoutes] = useState<StopRoute[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stopId) {
      setRoutes([]);
      return;
    }

    let cancelled = false;
    const key = shardKey(cityCode);

    const resolve = async () => {
      // Seoul: try live API first (getRouteByStation), fall back to static shard
      if (cityCode === '11') {
        if (seoulCache[stopId] !== undefined) {
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

        // API returned nothing — fall through to static shard
        seoulCache[stopId] = null;
      }

      // Static shard (non-Seoul, or Seoul API fallback)
      if (shardCache[key]) {
        if (!cancelled) { setRoutes(shardCache[key]![stopId] ?? []); setLoading(false); }
        return;
      }

      if (cityCode !== '11') setLoading(true);

      loadShard(key).then(data => {
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
