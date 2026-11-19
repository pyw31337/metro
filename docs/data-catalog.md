# MetroLive data catalog

검토 기준: 2026-11-19. 이 문서는 현재 저장소에 있는 데이터와 다음 제품에서 추가할 데이터의 역할을 분리한다. 브라우저가 원천 API를 직접 호출하지 않고, 수집기/Worker가 `source -> observed_at -> received_at -> freshness -> confidence`를 보존하는 것을 원칙으로 한다.

## 현재 자산

| 영역 | 현재 자산 | 상태 | 제품 활용 |
|---|---|---|---|
| 지하철 | 역·노선·geometry·시간표·도착·열차 위치 | 실시간 위치는 역 이벤트 기반 | 내 역 도착, 운행 지도, 경로 |
| 버스 | 서울/경기 정류장·노선·경로·정류장별 노선 | 정적 데이터가 크고 지역별 편차 있음 | 버스 검색, 도착, 노선 경로 |
| 시설 | 공공화장실 약 2.8만 건, 지하철 화장실·출구·엘리베이터 | 일부 지역별 원천 파일은 비어 있음 | 접근성·생활 편의 |
| 경로 | 지하철·버스 환승 탐색, 막차 경고 | 시간표와 실시간을 분리해야 함 | 목적지까지 이동 추천 |
| 운영 | Cloudflare Worker, IndexedDB, Web Worker, Pages | API 지연·키·fallback 관찰 필요 | 데이터 품질 배지 |

## 추가 수집 우선순위

### P0: 바로 제품 가치가 생기는 데이터

- 서울 지하철 실시간 도착정보와 열차 위치
- 서울·경기·인천 버스 도착/위치
- 서울교통공사 혼잡도(요일·30분·방향)
- 지하철 역사 편의시설(엘리베이터·에스컬레이터·화장실·수유실·ATM)
- 운행 장애·공사·집회·우회
- 데이터 생성시각·API 응답시각·오류코드

### P1: 차별화 기능을 만드는 데이터

- 서울 실시간 도시데이터의 인구·교통·날씨·승하차·따릉이
- 역사 이용 안내도와 출입구/환승 통로
- 저상버스·교통약자용 도착정보
- 시간대별 역간 이동시간과 실제 지연 이력
- 공공화장실 운영시간·접근성·비상벨·기저귀대·폐쇄 여부

### P2: 고도화 데이터

- 이용자 체감 혼잡 신고
- 열차/버스 지연 확인 및 대체 경로 피드백
- 장소별 날씨·행사·사고 영향
- 개인 즐겨찾기와 익명화된 ETA 보정 신호

## 데이터 품질 계약

모든 실시간 레코드는 아래 형태로 정규화한다.

```ts
type Freshness = 'live' | 'recent' | 'stale' | 'unavailable';
type Confidence = 'high' | 'medium' | 'low';

interface TransitObservation {
  source: 'position' | 'arrival' | 'timetable' | 'crowd' | 'facility';
  observedAt: string;
  receivedAt: string;
  ageSeconds: number;
  freshness: Freshness;
  confidence: Confidence;
}
```

오래된 데이터를 정상 실시간 데이터처럼 렌더링하지 않는다. `confidence`는 추정 알고리즘의 내부값이 아니라 사용자 화면에도 노출한다.

