"use client";
import { decodePolyline } from "@/utils/polyline";

/**
 * TAGO City Codes for metropolitan & regional areas
 */
export const CITY_CODES: Record<string, string> = {
  SEOUL: "11",
  INCHEON: "23",
  DAEJEON: "25",
  GYEONGGI: "41",
  GANGWON: "32",
  CHUNGBUK: "33",
  CHUNGNAM: "34",
  SEJONG: "36",
};

export type BusProvider = "SEOUL" | "GBIS" | "BIS_INCHEON" | "TAGO";

export interface BusArrivalItem {
  routeNo: string;
  routeId: string;
  arrivalTime: number; // seconds
  remainStops: number;
  plateNo: string;
  isLowFloor: boolean;
}

export class MetropolitanBusService {
  // All HTTPS — no mixed content errors
  private static SEOUL_URL = "https://ws.bus.go.kr/api/rest/";
  private static TAGO_URL = "https://apis.data.go.kr/1613000/";
  private static GBIS_URL = "https://apis.data.go.kr/6410000/";
  private static BIS_INCHEON_URL = "https://apis.data.go.kr/6280000/";

  static getProvider(cityCode: string): BusProvider {
    if (cityCode === "11") return "SEOUL";
    if (cityCode === "41") return "GBIS";
    if (cityCode === "23") return "BIS_INCHEON";
    return "TAGO";
  }

  /**
   * Fetch real-time bus arrivals for a stop by cityCode + stationId.
   */
  static async fetchArrivals(stationId: string, cityCode: string): Promise<BusArrivalItem[]> {
    const provider = this.getProvider(cityCode);
    const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";
    if (!apiKey || apiKey === "sample") return [];

    try {
      let url = "";
      switch (provider) {
        case "SEOUL":
          // Seoul Station UID based arrival
          url = `${this.SEOUL_URL}stationinfo/getStationByUid?arsId=${stationId}&serviceKey=${encodeURIComponent(apiKey)}&resultType=json`;
          break;
        case "GBIS":
          // Gyeonggi Bus Arrival (Integrated API)
          url = `${this.GBIS_URL}busarrivalservice/getBusArrivalItem?stationId=${stationId}&serviceKey=${encodeURIComponent(apiKey)}&_type=json`;
          break;
        case "TAGO":
        default:
          // National TAGO Arrival
          url = `${this.TAGO_URL}ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?cityCode=${cityCode}&nodeId=${stationId}&serviceKey=${encodeURIComponent(apiKey)}&_type=json`;
          break;
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];
      const json = await res.json();

      // ─── Seoul Parsing ───
      if (provider === "SEOUL") {
        const items = json?.ServiceResult?.msgBody?.itemList || [];
        return items.map((it: any) => ({
          routeNo: it.rtNm,
          routeId: it.busRouteId,
          arrivalTime: parseInt(it.traTime1 || "0"), // Seoul returns seconds
          remainStops: parseInt(it.traOrd1 || "0"),
          plateNo: it.plainNo1 || "",
          isLowFloor: it.busType1 === "1" || it.busType1 === "2",
        }));
      }

      // ─── Gyeonggi (GBIS) Parsing ───
      if (provider === "GBIS") {
        const items = json?.response?.body?.busArrivalItem || [];
        const arr = Array.isArray(items) ? items : [items];
        return arr.map((it: any) => ({
          routeNo: "정보없음", // GBIS arrival doesn't always include route number in this endpoint
          routeId: String(it.routeId || ""),
          arrivalTime: parseInt(it.predictTime1 || "0") * 60, // GBIS returns minutes
          remainStops: parseInt(it.locationNo1 || "0"),
          plateNo: it.plateNo1 || "",
          isLowFloor: it.lowPlate1 === "1",
        }));
      }

      // ─── TAGO (Incheon + Regional) Parsing ───
      if (provider === "TAGO") {
        const items = json?.response?.body?.items?.item || [];
        const arr = Array.isArray(items) ? items : [items];
        return arr
          .filter((it: any) => it.routeno !== undefined)
          .map((it: any) => ({
            routeNo: String(it.routeno),
            routeId: String(it.routeid),
            arrivalTime: parseInt(it.arrtime || "0"), // TAGO returns seconds
            remainStops: parseInt(it.arrprevstationcnt || "0"),
            plateNo: it.vehicletp || "",
            isLowFloor: it.vehicletp?.includes("저상") || false,
          }));
      }

      return [];
    } catch (err) {
      console.debug(`Bus arrival fetch error (${provider}):`, err);
      return [];
    }
  }

  /**
   * Fetch all stops passing through a route.
   */
  static async fetchRouteStops(cityCode: string, routeId: string): Promise<any[]> {
    const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";
    if (!apiKey || apiKey === "sample") return [];
    try {
      const url = `${this.TAGO_URL}BusRouteInfoInqireService/getRouteAcctoThrghSttnList?cityCode=${cityCode}&routeId=${routeId}&serviceKey=${encodeURIComponent(apiKey)}&_type=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];
      const json = await res.json();
      const items = json?.response?.body?.items?.item || [];
      return Array.isArray(items) ? items : [items];
    } catch {
      return [];
    }
  }

  /**
   * [NEW] Fetch route information from local master data (Offline resilience)
   */
  static async fetchLocalRouteInfo(routeId: string): Promise<any | null> {
    try {
      const res = await fetch("./data/master-bus-routes.json");
      if (!res.ok) return null;
      const routes = await res.json();
      return routes.find((r: any) => r.id === routeId) || null;
    } catch {
      return null;
    }
  }

  /**
   * [NEW] Fetch route station sequence from local master data (Offline resilience)
   */
  static async fetchLocalRouteStations(routeId: string): Promise<any[]> {
    try {
      // 1. Fetch sequence map
      const resSeq = await fetch("./data/master-route-stations.json");
      if (!resSeq.ok) return [];
      const sequenceMap = await resSeq.json();
      const sequence = sequenceMap[routeId] || [];
      if (sequence.length === 0) return [];

      // 2. Fetch master stops to get coordinates
      const resStops = await fetch("./data/master-bus-stops.json");
      if (!resStops.ok) return sequence;
      const stops = await resStops.json();
      const stopMap = new Map<string, any>();
      stops.forEach((s: any) => stopMap.set(s.id, s));

      // 3. Join
      return sequence.map((s: any) => ({
        ...s,
        ...(stopMap.get(s.id) || {})
      }));
    } catch {
      return [];
    }
  }

  /**
   * [NEW] Load route path from local sharded shards (High-fidelity, stable fallback)
   */
  static async fetchLocalRoutePath(cityCode: string, routeId: string): Promise<any | null> {
    try {
      // Load by shard (e.g. ./data/paths/bus-paths-11.json)
      const res = await fetch(`./data/paths/bus-paths-${cityCode}.json`);
      if (!res.ok) return null;
      const shard = await res.json();
      const encoded = shard[routeId];
      if (!encoded) return null;

      const coordinates = decodePolyline(encoded).map(p => [p[1], p[0]]); // [lng, lat] for GeoJSON
      return {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: { routeId, source: "local_shard" }
        }]
      };
    } catch (err) {
      console.warn(`Local shard fetch failed for ${cityCode}/${routeId}:`, err);
      return null;
    }
  }
  
  /**
   * [NEW] Fetch route path geometry from Tago API with local shard fallback
   */
  static async fetchRoutePath(cityCode: string, routeId: string): Promise<any | null> {
    // 1. Try local shard first (much faster and more reliable)
    const local = await this.fetchLocalRoutePath(cityCode, routeId);
    if (local) return local;

    // 2. Fallback to TAGO API
    const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";
    if (!apiKey || apiKey === "sample") return null;
    try {
      const url = `${this.TAGO_URL}BusRouteInfoInqireService/getRoutePath?cityCode=${cityCode}&routeId=${routeId}&serviceKey=${encodeURIComponent(apiKey)}&_type=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const json = await res.json();
      const items = json?.response?.body?.items?.item || [];
      const arr = Array.isArray(items) ? items : [items];
      
      if (arr.length === 0) return null;

      const coordinates = arr
        .map((it: any) => [parseFloat(it.gpslnt), parseFloat(it.gpslat)])
        .filter((coord: any) => !isNaN(coord[0]) && !isNaN(coord[1]));

      if (coordinates.length < 2) return null;

      return {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: { routeId, source: "tago_api" }
        }]
      };
    } catch (err) {
      console.error("Bus route path fetch error:", err);
      return null;
    }
  }

  /**
   * Fetch all routes serving a Seoul bus stop (ws.bus.go.kr getRouteByStation)
   * @param arsId Seoul bus stop ID (arsId)
   */
  static async fetchSeoulRoutesByStation(arsId: string): Promise<{ no: string; id: string; cityCode: string }[]> {
    const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";
    if (!apiKey || apiKey === "sample") return [];
    try {
      const url = `${this.SEOUL_URL}stationinfo/getRouteByStation?arsId=${arsId}&serviceKey=${encodeURIComponent(apiKey)}&resultType=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const json = await res.json();
      const headerCd = json?.ServiceResult?.msgHeader?.headerCd;
      if (headerCd !== "0") return [];
      const items: any[] = json?.ServiceResult?.msgBody?.itemList || [];
      return items
        .map((it: any) => ({ no: String(it.busRouteNm || it.rtNm || ""), id: String(it.busRouteId || ""), cityCode: "11" }))
        .filter(r => r.id && r.no);
    } catch {
      return [];
    }
  }

  /**
   * Fetch first/last bus times for a route at a Seoul stop (ws.bus.go.kr getBustimeByStation)
   * @param arsId Seoul bus stop ID
   * @param busRouteId Seoul bus route ID
   */
  static async fetchSeoulBustimeByStation(arsId: string, busRouteId: string): Promise<{ firstBus: string; lastBus: string; headway: number } | null> {
    const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";
    if (!apiKey || apiKey === "sample") return null;
    try {
      const url = `${this.SEOUL_URL}stationinfo/getBustimeByStation?arsId=${arsId}&busRouteId=${busRouteId}&serviceKey=${encodeURIComponent(apiKey)}&resultType=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const json = await res.json();
      const headerCd = json?.ServiceResult?.msgHeader?.headerCd;
      if (headerCd !== "0") return null;
      const items: any[] = json?.ServiceResult?.msgBody?.itemList || [];
      if (!items.length) return null;
      const it = items[0];
      // Seoul returns datetime string like "20230601053000" → extract HH:mm
      const fmt = (s: string) => {
        const str = String(s || "");
        if (str.length >= 12) return `${str.slice(8, 10)}:${str.slice(10, 12)}`;
        if (str.length >= 4)  return `${str.slice(0, 2)}:${str.slice(2, 4)}`; // fallback "0530"
        return "";
      };
      return {
        firstBus: fmt(it.firstBusTm || it.firstTm || ""),
        lastBus:  fmt(it.lastBusTm  || it.lastTm  || ""),
        headway:  parseInt(it.term || "0") || 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * [NEW] Fetch real-time bus positions by routeId (Seoul & TAGO)
   */
  static async fetchBusPositions(cityCode: string, routeId: string): Promise<any[]> {
    const provider = this.getProvider(cityCode);
    const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";
    if (!apiKey || apiKey === "sample") return [];

    try {
      let url = "";
      if (provider === "SEOUL") {
        url = `${this.SEOUL_URL}buspos/getBusPosByRtid?busRouteId=${routeId}&serviceKey=${encodeURIComponent(apiKey)}&resultType=json`;
      } else {
        url = `${this.TAGO_URL}BusLcInfoInqireService/getRouteLcInfoList?cityCode=${cityCode}&routeId=${routeId}&serviceKey=${encodeURIComponent(apiKey)}&_type=json`;
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return [];
      const json = await res.json();

      if (provider === "SEOUL") {
        const items = json?.ServiceResult?.msgBody?.itemList || [];
        return items.map((it: any) => ({
          id: it.vehId,
          no: it.plainNo,
          lat: parseFloat(it.tmY),
          lng: parseFloat(it.tmX),
          stopIdx: parseInt(it.sectOrd),
          isFull: it.isFull === "1"
        }));
      } else {
        const items = json?.response?.body?.items?.item || [];
        const arr = Array.isArray(items) ? items : [items];
        return arr.map((it: any) => ({
          id: it.vehicleno,
          no: it.vehicleno,
          lat: parseFloat(it.gpslat),
          lng: parseFloat(it.gpslnt),
          stopIdx: parseInt(it.nodeord),
        }));
      }
    } catch (err) {
      return [];
    }
  }
}
