import { db } from "@/services/db";
import { SUBWAY_LINES, Station, SubwayLine } from "@/data/subway-lines";

// ─────────────────────────────────────────────────────────────────────────────
// 노선별 평균 속도 (km/h)  — 실측 기반 추정값
// ─────────────────────────────────────────────────────────────────────────────
const LINE_SPEED_KMH: Record<string, number> = {
  '1호선': 40,
  '2호선': 32,
  '3호선': 38,
  '4호선': 38,
  '5호선': 38,
  '6호선': 32,
  '7호선': 38,
  '8호선': 32,
  '9호선': 42,
  '경의중앙선': 55,
  '공항철도': 75,
  '수인분당선': 45,
  '신분당선': 72,
  '경춘선': 55,
  '신림선': 35,
  '우이신설선': 30,
  '인천1호선': 38,
  '인천2호선': 35,
  'GTX-A': 100,
};
const DEFAULT_SPEED_KMH = 40;

// 환승 소요시간 (분) = 보행시간 + 다음 열차 대기시간
// 실측 기준: 빠른환승 ~1.5분 보행 + 4.5분 대기 = 6분
//            일반환승 ~3분 보행   + 5분 대기   = 8분
const TRANSFER_TIME_DEFAULT = 8.0;
const TRANSFER_TIME_FAST    = 6.0;

// Dijkstra 전략별 환승 패널티
// "time" 전략   : 패널티 없음, 실 환승시간만
// "transfer" 전략: 환승 1회당 600분 패널티 → 환승 횟수 우선 최소화 (같은 환승수면 시간 최소화)
// 600분은 현실적인 어떤 경로도 초과하지 않으므로 환승횟수가 항상 먼저 최소화됨
const TRANSFER_PENALTY_TIME     = 0;
const TRANSFER_PENALTY_TRANSFER = 600;

// ─────────────────────────────────────────────────────────────────────────────
// Inline Haversine (Worker는 import.meta 경로 이슈를 피하기 위해 인라인)
// ─────────────────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function kmToMinutes(km: number, speedKmh: number): number {
  return Math.max(1.0, (km / speedKmh) * 60);
}

// ─────────────────────────────────────────────────────────────────────────────
// 그래프 자료구조
// ─────────────────────────────────────────────────────────────────────────────
interface GraphConnection {
  nodeId: string;
  weight: number;   // 실제 이동 시간 (분)
  lineId: string;   // 노선 ID (예: "2-Seoul")
  lineName: string; // 노선 이름 (예: "2호선")
}

interface GraphNode {
  id: string;
  lat: number;
  lng: number;
  connections: GraphConnection[];
}

// 빠른환승 역명 Set (transfer-info.json 기반 + 주요 환승역 수동 추가)
const FAST_TRANSFER_SET = new Set([
  '영등포구청', '신도림', '대림', '고속터미널',
  '종로3가', '을지로3가', '을지로4가', '동대문역사문화공원',
  '왕십리', '공덕', '합정', '홍대입구', '신촌', '이대',
  '사당', '교대', '강남', '선릉', '역삼',
  '서울역', '용산', '영등포', '구로디지털단지',
  '잠실', '건대입구', '성수', '뚝섬',
  '여의도', '노량진', '당산',
  '이촌', '수서', '복정',
]);

// Module-level line and station index maps (built once at module init)
const LINE_BY_NAME = new Map(SUBWAY_LINES.map(l => [l.name, l]));
// Per-branch index maps: supports multi-branch lines (e.g. 5호선 has 5-Hanam and 5-Macheon).
// Using line.id as key avoids the "last branch wins" overwrite problem of name-keyed maps.
const LINE_IDX_BY_ID = new Map(
  SUBWAY_LINES.map(l => [l.id, new Map(l.stations.map((s, i) => [s.name, i]))])
);

// ─────────────────────────────────────────────────────────────────────────────
// 그래프 빌드 (모듈 초기화 시 1회 실행)
// ─────────────────────────────────────────────────────────────────────────────
let cachedGraph: Map<string, GraphNode> | null = null;
let cachedGraphKeys: Set<string> | null = null;

function buildGraph(): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();

  const getOrCreate = (name: string, lat: number, lng: number): GraphNode => {
    if (!graph.has(name)) {
      graph.set(name, { id: name, lat, lng, connections: [] });
    }
    return graph.get(name)!;
  };

  for (const line of SUBWAY_LINES) {
    const speed = LINE_SPEED_KMH[line.name] ?? DEFAULT_SPEED_KMH;
    const stations = line.stations;

    for (let i = 0; i < stations.length; i++) {
      const cur = stations[i];
      const curNode = getOrCreate(cur.name, cur.lat, cur.lng);

      if (i < stations.length - 1) {
        const nxt = stations[i + 1];
        const nxtNode = getOrCreate(nxt.name, nxt.lat, nxt.lng);

        const distKm = haversineKm(cur.lat, cur.lng, nxt.lat, nxt.lng);
        const timeMin = kmToMinutes(distKm, speed);

        curNode.connections.push({ nodeId: nxt.name, weight: timeMin, lineId: line.id, lineName: line.name });
        nxtNode.connections.push({ nodeId: cur.name, weight: timeMin, lineId: line.id, lineName: line.name });
      }
    }
  }

  return graph;
}

// ─────────────────────────────────────────────────────────────────────────────
// 이진 최소힙 (Binary Min-Heap)
// ─────────────────────────────────────────────────────────────────────────────
class MinHeap<T> {
  private heap: { priority: number; value: T }[] = [];

  push(value: T, priority: number) {
    this.heap.push({ priority, value });
    this._bubbleUp();
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop()!.value;
    const top = this.heap[0].value;
    this.heap[0] = this.heap.pop()!;
    this._sinkDown();
    return top;
  }

  get size() { return this.heap.length; }

  private _bubbleUp() {
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].priority <= this.heap[i].priority) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private _sinkDown() {
    let i = 0;
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.heap[l].priority < this.heap[smallest].priority) smallest = l;
      if (r < n && this.heap[r].priority < this.heap[smallest].priority) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dijkstra 탐색 상태 (parent pointer 방식 — 메모리 효율)
// ─────────────────────────────────────────────────────────────────────────────
interface DijkState {
  nodeId: string;
  cost: number;     // 최적화 목적 비용 (전략에 따라 달라짐)
  timeMin: number;  // 실제 이동시간 (분) — 화면 표시용
  transfers: number;
  lastLine: string | null;
  lastLineName: string | null;
  parent: DijkState | null;
}

function reconstructPath(state: DijkState) {
  const nodes: DijkState[] = [];
  let cur: DijkState | null = state;
  while (cur) {
    nodes.push(cur);
    cur = cur.parent;
  }
  nodes.reverse();

  const path: string[] = nodes.map(n => n.nodeId);
  const weights: number[] = nodes.map(n => n.timeMin);
  const linePath: string[] = nodes.slice(1).map(n => n.lastLineName ?? '');

  return { path, weights, linePath };
}

type PathStrategy = 'time' | 'transfer';

function dijkstra(
  startName: string,
  endName: string,
  graph: Map<string, GraphNode>,
  strategy: PathStrategy,
  fastTransferSet: Set<string>
): { path: string[]; weights: number[]; linePath: string[]; totalTimeMin: number; transferCount: number } | null {
  if (!graph.has(startName) || !graph.has(endName)) return null;

  const heap = new MinHeap<DijkState>();
  const bestCost = new Map<string, number>();

  heap.push({
    nodeId: startName, cost: 0, timeMin: 0,
    transfers: 0, lastLine: null, lastLineName: null, parent: null
  }, 0);

  while (heap.size > 0) {
    const state = heap.pop()!;
    const { nodeId, cost, timeMin, transfers, lastLine, lastLineName } = state;

    if (nodeId === endName) {
      const { path, weights, linePath } = reconstructPath(state);
      return { path, weights, linePath, totalTimeMin: timeMin, transferCount: transfers };
    }

    const prev = bestCost.get(nodeId) ?? Infinity;
    if (cost > prev) continue;
    bestCost.set(nodeId, cost);

    const node = graph.get(nodeId);
    if (!node) continue;

    for (const conn of node.connections) {
      const isTransfer = lastLine !== null && lastLine !== conn.lineId;

      // 실제 이동 시간
      let edgeTime = conn.weight;

      if (isTransfer) {
        // 환승 보행 시간 추가
        const walkTime = fastTransferSet.has(nodeId) ? TRANSFER_TIME_FAST : TRANSFER_TIME_DEFAULT;
        edgeTime += walkTime;
      }

      // 전략별 비용 계산
      let edgeCost = edgeTime;
      if (isTransfer && strategy === 'transfer') {
        edgeCost += TRANSFER_PENALTY_TRANSFER;
      }

      const newCost = cost + edgeCost;
      const newTime = timeMin + edgeTime;
      const newTransfers = transfers + (isTransfer ? 1 : 0);

      const existingBest = bestCost.get(conn.nodeId) ?? Infinity;
      if (newCost < existingBest) {
        heap.push({
          nodeId: conn.nodeId,
          cost: newCost,
          timeMin: newTime,
          transfers: newTransfers,
          lastLine: conn.lineId,
          lastLineName: conn.lineName,
          parent: state,
        }, newCost);
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 역명 정규화 (입력값 → 그래프 키)
// ─────────────────────────────────────────────────────────────────────────────
function normalizeForGraph(name: string, graphKeys: Set<string>): string {
  if (!name) return name;

  // 1. 직접 매칭
  if (graphKeys.has(name)) return name;

  // 2. "역" 접미사 제거
  const noSuffix = name.replace(/역$/, '').trim();
  if (graphKeys.has(noSuffix)) return noSuffix;

  // 3. 괄호 제거
  const noParens = name.replace(/\(.*?\)/g, '').trim();
  if (graphKeys.has(noParens)) return noParens;

  const noParensSuffix = noParens.replace(/역$/, '').trim();
  if (graphKeys.has(noParensSuffix)) return noParensSuffix;

  // 4. "내 위치 : X (내 위치)" 패턴 파싱
  const locationMatch = name.match(/내 위치\s*:\s*(.+?)\s*\(내 위치\)/);
  if (locationMatch) {
    const inner = locationMatch[1].trim();
    if (graphKeys.has(inner)) return inner;
    const innerClean = inner.replace(/역$/, '').trim();
    if (graphKeys.has(innerClean)) return innerClean;
  }

  // 5. 퍼지 매칭: 접두사 포함 역명 탐색
  for (const key of graphKeys) {
    if (key.startsWith(noParensSuffix) || noParensSuffix.startsWith(key)) {
      return key;
    }
  }

  return name; // 매칭 실패 시 원본 반환
}

// ─────────────────────────────────────────────────────────────────────────────
// 요금 계산 (수도권 통합요금 기준 2024)
// ─────────────────────────────────────────────────────────────────────────────
function calculateFare(totalDistKm: number): number {
  let fare = 1400; // 기본운임 (10km 이내)
  if (totalDistKm > 10) {
    const extra1 = Math.min(totalDistKm - 10, 40);
    fare += Math.ceil(extra1 / 5) * 100;
  }
  if (totalDistKm > 50) {
    const extra2 = totalDistKm - 50;
    fare += Math.ceil(extra2 / 8) * 100;
  }
  return fare;
}

// ─────────────────────────────────────────────────────────────────────────────
// 경로 상의 실제 이동거리 계산 (요금 산출용)
// ─────────────────────────────────────────────────────────────────────────────
function calcPathDistanceKm(path: string[], graph: Map<string, GraphNode>): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = graph.get(path[i]);
    const b = graph.get(path[i + 1]);
    if (a && b) total += haversineKm(a.lat, a.lng, b.lat, b.lng);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker 메시지 핸들러
// ─────────────────────────────────────────────────────────────────────────────
self.onmessage = async (e: MessageEvent) => {
  const { type, msgId, payload } = e.data;

  switch (type) {
    case 'FIND_PATH': {
      const { points } = payload as { points: string[] };

      if (!cachedGraph) { cachedGraph = buildGraph(); cachedGraphKeys = new Set(cachedGraph.keys()); }
      const graph = cachedGraph;
      const graphKeys = cachedGraphKeys!;

      const strategies: PathStrategy[] = ['time', 'transfer'];
      const results: Record<string, any> = {};

      for (const strategy of strategies) {
        let fullPath: string[] = [];
        let fullWeights: number[] = [];
        let fullLinePath: string[] = [];
        let totalTime = 0;
        let totalTransfers = 0;
        let failed = false;

        // 첫 역 처리
        const startResolved = normalizeForGraph(points[0], graphKeys);
        fullPath = [startResolved];
        fullWeights = [0];

        for (let i = 0; i < points.length - 1; i++) {
          const from = normalizeForGraph(points[i], graphKeys);
          const to   = normalizeForGraph(points[i + 1], graphKeys);

          if (from === to) continue;

          const result = dijkstra(from, to, graph, strategy, FAST_TRANSFER_SET);
          if (!result) { failed = true; break; }

          // 첫 구간이 아니면 시작역 중복 제거 (push 사용 — spread보다 O(n) 복사 없음)
          const skip = i === 0 ? 0 : 1;
          for (let j = skip; j < result.path.length; j++) fullPath.push(result.path[j]);
          for (let j = skip; j < result.weights.length; j++) fullWeights.push(result.weights[j] + (i === 0 ? 0 : totalTime));
          for (const l of result.linePath) fullLinePath.push(l);
          totalTime += result.totalTimeMin;
          totalTransfers += result.transferCount;
        }

        if (failed || fullPath.length < 2) continue;

        // 환승 메타데이터 조회 (DB)
        // DB는 정규화된 노선명("5", "2")으로 저장되므로 조회 전에 정규화
        const lineToCode = (s: string) => s.replace(/호선$|선$/, '');
        const pathTransfers: any[] = [];
        for (let i = 1; i < fullLinePath.length; i++) {
          const fromLine = fullLinePath[i - 1];
          const toLine   = fullLinePath[i];
          if (fromLine && toLine && fromLine !== toLine) {
            const stationName = fullPath[i];
            const tInfo = await db.getTransferInfo(stationName, lineToCode(fromLine), lineToCode(toLine));
            let fastStr: string | null = null;
            if (tInfo?.fastCar || tInfo?.fastDoor) {
              fastStr = [tInfo.fastCar, tInfo.fastDoor].filter(Boolean).join('-');
            } else if (tInfo?.platform) {
              fastStr = tInfo.platform;
            }
            pathTransfers.push({ stationName, fromLine, toLine, fastTransfer: fastStr });
          }
        }

        // 요금 계산
        const distKm = calcPathDistanceKm(fullPath, graph);
        const fare   = calculateFare(distKm);

        // segments 빌드 (TransitRealtimeLayers용)
        const segments = buildSegments(fullPath, fullLinePath);

        results[strategy] = {
          path: fullPath,
          totalWeight: Math.round(totalTime),
          weights: fullWeights,
          transferCount: totalTransfers,
          transfers: pathTransfers,
          strategy,
          fare,
          segments,
        };
      }

      self.postMessage({ type: 'PATH_RESULT', msgId, payload: results });
      break;
    }

    case 'FIND_NEAREST_STATION': {
      const { lat, lng, stations } = payload as { lat: number; lng: number; stations: Station[] };
      let nearest: Station | null = null;
      let minDist = Infinity;
      for (const s of stations) {
        const d = (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
        if (d < minDist) { minDist = d; nearest = s; }
      }
      self.postMessage({ type: 'NEAREST_STATION_RESULT', msgId, payload: nearest });
      break;
    }

    case 'SORT_WC': {
      const { items, userLat, userLng } = payload;
      const sorted = [...items]
        .map((a: any) => ({
          ...a,
          _dist: (a.lat - (userLat ?? 0)) ** 2 + (a.lng - (userLng ?? 0)) ** 2
        }))
        .sort((a, b) => a._dist - b._dist)
        .slice(0, 3);
      self.postMessage({ type: 'SORTED_WC_RESULT', msgId, payload: sorted });
      break;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Segment 빌드 (노선 방향 포함, TransitRealtimeLayers용)
// ─────────────────────────────────────────────────────────────────────────────
function buildSegments(
  path: string[],
  linePath: string[]
): { line: string; direction: '0' | '1'; stations: string[] }[] {
  if (path.length < 2) return [];

  const segments: { line: string; direction: '0' | '1'; stations: string[] }[] = [];
  let curLine = linePath[0] ?? null;
  let curStations = [path[0]];

  for (let i = 0; i < linePath.length; i++) {
    const line = linePath[i];
    const nextStation = path[i + 1];

    if (!nextStation) break;

    if (line === curLine) {
      curStations.push(nextStation);
    } else {
      if (curLine) segments.push(makeSegment(curLine, curStations));
      curLine = line;
      curStations = [path[i], nextStation];
    }
  }
  if (curLine && curStations.length > 1) {
    segments.push(makeSegment(curLine, curStations));
  }

  return segments;
}

function makeSegment(
  lineName: string,
  stations: string[]
): { line: string; direction: '0' | '1'; stations: string[] } {
  let direction: '0' | '1' = '1';
  if (stations.length >= 2) {
    const s0 = stations[0];
    const sN = stations[stations.length - 1];
    // Try all branches with this line name until both endpoints are found in the same branch.
    // Needed for multi-branch lines like 5호선 (5-Hanam covers 방화~하남, 5-Macheon covers 강동~마천).
    for (const line of SUBWAY_LINES) {
      if (line.name !== lineName) continue;
      const idxMap = LINE_IDX_BY_ID.get(line.id)!;
      const i1 = idxMap.get(s0) ?? -1;
      const i2 = idxMap.get(sN) ?? -1;
      if (i1 !== -1 && i2 !== -1) { direction = i2 > i1 ? '1' : '0'; break; }
    }
  }
  return { line: lineName, direction, stations };
}
