/**
 * 공공화장실 API 서비스
 *
 * 1순위: 환경변수 NEXT_PUBLIC_WC_API_KEY 있을 때 → data.go.kr 실API
 * 2순위: 키 없을 때 → ./wc.json Mock 데이터 fallback
 *
 * 사용 API: 서울교통공사_역사공중화장실정보
 * 출처: https://www.data.go.kr/data/15098783/fileData.do (Open API 자동변환)
 * 엔드포인트:
 *   GET https://api.odcloud.kr/api/15098783/v1/uddi:...
 *   또는 서울 열린데이터광장:
 *   GET http://openapi.seoul.go.kr:8088/{KEY}/json/subwayStationMaster/1/1000/
 */

import type { WCItem } from "@/components/WCLayer";
import mockData from "@/data/wc.json";

// ─── data.go.kr 응답 타입 ────────────────────────────────────────────────────
interface DataGoKrWCItem {
  SUBWAY_STN_NM: string;       // 역명
  LINE_NM: string;             // 호선명
  TOILET_NM: string;           // 화장실명
  BULD_NM?: string;            // 건물명
  DTAIL_LOC?: string;          // 상세위치
  RDNMADR?: string;            // 도로명주소
  LNMADR?: string;             // 지번주소
  LATITUDE?: string;           // 위도
  LONGITUDE?: string;          // 경도
  OPTN_DC?: string;            // 부가설명
  DSBL_YN?: string;            // 장애인 사용 가능 여부 (Y/N)
  OPNG_TM?: string;            // 개방시간
}

// ─── 서울 열린데이터광장 응답 타입 ─────────────────────────────────────────
interface SeoulOpenDataRow {
  STATION_NM: string;
  LINE_NUM: string;
  TOILET_NM: string;
  LOCATION: string;
  LAT?: string;
  LOT?: string;
  DISABLED?: string;
}

/**
 * data.go.kr 자동변환 Open API (서울교통공사_역사공중화장실정보)
 * 엔드포인트 형식 (실제 키 발급 후 serviceKey 파라미터로 전달)
 *
 * GET https://api.odcloud.kr/api/15098783/v1/uddi:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   ?page=1&perPage=1000&serviceKey={YOUR_KEY}
 */
async function fetchFromDataGoKr(apiKey: string): Promise<WCItem[]> {
  // 실제 serviceId는 data.go.kr에서 '활용신청' 후 API 문서에서 확인
  // 아래 URL은 파일데이터 자동변환 Open API 형식 (실제 ID로 교체 필요)
  const SERVICE_ID = "15098783"; // 서울교통공사_역사공중화장실정보 데이터셋 ID
  const url = `https://api.odcloud.kr/api/${SERVICE_ID}/v1/uddi:c88f27c0-3282-441a-8218-3f0b5ff59ab4?page=1&perPage=1000&serviceKey=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 86400 } }); // 24시간 캐시
  if (!res.ok) throw new Error(`WC API Error: ${res.status}`);

  const json = await res.json();
  const rows: DataGoKrWCItem[] = json?.data || [];

  return rows
    .filter((r) => r.LATITUDE && r.LONGITUDE)
    .map((r, i) => ({
      id: `api-${SERVICE_ID}-${i}`,
      name: r.TOILET_NM || `${r.SUBWAY_STN_NM}역 화장실`,
      station: r.SUBWAY_STN_NM || "",
      line: r.LINE_NM || "",
      lat: parseFloat(r.LATITUDE!),
      lng: parseFloat(r.LONGITUDE!),
      address: r.RDNMADR || r.LNMADR || r.DTAIL_LOC || "",
      floor: r.DTAIL_LOC || "B2",
      gender: "mixed",
      accessible: r.DSBL_YN === "Y",
    }))
    .filter((item) => item.lat !== 0 && item.lng !== 0);
}

/**
 * 서울 열린데이터광장 API (교통약자이용정보 장애인화장실)
 * GET http://openapi.seoul.go.kr:8088/{KEY}/json/tbTraficWheelChrAdit/1/1000/
 *
 * 이 API는 장애인 화장실 전용 데이터로 보완적으로 사용
 */
async function fetchFromSeoulOpenData(apiKey: string): Promise<WCItem[]> {
  const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/tbTraficWheelChrAdit/1/1000/`;

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`Seoul API Error: ${res.status}`);

  const json = await res.json();
  const rows: SeoulOpenDataRow[] = json?.tbTraficWheelChrAdit?.row || [];

  return rows
    .filter((r) => r.LAT && r.LOT)
    .map((r, i) => ({
      id: `seoul-${i}`,
      name: `${r.STATION_NM}역 장애인화장실`,
      station: r.STATION_NM || "",
      line: r.LINE_NUM || "",
      lat: parseFloat(r.LAT!),
      lng: parseFloat(r.LOT!),
      address: r.LOCATION || "",
      floor: "B",
      gender: "mixed",
      accessible: true,
    }))
    .filter((item) => item.lat !== 0 && item.lng !== 0);
}

// ─── Mock fallback ────────────────────────────────────────────────────────────
function getMockData(): WCItem[] {
  return mockData as WCItem[];
}

// ─── 메인 함수 (자동 fallback 포함) ──────────────────────────────────────────
export async function fetchWCData(): Promise<WCItem[]> {
  const wcKey = process.env.NEXT_PUBLIC_WC_API_KEY;
  const seoulKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;

  // 1순위: data.go.kr WC API
  if (wcKey && wcKey.length > 10) {
    try {
      const data = await fetchFromDataGoKr(wcKey);
      if (data.length > 0) {
        console.log(`[WC] Loaded ${data.length} items from data.go.kr`);
        return data;
      }
    } catch (err) {
      console.warn("[WC] data.go.kr API failed, trying Seoul Open Data:", err);
    }
  }

  // 2순위: 서울 열린데이터광장
  if (seoulKey && seoulKey.length > 10) {
    try {
      const data = await fetchFromSeoulOpenData(seoulKey);
      if (data.length > 0) {
        console.log(`[WC] Loaded ${data.length} items from Seoul Open Data`);
        return data;
      }
    } catch (err) {
      console.warn("[WC] Seoul Open Data API failed, using mock:", err);
    }
  }

  // 3순위: Mock 데이터
  console.info("[WC] Using mock data (no API key configured)");
  return getMockData();
}

/**
 * 클라이언트 사이드용 — 이미 빌드된 정적 데이터
 * GitHub Pages는 서버리스이므로 빌드 타임에 데이터를 fetch하거나
 * 클라이언트에서 직접 API를 호출합니다.
 *
 * GitHub Pages 환경에서는 CORS 우회를 위해 Next.js API Route 대신
 * 클라이언트에서 직접 호출하거나 NEXT_PUBLIC_ 키를 사용합니다.
 */
export async function fetchWCDataClient(): Promise<WCItem[]> {
  return fetchWCData();
}
