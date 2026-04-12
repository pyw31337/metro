"use client";

import { useState, useEffect } from "react";

export interface StationAddress {
  road: string;
  suburb: string;
  borough: string;
  district: string;
  city: string;
  postcode: string;
}

// Module-level cache — loaded once for all hooks
let addressData: Record<string, StationAddress> | null = null;
let loadingPromise: Promise<Record<string, StationAddress>> | null = null;

async function loadAddresses(): Promise<Record<string, StationAddress>> {
  if (addressData) return addressData;
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch("./data/station-addresses.json")
    .then(r => r.json())
    .then(d => { addressData = d; return d; })
    .catch(() => { loadingPromise = null; addressData = {}; return {}; });
  return loadingPromise;
}

export function useStationAddress(stationName: string | null): StationAddress | null {
  const [address, setAddress] = useState<StationAddress | null>(null);

  useEffect(() => {
    if (!stationName) { setAddress(null); return; }
    // If already cached, resolve synchronously on next tick
    if (addressData) {
      setAddress(addressData[stationName] ?? null);
      return;
    }
    let cancelled = false;
    loadAddresses().then(data => {
      if (!cancelled) setAddress(data[stationName] ?? null);
    });
    return () => { cancelled = true; };
  }, [stationName]);

  return address;
}

/** Returns a formatted short location string like "용산구 서울" or "의정부시" */
export function formatShortAddress(addr: StationAddress | null): string {
  if (!addr) return "";
  const parts = [addr.borough || addr.district, addr.city].filter(Boolean);
  return parts.join(" · ");
}
