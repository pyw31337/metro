"use client";

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
      const res = await fetch("/data/master-bus-routes.json");
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
      const resSeq = await fetch("/metro/data/master-route-stations.json");
      if (!resSeq.ok) return [];
      const sequenceMap = await resSeq.json();
      const sequence = sequenceMap[routeId] || [];
      if (sequence.length === 0) return [];

      // 2. Fetch master stops to get coordinates
      const resStops = await fetch("/metro/data/master-bus-stops.json");
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
}
