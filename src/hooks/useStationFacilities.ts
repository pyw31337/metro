"use client";

import { useState, useEffect } from "react";

export interface StationFacilityItem {
  name?: string;
  stnFloor?: string;
  direction?: string;
  entrance?: string;
  detail?: string;
  serial?: string;
  status?: string;
  floor?: string;
  info?: string;
  wheelcha?: boolean;
  inside?: boolean;
  bank?: string;
  hours?: string;
  exit?: string;
  count?: number;
  id?: string;
}

export interface StationFacilities {
  stnNm: string;
  lineNm: string;
  stnNo: string;
  elevator: StationFacilityItem[];
  escalator: StationFacilityItem[];
  restroom: StationFacilityItem[];
  atm: StationFacilityItem[];
  nursery: StationFacilityItem[];
  locker: StationFacilityItem[];
}

// Merged facilities across all stnCds for a station name
export interface MergedFacilities {
  elevator: StationFacilityItem[];
  escalator: StationFacilityItem[];
  restroom: StationFacilityItem[];
  atm: StationFacilityItem[];
  nursery: StationFacilityItem[];
  locker: StationFacilityItem[];
}

type FacilitiesData = Record<string, StationFacilities>;

// Module-level cache
let facilitiesData: FacilitiesData | null = null;
let facilitiesLoading: Promise<FacilitiesData> | null = null;
// Name → stnCd list reverse index
let nameIndex: Record<string, string[]> | null = null;

async function loadFacilities(): Promise<FacilitiesData> {
  if (facilitiesData) return facilitiesData;
  if (facilitiesLoading) return facilitiesLoading;
  facilitiesLoading = fetch('./data/station-facilities.json')
    .then(r => r.json())
    .then((d: FacilitiesData) => {
      facilitiesData = d;
      // Build name index
      nameIndex = {};
      for (const [stnCd, stn] of Object.entries(d)) {
        const nm = stn.stnNm;
        if (!nameIndex[nm]) nameIndex[nm] = [];
        nameIndex[nm].push(stnCd);
      }
      return d;
    })
    .catch(() => {
      facilitiesLoading = null;
      facilitiesData = {};
      nameIndex = {};
      return {} as FacilitiesData;
    });
  return facilitiesLoading;
}

function mergeFor(data: FacilitiesData, stnCds: string[]): MergedFacilities {
  const merged: MergedFacilities = { elevator: [], escalator: [], restroom: [], atm: [], nursery: [], locker: [] };
  for (const stnCd of stnCds) {
    const stn = data[stnCd];
    if (!stn) continue;
    for (const key of ['elevator','escalator','restroom','atm','nursery','locker'] as const) {
      merged[key].push(...(stn[key] || []));
    }
  }
  return merged;
}

export function useStationFacilities(stationName: string | null) {
  const [facilities, setFacilities] = useState<MergedFacilities | null>(null);

  useEffect(() => {
    if (!stationName) { setFacilities(null); return; }
    let cancelled = false;
    loadFacilities().then(data => {
      if (cancelled) return;
      const stnCds = nameIndex?.[stationName] || [];
      if (!stnCds.length) { setFacilities(null); return; }
      setFacilities(mergeFor(data, stnCds));
    });
    return () => { cancelled = true; };
  }, [stationName]);

  return facilities;
}
