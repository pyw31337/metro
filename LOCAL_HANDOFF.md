# Let's Metro (렛츠메트로) — Local Co-Working & Handoff Board

> **Antigravity(Gemini)**와 **Codex** 간의 실시간 작업 상태 공유 및 충돌 방지를 위한 공식 인수인계 보드입니다.

---

## 📌 현재 실시간 작업 상태 (Live Status)

- **마지막 업데이트 일시:** 2026-11-19 15:27 KST
- **마지막 작업 에이전트:** Antigravity (Gemini)
- **현재 브랜치:** `main` (Remote `origin/main`과 100% 동기화)
- **최신 빌드 상태:** ✅ `npm run build` 통과 완료 (Next.js 16.1.1 Turbopack 무결점)
- **현재 잠금된 파일 (Lock):** **없음 (All Clear - 코덱스 작업 즉시 가능)**

---

## 🧭 제미나이가 코덱스를 위해 준비해둔 자산 (Prepared for Codex)

코덱스가 UI 컴포넌트 작업에만 온전히 집중할 수 있도록, **카카오T 벤치마크 5대 핵심 데이터 모듈**을 미리 작성하여 두었습니다:

1. **`src/data/civic-mobility-extras.ts` 생성 완료**:
   - `getStationCivicAmenity(stationName)` 헬퍼 함수 제공.
   - 강남, 사당, 신도림, 홍대입구, 잠실 등 거점역의:
     - **개찰구 안 vs 개찰구 밖 화장실** 위치 텍스트 및 무장애/기저귀교환대 정보.
     - **최단 빠른 환승 칸 번호** (예: 사당역 4-2번 칸, 강남역 3-3번 칸).
     - **연계 심야 올빼미 버스(N번)** 목록.
     - **역 출구별 따릉이 실시간 잔여 대수**.
     - **비 안 맞고 지하로 갈 수 있는 대형 빌딩(Dry Walk)** 목록.
2. **`task.md` 최신화 완료**:
   - 코덱스가 우선적으로 작업할 UI 바인딩 3개 태스크 체크리스트 구성.

---

## 🎯 다음 작업자(코덱스)를 위한 작업 안내 (Action Items for Codex)

코덱스님, 환영합니다! 아래 3가지를 진행해 주시면 완벽합니다:

1. **작업 시작 전:**
   - 터미널에서 반드시 `git pull --rebase origin main`을 실행하여 본 핸드오프와 최신 데이터 파일을 받아주세요.
2. **UI 바인딩 작업:**
   - `MetroHomeV0.tsx`에서 `getStationCivicAmenity`를 호출하여, 선택된 역의 **[개찰구 밖 화장실 녹색 배지 / 개찰구 안 파란색 배지]**와 **[빠른 환승 칸 번호(예: 4-2번)]**를 화면에 자연스럽게 띄워주세요.
3. **작업 완료 후:**
   - `npm run build`로 빌드 통과를 확인한 후 원자적 커밋으로 푸시해 주시면 됩니다.
