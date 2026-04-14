import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchStationArrivals } from '@/services/arrivalApi';
import { normStation } from '@/data/stationRegistry';
import type { PathResult, StationArrival } from '@/types/metro';

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────
export type ServiceStatus = 'running' | 'not-started' | 'ended' | 'no-data';

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
  /** 실시간 API 실패 시 시간표 기반 운행 상태 */
  serviceStatus: ServiceStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// 시간표 인덱스 캐시 (subway-schedule-index.json)
// ─────────────────────────────────────────────────────────────────────────────
let _scheduleIndexPromise: Promise<Record<string, any>> | null = null;

function loadScheduleIndex(): Promise<Record<string, any>> {
  if (!_scheduleIndexPromise) {
    _scheduleIndexPromise = fetch('/data/subway-schedule-index.json')
      .then(r => r.json())
      .catch(() => ({}));
  }
  return _scheduleIndexPromise;
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 현재 시각이 운행 시간 내인지 확인. last가 24시 이후이면 자정 연장 운행 처리. */
function checkServiceStatus(
  schedEntry: Record<string, { first: string; last: string }>,
): ServiceStatus {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // 자정~오전 2시는 전날 운행이 연장된 것으로 봄 (예: 24:38 = 1478분)
  const nowNorm = nowMin < 120 ? nowMin + 24 * 60 : nowMin;

  let anyRunning = false;
  let allNotStarted = true;
  let allEnded = true;

  for (const { first, last } of Object.values(schedEntry)) {
    const firstMin = parseTimeToMinutes(first);
    const lastMin  = parseTimeToMinutes(last);
    if (nowNorm >= firstMin && nowNorm <= lastMin) { anyRunning = true; break; }
    if (nowMin >= firstMin) allNotStarted = false;
    if (nowNorm <= lastMin) allEnded = false;
  }

  if (anyRunning) return 'running';
  if (allNotStarted) return 'not-started';
  if (allEnded) return 'ended';
  return 'running'; // 사이 공백 시간대 → 운행 중으로 간주
}

async function getServiceStatus(station: string, line: string): Promise<ServiceStatus> {
  try {
    const index = await loadScheduleIndex();
    // Schedule index uses bare station name (no line disambiguation like "(5호선)")
    const bareStation = normStation(station);
    const entry = index[`${bareStation}__${line}`] ?? index[`${station}__${line}`];
    if (!entry) return 'no-data';

    const now = new Date();
    const dayType = now.getDay() === 0 ? 'sun' : now.getDay() === 6 ? 'sat' : 'week';
    const schedule: Record<string, { first: string; last: string }> =
      entry[dayType] ?? entry.week ?? {};
    if (Object.keys(schedule).length === 0) return 'no-data';
    return checkServiceStatus(schedule);
  } catch {
    return 'no-data';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 방향 매칭 헬퍼
// ─────────────────────────────────────────────────────────────────────────────
function directionMatches(updnLine: string, direction: '0' | '1'): boolean {
  const u = updnLine.trim();
  if (direction === '1') {
    return u.includes('하') || u.includes('외') || u === '1';
  } else {
    return u.includes('상') || u.includes('내') || u === '0';
  }
}

function lineMatches(arrLineName: string, segLine: string): boolean {
  if (!arrLineName || !segLine) return false;
  if (arrLineName === segLine) return true;
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

  // 앱 시작 시 시간표 인덱스 미리 로드
  useEffect(() => { loadScheduleIndex(); }, []);

  const buildInitial = useCallback((path: PathResult): RouteSegmentArrival[] => {
    const segs = path.segments ?? [];
    return segs.map(seg => ({
      boardStation:  normStation(seg.stations[0]),
      alightStation: normStation(seg.stations[seg.stations.length - 1]),
      line:          seg.line,
      direction:     seg.direction,
      trains:        [],
      loading:       true,
      fetchedAt:     null,
      serviceStatus: 'no-data' as ServiceStatus,
    }));
  }, []);

  const fetchAll = useCallback(async (path: PathResult) => {
    const segs = path.segments ?? [];
    if (segs.length === 0) return;

    const fetched = await Promise.allSettled(
      segs.map(seg => fetchStationArrivals(normStation(seg.stations[0])))
    );

    if (!mountedRef.current) return;

    // 실시간 결과 + 시간표 폴백 병렬 처리
    const updates = await Promise.all(
      segs.map(async (seg, i) => {
        const result = fetched[i];
        const all: StationArrival[] = result.status === 'fulfilled' ? result.value : [];

        const filtered = all
          .filter(a =>
            lineMatches(a.lineName, seg.line) &&
            directionMatches(a.updnLine, seg.direction)
          )
          .sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt))
          .slice(0, 3);

        // 실시간 열차가 없으면 시간표 기반 운행 상태 조회
        const serviceStatus: ServiceStatus = filtered.length > 0
          ? 'running'
          : await getServiceStatus(seg.stations[0], seg.line);

        return { index: i, filtered, serviceStatus };
      })
    );

    if (!mountedRef.current) return;

    setResults(prev => {
      const next = [...prev];
      updates.forEach(({ index, filtered, serviceStatus }) => {
        const existing = next[index];
        if (existing) {
          next[index] = {
            ...existing,
            trains:        filtered,
            loading:       false,
            fetchedAt:     Date.now(),
            serviceStatus,
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
