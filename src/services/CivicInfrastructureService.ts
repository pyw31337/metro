/**
 * CivicInfrastructureService.ts
 * 렛츠메트로(Let's Metro) 공공 모빌리티 & 시민 인프라 서비스 엔진
 * - 개찰구 안/밖 화장실 위치 판별
 * - 최단 빠른 환승 칸 번호
 * - 비 안 맞는 지하통로(Dry Walk)
 * - 따릉이 및 환승 공영주차장(Park & Ride)
 */

export interface CivicStationData {
  id: string;
  name: string;
  clean_name: string;
  lines: string[];
  lat: number;
  lng: number;
  toilet: {
    in_gate: boolean;
    out_gate: boolean;
    out_gate_desc: string;
    in_gate_desc: string;
    accessible: boolean;
    baby_care: boolean;
    emergency_bell: boolean;
    open_hours: string;
  };
  fast_transfers: {
    target_line: string;
    car_number: string;
    direction: string;
    walk_seconds: number;
  }[];
  elevators: {
    exit_number: number;
    type: string;
    status: string;
    desc: string;
  }[];
  night_buses: string[];
  bike_racks: {
    exit_number: number;
    name: string;
    capacity: number;
    estimated_available: number;
  }[];
  dry_walk_buildings: {
    building_name: string;
    connected_exit: number;
    type: string;
  }[];
  park_and_ride: {
    name: string;
    capacity: number;
    transit_discount_pct: number;
    fee_info: string;
  };
}

class CivicInfrastructureService {
  private cache: Record<string, CivicStationData> | null = null;
  private loadPromise: Promise<Record<string, CivicStationData>> | null = null;

  async load(): Promise<Record<string, CivicStationData>> {
    if (this.cache) return this.cache;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        const res = await fetch(`${base}/data/master-civic-infrastructure.json`);
        if (!res.ok) throw new Error("Failed to load master civic infrastructure");
        const json = await res.json();
        const map: Record<string, CivicStationData> = {};
        (json.stations || []).forEach((st: CivicStationData) => {
          map[st.clean_name] = st;
          map[st.name] = st;
        });
        this.cache = map;
        return map;
      } catch (err) {
        console.warn("[CivicInfrastructureService] Load fallback:", err);
        this.cache = {};
        return {};
      }
    })();

    return this.loadPromise;
  }

  getSync(stationName: string): CivicStationData | null {
    if (!this.cache) return null;
    const clean = stationName.replace(/역$/, "").trim();
    return this.cache[clean] ?? this.cache[stationName] ?? null;
  }
}

export const civicInfrastructureService = new CivicInfrastructureService();
