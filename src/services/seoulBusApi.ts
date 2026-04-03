/**
 * Seoul Metropolitan Bus API Service
 * --------------------------------------------------
 * 서울특별시_정류소정보조회 서비스   (data.go.kr 15000303)
 * 서울특별시_버스도착정보조회 서비스 (data.go.kr 15000314)
 * 서울특별시_버스위치정보조회 서비스 (data.go.kr 15000332)
 *
 * Base URL: http://ws.bus.go.kr/api/rest/
 * Auth: serviceKey (공공데이터포털 발급키, encodeURIComponent 적용 후 사용)
 * Note: HTTPS unavailable on ws.bus.go.kr → use Next.js API proxy to avoid Mixed Content.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SeoulBusStop {
  arsId: string;        // 정류소 ARS ID (5자리, 실시간 조회 주키)
  stId: string;         // 정류소 고유 ID
  stNm: string;         // 정류소명
  tmX: number;          // WGS84 경도
  tmY: number;          // WGS84 위도
  posX: number;         // GRS80 X좌표
  posY: number;         // GRS80 Y좌표
  stDir?: string;       // 방향 (예: "강남역 방향")
}

export interface SeoulBusRoute {
  busRouteId: string;   // 노선 ID
  busRouteNm: string;   // 노선 번호 (예: "146")
  routeType: string;    // 노선 유형 코드 (1:공항, 2:마을, 3:간선, 4:지선, 5:순환, 6:광역, 7:인천, 8:경기, 9:폐지, 0:공용)
  startStationNm: string;
  endStationNm: string;
  firstBusTime: string; // 첫차 시간 (HHmm)
  lastBusTime: string;  // 막차 시간 (HHmm)
  term: string;         // 배차 간격 (분)
}

export interface SeoulBusArrival {
  busRouteId: string;
  busRouteNm: string;
  rtNm: string;         // 노선 번호 표시명
  arsId: string;
  stNm: string;
  traTime1: number;     // 첫 번째 버스 도착 예상 시간 (초)
  traTime2: number;     // 두 번째 버스 도착 예상 시간 (초)
  traStat1: string;     // 운행 상태 (0:운행중, 1:출발지 대기)
  traStat2: string;
  stOrd1: number;       // 첫 번째 버스 남은 정거장 수
  stOrd2: number;
  plainNo1: string;     // 차량 번호
  plainNo2: string;
  busType1: string;     // 버스 유형 (0:일반, 1:저상, 2:굴절)
  busType2: string;
  isFullFlag1: string;  // 만차 여부
  isLastFlag1: string;  // 막차 여부
  mkTm: string;         // 정보 생성 시각
}

export interface SeoulBusPosition {
  vehId: string;        // 차량 ID
  plainNo: string;      // 차량 번호
  busRouteId: string;
  busRouteNm: string;
  stId: string;         // 현재 위치 정류소 ID
  stOrd: string;        // 현재 위치 순서
  tmX: string;          // WGS84 경도
  tmY: string;          // WGS84 위도
  isArrive: string;     // 도착 여부 (0:이동중, 1:도착)
  lastStnId: string;    // 최종 정류소 ID
  isLastStn: string;    // 최종 정류소 여부
  congestion: string;   // 혼잡도 (3:여유, 4:보통, 5:혼잡, 6:매우혼잡)
  busType: string;
}

// ─── Route Type Labels ────────────────────────────────────────────────────────

export const SEOUL_ROUTE_TYPES: Record<string, { label: string; color: string }> = {
  "1": { label: "공항", color: "#8b5cf6" },
  "2": { label: "마을", color: "#f59e0b" },
  "3": { label: "간선", color: "#3b82f6" },
  "4": { label: "지선", color: "#10b981" },
  "5": { label: "순환", color: "#f97316" },
  "6": { label: "광역", color: "#ef4444" },
  "7": { label: "인천", color: "#06b6d4" },
  "8": { label: "경기", color: "#ec4899" },
  "0": { label: "공용", color: "#6b7280" },
};

// ─── API Client ───────────────────────────────────────────────────────────────

// NOTE: ws.bus.go.kr supports HTTP only.
// This is acceptable in dev (npm run dev). For production static export,
// Mixed Content is avoided because the app is served from a basePath (/metro)
// and API calls are made from the browser's own origin.
// If deploying to HTTPS server, set up a CORS proxy or switch output mode.
const SEOUL_BUS_BASE = "http://ws.bus.go.kr/api/rest";

class SeoulBusApiClient {
  private apiKey: string;

  constructor() {
    // ws.bus.go.kr uses the public data portal key (raw, not encoded)
    this.apiKey = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || "";
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    try {
      const query = new URLSearchParams({ ...params, serviceKey: this.apiKey, resultType: "json" });
      const url = `${SEOUL_BUS_BASE}${path}?${query}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const json = await res.json();
      if (json?.msgHeader?.headerCd !== "0" && json?.msgHeader?.headerCd !== 0) {
        console.debug(`Seoul Bus API error (${path}):`, json?.msgHeader?.headerMsg);
        return null;
      }
      return json as T;
    } catch (err) {
      console.debug(`Seoul Bus API fetch error (${path}):`, err);
      return null;
    }
  }

  // ── 정류소 정보 조회 ─────────────────────────────────────────────────────────

  /**
   * 이름으로 정류소 검색 (getStationByName)
   */
  async searchStationByName(name: string): Promise<SeoulBusStop[]> {
    const data = await this.get<any>("/stationinfo/getStationByName", { stSrch: name });
    return data?.msgBody?.itemList ?? [];
  }

  /**
   * 좌표 기반 반경 내 정류소 검색 (getStationByPos)
   * @param tmX WGS84 경도
   * @param tmY WGS84 위도
   * @param radius 반경 (미터, 기본 300m)
   */
  async searchStationByPos(tmX: number, tmY: number, radius = 300): Promise<SeoulBusStop[]> {
    const data = await this.get<any>("/stationinfo/getStationByPos", {
      tmX: String(tmX),
      tmY: String(tmY),
      radius: String(radius),
    });
    return data?.msgBody?.itemList ?? [];
  }

  /**
   * 정류소 경유 노선 목록 (getRouteByStation)
   * @param arsId 정류소 ARS ID (5자리)
   */
  async getRoutesByStation(arsId: string): Promise<SeoulBusRoute[]> {
    const data = await this.get<any>("/stationinfo/getRouteByStation", { arsId });
    return data?.msgBody?.itemList ?? [];
  }

  // ── 도착 정보 조회 ─────────────────────────────────────────────────────────

  /**
   * 정류소 실시간 도착 정보 (getArrInfoByStation)
   * @param arsId 정류소 ARS ID
   */
  async getArrivalByStation(arsId: string): Promise<SeoulBusArrival[]> {
    const data = await this.get<any>("/arrive/getArrInfoByStation", { arsId });
    return data?.msgBody?.itemList ?? [];
  }

  /**
   * 특정 노선의 전 정류소 도착 정보 (getArrInfoByRouteAll)
   */
  async getArrivalByRoute(busRouteId: string): Promise<SeoulBusArrival[]> {
    const data = await this.get<any>("/arrive/getArrInfoByRouteAll", { busRouteId });
    return data?.msgBody?.itemList ?? [];
  }

  /**
   * 저상버스 도착 정보 (getLowArrInfoByStation)
   */
  async getLowFloorArrival(arsId: string): Promise<SeoulBusArrival[]> {
    const data = await this.get<any>("/arrive/getLowArrInfoByStation", { arsId });
    return data?.msgBody?.itemList ?? [];
  }

  // ── 버스 위치 정보 ─────────────────────────────────────────────────────────

  /**
   * 노선의 구간별 버스 위치 (getBusPosByRouteSt)
   * @param busRouteId 노선 ID
   * @param startOrd 시작 정류소 순서
   * @param endOrd 종료 정류소 순서
   */
  async getBusPositionsByRoute(busRouteId: string, startOrd = 1, endOrd = 999): Promise<SeoulBusPosition[]> {
    const data = await this.get<any>("/buspos/getBusPosByRouteSt", {
      busRouteId,
      startOrd: String(startOrd),
      endOrd: String(endOrd),
    });
    return data?.msgBody?.itemList ?? [];
  }

  /**
   * 차량 ID로 버스 위치 조회 (getBusPosByVehId)
   */
  async getBusPositionByVehicle(vehId: string): Promise<SeoulBusPosition | null> {
    const data = await this.get<any>("/buspos/getBusPosByVehId", { vehId });
    const items: SeoulBusPosition[] = data?.msgBody?.itemList ?? [];
    return items[0] ?? null;
  }
}

export const seoulBusApi = new SeoulBusApiClient();
