import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchStationArrivals } from '@/services/arrivalApi';
import type { PathResult, StationArrival } from '@/types/metro';

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────
export interface RouteSegmentArrival {
  /** 탑승 역명 */
  boardStation: string;
  /** 하차 역명 */
  alightStation: string;
  /** 노선명 */
  line: string;
  /** direction: '1'=하행/외선, '0'=상행/내선 */
  direction: '0' | '1';
  /** 이 구간 방향의 다음 열차 목록 (최대 3편) */
  trains: StationArrival[];
  /** 로딩 중 여부 */
  loading: boolean;
  /** 마지막 fetch 시각 */
  fetchedAt: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 방향 매칭 헬퍼
// '1' = 하행/외선순환, '0' = 상행/내선순환
// ─────────────────────────────────────────────────────────────────────────────
function directionMatches(updnLine: string, direction: '0' | '1'): boolean {
  const u = updnLine.trim();
  if (direction === '1') {
    // 하행, 외선순환, 숫자 '1'
    return u.includes('하') || u.includes('외') || u === '1';
  } else {
    // 상행, 내선순환, 숫자 '0'
    return u.includes('상') || u.includes('내') || u === '0';
  }
}

function lineMatches(arrLineName: string, segLine: string): boolean {
  if (!arrLineName || !segLine) return false;
  if (arrLineName === segLine) return true;
  // 부분 일치: "수인분당선" ↔ "수인·분당선" 등 변형 처리
  const a = arrLineName.replace(/[·\s]/g, '').replace('호선', '');
  const b = segLine.replace(/[·\s]/g, '').replace('호선', '');
  return a === b || a.includes(b) || b.includes(a);
}

// ─────────────────────────────────────────────────────────────────────────────
// 훅: PathResult.segments → 탑승역별 실시간 도착 정보
// ─────────────────────────────────────────────────────────────────────────────
const REFRESH_INTERVAL_MS = 30_000;

export function useRouteArrivals(activePath: PathResult | null): RouteSegmentArrival[] {
  const [results, setResults] = useState<RouteSegmentArrival[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef  = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const buildInitial = useCallback((path: PathResult): RouteSegmentArrival[] => {
    const segs = path.segments ?? [];
    return segs.map(seg => ({
      boardStation:  seg.stations[0],
      alightStation: seg.stations[seg.stations.length - 1],
      line:          seg.line,
      direction:     seg.direction,
      trains:        [],
      loading:       true,
      fetchedAt:     null,
    }));
  }, []);

  const fetchAll = useCallback(async (path: PathResult) => {
    const segs = path.segments ?? [];
    if (segs.length === 0) return;

    // 각 탑승역을 병렬 fetch
    const fetched = await Promise.allSettled(
      segs.map(seg => fetchStationArrivals(seg.stations[0]))
    );

    if (!mountedRef.current) return;

    setResults(prev => {
      const next = [...prev];
      segs.forEach((seg, i) => {
        const result = fetched[i];
        const all: StationArrival[] = result.status === 'fulfilled' ? result.value : [];

        // 노선 + 방향 필터
        const filtered = all
          .filter(a =>
            lineMatches(a.lineName, seg.line) &&
            directionMatches(a.updnLine, seg.direction)
          )
          .sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt))
          .slice(0, 3);

        const existing = next[i];
        if (existing) {
          next[i] = {
            ...existing,
            trains:    filtered,
            loading:   false,
            fetchedAt: Date.now(),
          };
        }
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!activePath?.segments?.length) {
      setResults([]);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    // 초기 스켈레톤 세팅 → 즉시 fetch
    setResults(buildInitial(activePath));
    fetchAll(activePath);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchAll(activePath), REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [activePath, buildInitial, fetchAll]);

  return results;
}
