# Let's Metro 공공 API 연동 실행 계획

제미나이의 `metro_public_api_evaluation.md`를 코드 기준으로 재정리한 운영 문서다.
현재 공개 데이터는 정적 fixture, 실시간 API, 수집기 산출물을 구분한다. `master-civic-infrastructure.json`은 UI·경로 검증용 정적 데이터이며 실시간 운영 상태로 표시하지 않는다.

## 현재 상태와 다음 연결

| 영역 | 현재 | 다음 작업 | 제품 표현 |
|---|---|---|---|
| 지하철 도착/위치 | 서울 TOPIS API + Worker fallback | 수신시각·신뢰도 공통화 | 도착 예정 + 데이터 나이 |
| 서울 실시간 도시데이터 | 혼잡 어댑터 일부 존재 | Worker 캐시·장소별 rate limit | 현재/도착지 혼잡, 사고 원인 |
| 버스 | 서울·경기 어댑터/정적 노선 | 인천·저상버스·출구 매핑 | 출구별 도착 핑 |
| 역사 시설 | `station-facilities.json`, 정적 civic fixture | 엘리베이터 운영 API로 갱신 | 무장애 가능/우회 |
| 화장실 | 공공화장실 수집기 + civic fixture | 행안부 전국 표준데이터 반경 검색 | 개찰구 안/밖, 운영시간 |
| 따릉이 | 정적 fixture/기존 데이터 구조 | `bikeList` Worker 캐시 | 출구별 잔여 대수 |
| 날씨 | Open-Meteo 브라우저 호출 | 기상청 초단기·특보 adapter | 우산 없는 경로 |
| 혼잡 | 장소 인구 데이터 | 호차별 통계/시간대 모델 | 덜 붐비는 칸 |
| 주차 | 미연결 | 서울 공영주차 실시간 adapter | 환승주차 잔여면 |

## 운영 규칙

1. 브라우저가 원천 API를 직접 호출하지 않는다. API 키와 rate limit은 Worker에서 관리한다.
2. 모든 응답은 `source`, `observedAt`, `receivedAt`, `ageSeconds`, `freshness`, `confidence`를 보존한다.
3. 정적 fixture는 `fixture` 상태로 표시하고 “실시간 운영”이라고 표현하지 않는다.
4. 서울 실시간 도시데이터는 한 장소 단위 조회이므로 현재 위치·출발역·도착역 3곳을 우선순위 큐로 조회한다.
5. API 장애 시 시간표·최근 캐시·정적 시설 순서로 fallback하고, 화면에 데이터 상태를 노출한다.

## 구현 순서

### P0

- 서울·경기·인천 버스 adapter를 Worker 뒤로 이동
- 지하철·버스·혼잡 응답에 freshness/confidence 추가
- 서울 실시간 도시데이터 사고·도로·인구 조회
- 엘리베이터 운영 상태와 따릉이 잔여 대수 연결

### P1

- 행안부 전국 개방화장실을 역 반경 300m로 검색
- 서울교통공사 최단경로 API와 자체 경로 엔진 결과 교차검증
- 저상버스와 무장애 경로 필터
- 기상청 초단기 강수·특보와 Dry Walk 추천

### P2

- 호차별 혼잡 예측
- 공영주차 Park & Ride
- 사용자 체감 혼잡 신고와 ETA 보정

## 인증키 호환성

기존 코드 일부가 `NEXT_PUBLIC_SEOUL_OPEN_DATA_KEY`를 사용하고 `.env.example`는 `NEXT_PUBLIC_SEOUL_API_KEY`를 사용하던 문제를 `src/services/apiConfig.ts`에서 통합했다. 신규 배포는 `NEXT_PUBLIC_SEOUL_API_KEY`를 사용하고, 실서비스에서는 `NEXT_PUBLIC_SUBWAY_PROXY_URL` 또는 통합 API Worker를 우선한다.
