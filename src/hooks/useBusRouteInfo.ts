"use client";

import { useState, useEffect } from "react";
import { MetropolitanBusService } from "@/services/busApi";

export interface BusRouteInfo {
  no: string;
  startName: string;
  endName: string;
  firstBus: string;    // "05:00"
  lastBus: string;     // "23:30"
  headwayPeak: number;  // minutes, 0 = unknown
  headwayOffPeak: number;
}

let cache: Record<string, BusRouteInfo | null> = {};

/**
 * @param routeId  Bus route ID
 * @param cityCode City code (e.g. "11" for Seoul, "41" for Gyeonggi)
 * @param arsId    Seoul bus stop arsId — required for Seoul schedule (getBustimeByStation)
 */
export function useBusRouteInfo(routeId: string | null, cityCode: string | null, arsId?: string | null) {
  const [info, setInfo] = useState<BusRouteInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!routeId || !cityCode) { setInfo(null); return; }

    // Seoul: use getBustimeByStation (needs arsId)
    if (cityCode === "11") {
      if (!arsId) { setInfo(null); return; }
      const key = `11:${routeId}:${arsId}`;
      if (cache[key] !== undefined) { setInfo(cache[key]); return; }

      setLoading(true);
      MetropolitanBusService.fetchSeoulBustimeByStation(arsId, routeId)
        .then(data => {
          if (data) {
            const result: BusRouteInfo = {
              no: "", startName: "", endName: "",
              firstBus: data.firstBus,
              lastBus: data.lastBus,
              headwayPeak: data.headway,
              headwayOffPeak: 0,
            };
            cache[key] = result;
            setInfo(result);
          } else {
            cache[key] = null;
            setInfo(null);
          }
        })
        .catch(() => { cache[key] = null; setInfo(null); })
        .finally(() => setLoading(false));
      return;
    }

    // Non-Seoul: use data.go.kr APIs
    const key = `${cityCode}:${routeId}`;
    if (cache[key] !== undefined) { setInfo(cache[key]); return; }

    const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";
    if (!apiKey || apiKey === "sample") { setInfo(null); return; }

    setLoading(true);

    const isGBIS = cityCode === "41";
    const url = isGBIS
      ? `https://apis.data.go.kr/6410000/busrouteservice/getBusRouteInfoItem?serviceKey=${encodeURIComponent(apiKey)}&_type=json&routeId=${routeId}`
      : `https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteInfoIem?serviceKey=${encodeURIComponent(apiKey)}&_type=json&cityCode=${cityCode}&routeId=${routeId}`;

    fetch(url, { signal: AbortSignal.timeout(8000) })
      .then(r => r.json())
      .then(json => {
        const item = isGBIS
          ? json?.response?.body?.busRouteInfoItem
          : json?.response?.body?.items?.item;

        if (!item) { cache[key] = null; setInfo(null); return; }

        // 시간 포맷: "050000" → "05:00"
        const fmt = (s: string) => {
          if (!s || s.length < 4) return "";
          return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
        };

        const result: BusRouteInfo = {
          no:           String(item.routeNo || item.ROUTE_NM || ""),
          startName:    String(item.startNodeNm || item.ORIGIN_STN_NM || item.startVehicleNodeName || ""),
          endName:      String(item.endNodeNm   || item.DEST_STN_NM   || item.endVehicleNodeName   || ""),
          firstBus:     fmt(String(item.firstBusTm  || item.START_TM || "")),
          lastBus:      fmt(String(item.lastBusTm   || item.END_TM   || "")),
          headwayPeak:    parseInt(item.peekAlloc   || item.WEEKDAY_HH_TM || "0") || 0,
          headwayOffPeak: parseInt(item.offPeekAlloc || "0") || 0,
        };

        cache[key] = result;
        setInfo(result);
      })
      .catch(() => { cache[key] = null; setInfo(null); })
      .finally(() => setLoading(false));
  }, [routeId, cityCode, arsId]);

  return { info, loading };
}
