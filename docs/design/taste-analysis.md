# MetroLive 디자인 방향: Taste × LDS

## 결론

Taste 컬렉션의 공통점은 `라이트 모드`, `깨끗한 여백`, `작은 위젯`, `강한 타이포 대비`, `절제된 색상 포인트`다. 컬렉션을 마케팅 랜딩페이지나 포스터처럼 재현하면 사용자의 취향과 반대로 보인다. MetroLive는 LDS를 구현 규칙으로 고정하고, Taste는 밀도·색상·위젯 감각을 보정하는 레퍼런스 레이어로 사용한다.

참고 컬렉션: [Taste collection](https://buildwithtaste.com/saves/c/8e8faccc-3d09-47ea-96c4-76406daa2231)

## Taste에서 확인된 선호

| 관찰 | 실제 레퍼런스 | MetroLive 적용 |
|---|---|---|
| Clean product UI | Perplexity Search, Laravel Cloud | 흰색 표면, 1px 디바이더, 짧은 카피, 충분한 여백 |
| Compact widget | Compact Widget Dashboard | 교통·날씨·혼잡·화장실을 1~2열 소형 위젯으로 배치 |
| Strong contrast | Apple Fitness, Finance App | Pretendard 600/700, 숫자와 상태값 우선 강조 |
| Orange / mint accent | CardCorner3, Finance App | LDS 오렌지·민트는 상태/행동 포인트에만 사용 |
| Restrained elevation | Laravel Cloud, Perplexity | 기본 카드 shadow 없음, hover/sticky/modal에서만 LDS elevation 사용 |
| 8px 중심 radius | Perplexity, Compact Widget | LDS 토큰 중 `radius-sm`와 `radius-md`를 데이터 위젯에 우선 사용 |

## 이전 시안이 실패한 이유

1. 이미지 생성 모델이 “히어로 이미지·움직이는 오브제”를 거대한 배경과 장식으로 해석해 제품 화면이 전단지처럼 됐다.
2. 지도, 카드, 설명 문구가 모두 주인공이 되어 시선 우선순위가 사라졌다.
3. 실제 서비스 데이터가 아닌 가상의 텍스트와 장식이 들어가 화면 구조를 검증할 수 없었다.
4. LDS의 surface-flush 원칙과 실제 토큰을 코드로 강제하지 않았다.

따라서 다음 단계부터는 최종 UI 시안에 imagegen을 사용하지 않는다. 지도와 텍스트는 실제 코드 컴포넌트로 만들고, 필요할 때만 아이콘·지도 마커·일러스트 같은 보조 래스터 자산을 별도로 만든다.

## 고정할 화면 구조

### 모바일

- 상단 `hero-map`: 실제 지도, 초기 `46svh` 이하
- 지도 위: 위치·검색·새로고침·데이터 시각 컨트롤만 배치
- 지도 아래에서 올라오는 흰색 콘텐츠 sheet: LDS `radius-lg`, 문서 전체 세로 스크롤
- 우선순위 순서: 주변 교통 → 출발/도착/경유지 → 빠른길·덜붐비는길·무장애길 → 혼잡/지연 → 날씨 → 화장실·출구·상가
- 하단 내비게이션은 4~5개 기능만 유지하고 CTA를 과대하게 만들지 않는다.

### 태블릿/PC

- 지도 52~62%, 정보 rail 38~48%의 2열 구조
- 지도는 고정하고 rail만 세로 스크롤한다.
- 모바일과 같은 정보 순서를 유지하되 위젯을 2열로 재배치한다.

## 반(反)전단지 규칙

- 모바일 화면의 큰 제목은 24px 이하, 숫자 metric만 28px까지 허용
- 한 화면에 거대한 카드 3개 이상을 쌓지 않는다.
- 그라디언트는 상태 강조나 지도 오버레이에만 약하게 사용한다.
- 이모지는 주 아이콘으로 사용하지 않고 LDS/Lucide/교통 SVG를 사용한다.
- 일반 카드에는 그림자를 넣지 않고 hairline border로 구획한다.
- 차트는 장식이 아니라 “혼잡도 변화”, “지연 원인”, “개선량”처럼 해석 가능한 값에만 사용한다.
- 모든 실시간 값은 `수집 시각`과 `신뢰도`를 함께 표시한다.

## 구현 순서

1. `MetroLive Home v0`를 실제 코드로 구현한다. LDS CSS 변수와 Pretendard만 사용한다.
2. 390px, 768px, 1440px에서 같은 정보 구조가 유지되는지 검증한다.
3. 실제 지도와 실제 API/fixture 데이터를 연결한다. 가짜 히어로 이미지는 사용하지 않는다.
4. 스크롤 시 지도 축소, sheet 상승, 위젯 hover/press, 데이터 갱신 pulse만 인터랙션으로 추가한다.
5. 코드 화면이 안정된 뒤에만 시각적 변형을 만든다. 변형은 색상 강조나 정보 우선순위 수준으로 제한한다.

## 완료 기준

- [ ] LDS 토큰 외 임의 색상·radius·shadow가 없다.
- [ ] 모바일/태블릿/PC에서 grid overflow와 이중 스크롤이 없다.
- [ ] 지도·경로·혼잡·날씨·시설 데이터의 freshness가 보인다.
- [ ] 모든 주요 상태가 색상만으로 전달되지 않는다.
- [ ] 화면을 캡처했을 때 포스터가 아니라 실제 운송 서비스 제품 화면으로 보인다.
