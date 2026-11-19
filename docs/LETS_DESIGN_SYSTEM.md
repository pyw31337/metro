# 렛츠 패밀리 통합 디자인 시스템 (Let's Design System, LDS v2.5.0)
> **최종 개정일**: 2026-11-19  
> **기준 철학**: Wide Editorial Modernism, Dieter Rams 물리적 에르고노믹스, Swiss High-Contrast Typography, Taste Skill ("Digital Craft & Tactile Modernism")  
> **적용 대상**: `Let's Hub`, `Let's People`, `Let's Asset` (`Let's Market` & `Let's Land`), `Let's Subway (Metro)`, `Let's Law`, `Let's Insu`, `Let's Art`, `Let's View`, `MeatTracker`, `Let's Camp` 등 생태계 전 서비스

---

## 1. 와이드 레이아웃 & 히어로존 원칙 (Wide Edge-to-Edge & Hero Canvas)

> [!IMPORTANT]
> **좌우 폭 꽉 찬 풀위드(Full-Width) & 와이드 히어로존 원칙**:  
> 상단 헤더, 글로벌 내비게이션 바, 메인 관제 영역을 좁은 중앙 박스(예: 1100px 박스)에 가두지 않고, **화면 좌우 가로폭을 시원하게 꽉 채우는 와이드 캔버스(Width: 100%, Max-Width: 1600px+)**로 설계합니다.  
> 특히 상단에는 브랜드의 권위와 상태를 한눈에 압도하는 **와이드 히어로존 (Wide Hero Cockpit)**을 배치하여 시각적 스케일감을 부여합니다.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  [Wide Full-Width Header Bar: 100% Edge-to-Edge with Clustered Actions]                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [Wide Hero Cockpit Section]                                                           │
│  "15대 독립 서비스 · 61개 무인 자동화 파이프라인 통합 거버넌스"                          │
│   • 초대형 Black 타이포그래피 (font-weight: 900)                                       │
│   • 섬세한 Light 보조 설명 (font-weight: 300)                                         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [Tactile Navigation Track: Full-Width Pill Carousel]                                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [Whitespace-Driven Main Sections: 56px ~ 72px Generous Negative Space]                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 타이포그래피 극명한 강약 대비 (Extreme Typographic Contrast: Black vs Light)

균일한 크기와 굵기로 글자를 오밀조밀하게 채우는 안티패턴을 엄격히 금지합니다:

- **Heavy / Black (`font-weight: 900`)**:
  - 메인 히어로 타이틀, 핵심 KPI 지표 수치, 인물명, 기업명.
  - 문자 크기는 과감하게 대형화(`36px ~ 52px`), 자간은 좁혀 탄탄한 응집력 부여(`letter-spacing: -0.04em`).
- **Thin / Light (`font-weight: 300` ~ `400`)**:
  - 서브 헤딩, 상세 메트릭 단위, 기술적 설명, 출처.
  - 넉넉한 줄간격(`line-height: 1.6`)과 섬세한 뉴트럴 톤(`color: #64748b` 또는 `#8b95a1`)으로 900 Black 수치와 압도적인 시각적 콘트라스트를 형성.
- **타뷸러 숫자 (`font-variant-numeric: tabular-nums`)**:
  - 카운트업 및 실시간 변화 시 지터링(흔들림) 원천 방지.

---

## 3. 여백 기반 공간 구획 원칙 (Whitespace-Driven Architecture)

> **"불필요한 구분선이나 칙칙한 배경색 박스를 쓰지 말고, 여백으로 확실하게 내용이 구분되게 하라."**

- **선과 면의 남발 탈피**:
  - 섹션을 구분하기 위해 진한 구분선(`border-top: 2px solid`)을 긋거나 카드마다 회색 배경 박스를 빽빽하게 겹쳐 넣는 낡은 방식을 금지합니다.
- **네거티브 스페이스(Negative Space)**:
  - 섹션 간 여백(`margin-bottom: 56px ~ 80px`), 요소 그룹 간 여백(`gap: 28px ~ 36px`)을 넉넉하게 주어 시각적 호흡감과 여유로운 프리미엄 무드를 연출합니다.
- **Flush Surface 안착**:
  - 모든 기본 카드는 서피스에 단정하게 안착(`box-shadow: none; border: 1px solid rgba(0,0,0,0.06);`)하며, 마우스 롤오버 호버 시에만 기능적으로 미세 반응(`transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.05);`)합니다.

---

## 4. 정밀 100% SVG 벡터 아이콘 표준 (Precision SVG Iconography)

- 시스템 및 서비스 UI 전역에서 **이모지(Emoji) 사용을 전면 배제**합니다.
- 모든 아이콘은 정밀한 **24x24 / 20x20 인라인 벡터 SVG** 스트로크(`stroke: currentColor; fill: none; stroke-width: 1.8~2.0; stroke-linecap: round; stroke-linejoin: round;`)로 렌더링하여 해상도 독립적이며 선명한 디지털 크래프트를 보장합니다.

---

## 5. 가로 캐러셀 인터랙션 표준 (Tactile Jitter-Tolerant Drag)

- **모바일**: 브라우저 네이티브 관성 스와이프(`-webkit-overflow-scrolling: touch`) 100% 보존.
- **데스크톱**: 마우스 지터 허용치(`10px` 이상 실질 이동 시에만 드래그 진입)로 클릭 씹힘 0% 보장.

---

## 6. 인물 8대 표준 온톨로지 & 사진 전수 매핑 표준 (`Let's People`)

- **8대 표준 한 단어 체계**:
  `이력` · `경력` · `재산` · `학연` · `지연` · `인척` · `범죄` · `체납`
- **실제 고화질 사진 전수 매핑 (Universal WebP Portraits)**:
  - 플레이스홀더 이모지를 금지하고, 모든 인물 카드에 WebP 압축 기반 고해상도 인물 사진을 전수 매핑합니다.

---

## 7. 렛츠에셋 로드맵: 이원 전문 서비스 분립 규격 (`Let's Asset`)

- **`Let's Market (금융투자)`**: KOSPI/KOSDAQ 상장 주식, DART 지분 공시, 채권, 기업 실적(매출/영업이익/시가총액).
- **`Let's Land (현물투자 · 가칭)`**: 프라임 오피스(서초사옥, 판교 아지트 등), 상업용 빌딩, 토지, 고급 주택, 담보/압류 현황.
- **인물-기업-자산-체납 연계 온톨로지 브리지**: 인물 주식/부동산 자산 규모 vs 체납액, 납부 여력, 강제징수 위험도 연계.
