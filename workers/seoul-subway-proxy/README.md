# seoul-subway-proxy (metro 전용 Cloudflare Worker)

운영 주소: `https://seoul-subway-proxy.pyw213.workers.dev`

GitHub Pages 판(https://pyw31337.github.io/metro)은 정적 사이트라서 서울 실시간 지하철 API를 브라우저가 직접 부를 수 없습니다. `swopenapi.seoul.go.kr`가 http 전용이고 CORS 헤더도 없기 때문입니다. 이 Worker가 그 사이를 맡습니다.

| 항목 | 동작 |
|---|---|
| 인증키 | Worker secret(`SEOUL_API_KEY`, 예비 `SEOUL_API_KEYS`)에만 둡니다. 앱 번들에는 없습니다. 한도 초과(ERROR-337)나 키 오류가 나면 예비 키로 넘어갑니다. |
| 허용 경로 | `/{아무값}/json/realtimePosition/{시작}/{끝}/{노선}`, `/{아무값}/json/realtimeStationArrival/{시작}/{끝}/{역}`만 받습니다. 그 외는 400을 돌려줍니다(열린 프록시가 아님). |
| CORS | `https://pyw31337.github.io`와 개발용 `http://localhost:*`, `http://127.0.0.1:*`만 허용합니다. 다른 Origin은 403입니다. |
| 캐시 | 같은 URL은 12초 동안 공유합니다(isolate 메모리 + Cache API). 정상(INFO-000)과 데이터 없음(INFO-200)만 캐시합니다. |
| 오류 | 서울시 오류 코드(한도 초과 등)를 그대로 전달합니다. Worker 자체 오류는 `PROXY-*` 코드로 돌려줍니다. |
| 제한 | IP당 분당 240회(isolate 단위, 느슨함)를 넘으면 429입니다. |
| 확인 | `GET /health`가 colo와 키 설정 여부를 알려 줍니다(키 값은 노출하지 않음). |

앱은 `NEXT_PUBLIC_SUBWAY_PROXY_URL`(저장소 Actions 변수)로 이 주소를 받습니다. Worker가 실패하면 공개 CORS 프록시와 sample 키로 대체합니다.

## 배포와 키 교체

Wrangler 4는 Node 22 이상이 필요합니다.

```bash
cd workers/seoul-subway-proxy
npx wrangler deploy
npx wrangler secret put SEOUL_API_KEY     # 실시간 지하철 인증키 (프롬프트에 붙여넣기)
npx wrangler secret put SEOUL_API_KEYS    # (선택) 예비 키, 쉼표로 구분
```

키를 교체할 때는 `secret put`만 다시 실행하면 됩니다. 앱을 다시 배포할 필요는 없습니다.

## 동작 확인

```bash
curl https://seoul-subway-proxy.pyw213.workers.dev/health
curl "https://seoul-subway-proxy.pyw213.workers.dev/KEY/json/realtimeStationArrival/0/5/강남"
```

`errorMessage.code`가 `INFO-000`이면 정상입니다. `ERROR-337`은 일일 한도 초과, `INFO-100`은 키 오류입니다. 응답 헤더의 `X-Proxy-Cache`(MISS/HIT)와 `X-Proxy-Colo`도 함께 확인하세요.
