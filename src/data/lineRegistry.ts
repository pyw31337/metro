/**
 * Canonical Line Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * 모든 노선명 변형 → canonical "X호선" / "경의중앙선" 형태로 정규화.
 * DB 쿼리용 short code (숫자만, 또는 약어)도 함께 제공.
 *
 * 사용법:
 *   import { resolveLineName, lineCode } from '@/data/lineRegistry';
 *   resolveLineName('5')           // → '5호선'
 *   resolveLineName('수도권1호선') // → '1호선'
 *   lineCode('5호선')              // → '5'  (DB key)
 */

import { SUBWAY_LINES } from './subway-lines';

// ─── Alias 테이블 ──────────────────────────────────────────────────────────────
// variant → canonical line name (subway-lines.ts 기준)

const ALIASES: Record<string, string> = {
  // 숫자만
  '1': '1호선', '01': '1호선',
  '2': '2호선', '02': '2호선',
  '3': '3호선', '03': '3호선',
  '4': '4호선', '04': '4호선',
  '5': '5호선', '05': '5호선',
  '6': '6호선', '06': '6호선',
  '7': '7호선', '07': '7호선',
  '8': '8호선', '08': '8호선',
  '9': '9호선', '09': '9호선',
  // API/DB 변형
  '수도권1호선': '1호선',
  '수도권2호선': '2호선',
  '수도권3호선': '3호선',
  '수도권4호선': '4호선',
  '수도권5호선': '5호선',
  '수도권6호선': '6호선',
  '수도권7호선': '7호선',
  '수도권8호선': '8호선',
  '수도권9호선': '9호선',
  // 경의중앙
  '경의중앙': '경의중앙선',
  '경의': '경의중앙선',
  'K': '경의중앙선',
  // 공항
  '공항': '공항철도',
  '공항철도': '공항철도',
  'AREX': '공항철도',
  // 수인분당
  '수인분당': '수인·분당선',
  '분당': '수인·분당선',
  '수인': '수인·분당선',
  '수인분당선': '수인·분당선',
  // 신분당
  '신분당': '신분당선',
  // 경춘
  '경춘': '경춘선',
  // 우이신설
  '우이신설': '우이신설선',
  '우이': '우이신설선',
  // 신림
  '신림': '신림선',
  // GTX
  'GTX-A': 'GTX-A',
  'gtx-a': 'GTX-A',
  'GTXA': 'GTX-A',
  // 인천
  '인천1': '인천1호선',
  '인천2': '인천2호선',
  // 의정부/에버라인/김포/서해
  '의정부': '의정부경전철',
  '에버라인': '에버라인',
  '용인': '에버라인',
  '김포': '김포골드라인',
  '서해': '서해선',
};

// SUBWAY_LINES의 canonical 이름도 자기 자신으로 등록
const CANONICAL_NAMES = new Set(SUBWAY_LINES.map(l => l.name));

/** DB 쿼리에 사용하는 short code: 숫자 노선은 숫자만, 나머지는 약어 */
const LINE_TO_CODE: Record<string, string> = {
  '1호선': '1', '2호선': '2', '3호선': '3', '4호선': '4',
  '5호선': '5', '6호선': '6', '7호선': '7', '8호선': '8', '9호선': '9',
  '경의중앙선': '경의중앙', '공항철도': '공항', '수인·분당선': '수인분당',
  '신분당선': '신분당', '경춘선': '경춘', '우이신설선': '우이신설',
  '신림선': '신림', 'GTX-A': 'GTX-A',
  '인천1호선': '인천1', '인천2호선': '인천2',
  '의정부경전철': '의정부', '에버라인': '에버라인',
  '김포골드라인': '김포', '서해선': '서해',
};

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 어떤 노선명 변형이든 canonical name으로 반환.
 * 매칭 실패 시 raw 그대로 반환.
 */
export function resolveLineName(raw: string): string {
  if (!raw) return raw;
  if (CANONICAL_NAMES.has(raw)) return raw;
  const trimmed = raw.trim();
  if (CANONICAL_NAMES.has(trimmed)) return trimmed;
  return ALIASES[trimmed] ?? ALIASES[trimmed.replace(/호선$/, '').replace(/선$/, '')] ?? trimmed;
}

/**
 * DB 조회용 short code 반환.
 * resolveLineName → code 순으로 변환.
 */
export function lineCode(raw: string): string {
  const canonical = resolveLineName(raw);
  return LINE_TO_CODE[canonical] ?? canonical;
}

/** canonical name → hex color */
export function lineColor(raw: string): string {
  const canonical = resolveLineName(raw);
  const line = SUBWAY_LINES.find(l => l.name === canonical);
  return line?.color ?? '#999999';
}
