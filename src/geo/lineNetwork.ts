/**
 * 노선 네트워크 (노선별 역 그래프 + 지도에 그리는 선형).
 *
 * 핵심 원칙: 지도에 그리는 노선 선과 열차가 움직이는 경로는 "같은 데이터"에서 나온다.
 *  - 지선(SubwayLine)마다 인접한 두 역을 잇는 구간(edge)을 만든다.
 *  - 역 좌표는 노선 안에서 하나로 통일한다(분기역이 지선마다 좌표가 조금씩 달라도 한 점으로).
 *  - 지도 선(branchPolylines)도, 열차 경로(edgePath)도 이 통일 좌표로 만든다.
 *  → 열차는 항상 그려진 선 위에만 있을 수 있다.
 *
 * 분기 처리: 같은 노선명(1호선, 2호선, 5호선, 경의중앙선 …)의 모든 지선을 하나의 그래프로 묶고,
 * 종착역까지의 최단 경로로 다음 역을 고른다. 판단할 수 없으면(분기역인데 종착역을 모름 등)
 * 다음 역을 정하지 않는다(= 확인된 역에 머문다).
 */
import { SUBWAY_LINES, SubwayLine } from '@/data/subway-lines';
import { normStation } from '@/data/stationRegistry';
import { LngLat } from './geoMath';

export interface NetNode {
  key: string;          // 정규화된 역명 (normStation)
  name: string;         // 원래 역명 (첫 등장)
  coord: LngLat;        // 노선 내 통일 좌표
  neighbors: Set<string>;
}

export interface NetEdge {
  a: string;
  b: string;
  branchId: string;
  path: LngLat[];       // a → b
}

export interface LineGraph {
  name: string;
  color: string;
  nodes: Map<string, NetNode>;
  edges: Map<string, NetEdge>;      // `${a}|${b}` (양방향 모두 등록, path 는 방향에 맞춤)
  branches: { id: string; keys: string[] }[];
  /** 순환선 역 순서 (2호선 본선). 내선(0) = 배열 순서 방향 */
  loop: string[] | null;
  /** 단방향 구간에서 금지된 진행 방향 `${from}|${to}` (6호선 응암순환: 응암→역촌→불광→독바위→연신내→구산→응암) */
  forbidden: Set<string>;
}

// API 표기와 노선 데이터 표기가 다른 역 (개명/병기)
const KEY_ALIAS: Record<string, string> = {
  '불암산': '당고개',        // 4호선 2024 개명
  '총신대입구': '이수',      // API: 총신대입구(이수), 데이터: 이수(총신대)
  '세종왕릉': '세종대왕릉',
  '응암순환': '응암',
};

export const stationKey = (name: string): string => {
  const k = normStation(String(name ?? '')).replace(/종착$/, '').replace(/행$/, '').replace(/[·ㆍ]/g, '.').replace(/\s/g, '').trim();
  return KEY_ALIAS[k] ?? k;
};

function build(): Map<string, LineGraph> {
  const graphs = new Map<string, LineGraph>();
  for (const line of SUBWAY_LINES as SubwayLine[]) {
    let g = graphs.get(line.name);
    if (!g) {
      g = { name: line.name, color: line.color, nodes: new Map(), edges: new Map(), branches: [], loop: null, forbidden: new Set() };
      graphs.set(line.name, g);
    }
    const keys = line.stations.map(s => stationKey(s.name));
    for (let i = 0; i < line.stations.length; i++) {
      const s = line.stations[i];
      const k = keys[i];
      if (!g.nodes.has(k)) g.nodes.set(k, { key: k, name: s.name, coord: [s.lng, s.lat], neighbors: new Set() });
    }
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      if (a === b) continue;
      g.nodes.get(a)!.neighbors.add(b);
      g.nodes.get(b)!.neighbors.add(a);
      if (!g.edges.has(`${a}|${b}`)) {
        const pa = g.nodes.get(a)!.coord, pb = g.nodes.get(b)!.coord;
        g.edges.set(`${a}|${b}`, { a, b, branchId: line.id, path: [pa, pb] });
        g.edges.set(`${b}|${a}`, { a: b, b: a, branchId: line.id, path: [pb, pa] });
      }
    }
    g.branches.push({ id: line.id, keys });
    if (keys.length > 2 && keys[0] === keys[keys.length - 1]) g.loop = keys.slice(0, -1);
    else {
      // 지선 중간에 같은 역이 다시 나오면 그 사이는 단방향 순환 구간 (배열 순서로만 운행)
      for (let i = 0; i < keys.length; i++) {
        const j = keys.indexOf(keys[i], i + 1);
        if (j > i + 2) {
          for (let t = i; t < j; t++) g.forbidden.add(`${keys[t + 1]}|${keys[t]}`);
          break;
        }
      }
    }
  }
  return graphs;
}

const GRAPHS = build();

export function getLineGraph(lineName: string): LineGraph | undefined {
  return GRAPHS.get(lineName);
}

export function allLineGraphs(): LineGraph[] {
  return Array.from(GRAPHS.values());
}

/** 인접한 두 역 사이 경로 (a → b). 인접하지 않으면 null */
export function edgePath(lineName: string, a: string, b: string): LngLat[] | null {
  const e = GRAPHS.get(lineName)?.edges.get(`${a}|${b}`);
  return e ? e.path : null;
}

/** 지도에 그릴 지선별 선형 (열차 경로와 같은 좌표) */
export function branchPolylines(): { id: string; name: string; color: string; coords: LngLat[] }[] {
  const out: { id: string; name: string; color: string; coords: LngLat[] }[] = [];
  for (const line of SUBWAY_LINES as SubwayLine[]) {
    const g = GRAPHS.get(line.name)!;
    const coords = line.stations.map(s => g.nodes.get(stationKey(s.name))!.coord);
    out.push({ id: line.id, name: line.name, color: line.color, coords });
  }
  return out;
}

/** 노선 내 역 좌표 (통일 좌표) */
export function stationCoord(lineName: string, station: string): LngLat | null {
  return GRAPHS.get(lineName)?.nodes.get(stationKey(station))?.coord ?? null;
}

/** 최단 경로 (역 키 배열). 없으면 null */
export function shortestPath(g: LineGraph, from: string, to: string): string[] | null {
  if (!g.nodes.has(from) || !g.nodes.has(to)) return null;
  if (from === to) return [from];
  const prev = new Map<string, string>();
  const q = [from];
  const seen = new Set([from]);
  while (q.length) {
    const cur = q.shift()!;
    for (const n of g.nodes.get(cur)!.neighbors) {
      if (seen.has(n) || g.forbidden.has(`${cur}|${n}`)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === to) {
        const path = [to];
        let p = to;
        while (prev.has(p)) { p = prev.get(p)!; path.unshift(p); }
        return path;
      }
      q.push(n);
    }
  }
  return null;
}

/** 두 역 사이 정거장 수 (경로가 없으면 null) */
export function hopsBetween(lineName: string, from: string, to: string): number | null {
  const g = GRAPHS.get(lineName);
  if (!g) return null;
  const p = shortestPath(g, stationKey(from), stationKey(to));
  return p ? p.length - 1 : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 진행 방향 판정
// ─────────────────────────────────────────────────────────────────────────────
export function isDownward(updnLine: string | undefined): boolean | null {
  if (updnLine === undefined || updnLine === null) return null;
  const v = String(updnLine).trim();
  if (v === '1') return true;
  if (v === '0') return false;
  if (/하행|외선|outer/.test(v)) return true;
  if (/상행|내선|inner/.test(v)) return false;
  return null;
}

function turnScore(g: LineGraph, from: string, via: string, to: string): number {
  // from → via → to 가 얼마나 곧은지 (1 = 일직선, -1 = 되돌아감)
  const a = g.nodes.get(from)!.coord, b = g.nodes.get(via)!.coord, c = g.nodes.get(to)!.coord;
  const cos = Math.cos(b[1] * Math.PI / 180);
  const v1 = [(b[0] - a[0]) * cos, b[1] - a[1]], v2 = [(c[0] - b[0]) * cos, c[1] - b[1]];
  const n1 = Math.hypot(v1[0], v1[1]), n2 = Math.hypot(v2[0], v2[1]);
  if (n1 === 0 || n2 === 0) return 0;
  return (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2);
}

export interface Motion {
  graph: LineGraph;
  at: string;             // 보고된 역 (키)
  prev: string | null;    // 직전 역 (판단 불가 시 null)
  next: string | null;    // 다음 역 (종착/판단 불가 시 null)
  reason: string;         // 판정 근거 (디버그용)
}

/**
 * 보고된 역 + 종착역 + 상하행으로 직전/다음 역을 정한다.
 * 확신할 수 없으면 next/prev 를 null 로 두어 "역에 머무르게" 한다.
 */
export function resolveMotion(lineName: string, station: string, dest: string | undefined, updnLine: string | undefined): Motion | null {
  const g = GRAPHS.get(lineName);
  if (!g) return null;
  const at = stationKey(station);
  const node = g.nodes.get(at);
  if (!node) return null;
  const d = dest ? stationKey(dest) : '';
  const down = isDownward(updnLine);

  let next: string | null = null;
  let reason = '';

  if (d && d === at) {
    reason = 'terminating-here';
  } else if (g.loop && g.loop.includes(at) && (!d || !g.nodes.has(d) || g.loop.includes(d))) {
    // 2호선 순환선: 내선(0) = 배열 순서(시청→을지로입구…), 외선(1) = 역방향
    if (down !== null) {
      const L = g.loop, i = L.indexOf(at), n = L.length;
      next = L[(i + (down ? -1 : 1) + n) % n];
      reason = down ? 'loop-outer' : 'loop-inner';
    } else reason = 'loop-unknown-direction';
  } else if (d && g.nodes.has(d)) {
    const p = shortestPath(g, at, d);
    if (p && p.length > 1) { next = p[1]; reason = 'route-to-destination'; }
    else reason = 'destination-unreachable';
  } else {
    // 종착역을 모르면 진행 방향을 추측하지 않는다 (지선 배열 순서가 상하행과 일치한다는 보장이 없음)
    reason = node.neighbors.size >= 3 ? 'junction-without-destination' : 'destination-unknown';
  }

  // 직전 역: 다음 역이 아닌 이웃. 여럿이면 가장 곧게 이어지는 쪽
  let prev: string | null = null;
  const cands = Array.from(node.neighbors).filter(n => n !== next && !g.forbidden.has(`${n}|${at}`));
  if (cands.length === 1 && (next || node.neighbors.size === 1)) prev = cands[0];
  else if (cands.length > 1 && next) {
    prev = cands.reduce((best, c) => (turnScore(g, c, at, next!) > turnScore(g, best, at, next!) ? c : best));
    if (turnScore(g, prev, at, next) < 0) prev = null; // 되돌아가는 모양이면 판단 보류
  }
  return { graph: g, at, prev, next, reason };
}
