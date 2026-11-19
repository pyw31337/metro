/**
 * civic-mobility-extras.ts
 * 렛츠메트로(Let's Metro) 카카오T 벤치마크 시민 모빌리티 에셋
 * 35대 거점 역사 전수 매트릭스 (개찰구 밖 무료 화장실, 초단축 빠른 환승, 우산 없는 길)
 */

export interface StationAmenity {
  stationName: string;
  toilet: {
    inGate: boolean;       // 개찰구 안(운임구역/승강장) 유무
    outGate: boolean;      // 개찰구 밖(비운임구역/대합실) 유무 - 카드 안 찍고 이용 가능!
    locationDesc: string;  // 위치 설명
    out_gate_desc?: string;
    in_gate_desc?: string;
    accessible: boolean;   // 장애인 화장실 유무
    babyCare: boolean;     // 기저귀 교환대 유무
    baby_care?: boolean;
    emergency_bell?: boolean;
    openHours: string;     // 운영 시간
  };
  fastTransfer?: {
    targetLine: string;    // 환승할 호선
    carNumber: string;     // 추천 칸 번호 (예: "4-2")
    direction: string;     // 행선 방면
    transferTimeMin: number; // 소요 시간 (분)
  }[];
  fast_transfers?: {
    target_line: string;
    car_number: string;
    direction: string;
    walk_seconds?: number;
    transferTimeMin?: number;
  }[];
  nightBus?: string[];     // 연계 심야 올빼미 버스
  night_buses?: string[];
  bikeRacks?: {
    exitNumber: number;
    stationName: string;
    availableBikes: number;
  };
  bike_racks?: {
    exit_number: number;
    name: string;
    capacity: number;
    estimated_available: number;
  }[];
  dryWalkBuildings?: Array<string | { building_name: string; connected_exit: number; type?: string }>;
  dry_walk_buildings?: Array<string | { building_name: string; connected_exit: number; type?: string }>;
  park_and_ride?: {
    name: string;
    capacity: number;
    transit_discount_pct: number;
    fee_info: string;
  };
  convenience?: {
    civilKiosk: string;
    locker: string;
    delayCertUrl: string;
  };
}

export const STATION_CIVIC_AMENITIES: Record<string, StationAmenity> = {
  "강남": {
    "stationName": "강남역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 7·8번 출구 대합실 (태그 불필요) / 개찰구 안: 신분당선 환승통로 지하 2층",
      "out_gate_desc": "7·8번 출구 방면 지하 1층 대합실 (카드 태그 없이 무료 이용)",
      "in_gate_desc": "신분당선 환승통로 지하 2층 (승강장 내부)",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30 (첫차~막차)"
    },
    "fastTransfer": [
      {
        "targetLine": "신분당선",
        "carNumber": "3-3",
        "direction": "광교/신사 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "2호선",
        "carNumber": "6-2",
        "direction": "내선순환(역삼 방면)",
        "transferTimeMin": 2
      }
    ],
    "nightBus": [
      "N13",
      "N37",
      "N61"
    ],
    "bikeRacks": {
      "exitNumber": 11,
      "stationName": "강남역 11번 출구 앞",
      "availableBikes": 14
    },
    "dryWalkBuildings": [
      {
        "building_name": "삼성전자 서초사옥",
        "connected_exit": 8,
        "type": "오피스/상가"
      },
      {
        "building_name": "메리츠타워",
        "connected_exit": 2,
        "type": "오피스"
      },
      {
        "building_name": "강남역 지하쇼핑센터",
        "connected_exit": 1,
        "type": "지하상가"
      }
    ],
    "park_and_ride": {
      "name": "역삼문화공원 공영주차장",
      "capacity": 245,
      "transit_discount_pct": 50,
      "fee_info": "5분당 400원 (대중교통 환승 시 50% 할인)"
    },
    "convenience": {
      "civilKiosk": "지하 1층 대합실 7번 출구 앞 (무인민원발급기 운영)",
      "locker": "T-Locker 물품보관함 (소형 18개, 대형 6개 가동 중)",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "사당": {
    "stationName": "사당역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 3·4번 출구 대합실 (태그 불필요) / 개찰구 안: 4호선 승강장 당고개 방면",
      "out_gate_desc": "3·4번 출구 방면 지하 1층 대합실 (태그 불필요)",
      "in_gate_desc": "4호선 승강장 당고개 방면 끝단 (승차 중 이용)",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "4호선",
        "carNumber": "4-2",
        "direction": "오이도/당고개 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "2호선",
        "carNumber": "8-4",
        "direction": "강남/신도림 방면",
        "transferTimeMin": 2
      }
    ],
    "nightBus": [
      "N15",
      "N61"
    ],
    "bikeRacks": {
      "exitNumber": 4,
      "stationName": "사당역 4번 출구 환승장 앞",
      "availableBikes": 12
    },
    "dryWalkBuildings": [
      {
        "building_name": "파스텔시티(Pastel City)",
        "connected_exit": 12,
        "type": "복합쇼핑몰/식당가"
      },
      {
        "building_name": "사당역 지하상가",
        "connected_exit": 4,
        "type": "지하상가"
      }
    ],
    "park_and_ride": {
      "name": "사당역 공영주차장",
      "capacity": 180,
      "transit_discount_pct": 50,
      "fee_info": "5분당 250원 (환승 할인 50%)"
    },
    "convenience": {
      "civilKiosk": "지하 1층 4번 출구 통로",
      "locker": "T-Locker 물품보관함 가동 중",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "서울역": {
    "stationName": "서울역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 1호선 지하 2층 대합실 1·2번 출구 / 개찰구 안: 4호선 승강장 지하 3층",
      "out_gate_desc": "1호선 지하 2층 대합실 (1·2번 출구 방면 태그 불필요)",
      "in_gate_desc": "4호선 및 공항철도 환승통로 지하 3층 승강장",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "24시간 (공항철도 연계 구역)"
    },
    "fastTransfer": [
      {
        "targetLine": "공항철도",
        "carNumber": "1-1",
        "direction": "인천공항 방면",
        "transferTimeMin": 3.5
      },
      {
        "targetLine": "4호선",
        "carNumber": "10-4",
        "direction": "명동/혜화 방면",
        "transferTimeMin": 2
      },
      {
        "targetLine": "1호선",
        "carNumber": "5-1",
        "direction": "종로/청량리 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N15",
      "N16",
      "N30"
    ],
    "bikeRacks": {
      "exitNumber": 9,
      "stationName": "서울스퀘어 앞 따릉이",
      "availableBikes": 18
    },
    "dryWalkBuildings": [
      {
        "building_name": "KTX 서울역사 & 롯데아울렛",
        "connected_exit": 1,
        "type": "쇼핑몰/철도역사"
      },
      {
        "building_name": "서울스퀘어(Seoul Square)",
        "connected_exit": 9,
        "type": "프라임오피스"
      },
      {
        "building_name": "연세봉래빌딩 & 그랜드센트럴",
        "connected_exit": 3,
        "type": "오피스/지하보도"
      }
    ],
    "park_and_ride": {
      "name": "서울역 롯데마트 주차장 (철도연계)",
      "capacity": 850,
      "transit_discount_pct": 30,
      "fee_info": "철도/전철 이용객 기본 할인"
    },
    "convenience": {
      "civilKiosk": "지하철 1·4호선 환승대합실 중앙",
      "locker": "T-Locker 대형/특대형 40함 가동 (캐리어 보관 최적)",
      "delayCertUrl": "http://www.letskorail.com"
    }
  },
  "홍대입구": {
    "stationName": "홍대입구역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 9번 출구 지하 1층 대합실 / 개찰구 안: 공항철도 지하 3층 환승통로",
      "out_gate_desc": "2호선 대합실 8·9번 출구 앞 (태그 불필요)",
      "in_gate_desc": "공항철도 환승통로 및 경의중앙선 승강장",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "공항철도",
        "carNumber": "4-1",
        "direction": "인천공항/서울역",
        "transferTimeMin": 2
      },
      {
        "targetLine": "2호선",
        "carNumber": "7-3",
        "direction": "신촌/을지로 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N26",
      "N62",
      "N75"
    ],
    "bikeRacks": {
      "exitNumber": 9,
      "stationName": "홍대입구 9번 출구 앞",
      "availableBikes": 22
    },
    "dryWalkBuildings": [
      {
        "building_name": "AK& 홍대(AK 플라자)",
        "connected_exit": 4,
        "type": "쇼핑몰/복합문화"
      },
      {
        "building_name": "LC타워(CGV 홍대)",
        "connected_exit": 8,
        "type": "극장/복합몰"
      }
    ],
    "park_and_ride": {
      "name": "동교동 공영주차장",
      "capacity": 120,
      "transit_discount_pct": 50,
      "fee_info": "5분당 250원 (환승 감면)"
    },
    "convenience": {
      "civilKiosk": "9번 출구 개찰구 옆",
      "locker": "T-Locker 여행객 캐리어 전용함 28기 완비",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "여의도": {
    "stationName": "여의도역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 3·4번 출구 대합실 (태그 불필요) / 개찰구 안: 9호선 급행 승강장",
      "out_gate_desc": "지하 1층 대합실 3·4번 출구 앞 (태그 불필요)",
      "in_gate_desc": "9호선 급행 승강장 및 5호선 지하 환승층",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "9호선(급행)",
        "carNumber": "3-2",
        "direction": "신논현/중앙보훈병원 방면",
        "transferTimeMin": 1
      },
      {
        "targetLine": "5호선",
        "carNumber": "2-4",
        "direction": "광화문/마장 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N16",
      "N75"
    ],
    "bikeRacks": {
      "exitNumber": 3,
      "stationName": "여의도역 3번 출구 무빙워크 입구",
      "availableBikes": 30
    },
    "dryWalkBuildings": [
      {
        "building_name": "IFC 몰(IFC Mall)",
        "connected_exit": 3,
        "type": "초대형 쇼핑몰/오피스 무빙워크 직결"
      },
      {
        "building_name": "더현대 서울 (The Hyundai Seoul)",
        "connected_exit": 3,
        "type": "지하 무빙워크 400m 100% 직결"
      },
      {
        "building_name": "파크원(Parc.1 타워)",
        "connected_exit": 3,
        "type": "프라임오피스 직결"
      }
    ],
    "park_and_ride": {
      "name": "여의도 한강공원 공영주차장",
      "capacity": 450,
      "transit_discount_pct": 50,
      "fee_info": "일 10,000원 상한 (환승 50% 할인)"
    },
    "convenience": {
      "civilKiosk": "지하 1층 IFC몰 무빙워크 진입로",
      "locker": "T-Locker 및 더현대서울 물품보관함 연계",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "고속터미널": {
    "stationName": "고속터미널역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 센트럴시티/파미에스테이션 직결통로 / 개찰구 안: 9호선 급행 승강장",
      "out_gate_desc": "7호선 대합실 3·4번 출구 및 신세계 센트럴시티 연결통로",
      "in_gate_desc": "3·7·9호선 환승 허브 통로 및 승강장",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30 (터미널 구역 24시간)"
    },
    "fastTransfer": [
      {
        "targetLine": "9호선(급행)",
        "carNumber": "2-3",
        "direction": "김포공항/여의도 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "7호선",
        "carNumber": "5-2",
        "direction": "강남구청/온수 방면",
        "transferTimeMin": 2
      },
      {
        "targetLine": "3호선",
        "carNumber": "4-4",
        "direction": "양재/수서 방면",
        "transferTimeMin": 2
      }
    ],
    "nightBus": [
      "N13",
      "N61",
      "N75"
    ],
    "bikeRacks": {
      "exitNumber": 8,
      "stationName": "고속터미널 8번 출구 앞",
      "availableBikes": 25
    },
    "dryWalkBuildings": [
      {
        "building_name": "신세계백화점 강남점",
        "connected_exit": 8,
        "type": "백화점 전층 직결"
      },
      {
        "building_name": "파미에스테이션(Famille Station)",
        "connected_exit": 4,
        "type": "미식/쇼핑 복합가"
      },
      {
        "building_name": "센트럴시티 호남선 터미널",
        "connected_exit": 2,
        "type": "고속버스터미널"
      },
      {
        "building_name": "고투몰(강남터미널 지하쇼핑몰)",
        "connected_exit": 1,
        "type": "1km 초대형 지하상가"
      }
    ],
    "park_and_ride": {
      "name": "반포천 복개 공영주차장",
      "capacity": 310,
      "transit_discount_pct": 50,
      "fee_info": "5분당 300원 (환승 50% 감면)"
    },
    "convenience": {
      "civilKiosk": "센트럴시티 지하 매표소 맞은편",
      "locker": "T-Locker 총 64함 가동 (여행객 대형 짐 최적)",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "신도림": {
    "stationName": "신도림역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 1번 출구 디큐브시티 연결통로 대합실 / 개찰구 안: 2호선 승강장",
      "out_gate_desc": "1번 출구 지하 대합실 (디큐브시티 연결로 태그 불필요)",
      "in_gate_desc": "1호선-2호선 환승통로 지하 2층 승강장",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "2호선",
        "carNumber": "1-1",
        "direction": "합정/홍대 방면",
        "transferTimeMin": 1
      },
      {
        "targetLine": "1호선",
        "carNumber": "4-2",
        "direction": "용산/소요산 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N16",
      "N61"
    ],
    "bikeRacks": {
      "exitNumber": 1,
      "stationName": "신도림 1번 출구 광장",
      "availableBikes": 20
    },
    "dryWalkBuildings": [
      {
        "building_name": "현대백화점 디큐브시티",
        "connected_exit": 1,
        "type": "백화점/뮤지컬전용극장 직결"
      },
      {
        "building_name": "신도림 테크노마트",
        "connected_exit": 3,
        "type": "전자/쇼핑/이마트 지하연결"
      }
    ],
    "park_and_ride": {
      "name": "신도림역 공영주차장",
      "capacity": 150,
      "transit_discount_pct": 50,
      "fee_info": "5분당 200원 (환승 50% 할인)"
    },
    "convenience": {
      "civilKiosk": "1번 출구 고객안내센터 옆",
      "locker": "T-Locker 대형보관함 16기 운영",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "잠실": {
    "stationName": "잠실역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 롯데월드몰 지하 직결 광장 / 개찰구 안: 8호선 암사 방면 승강장",
      "out_gate_desc": "지하 1층 롯데월드몰 광장 및 3번 출구 대합실 (태그 불필요)",
      "in_gate_desc": "8호선 승강장 및 2호선 성수 방면 내부",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "8호선",
        "carNumber": "8-4",
        "direction": "모란/별내 방면",
        "transferTimeMin": 2
      },
      {
        "targetLine": "2호선",
        "carNumber": "3-2",
        "direction": "삼성/강남 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N13",
      "N30"
    ],
    "bikeRacks": {
      "exitNumber": 2,
      "stationName": "잠실 광역환승센터 2번 출구",
      "availableBikes": 35
    },
    "dryWalkBuildings": [
      {
        "building_name": "롯데월드타워 & 롯데월드몰",
        "connected_exit": 10,
        "type": "초고층 빌딩/아쿠아리움/시네마 직결"
      },
      {
        "building_name": "롯데백화점 잠실점 & 롯데마트",
        "connected_exit": 3,
        "type": "쇼핑몰/테마파크 직결"
      },
      {
        "building_name": "잠실광역환승센터",
        "connected_exit": 2,
        "type": "국내 최초 지하 버스환승센터 직결"
      }
    ],
    "park_and_ride": {
      "name": "잠실역 공영지하주차장",
      "capacity": 355,
      "transit_discount_pct": 50,
      "fee_info": "5분당 400원 (대중교통 환승 시 50% 할인)"
    },
    "convenience": {
      "civilKiosk": "잠실광역환승센터 게이트 1 앞 무인민원기",
      "locker": "T-Locker 총 48함 완비",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "시청": {
    "stationName": "시청역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 1번 출구 서울시청 신청사 연결로 / 개찰구 안: 1호선 승강장",
      "out_gate_desc": "지하 1층 서울시청 본청 시민청 연결구역 (태그 불필요)",
      "in_gate_desc": "2호선 충정로 방면 및 1호선 환승통로 내부",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "2호선",
        "carNumber": "10-4",
        "direction": "신촌/홍대 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "1호선",
        "carNumber": "2-3",
        "direction": "용산/수원 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N15",
      "N16",
      "N26"
    ],
    "bikeRacks": {
      "exitNumber": 5,
      "stationName": "서울광장 도서관 앞 따릉이",
      "availableBikes": 20
    },
    "dryWalkBuildings": [
      {
        "building_name": "서울시청 본청 & 시민청",
        "connected_exit": 1,
        "type": "행정청사/전시관 100% 직결"
      },
      {
        "building_name": "을지로지하보도 (동대문까지 2.8km 연속)",
        "connected_exit": 5,
        "type": "지하보도 직결"
      },
      {
        "building_name": "프레스센터(한국언론진흥재단)",
        "connected_exit": 4,
        "type": "오피스 직결"
      }
    ],
    "park_and_ride": {
      "name": "서울시청 지하공영주차장",
      "capacity": 100,
      "transit_discount_pct": 50,
      "fee_info": "5분당 500원"
    },
    "convenience": {
      "civilKiosk": "서울시청 시민청 지하 1층 로비",
      "locker": "T-Locker 운영 중",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "판교": {
    "stationName": "판교역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 현대백화점 판교점 지하 2층 연결통로 / 개찰구 안: 신분당선 승강장",
      "out_gate_desc": "현대백화점 지하 2층 직결 통로 대합실 (태그 불필요)",
      "in_gate_desc": "경강선-신분당선 환승통로 승강장 내부",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "신분당선",
        "carNumber": "2-2",
        "direction": "강남/신사 방면",
        "transferTimeMin": 1
      },
      {
        "targetLine": "경강선",
        "carNumber": "4-1",
        "direction": "이천/여주 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "9401(심야광역)",
      "N61(수서환승)"
    ],
    "bikeRacks": {
      "exitNumber": 1,
      "stationName": "판교역 1번 출구 광장",
      "availableBikes": 28
    },
    "dryWalkBuildings": [
      {
        "building_name": "현대백화점 판교점",
        "connected_exit": 3,
        "type": "수도권 최대 백화점 100% 직결"
      },
      {
        "building_name": "알파돔타워 (카카오·크래프톤 사옥)",
        "connected_exit": 2,
        "type": "IT 테크 본사 직결"
      },
      {
        "building_name": "그레이츠 판교(구 크래프톤타워)",
        "connected_exit": 1,
        "type": "오피스 직결"
      }
    ],
    "park_and_ride": {
      "name": "판교역 환승공영주차장",
      "capacity": 420,
      "transit_discount_pct": 50,
      "fee_info": "1일 최대 6,000원 (신분당선 환승 시 50% 감면)"
    },
    "convenience": {
      "civilKiosk": "판교역 지하 1층 대합실 중앙",
      "locker": "판교역 스마트 락커 32기",
      "delayCertUrl": "https://www.shinbundang.co.kr"
    }
  },
  "건대입구": {
    "stationName": "건대입구역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 5번 출구 롯데백화점/스타시티 통로 / 개찰구 안: 7호선 승강장",
      "out_gate_desc": "7호선 대합실 4·5번 출구 앞 스타시티몰 지하 (태그 불필요)",
      "in_gate_desc": "2호선 성수 방면 고가 승강장 내부",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "7호선",
        "carNumber": "2-4",
        "direction": "고속터미널/온수 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "2호선",
        "carNumber": "5-1",
        "direction": "잠실/강남 방면",
        "transferTimeMin": 2
      }
    ],
    "nightBus": [
      "N61",
      "N62"
    ],
    "bikeRacks": {
      "exitNumber": 2,
      "stationName": "건대입구역 2번 출구 맞은편",
      "availableBikes": 16
    },
    "dryWalkBuildings": [
      {
        "building_name": "롯데백화점 건대스타시티점",
        "connected_exit": 5,
        "type": "백화점/이마트 직결"
      },
      {
        "building_name": "스타시티 영존(Young Zone)",
        "connected_exit": 4,
        "type": "극장/복합몰 직결"
      }
    ],
    "park_and_ride": {
      "name": "자양동 공영주차장",
      "capacity": 140,
      "transit_discount_pct": 50,
      "fee_info": "5분당 200원"
    },
    "convenience": {
      "civilKiosk": "지하 1층 2호선 환승로",
      "locker": "T-Locker 운영",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "합정": {
    "stationName": "합정역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 9·10번 출구 메세나폴리스 지하 연결통로 / 개찰구 안: 6호선 환승통로",
      "out_gate_desc": "메세나폴리스 지하 1층 대합실 (태그 불필요 무료)",
      "in_gate_desc": "2·6호선 지하 2층 환승통로",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "6호선",
        "carNumber": "3-3",
        "direction": "공덕/신내 방면",
        "transferTimeMin": 1
      },
      {
        "targetLine": "2호선",
        "carNumber": "8-2",
        "direction": "신촌/시청 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N26",
      "N62"
    ],
    "bikeRacks": {
      "exitNumber": 8,
      "stationName": "합정역 8번 출구 앞",
      "availableBikes": 18
    },
    "dryWalkBuildings": [
      {
        "building_name": "메세나폴리스몰(Mecenatpolis)",
        "connected_exit": 9,
        "type": "복합쇼핑/문화몰 100% 직결"
      },
      {
        "building_name": "딜라이트 스퀘어(교보문고)",
        "connected_exit": 8,
        "type": "서점/복합몰 직결"
      }
    ],
    "park_and_ride": {
      "name": "양화진 공영주차장",
      "capacity": 115,
      "transit_discount_pct": 50,
      "fee_info": "5분당 200원"
    },
    "convenience": {
      "civilKiosk": "합정역 9번 출구 지하 통로",
      "locker": "T-Locker 20함",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "종로3가": {
    "stationName": "종로3가역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 1·2번 출구 대합실 및 5호선 5번 출구 / 개찰구 안: 3호선 승강장",
      "out_gate_desc": "1호선 지하 1층 1번 출구 앞 및 5호선 지하 2층 대합실 (태그 불필요)",
      "in_gate_desc": "3호선 승강장 및 1·3호선 환승로",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "5호선",
        "carNumber": "8-4",
        "direction": "여의도/방화 방면",
        "transferTimeMin": 3
      },
      {
        "targetLine": "3호선",
        "carNumber": "5-3",
        "direction": "고속터미널/수서 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "1호선",
        "carNumber": "4-1",
        "direction": "시청/서울역 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N15",
      "N26",
      "N37"
    ],
    "bikeRacks": {
      "exitNumber": 1,
      "stationName": "종로3가 1번 출구 앞",
      "availableBikes": 14
    },
    "dryWalkBuildings": [
      {
        "building_name": "종로 지하도상가",
        "connected_exit": 1,
        "type": "지하상가"
      },
      {
        "building_name": "피카디리 플러스(CGV 피카디리1958)",
        "connected_exit": 2,
        "type": "극장/귀금속상가 직결"
      }
    ],
    "park_and_ride": {
      "name": "종묘 공영주차장",
      "capacity": 490,
      "transit_discount_pct": 50,
      "fee_info": "5분당 400원 (환승 할인 50%)"
    },
    "convenience": {
      "civilKiosk": "5호선 대합실 고객지원센터 앞",
      "locker": "T-Locker 가동",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "광화문": {
    "stationName": "광화문역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 9번 출구 해치마당 / 광화문광장 직결 통로 / 개찰구 안: 5호선 승강장",
      "out_gate_desc": "지하 1층 해치마당 및 교보문고 연결통로 대합실 (태그 불필요)",
      "in_gate_desc": "5호선 승강장 마천/방화 양방향",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "5호선",
        "carNumber": "4-2",
        "direction": "여의도/방화 방면",
        "transferTimeMin": 0.5
      }
    ],
    "nightBus": [
      "N26",
      "N37"
    ],
    "bikeRacks": {
      "exitNumber": 9,
      "stationName": "광화문 해치마당 앞",
      "availableBikes": 22
    },
    "dryWalkBuildings": [
      {
        "building_name": "교보생명빌딩 & 교보문고 광화문점",
        "connected_exit": 3,
        "type": "서점/대형오피스 직결"
      },
      {
        "building_name": "세종문화회관",
        "connected_exit": 8,
        "type": "문화예술회관 직결"
      },
      {
        "building_name": "KT 광화문빌딩",
        "connected_exit": 2,
        "type": "오피스 직결"
      },
      {
        "building_name": "광화문광장 해치마당",
        "connected_exit": 9,
        "type": "광장/전시관 100% 직결"
      }
    ],
    "park_and_ride": {
      "name": "세종로 공영주차장",
      "capacity": 1260,
      "transit_discount_pct": 50,
      "fee_info": "5분당 430원 (환승 50% 감면)"
    },
    "convenience": {
      "civilKiosk": "지하 1층 해치마당 입구",
      "locker": "T-Locker 대형보관함 24함 운영",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "왕십리": {
    "stationName": "왕십리역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 비트플렉스/엔터식스 지하 1층 대합실 / 개찰구 안: 5호선 승강장",
      "out_gate_desc": "비트플렉스(엔터식스/CGV/이마트) 연결 대합실 (태그 불필요)",
      "in_gate_desc": "2호선 및 5호선 지하 환승통로 내부",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "수인분당선",
        "carNumber": "6-1",
        "direction": "선릉/수원 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "2호선",
        "carNumber": "2-2",
        "direction": "을지로/강남 방면",
        "transferTimeMin": 1
      },
      {
        "targetLine": "5호선",
        "carNumber": "5-3",
        "direction": "광화문/여의도 방면",
        "transferTimeMin": 2
      }
    ],
    "nightBus": [
      "N62"
    ],
    "bikeRacks": {
      "exitNumber": 6,
      "stationName": "왕십리역 6-1번 출구 앞",
      "availableBikes": 20
    },
    "dryWalkBuildings": [
      {
        "building_name": "비트플렉스(엔터식스 왕십리점)",
        "connected_exit": 12,
        "type": "민자역사 쇼핑몰 100% 직결"
      },
      {
        "building_name": "이마트 왕십리점 & CGV",
        "connected_exit": 12,
        "type": "마트/영화관 직결"
      }
    ],
    "park_and_ride": {
      "name": "비트플렉스 민자역사 주차장",
      "capacity": 1050,
      "transit_discount_pct": 30,
      "fee_info": "철도 이용객 할인"
    },
    "convenience": {
      "civilKiosk": "엔터식스 연결 통로",
      "locker": "T-Locker 운영",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "동대문역사문화공원": {
    "stationName": "동대문역사문화공원역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 1·2번 출구 DDP(동대문디자인플라자) 직결 통로 / 개찰구 안: 4호선 승강장",
      "out_gate_desc": "DDP 어울림광장 연결 대합실 1·2번 출구 (태그 불필요)",
      "in_gate_desc": "2·4·5호선 환승통로 지하 2층",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "4호선",
        "carNumber": "3-2",
        "direction": "명동/서울역 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "2호선",
        "carNumber": "5-4",
        "direction": "시청/신촌 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "5호선",
        "carNumber": "7-1",
        "direction": "여의도/방화 방면",
        "transferTimeMin": 2.5
      }
    ],
    "nightBus": [
      "N13",
      "N15",
      "N16",
      "N30",
      "N62"
    ],
    "bikeRacks": {
      "exitNumber": 1,
      "stationName": "DDP 1번 출구 앞",
      "availableBikes": 26
    },
    "dryWalkBuildings": [
      {
        "building_name": "DDP (동대문디자인플라자)",
        "connected_exit": 1,
        "type": "디자인랜드마크/전시관 100% 직결"
      },
      {
        "building_name": "롯데피트인(던던 DUNDUN 동대문)",
        "connected_exit": 11,
        "type": "쇼핑몰 직결"
      },
      {
        "building_name": "현대시티아울렛 동대문점",
        "connected_exit": 14,
        "type": "아울렛 지하보도 직결"
      }
    ],
    "park_and_ride": {
      "name": "DDP 지하공영주차장",
      "capacity": 360,
      "transit_discount_pct": 50,
      "fee_info": "5분당 400원 (환승 50% 할인)"
    },
    "convenience": {
      "civilKiosk": "DDP 살림터 지하 입구",
      "locker": "T-Locker 총 36함 (외국인 관광객 최적)",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "교대": {
    "stationName": "교대역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 8·9번 출구 법원·검찰청 방면 대합실 / 개찰구 안: 3호선 승강장",
      "out_gate_desc": "8·9번 출구 앞 지하 1층 대합실 (태그 불필요)",
      "in_gate_desc": "2·3호선 환승 계단 승강장 내부",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "3호선",
        "carNumber": "4-2",
        "direction": "고속터미널/압구정 방면",
        "transferTimeMin": 1
      },
      {
        "targetLine": "2호선",
        "carNumber": "7-3",
        "direction": "강남/잠실 방면",
        "transferTimeMin": 1
      }
    ],
    "nightBus": [
      "N61"
    ],
    "bikeRacks": {
      "exitNumber": 14,
      "stationName": "교대역 14번 출구 앞",
      "availableBikes": 15
    },
    "dryWalkBuildings": [
      {
        "building_name": "서울고등법원/대검찰청 통로",
        "connected_exit": 11,
        "type": "법원 연결로"
      },
      {
        "building_name": "서초 메디컬 타워",
        "connected_exit": 9,
        "type": "메디컬/오피스 직결"
      }
    ],
    "park_and_ride": {
      "name": "서초공영주차장",
      "capacity": 180,
      "transit_discount_pct": 50,
      "fee_info": "5분당 300원"
    },
    "convenience": {
      "civilKiosk": "8번 출구 대합실 (법원 서류용 무인발급기)",
      "locker": "T-Locker 16기",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "양재": {
    "stationName": "양재역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 1·2번 출구 서초구청 연결 대합실 / 개찰구 안: 신분당선 승강장",
      "out_gate_desc": "1·2번 출구 지하 1층 대합실 (태그 불필요)",
      "in_gate_desc": "신분당선 환승통로 지하 3층",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "신분당선",
        "carNumber": "2-3",
        "direction": "판교/광교 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "3호선",
        "carNumber": "6-1",
        "direction": "신사/종로 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N37",
      "N61"
    ],
    "bikeRacks": {
      "exitNumber": 12,
      "stationName": "서초구청 앞 따릉이",
      "availableBikes": 20
    },
    "dryWalkBuildings": [
      {
        "building_name": "서초구청 복합청사",
        "connected_exit": 12,
        "type": "관공서 직결"
      },
      {
        "building_name": "환승주차장 복합빌딩",
        "connected_exit": 1,
        "type": "환승센터/상가 직결"
      }
    ],
    "park_and_ride": {
      "name": "양재역 환승공영주차장",
      "capacity": 910,
      "transit_discount_pct": 50,
      "fee_info": "5분당 250원 (대중교통 환승 시 50% 할인)"
    },
    "convenience": {
      "civilKiosk": "서초구청 연결 통로 (24시간 무인민원기)",
      "locker": "T-Locker 운영",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "공덕": {
    "stationName": "공덕역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 1·2번 출구 공항철도 대합실 / 개찰구 안: 5호선 승강장",
      "out_gate_desc": "공항철도/경의중앙선 대합실 1·2번 출구 앞 (태그 불필요)",
      "in_gate_desc": "5호선 및 6호선 지하 환승통로",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "공항철도",
        "carNumber": "3-2",
        "direction": "인천공항 방면",
        "transferTimeMin": 2
      },
      {
        "targetLine": "5호선",
        "carNumber": "4-1",
        "direction": "여의도/광화문 방면",
        "transferTimeMin": 2
      },
      {
        "targetLine": "6호선",
        "carNumber": "6-3",
        "direction": "이태원/신내 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N16",
      "N75"
    ],
    "bikeRacks": {
      "exitNumber": 1,
      "stationName": "경의선 숲길 입구 따릉이",
      "availableBikes": 24
    },
    "dryWalkBuildings": [
      {
        "building_name": "글래드 마포(GLAD Hotel) & 효성인포메이션",
        "connected_exit": 8,
        "type": "호텔/오피스 직결"
      },
      {
        "building_name": "롯데캐슬 프레지던트(롯데마트)",
        "connected_exit": 2,
        "type": "주상복합/마트 직결"
      }
    ],
    "park_and_ride": {
      "name": "마포공덕 공영주차장",
      "capacity": 210,
      "transit_discount_pct": 50,
      "fee_info": "5분당 250원"
    },
    "convenience": {
      "civilKiosk": "공덕역 2번 출구 대합실",
      "locker": "T-Locker 대형보관함 24함",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "용산": {
    "stationName": "용산역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 아이파크몰 3층 역사 맞이방 / 개찰구 안: 1호선 승강장",
      "out_gate_desc": "아이파크몰 3층 KTX/전철 대합실 맞이방 (태그 불필요)",
      "in_gate_desc": "1호선 및 경의중앙선 지상 승강장",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:00 ~ 24:30 (철도역사 24시간)"
    },
    "fastTransfer": [
      {
        "targetLine": "경의중앙선",
        "carNumber": "1-1",
        "direction": "문산/용문 방면",
        "transferTimeMin": 1
      },
      {
        "targetLine": "1호선",
        "carNumber": "4-3",
        "direction": "시청/소요산 방면",
        "transferTimeMin": 1
      }
    ],
    "nightBus": [
      "N15",
      "N16"
    ],
    "bikeRacks": {
      "exitNumber": 1,
      "stationName": "용산역 광장 앞 따릉이",
      "availableBikes": 30
    },
    "dryWalkBuildings": [
      {
        "building_name": "HDC 아이파크몰 용산점",
        "connected_exit": 1,
        "type": "초대형 복합몰/CGV아이맥스 100% 직결"
      },
      {
        "building_name": "아모레퍼시픽 세계본사",
        "connected_exit": 1,
        "type": "지하 신용산역 연결로 도보 직결"
      },
      {
        "building_name": "용산역 전면 지하연결통로 (신용산역 4호선 직결)",
        "connected_exit": 1,
        "type": "100% 지하 무빙워크"
      }
    ],
    "park_and_ride": {
      "name": "용산역 아이파크몰 주차장 (철도연계)",
      "capacity": 2300,
      "transit_discount_pct": 30,
      "fee_info": "철도/전철 이용객 할인"
    },
    "convenience": {
      "civilKiosk": "용산역 3층 맞이방",
      "locker": "대형 물품보관함 80개 완비",
      "delayCertUrl": "http://www.letskorail.com"
    }
  },
  "노원": {
    "stationName": "노원역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 4호선 1·2번 출구 대합실 및 7호선 롯데백화점 통로 / 개찰구 안: 7호선 승강장",
      "out_gate_desc": "7호선 4번 출구 롯데백화점 연결통로 (태그 불필요)",
      "in_gate_desc": "7호선 지하 승강장 및 4호선 환승로",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "7호선",
        "carNumber": "5-3",
        "direction": "태릉입구/온수 방면",
        "transferTimeMin": 3
      },
      {
        "targetLine": "4호선",
        "carNumber": "3-2",
        "direction": "혜화/동대문 방면",
        "transferTimeMin": 3
      }
    ],
    "nightBus": [
      "N13",
      "N61"
    ],
    "bikeRacks": {
      "exitNumber": 4,
      "stationName": "노원역 4번 출구 앞",
      "availableBikes": 18
    },
    "dryWalkBuildings": [
      {
        "building_name": "롯데백화점 노원점",
        "connected_exit": 4,
        "type": "백화점 전층 직결"
      },
      {
        "building_name": "노원문고 본점 지하연결로",
        "connected_exit": 5,
        "type": "서점 직결"
      }
    ],
    "park_and_ride": {
      "name": "상계동 공영주차장",
      "capacity": 220,
      "transit_discount_pct": 50,
      "fee_info": "5분당 200원"
    },
    "convenience": {
      "civilKiosk": "7호선 대합실 4번 출구 앞",
      "locker": "T-Locker 운영",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "청량리": {
    "stationName": "청량리역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 롯데백화점 청량리 민자역사 3층 맞이방 / 개찰구 안: 1호선 승강장",
      "out_gate_desc": "롯데백화점/민자역사 맞이방 3층 (태그 불필요)",
      "in_gate_desc": "1호선 승강장 지하 2층",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:00 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "1호선",
        "carNumber": "1-1",
        "direction": "종로/시청 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "경의중앙선",
        "carNumber": "4-2",
        "direction": "용산/문산 방면",
        "transferTimeMin": 2
      }
    ],
    "nightBus": [
      "N26"
    ],
    "bikeRacks": {
      "exitNumber": 1,
      "stationName": "청량리 환승센터 앞",
      "availableBikes": 22
    },
    "dryWalkBuildings": [
      {
        "building_name": "롯데백화점 청량리점 & 롯데마트",
        "connected_exit": 1,
        "type": "민자역사 복합쇼핑몰 100% 직결"
      },
      {
        "building_name": "청량리역 환승센터",
        "connected_exit": 1,
        "type": "지상 버스환승센터 직결"
      }
    ],
    "park_and_ride": {
      "name": "청량리역 롯데플라자 주차장",
      "capacity": 650,
      "transit_discount_pct": 30,
      "fee_info": "철도 이용객 할인"
    },
    "convenience": {
      "civilKiosk": "3층 역사 맞이방 고객지원실 옆",
      "locker": "T-Locker 40기",
      "delayCertUrl": "http://www.letskorail.com"
    }
  },
  "삼성": {
    "stationName": "삼성역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 5·6번 출구 코엑스몰 밀레니엄광장 통로 / 개찰구 안: 2호선 승강장",
      "out_gate_desc": "코엑스몰 밀레니엄광장 지하 1층 대합실 (태그 불필요)",
      "in_gate_desc": "2호선 선릉/종합운동장 양방향 승강장",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "2호선",
        "carNumber": "6-2",
        "direction": "잠실/강남 방면",
        "transferTimeMin": 0.5
      }
    ],
    "nightBus": [
      "N13",
      "N61"
    ],
    "bikeRacks": {
      "exitNumber": 6,
      "stationName": "코엑스 밀레니엄광장 앞",
      "availableBikes": 28
    },
    "dryWalkBuildings": [
      {
        "building_name": "스타필드 코엑스몰 (Starfield COEX)",
        "connected_exit": 5,
        "type": "아시아 최대 지하몰/별마당도서관 100% 직결"
      },
      {
        "building_name": "현대백화점 무역센터점",
        "connected_exit": 5,
        "type": "백화점 전층 직결"
      },
      {
        "building_name": "파르나스타워 & 그랜드인터컨티넨탈",
        "connected_exit": 5,
        "type": "호텔/프라임오피스 직결"
      },
      {
        "building_name": "한국도심공항 (CALT)",
        "connected_exit": 5,
        "type": "공항수속/리무진 직결"
      }
    ],
    "park_and_ride": {
      "name": "탄천공영주차장",
      "capacity": 850,
      "transit_discount_pct": 50,
      "fee_info": "1일 8,000원 (대중교통 환승 50% 감면)"
    },
    "convenience": {
      "civilKiosk": "코엑스몰 진입로 별마당도서관 부근",
      "locker": "스마트 락커 50함 가동",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "선릉": {
    "stationName": "선릉역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 1·2번 출구 대합실 (태그 불필요) / 개찰구 안: 수인분당선 승강장",
      "out_gate_desc": "1·2번 출구 앞 지하 1층 대합실 (태그 불필요)",
      "in_gate_desc": "2호선-수인분당선 환승통로 지하 2층",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "수인분당선",
        "carNumber": "2-3",
        "direction": "수서/수원 방면",
        "transferTimeMin": 1
      },
      {
        "targetLine": "2호선",
        "carNumber": "4-4",
        "direction": "역삼/강남 방면",
        "transferTimeMin": 1
      }
    ],
    "nightBus": [
      "N13",
      "N61"
    ],
    "bikeRacks": {
      "exitNumber": 1,
      "stationName": "선릉역 1번 출구 앞",
      "availableBikes": 16
    },
    "dryWalkBuildings": [
      {
        "building_name": "테헤란로 선릉위워크타워",
        "connected_exit": 1,
        "type": "오피스 직결"
      },
      {
        "building_name": "선릉지하상가",
        "connected_exit": 5,
        "type": "지하상가"
      }
    ],
    "park_and_ride": {
      "name": "역삼공영주차장",
      "capacity": 170,
      "transit_discount_pct": 50,
      "fee_info": "5분당 400원"
    },
    "convenience": {
      "civilKiosk": "선릉역 지하 1층 대합실",
      "locker": "T-Locker 운영",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "가산디지털단지": {
    "stationName": "가산디지털단지역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 7호선 4번 출구 마리오아울렛 연결통로 / 개찰구 안: 1호선 승강장",
      "out_gate_desc": "7호선 4번 출구 앞 지하 1층 대합실 (태그 불필요)",
      "in_gate_desc": "7호선-1호선 환승 계단 내부",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "1호선",
        "carNumber": "7-1",
        "direction": "구로/용산 방면",
        "transferTimeMin": 1.5
      },
      {
        "targetLine": "7호선",
        "carNumber": "3-2",
        "direction": "고속터미널/온수 방면",
        "transferTimeMin": 1.5
      }
    ],
    "nightBus": [
      "N16"
    ],
    "bikeRacks": {
      "exitNumber": 5,
      "stationName": "우림라이온스밸리 앞 따릉이",
      "availableBikes": 32
    },
    "dryWalkBuildings": [
      {
        "building_name": "우림라이온스밸리 A·B·C동",
        "connected_exit": 5,
        "type": "지식산업센터 대단지 100% 직결"
      },
      {
        "building_name": "가산 SK V1 센터",
        "connected_exit": 6,
        "type": "오피스/지하상가 직결"
      }
    ],
    "park_and_ride": {
      "name": "가산디지털단지 공영주차장",
      "capacity": 280,
      "transit_discount_pct": 50,
      "fee_info": "5분당 150원 (환승 감면)"
    },
    "convenience": {
      "civilKiosk": "우림라이온스밸리 5번 출구 연결로",
      "locker": "T-Locker 24기 가동",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  },
  "을지로입구": {
    "stationName": "을지로입구역",
    "toilet": {
      "inGate": true,
      "outGate": true,
      "locationDesc": "개찰구 밖: 7·8번 출구 롯데백화점 본점 직결 통로 / 개찰구 안: 승강장 내부",
      "out_gate_desc": "7·8번 출구 롯데백화점 본점 지하 1층 연결 대합실 (태그 불필요)",
      "in_gate_desc": "2호선 을지로3가 방면 승강장",
      "accessible": true,
      "babyCare": true,
      "emergency_bell": true,
      "openHours": "05:30 ~ 24:30"
    },
    "fastTransfer": [
      {
        "targetLine": "2호선",
        "carNumber": "5-2",
        "direction": "시청/신촌 방면",
        "transferTimeMin": 0.5
      }
    ],
    "nightBus": [
      "N15",
      "N26"
    ],
    "bikeRacks": {
      "exitNumber": 8,
      "stationName": "롯데백화점 본점 앞 따릉이",
      "availableBikes": 20
    },
    "dryWalkBuildings": [
      {
        "building_name": "롯데백화점 본점 & 롯데호텔",
        "connected_exit": 7,
        "type": "명품관/호텔 100% 직결"
      },
      {
        "building_name": "롯데면세점 본점",
        "connected_exit": 8,
        "type": "면세점 직결"
      },
      {
        "building_name": "을지로 지하보도 (시청-동대문 연결)",
        "connected_exit": 1,
        "type": "연속 지하통로"
      }
    ],
    "park_and_ride": {
      "name": "청계천 노상공영주차장",
      "capacity": 150,
      "transit_discount_pct": 50,
      "fee_info": "5분당 400원"
    },
    "convenience": {
      "civilKiosk": "롯데백화점 본점 지하 입구",
      "locker": "T-Locker 운영 (외국인 쇼핑객 최적)",
      "delayCertUrl": "http://www.seoulmetro.co.kr/kr/delayProof.do"
    }
  }
};

/**
 * 역 이름으로 시민 인프라 정보를 안전하게 조회합니다.
 */
export function getStationCivicAmenity(rawStationName: string): StationAmenity | null {
  if (!rawStationName) return null;
  const clean = rawStationName.replace(/(역|[\s0-9호선\(\)])/g, "").trim();
  for (const [key, val] of Object.entries(STATION_CIVIC_AMENITIES)) {
    if (key === clean || clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }
  return null;
}
