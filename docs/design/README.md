# MetroLive design directions

세 시안은 색상 변형이 아니라 정보 구조와 사용 목적이 서로 다르다.

| 시안 | 강조점 | 기본 화면 구조 | 구현 우선순위 |
|---|---|---|---|
| A Ride Cockpit | 목적지까지 지금 가장 좋은 이동 결정 | 지도 배경 + 상단 검색 + 하단 경로 카드 | 1순위 홈 |
| B Station Inside-Out | 역 안에서 실제로 움직이는 방법 | 역사 평면도 + 좌측 시설 rail + 하단 다음 행동 | 역 상세 |
| C Urban Pulse | 서울 전체의 혼잡·지연·사고 판단 | 도시 지도 + 좌측 상황판 + 하단 경로 비교 | 탐색/운영 |

## 개발 고정 규칙

- 지도는 전체 화면 배경이어야 한다.
- 검색, 필터, 추천 경로는 지도 위 floating surface로 구현한다.
- A안의 하단 sheet는 화면 높이의 30~38%를 넘지 않는다.
- B안은 역사 평면도를 별도 데이터 레이어로 로드하고, 카드가 평면도를 가리지 않게 한다.
- C안의 색상은 혼잡·사고·날씨·운영상태를 서로 다른 semantic token으로 고정한다.
- 모든 실시간 값에는 데이터 시각과 신뢰도를 함께 표시한다.
- 이미지 속 텍스트를 그대로 배경 이미지로 사용하지 않고, 실제 HTML/CSS 텍스트와 컴포넌트로 재구현한다.

## 시안 이미지

- `metrolive-a-ride-cockpit.png`
- `metrolive-b-station-inside-out.png`
- `metrolive-c-urban-pulse.png`

