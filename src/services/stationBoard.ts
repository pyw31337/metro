/**
 * "내 역" 도착 안내 보드 (서울시 실시간 도착정보 realtimeStationArrival 기반).
 *
 * 원칙
 *  - 남은 시간은 barvlDt(데이터 생성 시각 기준)에서 (지금 − recptnDt)를 빼서 보정한다.
 *  - barvlDt 가 없는(0) 노선(예: 1호선)은 남은 정거장 수로 "추정"하고, 화면에 추정이라고 표시한다.
 *  - 이미 출발한 열차(당역 출발)와 10분 넘게 갱신되지 않은 기록(유령)은 보여주지 않는다.
 */
import { callSeoulSubway, lagMsFrom, parseSeoulTime } from './seoulApi';
import { normStation } from '@/data/stationRegistry';
import { SUBWAY_LINES } from '@/data/subway-lines';
import { getLineGraph, stationKey, shortestPath } from '@/geo/lineNetwork';

export const SUBWAY_ID_LINE: Record<string, string> = {
  '1001': '1호선', '1002': '2호선', '1003': '3호선', '1004': '4호선', '1005': '5호선',
  '1006': '6호선', '1007': '7호선', '1008': '8호선', '1009': '9호선',
  '1061': '경의중앙선', '1063': '경의중앙선', '1065': '공항철도', '1067': '경춘선', '1075': '수인분당선',
  '1077': '신분당선', '1081': '경강선', '1092': '우이신설선', '1093': '서해선', '1094': '신림선', '1032': 'GTX-A',
};

const LINE_COLORS = new Map(SUBWAY_LINES.map(l => [l.name, l.color]));
export const lineColor = (lineName: string) => LINE_COLORS.get(lineName) ?? '#71717a';

export interface RawArrival {
  subwayId?: string; updnLine?: string; trainLineNm?: string; statnNm?: string;
  arvlMsg2?: string; arvlMsg3?: string; arvlCd?: string; barvlDt?: string;
  bstatnNm?: string; btrainNo?: string; btrainSttus?: string; recptnDt?: string; ordkey?: string; lstcarAt?: string;
}

export type EtaKind = 'reported' | 'estimated' | 'at-station';

export interface BoardTrain {
  trainNo: string;
  dest: string;
  express: boolean;
  lastTrain: boolean;
  /** 지금 기준 남은 초 (at-station 이면 0) */
  etaSec: number;
  /** reported: barvlDt 보정값 · estimated: 정거장 수로 추정 · at-station: 진입/도착 상태 */
  etaKind: EtaKind;
  statusText: string;       // 원문 상태 (arvlMsg2)
  arvlCd: string;
  stopsAway: number | null;
  location: string;         // 현재 위치 (arvlMsg3)
  recptnTs: number;         // 데이터 생성 시각 (epoch ms, 모르면 NaN)
  ageSec: number | null;    // 지금 − 데이터 생성 시각
  stale: boolean;           // 90초 넘게 갱신 안 됨
}

export interface BoardGroup {
  key: string;
  lineName: string;
  color: string;
  updnLine: string;
  /** "역삼방면" 같은 진행 방향 (trainLineNm 의 뒷부분) */
  heading: string;
  trains: BoardTrain[];
}

const GHOST_SEC = 10 * 60;      // 10분 넘게 갱신 없는 기록은 숨김
const STALE_SEC = 90;
const PER_STOP_SEC = 120;       // 정거장당 평균 소요(주행+정차) — 추정치에만 사용
const STATUS_ETA: Record<string, number> = { '3': 90, '4': 120, '5': 110 }; // 전역 출발/진입/도착 → 당역까지 대략
const AT_STATION_MAX_AGE_SEC = 150; // '도착/진입' 기록이 이보다 오래되면 이미 떠났을 가능성이 커서 숨김
const OVERDUE_SEC = 120;            // 예정 도착 시각이 이만큼 지났는데 갱신이 없으면 숨김

/** 순환선(2호선)은 진행 방향으로, 나머지는 최단 경로로 정거장 수를 센다 */
export function stopsBetween(lineName: string, from: string, to: string, updnLine?: string): number | null {
  const g = getLineGraph(lineName);
  if (!g) return null;
  const a = stationKey(from), b = stationKey(to);
  if (!g.nodes.has(a) || !g.nodes.has(b)) return null;
  if (g.loop && g.loop.includes(a) && g.loop.includes(b) && updnLine && /내선|외선/.test(updnLine)) {
    const L = g.loop, n = L.length;
    const step = /내선/.test(updnLine) ? 1 : -1; // 내선 = 배열 순서
    let i = L.indexOf(a), c = 0;
    while (L[i] !== b && c < n) { i = (i + step + n) % n; c++; }
    return c < n ? c : null;
  }
  const p = shortestPath(g, a, b);
  return p ? p.length - 1 : null;
}

function stopsAwayOf(r: RawArrival, lineName: string): number | null {
  const code = String(r.arvlCd ?? '');
  if (code === '0' || code === '1') return 0;
  if (code === '3' || code === '4' || code === '5') return 1;
  const m = /\[(\d+)\]번째/.exec(r.arvlMsg2 ?? '');
  if (m) return parseInt(m[1], 10);
  const loc = (r.arvlMsg3 ?? '').trim();
  if (loc && r.statnNm) {
    const s = stopsBetween(lineName, loc, r.statnNm, r.updnLine);
    if (s !== null) return s;
  }
  return null;
}

export function buildBoardTrain(r: RawArrival, lineName: string, now: number): BoardTrain | null {
  const code = String(r.arvlCd ?? '99');
  if (code === '2') return null; // 이미 출발
  const recptnTs = parseSeoulTime(r.recptnDt);
  const lag = lagMsFrom(r.recptnDt, now);
  const ageSec = Number.isFinite(lag) ? Math.floor(lag / 1000) : null;
  if (ageSec !== null && ageSec > GHOST_SEC) return null;

  const stopsAway = stopsAwayOf(r, lineName);
  const barvl = parseInt(r.barvlDt ?? '', 10);
  const age = ageSec ?? 0;
  let etaSec: number, etaKind: EtaKind;
  let rawEta: number;
  if (code === '0' || code === '1') {
    if (age > AT_STATION_MAX_AGE_SEC) return null;
    rawEta = 0; etaKind = 'at-station';
  }
  else if (Number.isFinite(barvl) && barvl > 0) { rawEta = barvl - age; etaKind = 'reported'; }
  else if (STATUS_ETA[code] !== undefined) { rawEta = STATUS_ETA[code] - age; etaKind = 'estimated'; }
  else if (stopsAway !== null && stopsAway > 0) { rawEta = stopsAway * PER_STOP_SEC - age; etaKind = 'estimated'; }
  else return null; // 위치도 시간도 알 수 없으면 보여주지 않는다
  if (etaKind !== 'at-station' && rawEta < -OVERDUE_SEC) return null; // 이미 지나갔을 열차
  etaSec = Math.max(0, rawEta);

  const dest = normStation(String(r.bstatnNm || (r.trainLineNm ?? '').split(/행|\s-\s/)[0] || ''));
  return {
    trainNo: String(r.btrainNo ?? ''),
    dest,
    express: /급행|ITX|특급/.test(String(r.btrainSttus ?? '')),
    lastTrain: String(r.lstcarAt ?? '') === '1',
    etaSec, etaKind,
    statusText: String(r.arvlMsg2 ?? ''),
    arvlCd: code,
    stopsAway,
    location: String(r.arvlMsg3 ?? ''),
    recptnTs,
    ageSec,
    stale: ageSec !== null && ageSec > STALE_SEC,
  };
}

/** 노선·방향별로 묶고 다음 열차 2대를 고른다 */
export function buildBoard(raw: RawArrival[], now: number, perGroup = 2): BoardGroup[] {
  const groups = new Map<string, BoardGroup & { seen: Set<string> }>();
  for (const r of raw) {
    const lineName = SUBWAY_ID_LINE[String(r.subwayId ?? '')] ?? String(r.subwayId ?? '');
    const t = buildBoardTrain(r, lineName, now);
    if (!t) continue;
    const updn = String(r.updnLine ?? '');
    const heading = (String(r.trainLineNm ?? '').split(/\s-\s/)[1] ?? '').trim();
    const key = `${lineName}|${updn}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, lineName, color: lineColor(lineName), updnLine: updn, heading, trains: [], seen: new Set() };
      groups.set(key, g);
    }
    if (!g.heading && heading) g.heading = heading;
    const id = t.trainNo && t.trainNo !== '0000' ? t.trainNo : `${t.dest}-${t.location}-${t.statusText}`;
    if (g.seen.has(id)) {
      // 같은 열차가 중복되면 더 최신 기록을 쓴다
      const i = g.trains.findIndex(x => (x.trainNo || `${x.dest}-${x.location}-${x.statusText}`) === id);
      if (i >= 0 && (t.ageSec ?? 1e9) < (g.trains[i].ageSec ?? 1e9)) g.trains[i] = t;
      continue;
    }
    g.seen.add(id);
    g.trains.push(t);
  }
  const lineOrder = (n: string) => { const m = /^(\d)호선/.exec(n); return m ? parseInt(m[1], 10) : 100; };
  return Array.from(groups.values())
    .map(({ seen: _seen, ...g }) => ({
      ...g,
      trains: g.trains
        .sort((a, b) => a.etaSec - b.etaSec || (a.stopsAway ?? 99) - (b.stopsAway ?? 99))
        .slice(0, perGroup),
    }))
    .filter(g => g.trains.length > 0)
    .sort((a, b) => lineOrder(a.lineName) - lineOrder(b.lineName) || a.lineName.localeCompare(b.lineName) || a.updnLine.localeCompare(b.updnLine));
}

/** 남은 시간을 사람이 읽는 문장으로 */
export function formatEta(t: BoardTrain): string {
  if (t.etaKind === 'at-station') return t.arvlCd === '0' ? '진입 중' : '도착';
  if (t.etaSec < 30) return '곧 도착';
  const m = Math.floor(t.etaSec / 60), s = t.etaSec % 60;
  if (t.etaKind === 'estimated') return `약 ${Math.max(1, Math.round(t.etaSec / 60))}분`;
  return m > 0 ? `${m}분 ${String(s).padStart(2, '0')}초` : `${s}초`;
}

export type BoardFetchResult =
  | { kind: 'ok'; raw: RawArrival[]; fetchedAt: number }
  | { kind: 'no-data' | 'quota' | 'invalid-key' | 'error'; raw: []; fetchedAt: number };

/** API 역명 표기 차이 */
const QUERY_VARIANTS: Record<string, string[]> = {
  '서울역': ['서울'], '총신대입구': ['총신대입구(이수)', '이수'], '이수': ['총신대입구(이수)'],
  '불암산': ['당고개'], '당고개': ['불암산'],
};

export async function fetchBoard(stationName: string): Promise<BoardFetchResult> {
  const base = normStation(stationName);
  const tries = [base, ...(QUERY_VARIANTS[base] ?? [])];
  let last: BoardFetchResult['kind'] = 'error';
  for (const name of tries) {
    const res = await callSeoulSubway(`json/realtimeStationArrival/0/40/${name}`);
    if (res.kind === 'ok') {
      const raw: RawArrival[] = (res.data as any)?.realtimeArrivalList ?? [];
      return { kind: 'ok', raw, fetchedAt: Date.now() };
    }
    last = res.kind;
    if (res.kind !== 'no-data') break;
  }
  return { kind: last as any, raw: [], fetchedAt: Date.now() };
}
