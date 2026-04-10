/**
 * Canonical Station Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * 모든 역명 변형(역 suffix, 괄호, 노선 suffix 등) → 단일 정규화 함수로 해결.
 * 전체 codebase에서 .replace(/역$/, '') 패턴을 이 모듈로 대체한다.
 *
 * 사용법:
 *   import { resolveStationName, stationIdx } from '@/data/stationRegistry';
 *   const canonical = resolveStationName('영등포구청역');  // → '영등포구청'
 *   const idx = stationIdx('7호선', '천왕역');             // → number | -1
 */

import { SUBWAY_LINES } from './subway-lines';

// ─── 정규화 함수 ─────────────────────────────────────────────────────────────

/** 역명에서 "(괄호)", "역" suffix를 제거한 기본 이름을 반환 */
export function normStation(raw: string): string {
  return raw.replace(/\(.*?\)/g, '').replace(/역$/, '').trim();
}

/** 노선명에서 "호선", "선" suffix, 선행 0 등을 제거한 코드를 반환 */
export function normLine(raw: string): string {
  return raw
    .replace(/\(.*?\)/g, '')
    .replace(/호선$/, '')
    .replace(/선$/, '')
    .replace(/^0+/, '')
    .trim();
}

// ─── 모듈 로드 시 1회 빌드되는 인덱스 ───────────────────────────────────────

/** Map< variant → canonical stationName >  (역 suffix 있는 변형 포함) */
const VARIANT_TO_CANONICAL = new Map<string, string>();

/** Map< lineName → Map< canonicalStationName → stationIndex > > */
const LINE_STATION_IDX = new Map<string, Map<string, number>>();

/** Map< canonicalStationName → { lineName, color }[] > */
const STATION_LINES = new Map<string, { lineName: string; color: string }[]>();

function buildRegistry() {
  for (const line of SUBWAY_LINES) {
    const idxMap = new Map<string, number>();
    LINE_STATION_IDX.set(line.name, idxMap);

    line.stations.forEach((s, i) => {
      const canonical = s.name; // subway-lines.ts 기준이 canonical
      const bare      = normStation(canonical);

      // 인덱스 맵: canonical 이름으로 등록
      idxMap.set(canonical, i);
      if (bare !== canonical) idxMap.set(bare, i);

      // variant → canonical 맵
      const variants = [
        canonical,
        bare,
        canonical + '역',
        bare + '역',
      ];
      for (const v of variants) {
        if (!VARIANT_TO_CANONICAL.has(v)) VARIANT_TO_CANONICAL.set(v, canonical);
      }

      // 역 → 노선 역방향 인덱스
      const entry = { lineName: line.name, color: line.color };
      const existing = STATION_LINES.get(canonical);
      if (existing) { if (!existing.some(e => e.lineName === line.name)) existing.push(entry); }
      else STATION_LINES.set(canonical, [entry]);

      // bare name도 같은 리스트로 포인트
      if (bare !== canonical) {
        STATION_LINES.set(bare, STATION_LINES.get(canonical)!);
      }
    });
  }
}

buildRegistry();

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 어떤 변형 역명이든 subway-lines.ts 기준 canonical name으로 반환.
 * 매칭 실패 시 bare(괄호·역 제거) 형태 반환.
 */
export function resolveStationName(raw: string): string {
  return VARIANT_TO_CANONICAL.get(raw) ?? VARIANT_TO_CANONICAL.get(normStation(raw)) ?? normStation(raw);
}

/**
 * 특정 노선에서 역명의 인덱스를 O(1)로 반환. 찾지 못하면 -1.
 * raw에 "역", 괄호 등이 포함돼 있어도 자동 정규화.
 */
export function stationIdx(lineName: string, raw: string): number {
  const idxMap = LINE_STATION_IDX.get(lineName);
  if (!idxMap) return -1;
  const canonical = resolveStationName(raw);
  return idxMap.get(canonical) ?? idxMap.get(raw) ?? idxMap.get(normStation(raw)) ?? -1;
}

/**
 * 역명이 속한 노선 목록 반환 (STATION_LINE_IDX 대체 가능).
 */
export function stationLines(raw: string): { lineName: string; color: string }[] {
  const canonical = resolveStationName(raw);
  return STATION_LINES.get(canonical) ?? STATION_LINES.get(normStation(raw)) ?? [];
}

/** 노선별 역 인덱스 맵 직접 접근 (고급 용도) */
export function lineStationIdxMap(lineName: string): Map<string, number> | undefined {
  return LINE_STATION_IDX.get(lineName);
}
