import { useState, useEffect, useRef, useCallback } from 'react';
import { StationArrival } from '@/types/metro';
import { fetchStationArrivals, getScheduledArrivalsFromDB, getArrivalsFromScheduleIndex, getArrivalsFromFullTimetable } from '@/services/arrivalApi';
import { getEstimatedArrivalsFromStatic } from '@/data/static-timetables';
import { normalizeStationName } from '@/utils/stationUtils';
import { isRealtimeArrival, scoreArrivalSet } from '@/utils/arrivalTrust';

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
  const requestSeqRef = useRef(0);

  const fetchData = useCallback(async (name: string) => {
    if (!mountedRef.current) return;
    const cleanName = normalizeStationName(name);
    const requestId = ++requestSeqRef.current;
    let bestScore = -1;

    setLoading(true);
    setError(null);
    setSchedules({});

    const applyCandidate = (candidate: StationArrival[]) => {
      if (!mountedRef.current || requestSeqRef.current !== requestId || candidate.length === 0) return;

      const candidateScore = scoreArrivalSet(candidate);
      if (candidateScore < bestScore) return;
      bestScore = candidateScore;

      setArrivals(candidate);
      const hasRealtime = candidate.some(isRealtimeArrival);
      setIsLive(hasRealtime);
      if (hasRealtime) setLastUpdated(Date.now());
    };

    const staticArrivals = getEstimatedArrivalsFromStatic(cleanName);
    applyCandidate(staticArrivals);

    const livePromise = fetchStationArrivals(cleanName).catch(() => []);
    const fullPromise = getArrivalsFromFullTimetable(cleanName).catch(() => []);
    const indexedPromise = getArrivalsFromScheduleIndex(cleanName).catch(() => []);
    const scheduledPromise = getScheduledArrivalsFromDB(cleanName).catch(() => []);

    fullPromise.then(applyCandidate);
    indexedPromise.then(applyCandidate);
    livePromise.then(applyCandidate);
    scheduledPromise.then((scheduled) => {
      applyCandidate(scheduled.slice(0, 6));
      if (!mountedRef.current || requestSeqRef.current !== requestId || scheduled.length === 0) return;
      const lineScheds: Record<string, ScheduleInfo> = {};
      scheduled.forEach((arrival) => {
        if (arrival.lineName && !lineScheds[arrival.lineName]) {
          lineScheds[arrival.lineName] = { firstTrain: '05:30', lastTrain: '23:50' };
        }
      });
      setSchedules(lineScheds);
    });

    try {
      const [live, fullTt, indexed, scheduled] = await Promise.all([
        livePromise,
        fullPromise,
        indexedPromise,
        scheduledPromise,
      ]);

      if (!mountedRef.current || requestSeqRef.current !== requestId) return;

      if (
        live.length === 0 &&
        fullTt.length === 0 &&
        indexed.length === 0 &&
        scheduled.length === 0 &&
        staticArrivals.length === 0
      ) {
        setArrivals([]);
        setError('운행 정보가 없습니다.');
      }
    } catch (err) {
      if (!mountedRef.current || requestSeqRef.current !== requestId) return;
      if (staticArrivals.length === 0) {
        setError('데이터를 불러오는 데 실패했습니다.');
      }
      console.error('[useArrivalInfo] fetch error:', err);
    } finally {
      if (mountedRef.current && requestSeqRef.current === requestId) setLoading(false);
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
