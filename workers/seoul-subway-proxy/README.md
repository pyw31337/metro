# seoul-subway-proxy (선택)

GitHub Pages 판(https://pyw31337.github.io/metro)은 정적 사이트라서 서울 실시간 지하철 API를 브라우저가 직접 호출할 수 없습니다.

- `swopenapi.seoul.go.kr`는 **http 전용**이고 **CORS 헤더가 없습니다**. https 페이지에서 직접 호출하면 mixed content로 차단됩니다.
- 그래서 앱은 기본으로 공개 CORS 프록시(allorigins → codetabs)를 거칩니다. 무료 서비스라 **가용성 보장이 없고**, 키가 들어간 URL이 제3자 서버를 지나갑니다.
- 이 Worker를 배포해 `NEXT_PUBLIC_SUBWAY_PROXY_URL`에 주소를 넣으면 다음이 해결됩니다.
  - 키는 Worker secret에만 있고 번들에는 들어가지 않습니다.
  - 15초 edge 캐시 덕분에 여러 사용자가 접속해도 일일 호출 한도(실시간 API 기본 1,000회/일)를 덜 씁니다.
  - 제3자 프록시에 의존하지 않습니다.

## 배포

```bash
cd workers/seoul-subway-proxy
npx wrangler deploy
npx wrangler secret put SEOUL_API_KEY   # 서울 열린데이터광장 실시간 지하철 인증키
```

그다음 GitHub 저장소 **Settings → Secrets and variables → Actions → Variables**에 `NEXT_PUBLIC_SUBWAY_PROXY_URL=https://seoul-subway-proxy.<계정>.workers.dev`를 추가하고 Pages 워크플로를 다시 실행합니다.

## 동작 확인

```bash
curl "https://seoul-subway-proxy.<계정>.workers.dev/KEY/json/realtimePosition/0/5/2호선"
```

`errorMessage.code`가 `INFO-000`이면 정상입니다. `ERROR-337`이면 일일 한도 초과, `INFO-100`이면 키 오류입니다.
