import type { RealtimeUnit } from "@/services/TransitRealtimeService";

export type RealtimeLineState = "live" | "estimated" | "simulated";

export interface RealtimeLineCoverage {
  lineName: string;
  state: RealtimeLineState;
  label: string;
  freshness: string;
}

export interface RealtimeCoverageSnapshot {
  liveLines: number;
  estimatedLines: number;
  simulatedLines: number;
  totalLines: number;
  lines: Record<string, RealtimeLineCoverage>;
  activeLineSource: RealtimeLineCoverage | null;
}

const EMPTY_SNAPSHOT: RealtimeCoverageSnapshot = {
  liveLines: 0,
  estimatedLines: 0,
  simulatedLines: 0,
  totalLines: 0,
  lines: {},
  activeLineSource: null,
};

function formatFreshness(ageSeconds: number | undefined, fallback: string): string {
  if (typeof ageSeconds !== "number" || !Number.isFinite(ageSeconds)) {
    return fallback;
  }

  if (ageSeconds <= 5) return "방금 수신";
  if (ageSeconds < 60) return `${ageSeconds}초 전`;
  return `${Math.floor(ageSeconds / 60)}분 전`;
}

function getLineCandidate(unit: RealtimeUnit): RealtimeLineCoverage & { rank: number; ageRank: number } {
  if (!unit.isSimulated && unit.dataSource === "live-position") {
    return {
      lineName: unit.lineName,
      state: "live",
      label: unit.confidence === "low" ? "실측 위치(지연)" : "실측 위치",
      freshness: formatFreshness(unit.ageSeconds, "방금 수신"),
      rank: 3,
      ageRank: typeof unit.ageSeconds === "number" ? unit.ageSeconds : -1,
    };
  }

  if (!unit.isSimulated && (unit.dataSource === "arrival-probe" || unit.isEstimatedRealtime)) {
    return {
      lineName: unit.lineName,
      state: "estimated",
      label: "실시간 추정",
      freshness: formatFreshness(unit.ageSeconds, "도착 API 기준"),
      rank: 2,
      ageRank: typeof unit.ageSeconds === "number" ? unit.ageSeconds : Number.MAX_SAFE_INTEGER,
    };
  }

  return {
    lineName: unit.lineName,
    state: "simulated",
    label: "시뮬레이션",
    freshness: "실측 데이터 없음",
    rank: 1,
    ageRank: Number.MAX_SAFE_INTEGER,
  };
}

export function buildRealtimeCoverage(
  units: RealtimeUnit[],
  activeLine?: string | null,
): RealtimeCoverageSnapshot {
  if (units.length === 0) return EMPTY_SNAPSHOT;

  const bestByLine = new Map<string, RealtimeLineCoverage & { rank: number; ageRank: number }>();

  units.forEach((unit) => {
    if (unit.type !== "subway") return;

    const candidate = getLineCandidate(unit);
    const current = bestByLine.get(unit.lineName);

    if (
      !current ||
      candidate.rank > current.rank ||
      (candidate.rank === current.rank && candidate.ageRank < current.ageRank)
    ) {
      bestByLine.set(unit.lineName, candidate);
    }
  });

  const lines = Object.fromEntries(
    Array.from(bestByLine.entries()).map(([lineName, coverage]) => [
      lineName,
      {
        lineName,
        state: coverage.state,
        label: coverage.label,
        freshness: coverage.freshness,
      } satisfies RealtimeLineCoverage,
    ]),
  );

  const values = Object.values(lines);

  return {
    liveLines: values.filter((value) => value.state === "live").length,
    estimatedLines: values.filter((value) => value.state === "estimated").length,
    simulatedLines: values.filter((value) => value.state === "simulated").length,
    totalLines: values.length,
    lines,
    activeLineSource: activeLine ? lines[activeLine] ?? null : null,
  };
}

export function getRealtimeCoverageTone(state?: RealtimeLineState | null) {
  if (state === "live") {
    return {
      shortLabel: "LIVE",
      badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      dotClass: "bg-emerald-500",
    };
  }

  if (state === "estimated") {
    return {
      shortLabel: "추정",
      badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      dotClass: "bg-sky-500",
    };
  }

  return {
    shortLabel: "SIM",
    badgeClass: "bg-zinc-900/10 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
    dotClass: "bg-zinc-400",
  };
}
