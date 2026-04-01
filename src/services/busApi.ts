"use client";

import { BusPosition } from "@/hooks/useBusPositions";

/**
 * TAGO City Codes for Gangwon & Chungcheong
 */
export const CITY_CODES = {
  GANGNEUNG: "32010",
  CHUNCHEON: "32020",
  WONJU: "32030",
  CHEONGJU: "33010",
  CHUNGJU: "33020",
  DAEJEON: "25", // Metropolitan city
  SEJONG: "36010"
};

export type BusProvider = "SEOUL" | "GBIS" | "BIS_INCHEON" | "TAGO";

export class MetropolitanBusService {
  private static SEOUL_URL = "http://ws.bus.go.kr/api/rest/";
  private static TAGO_URL = "http://apis.data.go.kr/1613000/";
  private static GBIS_URL = "http://apis.data.go.kr/6410000/";
  private static BIS_INCHEON_URL = "http://apis.data.go.kr/6280000/";

  static getProvider(region: string): BusProvider {
    if (region.includes("서울")) return "SEOUL";
    if (region.includes("경기")) return "GBIS";
    if (region.includes("인천")) return "BIS_INCHEON";
    return "TAGO"; // Default to National TAGO for Gangwon/Chungcheong
  }

  /**
   * Fetch real-time bus arrivals for a station based on region.
   */
  static async fetchArrivals(stationId: string, region: string) {
    const provider = this.getProvider(region);
    const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";

    try {
      switch (provider) {
        case "SEOUL":
          // Implementation for Seoul Open Data
          return [];
        case "GBIS":
          // Implementation for Gyeonggi Bus
          return [];
        default:
          // Implementation for TAGO (Gangwon/Chungcheong)
          return [];
      }
    } catch (err) {
      console.error(`Bus arrival fetch error (${provider}):`, err);
      return [];
    }
  }

  /**
   * Fetch detailed route info (shapes, stations) for a given route.
   */
  static async fetchRouteInfo(routeId: string, provider: BusProvider) {
    // Shared logic for route metadata ingestion
  }
}
