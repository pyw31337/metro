"use client";

import { useEffect, useState } from "react";

import { transitRealtimeService, type RealtimeUnit } from "@/services/TransitRealtimeService";
import { buildRealtimeCoverage, type RealtimeCoverageSnapshot } from "@/utils/realtimeCoverage";

const REALTIME_COVERAGE_EVENT = "metro:realtime-coverage";

declare global {
  interface Window {
    __METRO_REALTIME_COVERAGE__?: RealtimeCoverageSnapshot;
  }
}

function getSubwayUnits(units: RealtimeUnit[]) {
  return units.filter((unit) => unit.type === "subway");
}

function withActiveLine(snapshot: RealtimeCoverageSnapshot, activeLine?: string | null): RealtimeCoverageSnapshot {
  return {
    ...snapshot,
    activeLineSource: activeLine ? snapshot.lines[activeLine] ?? null : null,
  };
}

export function useRealtimeCoverage(activeLine?: string | null): RealtimeCoverageSnapshot {
  const [snapshot, setSnapshot] = useState(() =>
    withActiveLine(
      typeof window !== "undefined" && window.__METRO_REALTIME_COVERAGE__
        ? window.__METRO_REALTIME_COVERAGE__
        : buildRealtimeCoverage(getSubwayUnits(transitRealtimeService.units), activeLine),
      activeLine,
    ),
  );

  useEffect(() => {
    const handle = (units: RealtimeUnit[]) => {
      setSnapshot(withActiveLine(buildRealtimeCoverage(getSubwayUnits(units), activeLine), activeLine));
    };

    const handleWindowCoverage = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeCoverageSnapshot>).detail;
      if (!detail) return;
      setSnapshot(withActiveLine(detail, activeLine));
    };

    if (typeof window !== "undefined" && window.__METRO_REALTIME_COVERAGE__) {
      setSnapshot(withActiveLine(window.__METRO_REALTIME_COVERAGE__, activeLine));
    } else {
      handle(transitRealtimeService.units);
    }

    window.addEventListener(REALTIME_COVERAGE_EVENT, handleWindowCoverage as EventListener);
    transitRealtimeService.on("update", handle);
    return () => {
      window.removeEventListener(REALTIME_COVERAGE_EVENT, handleWindowCoverage as EventListener);
      transitRealtimeService.off("update", handle);
    };
  }, [activeLine]);

  return snapshot;
}
