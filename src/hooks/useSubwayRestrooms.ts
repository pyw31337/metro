"use client";

import { useState, useEffect } from "react";

export interface RestroomEntry {
  floor: string;
  entrance: string;
  detail: string;
  info: string;
  wheelchair: boolean;
  inside: boolean;
}

export interface StationRestroomData {
  line: string;
  restrooms: RestroomEntry[];
}

// Module-level cache
let restroomData: Record<string, StationRestroomData> | null = null;
let loadingPromise: Promise<Record<string, StationRestroomData>> | null = null;

async function loadRestrooms(): Promise<Record<string, StationRestroomData>> {
  if (restroomData) return restroomData;
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch("./data/subway-restrooms.json")
    .then(r => r.json())
    .then((raw: Record<string, any>) => {
      // Deduplicate restrooms per station
      const out: Record<string, StationRestroomData> = {};
      for (const [name, station] of Object.entries(raw)) {
        const seen = new Set<string>();
        const unique: RestroomEntry[] = [];
        for (const r of (station.restrooms as RestroomEntry[])) {
          const key = `${r.floor}|${r.entrance}|${r.detail}`;
          if (!seen.has(key)) { seen.add(key); unique.push(r); }
        }
        out[name] = { line: station.line, restrooms: unique };
      }
      restroomData = out;
      return out;
    })
    .catch(() => { loadingPromise = null; restroomData = {}; return {}; });
  return loadingPromise;
}

export function useSubwayRestrooms(stationName: string | null): StationRestroomData | null {
  const [data, setData] = useState<StationRestroomData | null>(null);

  useEffect(() => {
    if (!stationName) { setData(null); return; }
    if (restroomData) { setData(restroomData[stationName] ?? null); return; }
    let cancelled = false;
    loadRestrooms().then(d => {
      if (!cancelled) setData(d[stationName] ?? null);
    });
    return () => { cancelled = true; };
  }, [stationName]);

  return data;
}
