import type {
  ArrivalDataSource,
  DataConfidence,
  StationArrival,
} from "@/types/metro";

export const ARRIVAL_SOURCE_PRIORITY: Record<ArrivalDataSource, number> = {
  live: 6,
  "arrival-probe": 5,
  "full-timetable": 4,
  "db-schedule": 3,
  "schedule-index": 2,
  static: 1,
};

const CONFIDENCE_PRIORITY: Record<DataConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function getArrivalSource(arrival: StationArrival): ArrivalDataSource {
  if (arrival.source) return arrival.source;
  return arrival.isScheduled ? "static" : "live";
}

export function getArrivalConfidence(arrival: StationArrival): DataConfidence {
  if (arrival.confidence) return arrival.confidence;
  return getArrivalSource(arrival) === "live" ? "high" : "low";
}

export function isRealtimeArrival(arrival: StationArrival): boolean {
  const source = getArrivalSource(arrival);
  return source === "live" || source === "arrival-probe";
}

export function scoreArrivalSet(arrivals: StationArrival[]): number {
  if (arrivals.length === 0) return -1;

  const bestSource = Math.max(
    ...arrivals.map((arrival) => ARRIVAL_SOURCE_PRIORITY[getArrivalSource(arrival)] ?? 0)
  );
  const bestConfidence = Math.max(
    ...arrivals.map((arrival) => CONFIDENCE_PRIORITY[getArrivalConfidence(arrival)] ?? 0)
  );
  const validCount = arrivals.filter(
    (arrival) =>
      arrival.arvlCd === "1" ||
      arrival.arvlCd === "0" ||
      (parseInt(arrival.barvlDt || "0", 10) || 0) > 0
  ).length;

  return bestSource * 100 + bestConfidence * 10 + Math.min(validCount, 9);
}

export function getArrivalBadge(arrival: StationArrival): {
  label: string;
  className: string;
} {
  const source = getArrivalSource(arrival);
  const confidence = getArrivalConfidence(arrival);

  if (source === "live") {
    return {
      label: confidence === "low" ? "LIVE 지연" : "LIVE",
      className:
        confidence === "low"
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
    };
  }

  if (source === "arrival-probe") {
    return {
      label: "실시간 추정",
      className:
        "bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30",
    };
  }

  if (source === "full-timetable") {
    return {
      label: "정확한 시각표",
      className:
        "bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-500/30",
    };
  }

  if (source === "db-schedule") {
    return {
      label: "로컬 시각표",
      className:
        "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border border-zinc-500/30",
    };
  }

  if (source === "schedule-index") {
    return {
      label: "운행 패턴",
      className:
        "bg-orange-500/15 text-orange-600 dark:text-orange-300 border border-orange-500/30",
    };
  }

  return {
    label: "기본 추정",
    className:
      "bg-zinc-400/15 text-zinc-500 dark:text-zinc-400 border border-zinc-400/20",
  };
}

export function getArrivalMetaText(arrival: StationArrival): string {
  const source = getArrivalSource(arrival);
  const ageSeconds = arrival.ageSeconds;

  if (source === "live") {
    if (typeof ageSeconds === "number") {
      if (ageSeconds >= 60) return `${Math.floor(ageSeconds / 60)}분 전 수신`;
      if (ageSeconds > 5) return `${ageSeconds}초 전 수신`;
      return "방금 수신";
    }
    return "실시간 위치 기반";
  }

  if (source === "arrival-probe") return "도착 API 기반 위치 추정";
  if (source === "full-timetable") return "열차별 시각표 기준";
  if (source === "db-schedule") return "저장된 시간표 기준";
  if (source === "schedule-index") return "첫차/막차/배차 패턴 기반";
  return "배차 주기 기반 추정";
}
