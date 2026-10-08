/**
 * 서울 열린데이터광장 실시간 지하철 API (swopenapi.seoul.go.kr) 공통 클라이언트
 *
 * - 인증키: 빌드 타임 환경변수에서만 읽는다 (소스에 키를 하드코딩하지 않음)
 *     NEXT_PUBLIC_SEOUL_API_KEY   : 기본 키
 *     NEXT_PUBLIC_SEOUL_API_KEYS  : (선택) 쉼표로 구분한 예비 키 목록
 *   키가 없으면 'sample' 키로 동작한다 (노선당 최대 5건, 도착 API는 '서울'역만).
 *   운영(GitHub Pages)에서는 키를 번들에 넣지 않고 NEXT_PUBLIC_SUBWAY_PROXY_URL(전용 Worker)만 설정한다.
 *   Worker 가 실패하면 공개 CORS 프록시 + sample 키로 대체한다.
 *   주의: GitHub Pages 같은 정적 호스팅에서는 NEXT_PUBLIC_* 값이 번들에 그대로 포함되므로
 *   키는 공개된 것으로 간주해야 한다. 키를 숨기려면 NEXT_PUBLIC_SUBWAY_PROXY_URL 로
 *   서버측 프록시(예: workers/seoul-subway-proxy)를 지정하고 키는 프록시에만 둔다.
 *
 * - 전송 경로: swopenapi는 CORS 헤더가 없고 브라우저에서 https 접근이 불안정하므로
 *   (https 페이지에서 http 호출은 mixed content로 차단) 아래 순서로 시도한다.
 *     1) NEXT_PUBLIC_SUBWAY_PROXY_URL (직접 운영하는 프록시, 키 주입 가능)
 *     2) 개발 서버 rewrite (/api/proxy/subway, next dev 전용)
 *     3) 공개 CORS 프록시 (cors.eu.org → allorigins → codetabs, 가용성 보장 없음)
 *
 * - 응답 분류: 서울시 API는 오류도 HTTP 200 + JSON(code)으로 내려주므로
 *   code 값을 해석해 quota 초과/키 오류/데이터 없음을 구분한다.
 */

export const SEOUL_SUBWAY_HOST = 'http://swopenapi.seoul.go.kr/api/subway';

export type SeoulApiIssue = 'none' | 'quota' | 'invalid-key' | 'unreachable' | 'sample-key';

export type SeoulResultKind = 'ok' | 'no-data' | 'quota' | 'invalid-key' | 'error';

export interface SeoulResult<T = any> {
  kind: SeoulResultKind;
  code: string;
  data: T | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 키 관리
// ─────────────────────────────────────────────────────────────────────────────
function readKeys(): string[] {
  const primary = (process.env.NEXT_PUBLIC_SEOUL_API_KEY || '').trim();
  const extra = (process.env.NEXT_PUBLIC_SEOUL_API_KEYS || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
  const keys = [primary, ...extra].filter(k => k.length >= 10);
  return Array.from(new Set(keys));
}

const PROXY_URL = (process.env.NEXT_PUBLIC_SUBWAY_PROXY_URL || '').trim().replace(/\/+$/, '');

/** 프록시가 키를 주입하는 경우 클라이언트에서는 이 자리표시자를 보낸다 */
const PROXY_KEY_PLACEHOLDER = 'KEY';

/** 전용 프록시 연결 실패 시 잠시(60초) 건너뛴다 (매 요청마다 타임아웃을 기다리지 않도록) */
let _proxyDownUntil = 0;
function isProxyDown(): boolean { return Date.now() < _proxyDownUntil; }
function markProxyDown() { _proxyDownUntil = Date.now() + 60_000; }

const KEYS = readKeys();
const _exhaustedUntil: Record<string, number> = {};
let _activeIdx = 0;

function nextMidnightKst(): number {
  // KST(UTC+9) 자정 = UTC 15:00
  const now = Date.now();
  const kst = new Date(now + 9 * 3600_000);
  kst.setUTCHours(24, 0, 0, 0);
  return kst.getTime() - 9 * 3600_000;
}

function isExhausted(key: string): boolean {
  const until = _exhaustedUntil[key];
  if (!until) return false;
  if (Date.now() > until) { delete _exhaustedUntil[key]; return false; }
  return true;
}

/** 사용 가능한 키 순서 (현재 활성 키 우선). 키가 모두 소진되면 'sample'만 남는다. */
export function candidateKeys(): string[] {
  // 전용 프록시가 있으면 키는 프록시가 주입한다. 프록시가 실패하면 공개 프록시 + sample 키로 대체
  if (PROXY_URL) return isProxyDown() ? ['sample'] : [PROXY_KEY_PLACEHOLDER, 'sample'];
  const ordered: string[] = [];
  for (let i = 0; i < KEYS.length; i++) {
    const k = KEYS[(_activeIdx + i) % KEYS.length];
    if (!isExhausted(k)) ordered.push(k);
  }
  ordered.push('sample');
  return ordered;
}

export function hasRealKey(): boolean {
  return (Boolean(PROXY_URL) && !isProxyDown()) || KEYS.length > 0;
}

/** 직접 운영하는 프록시 없이 공개 CORS 프록시를 써야 하는 환경인지 (정적 배포 + 프록시 미설정) */
export function usingPublicProxy(): boolean {
  return (!PROXY_URL || isProxyDown()) && process.env.NODE_ENV !== 'development';
}

/** 지금 전용 프록시(Worker)를 쓰고 있는지 */
export function usingDedicatedProxy(): boolean {
  return Boolean(PROXY_URL) && !isProxyDown();
}

function markKey(key: string, kind: SeoulResultKind) {
  if (key === 'sample' || key === PROXY_KEY_PLACEHOLDER) return;
  if (kind === 'quota') _exhaustedUntil[key] = nextMidnightKst();
  else if (kind === 'invalid-key') _exhaustedUntil[key] = Date.now() + 6 * 3600_000;
  else if (kind === 'ok' || kind === 'no-data') {
    const idx = KEYS.indexOf(key);
    if (idx >= 0) _activeIdx = idx;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 상태 이벤트 (UI 배지에서 구독)
// ─────────────────────────────────────────────────────────────────────────────
type IssueListener = (issue: SeoulApiIssue) => void;
const _listeners = new Set<IssueListener>();
let _issue: SeoulApiIssue = 'none';

export function getSeoulApiIssue(): SeoulApiIssue { return _issue; }
export function onSeoulApiIssue(fn: IssueListener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
function setIssue(issue: SeoulApiIssue) {
  if (issue === _issue) return;
  _issue = issue;
  _listeners.forEach(fn => { try { fn(issue); } catch { /* noop */ } });
}

// ─────────────────────────────────────────────────────────────────────────────
// 시각 파싱 — 서울시 API 시각은 항상 KST (예: "2026-10-08 09:27:11")
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 서울시 API 시각 문자열을 epoch ms로 변환. 해석 불가하면 NaN.
 * 클라이언트 시간대와 무관하게 KST(+09:00)로 해석한다.
 * 주의: realtimePosition 의 lastRecptnDt 는 "20261008" 처럼 날짜만 들어오므로
 *       시각 계산에는 반드시 recptnDt 를 사용해야 한다.
 */
export function parseSeoulTime(value: string | null | undefined): number {
  if (!value) return NaN;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, se] = m;
  return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se ?? '00'}+09:00`);
}

/** 수신 시각 기준 경과 ms (미래 시각은 0으로 클램프, 해석 불가면 NaN) */
export function lagMsFrom(recptnDt: string | null | undefined, now = Date.now()): number {
  const t = parseSeoulTime(recptnDt);
  if (!Number.isFinite(t)) return NaN;
  return Math.max(0, now - t);
}

// ─────────────────────────────────────────────────────────────────────────────
// 응답 분류
// ─────────────────────────────────────────────────────────────────────────────
function extractCode(json: any): string {
  return String(
    json?.errorMessage?.code ??
    json?.RESULT?.CODE ??
    json?.code ??
    ''
  );
}

export function classifySeoulResponse(json: any): SeoulResultKind {
  if (!json || typeof json !== 'object') return 'error';
  const code = extractCode(json);
  if (code === 'INFO-000') return 'ok';
  if (code === 'INFO-200') return 'no-data';
  // ERROR-337: 일일 트래픽 초과
  if (code === 'ERROR-337') return 'quota';
  // INFO-100: 인증키 오류, INFO-300: 관리자에 의한 사용 제한, ERROR-290: 유효하지 않은 키
  if (code === 'INFO-100' || code === 'INFO-300' || code === 'ERROR-290') return 'invalid-key';
  // 목록 키가 있으면 성공으로 본다 (일부 응답은 code 누락)
  if (Object.keys(json).some(k => k.endsWith('List') && Array.isArray(json[k]))) return 'ok';
  return 'error';
}

// ─────────────────────────────────────────────────────────────────────────────
// 전송
// ─────────────────────────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV === 'development';
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

async function fetchJson(url: string, timeoutMs: number, wrapped = false, abort?: AbortSignal): Promise<any> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = abort && typeof (AbortSignal as any).any === 'function' ? (AbortSignal as any).any([timeout, abort]) : timeout;
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error('non-JSON response'); }
  if (wrapped) {
    if (!data?.contents) throw new Error('empty wrapper');
    data = typeof data.contents === 'string' ? JSON.parse(data.contents) : data.contents;
  }
  // 서울시 API 형식인지 최소 확인 (프록시 오류 페이지 걸러내기)
  if (classifySeoulResponse(data) === 'error' && !extractCode(data)) {
    throw new Error('unexpected payload');
  }
  return data;
}

/** 응답 시간이 좋은 공개 프록시를 앞으로 당기기 위한 간단한 성공 카운터 */
const _proxyScore: Record<string, number> = {};

function publicProxies(target: string): { name: string; url: string; wrapped: boolean }[] {
  const enc = encodeURIComponent(target);
  const list = [
    // cors.eu.org: 대상 URL 을 그대로 경로에 붙인다 (2026-10 확인: ACAO *, 0.5~2s)
    { name: 'cors-eu', url: `https://cors.eu.org/${target}`, wrapped: false },
    { name: 'allorigins-raw', url: `https://api.allorigins.win/raw?url=${enc}`, wrapped: false },
    { name: 'allorigins-get', url: `https://api.allorigins.win/get?url=${enc}`, wrapped: true },
    { name: 'codetabs', url: `https://api.codetabs.com/v1/proxy?quest=${enc}`, wrapped: false },
  ];
  return list.sort((a, b) => (_proxyScore[b.name] ?? 0) - (_proxyScore[a.name] ?? 0));
}

/**
 * 서울시 실시간 지하철 API 경로(키 이후 부분)를 호출한다.
 * @param pathAfterKey 예: `json/realtimePosition/0/100/2호선` (역명/노선명은 인코딩하지 않은 원문)
 */
async function transport(key: string, pathAfterKey: string): Promise<any> {
  const encodedPath = pathAfterKey.split('/').map(encodeURIComponent).join('/');

  // 1) 직접 운영하는 프록시 (키는 프록시가 주입, 응답은 프록시가 짧게 캐시하므로 캐시 무효화 파라미터를 붙이지 않는다)
  if (PROXY_URL && key === PROXY_KEY_PLACEHOLDER) {
    return fetchJson(`${PROXY_URL}/${key}/${encodedPath}`, 8000);
  }

  // 캐시 무효화 파라미터 (공개 프록시의 응답 캐시 회피)
  const salt = `_s=${Date.now().toString(36)}`;
  const target = `${SEOUL_SUBWAY_HOST}/${key}/${encodedPath}?${salt}`;

  // 2) next dev rewrite (정적 export 에서는 존재하지 않음)
  if (IS_DEV) {
    try {
      return await fetchJson(`${BASE_PATH}/api/proxy/subway/${key}/${encodedPath}?${salt}`, 4000);
    } catch { /* fall through */ }
  }

  // 3) 공개 CORS 프록시: 점수가 높은 프록시부터 시도하고, 응답이 늦으면 다음 프록시를
  //    시차를 두고 추가로 띄운다(hedged request). 첫 성공을 쓰고 나머지는 취소한다.
  //    공개 프록시는 응답이 수 초~15초까지 걸리는 경우가 있어 타임아웃을 넉넉히 둔다.
  const proxies = publicProxies(target);
  const ctrl = new AbortController();
  await acquireProxySlot();
  try {
    return await Promise.any(proxies.map(async (p, i) => {
      if (i > 0) {
        await new Promise(r => setTimeout(r, i * PROXY_HEDGE_DELAY_MS));
        if (ctrl.signal.aborted) throw new Error('cancelled');
      }
      try {
        const data = await fetchJson(p.url, PUBLIC_PROXY_TIMEOUT_MS, p.wrapped, ctrl.signal);
        _proxyScore[p.name] = (_proxyScore[p.name] ?? 0) + 1;
        return data;
      } catch (e) {
        if (!ctrl.signal.aborted) _proxyScore[p.name] = (_proxyScore[p.name] ?? 0) - 1;
        throw e;
      }
    }));
  } finally {
    ctrl.abort();
    releaseProxySlot();
  }
}

/** 공개 프록시에 동시에 보내는 요청 수 제한 (한꺼번에 몰리면 429/5xx 로 CORS 헤더 없이 실패한다) */
const MAX_PUBLIC_PROXY_CONCURRENCY = 3;
let _proxyActive = 0;
const _proxyQueue: (() => void)[] = [];
function acquireProxySlot(): Promise<void> {
  if (_proxyActive < MAX_PUBLIC_PROXY_CONCURRENCY) { _proxyActive++; return Promise.resolve(); }
  return new Promise(resolve => _proxyQueue.push(() => { _proxyActive++; resolve(); }));
}
function releaseProxySlot() {
  _proxyActive = Math.max(0, _proxyActive - 1);
  const next = _proxyQueue.shift();
  if (next) next();
}

const PUBLIC_PROXY_TIMEOUT_MS = 15000;
const PROXY_HEDGE_DELAY_MS = 3500;
/**
 * '연결 실패' 표시 조건: 연속 실패 3회 이상 + 최근 90초 동안 성공 0회.
 * 노선 하나가 일시적으로 실패해도 배지가 깜박이지 않게 한다.
 */
const UNREACHABLE_AFTER_FAILS = 3;
const UNREACHABLE_NO_SUCCESS_MS = 90_000;
let _consecutiveNetFails = 0;
let _lastNetSuccessAt = 0;

/** sample 키는 한 번에 5건까지만 허용 (넘으면 ERROR-336) → 요청 범위를 0/5 로 줄인다 */
export function limitForSampleKey(pathAfterKey: string): string {
  return pathAfterKey.replace(/^(json|xml)\/(\w+)\/\d+\/\d+\//, '$1/$2/0/5/');
}

/**
 * 키 풀을 순회하며 호출. quota/키 오류는 해당 키를 소진 처리하고 다음 키로 넘어간다.
 */
export async function callSeoulSubway<T = any>(pathAfterKey: string): Promise<SeoulResult<T>> {
  const keys = candidateKeys();
  let sawQuota = false;
  let sawInvalid = false;
  let lastErrorCode = '';

  for (const key of keys) {
    let json: any;
    try {
      const path = key === 'sample' ? limitForSampleKey(pathAfterKey) : pathAfterKey;
      json = await transport(key, path);
    } catch {
      // 전용 프록시 실패 → 공개 프록시 + sample 키로 한 번 더 시도
      if (key === PROXY_KEY_PLACEHOLDER) { markProxyDown(); continue; }
      // 네트워크/프록시 실패는 키 문제와 무관하므로 다음 키로 넘기지 않는다
      _consecutiveNetFails++;
      if (_consecutiveNetFails >= UNREACHABLE_AFTER_FAILS && Date.now() - _lastNetSuccessAt > UNREACHABLE_NO_SUCCESS_MS) {
        setIssue('unreachable');
      }
      return { kind: 'error', code: 'NETWORK', data: null };
    }
    _consecutiveNetFails = 0;
    _lastNetSuccessAt = Date.now();
    const kind = classifySeoulResponse(json);
    const code = extractCode(json);
    markKey(key, kind);

    if (kind === 'quota') { sawQuota = true; lastErrorCode = code; continue; }
    if (kind === 'invalid-key') { sawInvalid = true; lastErrorCode = code; continue; }

    if (kind === 'ok' || kind === 'no-data') {
      if (key === 'sample') setIssue(sawQuota ? 'quota' : sawInvalid ? 'invalid-key' : 'sample-key');
      else setIssue('none');
    }
    return { kind, code, data: kind === 'ok' ? (json as T) : null };
  }

  setIssue(sawQuota ? 'quota' : sawInvalid ? 'invalid-key' : 'unreachable');
  return { kind: sawQuota ? 'quota' : sawInvalid ? 'invalid-key' : 'error', code: lastErrorCode, data: null };
}
