# Metro Live

수도권 지하철 열차 위치를 지도에 실시간으로 보여주고, 경로·버스·화장실을 한 화면에서 찾는 웹앱입니다.

- 서비스 주소: https://pyw31337.github.io/metro/ (GitHub Pages)
- 실시간 지하철 중계: https://seoul-subway-proxy.pyw213.workers.dev (Cloudflare Worker, `workers/seoul-subway-proxy`)

## 실시간 열차 위치는 이렇게 계산합니다

1. 서울 열린데이터광장 `realtimePosition`(노선별)으로 열차마다 **마지막 이벤트**를 받습니다. 이벤트는 `statnNm`(역), `trainSttus`(0 진입, 1 도착, 2 출발, 3 전역출발), `recptnDt`(발생 시각, KST)입니다.
   - `lastRecptnDt`에는 날짜만 들어 있어서 시각 계산에 쓰지 않습니다.
2. `now - recptnDt`만큼 앞으로 보정합니다. 서버 시각이 미래로 찍혀 오면 0으로 처리합니다.
3. 역 사이 소요시간은 시간표 기반 데이터(`public/data/korail-travel-times.json`)를 쓰고, 데이터가 없으면 거리/속도로 추정해 보간합니다.
4. 같은 역에서 상태가 바뀌면(도착 → 출발) 그 시점으로 다시 맞춥니다.
5. 10분 넘게 갱신되지 않은 열차는 숨깁니다. 정차 중이면 20분까지 둡니다.
6. 종착역 대기 열차는 `realtimeStationArrival`로 보완합니다. 이때 `bstatnNm`은 종착역이므로 위치로 쓰지 않고 `arvlMsg3`(현재 위치)를 씁니다. 서울시 밖 역은 이 API가 제공하지 않아 호출하지 않습니다.

## 환경 변수

| 이름 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUBWAY_PROXY_URL` | 실시간 지하철 중계(Worker) 주소. 운영에서는 저장소 Actions 변수로 설정되어 있고, 인증키는 Worker secret 에만 있습니다. |
| `NEXT_PUBLIC_SEOUL_API_KEY` / `_KEYS` | (로컬 개발용, 선택) 프록시 없이 직접 호출할 때의 키. 운영 빌드에는 넣지 않습니다. 둘 다 없으면 `sample` 키(노선당 5대)로 동작합니다. |

> 주의: `NEXT_PUBLIC_*` 값은 정적 번들에 그대로 들어가므로 누구나 볼 수 있습니다. 인증키는 Worker secret 에만 두세요.

## 정적 배포에서 API 호출 경로

`swopenapi.seoul.go.kr`는 http 전용이고 CORS 헤더가 없어서, https 페이지(GitHub Pages)에서는 브라우저가 직접 호출할 수 없습니다. 그래서 아래 순서로 시도합니다.

1. `NEXT_PUBLIC_SUBWAY_PROXY_URL` — 전용 Cloudflare Worker (키 주입, 12초 공유 캐시)
2. `next dev`의 rewrite (`/api/proxy/subway`, 개발 서버에서만)
3. Worker 장애 시 대체: 공개 CORS 프록시(cors.eu.org → allorigins → codetabs) + `sample` 키. 무료 서비스라 **가용성을 보장하지 않습니다.**

호출 한도 초과, 키 오류, 연결 실패는 화면 왼쪽 위 상태 표시에 그대로 나타납니다.

## 개발

```bash
npm ci
npm run dev        # http://localhost:3000/metro
npm test           # vitest (실시간 위치 계산 단위 테스트)
npm run typecheck
npx next build     # out/ 에 정적 export
```

## 배포

- **웹앱 (GitHub Pages)**: `.github/workflows/pages.yml`이 `main`에 push될 때 타입 검사·테스트·빌드 후 `out/`을 Pages로 배포합니다. 저장소 **Settings → Pages → Source**가 **GitHub Actions**여야 합니다. 배포 워크플로는 이것 하나뿐입니다(Firebase Hosting 배포는 2026-10 제거).
- **실시간 중계 (Cloudflare Worker)**: `workers/seoul-subway-proxy/README.md` 참고. 키 교체는 `npx wrangler secret put SEOUL_API_KEY` 만 하면 되고 앱 재배포는 필요 없습니다.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
