import { useState, useEffect } from 'react';
import { MetropolitanBusService } from '@/services/busApi';

export interface StopRoute {
  no: string;
  id: string;
  cityCode: string;
}

// ─── 샤드 캐시 (모듈 레벨, 첫 로드 후 영구 메모리) ──────────────────────────
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
      console.warn(`useStopRoutes: shard load failed (${key})`, err);
      shardCache[key] = {};
      return {} as Record<string, StopRoute[]>;
    });
  return shardLoading[key]!;
}

// ─── 서울 라이브 API 결과 캐시 ─────────────────────────────────────────────
const seoulCache: Record<string, StopRoute[] | null> = {};

// ─── 앱 시작 2초 후 모든 샤드 선제 로드 ────────────────────────────────────
// 첫 번째 버스 정류장 팝업 오픈 시 즉시 응답하기 위해
if (typeof window !== 'undefined') {
  setTimeout(() => {
    Object.keys(SHARD_FILES).forEach(k => {
      if (!shardLoading[k] && shardCache[k] === null) loadShard(k);
    });
  }, 2000);
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
    const key = shardKey(cityCode);

    const run = async () => {
      // ── 경로 1: 서울 라이브 캐시 히트 → 즉시 반환 (0ms) ──────────────────
      if (cityCode === '11' && seoulCache[stopId] !== undefined) {
        if (!cancelled) setRoutes(seoulCache[stopId] ?? []);
        return;
      }

      // ── 경로 2: 정적 샤드 이미 메모리에 있음 → 즉시 반환 (~0ms) ──────────
      if (shardCache[key] !== null) {
        if (!cancelled) setRoutes(shardCache[key]![stopId] ?? []);
        // 서울: 백그라운드에서 라이브 갱신 (로딩 표시 없이)
        if (cityCode === '11') {
          MetropolitanBusService.fetchSeoulRoutesByStation(stopId)
            .then(live => {
              seoulCache[stopId] = live.length > 0 ? live : null;
              if (!cancelled && live.length > 0) setRoutes(live);
            })
            .catch(() => { seoulCache[stopId] = null; });
        }
        return;
      }

      // ── 경로 3: 콜드 스타트 — 샤드 미로드 ────────────────────────────────
      // 서울: 샤드 로드 + 라이브 API 동시 시작, 먼저 도착한 것 표시
      setLoading(true);

      if (cityCode === '11') {
        let liveReceived = false;

        // 라이브 API 병렬 시작 (await 안 함 — 백그라운드)
        MetropolitanBusService.fetchSeoulRoutesByStation(stopId)
          .then(live => {
            seoulCache[stopId] = live.length > 0 ? live : null;
            if (!cancelled && live.length > 0) {
              liveReceived = true;
              setRoutes(live);
              setLoading(false);
            }
          })
          .catch(() => { seoulCache[stopId] = null; });

        // 샤드가 보통 훨씬 빠름 (~200ms vs 1-5s) — 먼저 로드되면 즉시 표시
        const shard = await loadShard(key);
        if (!cancelled && !liveReceived) {
          setRoutes(shard[stopId] ?? []);
          setLoading(false);
        }
      } else {
        // 비서울: 정적 샤드만 사용
        const shard = await loadShard(key);
        if (!cancelled) {
          setRoutes(shard[stopId] ?? []);
          setLoading(false);
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [stopId, cityCode]);

  return { routes, loading };
}
