"use client";

import { useState, useEffect } from "react";

export interface StationExitData {
  line: string;
  stinCd: string;
  exits: Record<string, string[]>; // exitNo → facility names
}

// Module-level cache
let exitsData: Record<string, StationExitData> | null = null;
let loadingPromise: Promise<Record<string, StationExitData>> | null = null;

async function loadExits(): Promise<Record<string, StationExitData>> {
  if (exitsData) return exitsData;
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch("./data/station-exits.json")
    .then(r => r.json())
    .then(d => { exitsData = d; return d; })
    .catch(() => { loadingPromise = null; exitsData = {}; return {}; });
  return loadingPromise;
}

export function useStationExits(stationName: string | null): StationExitData | null {
  const [exits, setExits] = useState<StationExitData | null>(null);

  useEffect(() => {
    if (!stationName) { setExits(null); return; }
    if (exitsData) { setExits(exitsData[stationName] ?? null); return; }
    let cancelled = false;
    loadExits().then(data => {
      if (!cancelled) setExits(data[stationName] ?? null);
    });
    return () => { cancelled = true; };
  }, [stationName]);

  return exits;
}
