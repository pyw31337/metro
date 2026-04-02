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
 *   GET https://openapi.seoul.go.kr:8088/{KEY}/json/subwayStationMaster/1/1000/
 */

import type { WCItem } from "@/types/metro";
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
  
  // Check for "Unregistered service" or other API-specific errors
  if (json?.code === -3 || json?.msg?.includes("등록되지 않은")) {
      console.warn(`[WC] DataGoKr Unregistered: ${json.msg}`);
      return [];
  }

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
 * GET https://openapi.seoul.go.kr:8088/{KEY}/json/tbTraficWheelChrAdit/1/1000/
 *
 * 이 API는 장애인 화장실 전용 데이터로 보완적으로 사용
 */
async function fetchFromSeoulOpenData(apiKey: string): Promise<WCItem[]> {
  // Use standard HTTPS (443) instead of 8088 to avoid SSL protocol errors
  const url = `https://openapi.seoul.go.kr/${apiKey}/json/tbTraficWheelChrAdit/1/1000/`;

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

/**
 * 공공데이터포털 (data.go.kr) - 전국공중화장실표준데이터
 * 2000건 이상의 전국 화장실 데이터를 수집합니다.
 */
async function fetchNationalWC(apiKey: string): Promise<WCItem[]> {
  const SERVICE_ID = "15013116"; 
  const UUID = "9893d932-b677-4b18-b26a-986a4225e365";
  const url = `https://api.odcloud.kr/api/${SERVICE_ID}/v1/uddi:${UUID}?page=1&perPage=2000&serviceKey=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`National WC API Error: ${res.status}`);

  const json = await res.json();

  if (json?.code === -3 || json?.msg?.includes("등록되지 않은")) {
      console.warn(`[WC] National Unregistered: ${json.msg}`);
      return [];
  }

  const rows = json?.data || [];

  return rows
    .filter((r: any) => r.위도 && r.경도)
    .map((r: any, i: number) => ({
      id: `national-wc-${i}`,
      name: r.화장실명 || "공중화장실",
      station: r.화장실명.includes("역") ? r.화장실명.split(" ")[0] : "",
      line: "", 
      lat: parseFloat(r.위도),
      lng: parseFloat(r.경도),
      address: r.소재지도로명주소 || r.소재지지번주소 || "",
      floor: "",
      gender: r.남녀공용화장실여부 === "Y" ? "mixed" : "separated",
      hours: r.개방시간명 || "정보없음",
      diapers: r.기저귀교환대지정여부 === "Y" || r.기저귀교환대장소?.length > 0,
      emergencyBell: r.비상벨설치여부 === "Y" || r.비상벨설치장소?.length > 0,
      accessible: r.장애인용남성대변기수 > 0 || r.장애인용여성대변기수 > 0,
    }))
    .filter((item: WCItem) => item.lat !== 0 && item.lng !== 0);
}

// ─── Mock fallback ────────────────────────────────────────────────────────────
function getMockData(): WCItem[] {
  return mockData as WCItem[];
}

/**
 * 경기도 공중화장실 현황 API (data.gg.go.kr)
 * 1000건씩 최대 5페이지(5000건)를 수집합니다.
 */
async function fetchGyeonggiWC(apiKey: string): Promise<WCItem[]> {
  const allItems: WCItem[] = [];
  const PAGES = 5;
  const PER_PAGE = 1000;

  for (let p = 1; p <= PAGES; p++) {
    const url = `https://openapi.gg.go.kr/PubToilet?KEY=${apiKey}&Type=json&pIndex=${p}&pSize=${PER_PAGE}`;
    try {
      const res = await fetch(url, { next: { revalidate: 86400 } });
      if (!res.ok) break;
      const json = await res.json();
      const rows = json?.PubToilet?.[1]?.row || [];
      if (rows.length === 0) break;

      const items = rows.map((r: any, i: number) => ({
        id: `gg-wc-${p}-${i}`,
        name: r.PBCTLT_NM || "경기공중화장실",
        station: "",
        line: "",
        lat: parseFloat(r.REFINE_WGS84_LAT),
        lng: parseFloat(r.REFINE_WGS84_LOGT),
        address: r.REFINE_ROADNM_ADDR || r.REFINE_LOTNO_ADDR || "",
        floor: "",
        gender: r.MALE_FEMALE_CMN_USE_TOILET_YN === "Y" ? "mixed" : "separated",
        hours: r.OPEN_TM_INFO || "정보없음",
        diapers: r.BABY_CHG_PO_PLACE_NM?.length > 0 || r.BABY_CHG_PO_LOC_DESC?.length > 0,
        emergencyBell: r.EMGNCY_BELL_INSTL_YN === "Y",
        accessible: r.MALE_DSB_SH_TOILET_CNT > 0 || r.FEMALE_DSB_SH_TOILET_CNT > 0,
      }));
      allItems.push(...items.filter((item: WCItem) => item.lat && item.lng));
      if (rows.length < PER_PAGE) break;
    } catch (err) {
      console.warn(`[WC] GG API Error p${p}:`, err);
      break;
    }
  }
  return allItems;
}

/**
 * 전용 서비스: 모든 화장실 데이터 통합 (서울/경기/인천)
 */
export async function fetchWCData(): Promise<WCItem[]> {
  const nationalKey = process.env.NEXT_PUBLIC_WC_API_KEY;
  const seoulKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
  const ggKey = "bb76ade40706413f977749ddd28d5e38"; // Provided GG Key

  let allItems: WCItem[] = [];

  // 1. 경기도 데이터 (최신)
  if (ggKey) {
    const ggData = await fetchGyeonggiWC(ggKey);
    allItems = [...allItems, ...ggData];
  }

  // 2. 전국 데이터 (서울/인천 위주로 필터링 추천)
  if (nationalKey && nationalKey.length > 10) {
    try {
      const nationalData = await fetchNationalWC(nationalKey);
      // 서울/인천만 필터링 (경기도는 위에서 별도로 받음)
      const filtered = nationalData.filter((i: WCItem) => 
        i.address?.includes("서울") || i.address?.includes("인천")
      );
      allItems = [...allItems, ...filtered];
    } catch (err) {
      console.warn("[WC] National API failed:", err);
    }
  }

  // 3. 서울 전용 데이터 (중복 제거)
  if (seoulKey && seoulKey.length > 10) {
    try {
      const seoulData = await fetchFromSeoulOpenData(seoulKey);
      const existingNames = new Set(allItems.map(i => i.name));
      const filtered = seoulData.filter(i => !existingNames.has(i.name));
      allItems = [...allItems, ...filtered];
    } catch (err) {
      console.warn("[WC] Seoul API failed:", err);
    }
  }

  // 3순위: 서울 열린데이터광장 (보조용)
  if (seoulKey && seoulKey.length > 10) {
    try {
      const data = await fetchFromSeoulOpenData(seoulKey);
      const existingNames = new Set(allItems.map(i => i.name));
      const filtered = data.filter(i => !existingNames.has(i.name));
      allItems = [...allItems, ...filtered];
    } catch (err) {
      console.warn("[WC] Seoul Open Data API failed:", err);
    }
  }

  if (allItems.length > 0) {
    console.log(`[WC] Total integrated items: ${allItems.length}`);
    return allItems;
  }

  // 최종 fallback: Mock 데이터
  console.info("[WC] Using mock data (no API key configured)");
  return getMockData();
}

export async function fetchWCDataClient(): Promise<WCItem[]> {
  return fetchWCData();
}
