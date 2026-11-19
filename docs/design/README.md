# MetroLive design directions

이 문서의 최신 시안은 LDS v2.4.0 라이트모드와 모바일 우선 레이아웃을 기준으로 한다. 지도는 배경 hero zone이고, 콘텐츠는 아래로 스크롤되며, 이미지 속 텍스트는 실제 HTML/CSS 컴포넌트로 재구현한다.

| 시안 | 강조점 | 기본 화면 구조 | 구현 우선순위 |
|---|---|---|---|
| A Nearby Mobility | 내 주변 교통수단을 빠르게 확인하고 출발/도착/경유지를 설정 | 지도 hero + 주변 교통 카드 + 경로 옵션 | 1순위 홈 |
| B Station Inside | 역 안에서 실제로 움직이는 방법 | 역사 평면도 + GPS 경로 + 시설/출구 sheet | 역 상세 |
| C Live Conditions | 지연 이유와 현재·목적지 상황을 이해 | 지도 hero + 날씨/혼잡/사고 카드 + 회피경로 | 이동 상황 |

## 개발 고정 규칙

- 지도는 전체 화면 배경이어야 한다.
- 검색, 필터, 추천 경로는 지도 위 floating surface로 구현한다.
- A안의 하단 sheet는 화면 높이의 30~38%를 넘지 않는다.
- B안은 역사 평면도를 별도 데이터 레이어로 로드하고, 카드가 평면도를 가리지 않게 한다.
- C안의 색상은 혼잡·사고·날씨·운영상태를 서로 다른 semantic token으로 고정한다.
- 모든 실시간 값에는 데이터 시각과 신뢰도를 함께 표시한다.
- 이미지 속 텍스트를 그대로 배경 이미지로 사용하지 않고, 실제 HTML/CSS 텍스트와 컴포넌트로 재구현한다.

## 스크롤 동작 계약

- 모바일: `hero-map`은 상단에 `position: sticky`로 남고, 콘텐츠 sheet가 그 위를 덮으며 올라온다.
- 초기 hero 높이: `min(46svh, 420px)`; 스크롤 진행 후 지도는 `min(25svh, 220px)`까지 축소한다.
- 지도 위 보라색 LDS hero layer는 투명도만 줄이고, 콘텐츠가 올라올 때 보라색 헤더가 완전히 사라지지 않는다.
- 콘텐츠는 별도 내부 스크롤을 만들지 않고 문서 전체가 세로 스크롤한다. 이중 스크롤을 금지한다.
- PC: 지도 hero를 좌측 56~62%에 고정하고, 우측 추천/정보 sheet가 세로로 스크롤한다.
- 태블릿: 지도 52%, 하단 sheet 48%의 split layout으로 전환한다.
- 320px 폭까지 8pt spacing, `--radius-md/lg`, Pretendard Variable, LDS semantic color token만 사용한다.

## 최신 라이트모드 시안

- `metrolive-light-a-nearby-mobility.png`
- `metrolive-light-b-station-inside.png`
- `metrolive-light-c-live-conditions.png`

## 이전 탐색 시안

- `metrolive-a-ride-cockpit.png`
- `metrolive-b-station-inside-out.png`
- `metrolive-c-urban-pulse.png`

