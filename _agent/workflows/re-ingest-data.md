---
description: 전국 교통 데이터 정기 재수집 및 정규화 프로세스 (Subway, Bus, Toilets)
---

데이터 정기 재수집 및 정규화 워크플로우입니다. API 할당량이 초기화된 후 실행하는 것을 권장하며, 모든 수집 스크립트에는 안전 장치(Safe-Save)가 적용되어 있어 실패 시 기존 데이터를 보호합니다.

// turbo-all

1. 전국 지하철 역, 버스 정류장, 전국 화장실 기본 통합 수집
   `node scripts/ingest-all.js`

2. 버스 노선 및 정류장 상세 매핑 수집 (수도권 위주)
   `node scripts/ingest-station-mappings.js`

3. 버스 노선 경로(Polyline) 좌표 수집
   `node scripts/ingest-route-paths.js`

4. 수집된 개별 데이터를 마스터 JSON으로 통합 및 최적화
   `node scripts/consolidate-data.js`

5. 전국 주요 지하철 역사 시간표(Timetable) 생성 및 수집
   `node scripts/ingest-schedules.js`

6. (선택사항) 배포를 위한 Next.js 빌드 실행
   `npm run build`
