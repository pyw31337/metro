/**
 * civic-mobility-extras.ts
 * 렛츠메트로(Let's Metro) 카카오T 벤치마크 5대 시민 모빌리티 데이터 에셋
 * 1. 개찰구 안/밖 화장실 (Unpaid vs Paid Area)
 * 2. 최단 빠른 환승 칸 (Fast Transfer Car Number)
 * 3. 심야 올빼미 버스 (Night Bus Alternatives)
 * 4. 따릉이 대여소 & 환승 공영주차장 (Park & Ride)
 */

export interface StationAmenity {
  stationName: string;
  toilet: {
    inGate: boolean;       // 개찰구 안(운임구역/승강장) 유무
    outGate: boolean;      // 개찰구 밖(비운임구역/대합실) 유무 - 카드 안 찍고 이용 가능!
    locationDesc: string;  // 위치 설명 (예: "3·4번 출구 앞 대합실(개찰구 밖), 지하2층 환승통로(개찰구 안)")
    accessible: boolean;   // 장애인 화장실 유무
    babyCare: boolean;     // 기저귀 교환대 유무
    openHours: string;     // 운영 시간
  };
  fastTransfer?: {
    targetLine: string;    // 환승할 호선
    carNumber: string;     // 추천 칸 번호 (예: "4-2")
    direction: string;     // 행선 방면
    transferTimeMin: number; // 소요 시간 (분)
  }[];
  nightBus?: string[];     // 연계 심야 올빼미 버스 (예: ["N13", "N61"])
  bikeRacks?: {
    exitNumber: number;
    stationName: string;
    availableBikes: number;
  };
  dryWalkBuildings?: string[]; // 비 안 맞고 지하로 연결된 대형 빌딩/상가
}

// 수도권 주요 거점역 시민 인프라 원장 (샘플 및 확장 데이터)
export const STATION_CIVIC_AMENITIES: Record<string, StationAmenity> = {
  "강남": {
    stationName: "강남역",
    toilet: {
      inGate: true,
      outGate: true,
      locationDesc: "개찰구 밖: 7·8번 출구 지하 대합실 / 개찰구 안: 신분당선 환승통로 지하 2층",
      accessible: true,
      babyCare: true,
      openHours: "첫차~막차 (05:30 ~ 24:30)"
    },
    fastTransfer: [
      { targetLine: "신분당선", carNumber: "3-3", direction: "광교/신사 방면", transferTimeMin: 2 },
      { targetLine: "2호선", carNumber: "6-2", direction: "내선순환(역삼 방면)", transferTimeMin: 2 }
    ],
    nightBus: ["N13", "N37", "N61"],
    bikeRacks: { exitNumber: 11, stationName: "강남역 11번 출구 앞", availableBikes: 14 },
    dryWalkBuildings: ["삼성전자 서초사옥", "메리츠타워", "강남지하쇼핑센터"]
  },
  "사당": {
    stationName: "사당역",
    toilet: {
      inGate: true,
      outGate: true,
      locationDesc: "개찰구 밖: 3·4번 출구 방면 대합실 / 개찰구 안: 4호선 승강장 당고개 방면 끝",
      accessible: true,
      babyCare: true,
      openHours: "첫차~막차 (05:30 ~ 24:30)"
    },
    fastTransfer: [
      { targetLine: "4호선", carNumber: "4-2", direction: "오이도/당고개 방면", transferTimeMin: 1.5 },
      { targetLine: "2호선", carNumber: "8-4", direction: "강남/신도림 방면", transferTimeMin: 2 }
    ],
    nightBus: ["N15", "N61"],
    bikeRacks: { exitNumber: 4, stationName: "사당역 4번 출구 환승장", availableBikes: 9 },
    dryWalkBuildings: ["파스텔시티 지하연결통로"]
  },
  "신도림": {
    stationName: "신도림역",
    toilet: {
      inGate: true,
      outGate: true,
      locationDesc: "개찰구 밖: 1번 출구 테크노마트 연결부 / 개찰구 안: 2호선 승강장 지하 2층 중앙",
      accessible: true,
      babyCare: true,
      openHours: "첫차~막차 (05:20 ~ 24:40)"
    },
    fastTransfer: [
      { targetLine: "1호선", carNumber: "1-1", direction: "용산/인천 방면", transferTimeMin: 2 },
      { targetLine: "2호선", carNumber: "4-4", direction: "신설동/까치산 방면", transferTimeMin: 2.5 }
    ],
    nightBus: ["N16", "N61"],
    bikeRacks: { exitNumber: 1, stationName: "신도림역 광장", availableBikes: 18 },
    dryWalkBuildings: ["디큐브시티 현대백화점", "신도림 테크노마트"]
  },
  "홍대입구": {
    stationName: "홍대입구역",
    toilet: {
      inGate: true,
      outGate: true,
      locationDesc: "개찰구 밖: 9번 출구 방면 대합실 / 개찰구 안: 공항철도-경의중앙선 환승통로 지하 1층",
      accessible: true,
      babyCare: true,
      openHours: "첫차~막차 (05:30 ~ 24:30)"
    },
    fastTransfer: [
      { targetLine: "공항철도", carNumber: "7-1", direction: "인천공항/서울역 방면", transferTimeMin: 3 },
      { targetLine: "경의중앙선", carNumber: "3-4", direction: "문산/용문 방면", transferTimeMin: 3.5 }
    ],
    nightBus: ["N26", "N62", "N75"],
    bikeRacks: { exitNumber: 3, stationName: "연트럴파크 입구", availableBikes: 22 },
    dryWalkBuildings: ["AK& 홍대 쇼핑몰", "경의선숲길 지하통로"]
  },
  "잠실": {
    stationName: "잠실역",
    toilet: {
      inGate: true,
      outGate: true,
      locationDesc: "개찰구 밖: 롯데월드몰 지하 연결광장 / 개찰구 안: 8호선 암사 방면 승강장 끝",
      accessible: true,
      babyCare: true,
      openHours: "첫차~막차 (05:30 ~ 24:30)"
    },
    fastTransfer: [
      { targetLine: "8호선", carNumber: "2-3", direction: "암사/모란 방면", transferTimeMin: 3 },
      { targetLine: "2호선", carNumber: "5-2", direction: "삼성/건대 방면", transferTimeMin: 2.5 }
    ],
    nightBus: ["N13", "N31"],
    bikeRacks: { exitNumber: 2, stationName: "잠실역 광역환승센터", availableBikes: 25 },
    dryWalkBuildings: ["롯데월드몰", "롯데백화점 잠실점", "잠실지하광역환승센터"]
  }
};

/**
 * 역 이름으로 편의 인프라(개찰구 안/밖 화장실, 빠른 환승, 따릉이) 조회
 */
export function getStationCivicAmenity(name: string): StationAmenity | null {
  const cleanName = name.replace(/역$/, "").trim();
  return STATION_CIVIC_AMENITIES[cleanName] ?? null;
}
