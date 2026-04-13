import { useState, useEffect } from 'react';
import { MetropolitanBusService, BusArrivalItem } from '@/services/busApi';

// 모듈 레벨 캐시 — 30초 TTL, 팝업 재오픈 시 즉시 표시
const CACHE_TTL = 30_000;
const cache = new Map<string, { data: BusArrivalItem[]; ts: number }>();

export function useBusArrivals(stopId: string | null, cityCode: string | null) {
  const [arrivals, setArrivals] = useState<BusArrivalItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stopId || !cityCode) {
      setArrivals([]);
      return;
    }

    const cacheKey = `${cityCode}:${stopId}`;
    let cancelled = false;

    const doFetch = async (background: boolean) => {
      if (!background) setLoading(true);
      try {
        const data = await MetropolitanBusService.fetchArrivals(stopId, cityCode);
        cache.set(cacheKey, { data, ts: Date.now() });
        if (!cancelled) setArrivals(data.sort((a, b) => a.arrivalTime - b.arrivalTime));
      } catch {
        // 실패해도 캐시 데이터 유지
      } finally {
        if (!cancelled && !background) setLoading(false);
      }
    };

    // 캐시 히트 → 즉시 표시 (로딩 없음), 스테일이면 백그라운드 갱신
    const hit = cache.get(cacheKey);
    if (hit) {
      setArrivals(hit.data.sort((a, b) => a.arrivalTime - b.arrivalTime));
      if (Date.now() - hit.ts > CACHE_TTL) doFetch(true);
    } else {
      doFetch(false); // 첫 조회만 로딩 표시
    }

    // 25초 주기 백그라운드 갱신 (30초 TTL보다 짧게)
    const iv = setInterval(() => doFetch(true), 25_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [stopId, cityCode]);

  return { arrivals, loading };
}
