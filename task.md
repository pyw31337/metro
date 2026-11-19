# Let's Metro (렛츠메트로) — Co-Working Task Board (Codex & Antigravity)

> **[URGENT / MANDATORY FOR CODEX]**  
> 1. 공식 명칭: **`Let's Metro (렛츠메트로)`**  
> 2. 정체성: 전철 + 시내·광역 버스 + 개찰구 안/밖 화장실 + 따릉이 통합 시민 인프라 관제.  
> 3. 협업 룰: 작업 전 반드시 `git pull --rebase origin main` 실행. 작업 완료 후 `npm run build` 검증 필수.

---

## 🚀 카카오T 벤치마크 5대 킬러 콘텐츠 구현 태스크 (In Progress)

- [x] **[태스크 1] 시민 인프라 헬퍼 데이터 에셋 구축 (Antigravity 완료)**
  - `src/data/civic-mobility-extras.ts` 생성 완료.
  - 강남, 사당, 신도림, 홍대입구, 잠실 등 거점역의 개찰구 안/밖 화장실, 빠른 환승 칸(3-3번 등), 심야 올빼미 버스(N번), 따릉이 대여소 데이터 완비.
  - 헬퍼 함수: `getStationCivicAmenity(name)` 제공.

- [x] **[태스크 2] 개찰구 안/밖 화장실 배지 및 위치 팝업 UI 바인딩 (Codex 완료)**
  - `src/components/MetroHomeV0.tsx` 및 `UnifiedBottomPanel.tsx`:
  - `getStationCivicAmenity`를 호출하여 역 선택 시:
    - `[개찰구 밖 (대합실)]`: 카드 태그 불필요 녹색 배지 (`#059669`)
    - `[개찰구 안 (승강장)]`: 승차 중 이용 가능 파란색 배지 (`#2563eb`)
    - 위치 텍스트(예: "3·4번 출구 앞 대합실") 렌더링.

- [x] **[태스크 3] 최단 빠른 환승 칸 번호 칩 렌더링 (Codex 완료)**
  - `route-diagram` 경로 노선도에서 환승 구간마다:
    - 예: `4-2번 칸 탑승 시 빠른 환승 (도보 1.5분)` 칩 표시.

- [x] **[태스크 4] 심야 올빼미 버스(N번) 및 따릉이 잔여 대수 위젯 연결 (Codex 완료)**
  - `widget-grid` 또는 `nearby-list`에 연계 심야 버스 번호 뱃지 및 역 출구 앞 따릉이 잔여 대수 표출.

- [x] **[태스크 5] 브랜드 정체성 및 렛츠 마스터 허브 크로스 링크 (Antigravity 완료)**
  - `layout.tsx` 메타데이터 및 상단 헤더 '허브' 바로가기 연계 완료.

---

## 📌 기존 완료된 최적화 태스크
- [x] MapLibre `beforeId` 레이어 순서 에러 해결
- [x] `TrainLayers.tsx` filter null 타입 에러 수정
- [x] 샛강-대방 좌표 및 가좌-서강대 분기 로직 검증
- [x] Next.js 16.1.1 Turbopack 프로덕션 빌드 무결점 통과
