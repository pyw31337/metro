import { useState, useEffect, useRef, useCallback } from 'react';
import { StationArrival } from '@/types/metro';
import { fetchStationArrivals, getScheduledArrivalsFromDB } from '@/services/arrivalApi';
import { normalizeStationName } from '@/utils/stationUtils';

export interface ScheduleInfo {
  firstTrain: string;
  lastTrain: string;
}

export interface ArrivalState {
  arrivals:     StationArrival[];
  schedules:    Record<string, ScheduleInfo>;
  loading:      boolean;
  isLive:       boolean;          // 실시간 데이터 수신 여부
  lastUpdated:  number | null;    // Date.now()
  error:        string | null;
  refresh:      () => void;       // 수동 새로고침
}

const REFRESH_INTERVAL_MS = 30_000; // 30초 자동 갱신

export function useArrivalInfo(stationName: string | null): ArrivalState {
  const [arrivals,    setArrivals]    = useState<StationArrival[]>([]);
  const [schedules,   setSchedules]   = useState<Record<string, ScheduleInfo>>({});
  const [loading,     setLoading]     = useState(false);
  const [isLive,      setIsLive]      = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef  = useRef(true);

  const fetchData = useCallback(async (name: string) => {
    if (!mountedRef.current) return;
    const cleanName = normalizeStationName(name);
    setLoading(true);
    setError(null);

    try {
      // 1. 즉시 예정 데이터 표시 (로컬 DB)
      const scheduled = await getScheduledArrivalsFromDB(cleanName);

      if (scheduled.length > 0 && mountedRef.current) {
        // 첫 렌더 — 예정 데이터로 우선 표시
        setArrivals(scheduled.slice(0, 6).map(a => ({ ...a, isScheduled: true })));
        setIsLive(false);

        const lineScheds: Record<string, ScheduleInfo> = {};
        scheduled.forEach(s => {
          if (s.lineName && !lineScheds[s.lineName]) {
            lineScheds[s.lineName] = { firstTrain: '05:30', lastTrain: '23:50' };
          }
        });
        setSchedules(lineScheds);
      }

      // 2. 실시간 데이터 병렬 fetch
      const live = await fetchStationArrivals(cleanName);

      if (!mountedRef.current) return;

      if (live.length > 0) {
        setArrivals(live);
        setIsLive(true);
        setLastUpdated(Date.now());
      } else if (scheduled.length === 0) {
        setArrivals([]);
        setError('운행 정보가 없습니다.');
      }
      // live가 비어있고 scheduled는 있으면 → 예정 유지 (already set above)
    } catch (err) {
      if (!mountedRef.current) return;
      setError('데이터를 불러오는 데 실패했습니다.');
      console.error('[useArrivalInfo] fetch error:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // 역 바뀌면 초기화
    setArrivals([]);
    setSchedules({});
    setIsLive(false);
    setLastUpdated(null);
    setError(null);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!stationName) return;

    fetchData(stationName);

    intervalRef.current = setInterval(() => {
      fetchData(stationName);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [stationName, fetchData]);

  const refresh = useCallback(() => {
    if (stationName) fetchData(stationName);
  }, [stationName, fetchData]);

  return { arrivals, schedules, loading, isLive, lastUpdated, error, refresh };
}
