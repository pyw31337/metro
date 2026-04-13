/* eslint-disable no-restricted-globals */
export {};

// ─────────────────────────────────────────────────────────────────────────────
// 열차 내부 상태
// ─────────────────────────────────────────────────────────────────────────────
interface TransitUnit {
  id: string;
  type: 'bus' | 'subway';
  lastPos: [number, number];
  nextPos: [number, number];
  futurePos: [number, number];
  lastUpdateTime: number;   // 애니메이션 기준 시각 (백데이트 가능)
  lastSeenTime: number;     // 마지막 API 수신 시각 (만료 판정용 — 백데이트 없음)
  lineName: string;
  lineColor: string;
  label: string;
  status: string;
  currentBearing: number;
  bearingInitialized: boolean; // false이면 첫 비-0 targetBearing에서 스냅 (북향 깜박임 방지)
  isSimulated: boolean;
  birthTime: number;        // 페이드-인 시작 시각
  deathTime: number | null; // 페이드-아웃 시작 시각 (null = 살아있음)
  // ── 충돌 방지용 노선 순서 정보 ──
  lineStationIdx: number;   // nextPos에 해당하는 역의 노선 인덱스
  lineDir: number;          // +1 = 하행(idx 증가), -1 = 상행(idx 감소)
  // ── 가변 속도 · 정차 시간 ──
  segmentMs: number;        // lastPos → nextPos 구간 소요시간 (ms)
  nextSegmentMs: number;    // nextPos → futurePos 구간 소요시간 (ms)
  dwellMs: number;          // nextPos 역에서 정차 시간 (ms)
  // ── OSM 선로 waypoints ──
  waypoints?: [number,number][];      // lastPos → nextPos 실제 선로 경유점 (Phase 1)
  nextWaypoints?: [number,number][];  // nextPos → futurePos 실제 선로 경유점 (Phase 3)
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────
const ANIM_DURATION  = 90_000;  // 기본 구간 소요시간 fallback (ms) — 약 90초
const DWELL_DEFAULT  = 15_000;  // 기본 정차 시간 (ms) — 15초 (30→15 단축, 시각적 이동성 개선)
const FADE_IN_MS     = 1_500;
const FADE_OUT_MS    = 1_500;
const EXPIRE_MS      = 90_000;
const TICK_INTERVAL  = 1000 / 30; // 30fps

// 같은 방향 열차 간 최소 간격 (역 구간 단위)
const MIN_TRAIN_GAP  = 0.35;

const state = new Map<string, TransitUnit>();
let isTicking = false;

// ─────────────────────────────────────────────────────────────────────────────
// 3단계 ratio 계산: 주행(0→1) → 정차(1.0 고정) → 출발(1→2.0)
//
//   Phase 1  [0, segmentMs)          : lastPos → nextPos  (ratio 0→1)
//   Phase 2  [segmentMs, +dwellMs)   : nextPos 정차       (ratio = 1.0)
//   Phase 3  [segmentMs+dwellMs, …)  : nextPos → futurePos (ratio 1→2.0)
//
//   Phase 3 상한 2.0: overT = ratio - 1.0 → 0~1.0 → lerp(nextPos, futurePos, easeInOut(overT))
//   열차가 futurePos(다음 역)까지 완전히 이동 후 정지. API 업데이트 시 자연스럽게 전환.
// ─────────────────────────────────────────────────────────────────────────────
function computeRatio(unit: TransitUnit, elapsed: number): number {
  const seg   = unit.segmentMs;
  const dwell = unit.dwellMs;

  if (elapsed < seg)              return elapsed / seg;        // Phase 1: 주행
  if (elapsed < seg + dwell)      return 1.0;                  // Phase 2: 정차
  return Math.min(2.0, 1.0 + (elapsed - seg - dwell) / unit.nextSegmentMs); // Phase 3: 출발
}

// ─────────────────────────────────────────────────────────────────────────────
// 메시지 핸들러
// ─────────────────────────────────────────────────────────────────────────────
self.onmessage = (e: MessageEvent) => {
  const { type, data, lineName } = e.data;

  switch (type) {
    case 'UPDATE_UNITS':
      processUpdates(data as any[]);
      if (!isTicking) startTick();
      break;

    case 'CLEAR_LINE_SIM': {
      const now = Date.now();
      for (const [id, unit] of state) {
        if (unit.isSimulated && unit.lineName === lineName && !unit.deathTime) {
          unit.deathTime = now;
        }
      }
      break;
    }

    case 'CLEAR_SIMULATED': {
      const now = Date.now();
      for (const [id, unit] of state) {
        if (unit.isSimulated && !unit.deathTime) unit.deathTime = now;
      }
      break;
    }

    case 'STOP':
      isTicking = false;
      state.clear();
      break;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 유닛 업데이트 처리
// ─────────────────────────────────────────────────────────────────────────────
function processUpdates(units: any[]) {
  const now = Date.now();

  for (const unit of units) {
    const existing = state.get(unit.id);
    const segMs  = unit.segmentMs     ?? ANIM_DURATION;
    const dwMs   = unit.dwellMs       ?? DWELL_DEFAULT;
    const nxMs   = unit.nextSegmentMs ?? ANIM_DURATION;

    if (!existing) {
      // ── 신규 등장: initialRatio → 경과 시간 역산 ──
      const startPos: [number, number] =
        unit.prevPos &&
        (unit.prevPos[0] !== unit.nextPos[0] || unit.prevPos[1] !== unit.nextPos[1])
          ? unit.prevPos
          : unit.nextPos;

      const initR = unit.initialRatio ?? 0;
      let backwardMs: number;
      if (initR <= 1.0) {
        // Phase 1/2: 주행 중이거나 막 도착 (dwell 시작점)
        backwardMs = initR * segMs;
      } else {
        // Phase 3: 이미 출발 후 (overshoot) — ratio > 1.0
        backwardMs = segMs + dwMs + (initR - 1.0) * nxMs;
      }
      backwardMs = Math.min(backwardMs, segMs + dwMs + 1.0 * nxMs);

      const bearingTarget: [number, number] = initR >= 1.0
        ? (unit.futurePos ?? unit.nextPos)
        : unit.nextPos;

      // 초기 베어링: startPos→bearingTarget 우선.
      // 두 좌표가 동일하면(prevPos 없는 말단역 등 → calcBearing=0이 되는 버그) futurePos 방향으로 보완.
      function bestInitialBearing(): number {
        const b1 = calcBearing(startPos, bearingTarget);
        if (b1 !== 0) return b1;
        // startPos === bearingTarget → futurePos 방향 시도
        const fp = unit.futurePos ?? unit.nextPos;
        const b2 = calcBearing(unit.nextPos, fp);
        if (b2 !== 0) return b2;
        // prevPos → nextPos 방향 시도
        return calcBearing(unit.prevPos ?? unit.nextPos, unit.nextPos);
      }

      const initBearing = bestInitialBearing();
      state.set(unit.id, {
        ...unit,
        lastPos:              startPos,
        lastUpdateTime:       now - backwardMs,
        lastSeenTime:         now,              // 만료 판정: 항상 실제 수신 시각
        currentBearing:       initBearing,
        bearingInitialized:   initBearing !== 0,
        birthTime:            now,
        deathTime:       null,
        lineStationIdx:  unit.lineStationIdx ?? 0,
        lineDir:         unit.lineDir ?? 1,
        segmentMs:       segMs,
        nextSegmentMs:   nxMs,
        dwellMs:         dwMs,
        waypoints:       unit.waypoints,
        nextWaypoints:   unit.nextWaypoints,
      });

    } else {
      // ── 기존 유닛 업데이트 ──

      // 공통 메타데이터 항상 갱신
      existing.lineName       = unit.lineName;
      existing.lineColor      = unit.lineColor;
      existing.label          = unit.label;
      existing.status         = unit.status ?? '99';
      existing.isSimulated    = unit.isSimulated;
      existing.lineStationIdx = unit.lineStationIdx ?? existing.lineStationIdx;
      existing.lineDir        = unit.lineDir        ?? existing.lineDir;
      existing.lastSeenTime   = now;   // 만료 판정: 항상 실제 수신 시각으로 갱신
      (existing as any).updnLine           = (unit as any).updnLine;
      (existing as any).currentStationName = (unit as any).currentStationName;
      if (!unit.isSimulated && existing.deathTime !== null) {
        existing.deathTime = null;
        existing.birthTime = now;
      }

      const elapsed    = now - existing.lastUpdateTime;
      const ratio      = computeRatio(existing, elapsed);
      const newNextPos = unit.nextPos;
      const sameTarget = coordsClose(existing.nextPos, newNextPos);
      // 도착점을 이미 통과했는지 (dwell 또는 출발 구간)
      const pastArrival = elapsed >= existing.segmentMs;

      if (sameTarget) {
        // ── 같은 역 보고 ──
        // futurePos와 다음 구간 소요시간·waypoints만 갱신, 타이머 유지
        existing.futurePos      = unit.futurePos ?? unit.nextPos;
        existing.nextSegmentMs  = nxMs;
        existing.dwellMs        = dwMs;
        existing.nextWaypoints  = unit.nextWaypoints;

      } else if (pastArrival) {
        // ── 다음 역으로 이동, dwell 또는 출발 구간에서 전환 ──
        const afterDwell = Math.max(0, elapsed - existing.segmentMs - existing.dwellMs);
        const overT      = Math.min(1.0, afterDwell / existing.nextSegmentMs);

        existing.lastPos        = existing.nextPos;
        existing.nextPos        = newNextPos;
        existing.futurePos      = unit.futurePos ?? newNextPos;
        existing.segmentMs      = segMs;
        existing.nextSegmentMs  = nxMs;
        existing.dwellMs        = dwMs;
        existing.lastUpdateTime = now - overT * segMs;
        // nextWaypoints가 현재 구간의 waypoints로 승격
        existing.waypoints      = existing.nextWaypoints;
        existing.nextWaypoints  = unit.nextWaypoints;

      } else {
        // ── 주행 중(ratio<1.0)에 새 목적지로 변경 ──
        const visualPos: [number, number] = existing.waypoints && existing.waypoints.length >= 2
          ? interpolateAlongPath(existing.waypoints, easeInOut(ratio))
          : lerp(existing.lastPos, existing.nextPos, easeInOut(ratio));
        const stdDist  = coordDist(existing.lastPos, existing.nextPos);
        const jumpDist = coordDist(visualPos, newNextPos);
        const scaledSegMs = stdDist > 0
          ? Math.max(45_000, Math.min(300_000, segMs * (jumpDist / stdDist)))
          : segMs;
        existing.lastPos        = visualPos;
        existing.nextPos        = newNextPos;
        existing.futurePos      = unit.futurePos ?? newNextPos;
        existing.segmentMs      = scaledSegMs;
        existing.nextSegmentMs  = nxMs;
        existing.dwellMs        = dwMs;
        existing.lastUpdateTime = now;
        // 중간 변경 시 waypoints는 undefined (fallback to lerp), 다음 구간은 수신값 사용
        existing.waypoints      = undefined;
        existing.nextWaypoints  = unit.nextWaypoints;
      }
    }
  }

  // 오래된 유닛 페이드-아웃 예약
  // lastSeenTime(실제 API 수신 시각) 기준으로 만료 판정.
  // lastUpdateTime은 애니메이션 백데이트로 과거로 설정될 수 있으므로 사용 불가.
  for (const [, unit] of state) {
    if (Date.now() - unit.lastSeenTime > EXPIRE_MS && !unit.deathTime) {
      unit.deathTime = Date.now();
    }
  }
}

// 두 좌표가 ~100m 이내인지 (동일 역 판별)
function coordsClose(a: [number, number], b: [number, number]): boolean {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return (dx * dx + dy * dy) < 0.000001;
}

// 두 좌표 간 유클리드 거리(도 단위) — 순간이동 방지용 상대 비교에 충분
function coordDist(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// ─────────────────────────────────────────────────────────────────────────────
// 30fps Tick 루프
// ─────────────────────────────────────────────────────────────────────────────
function startTick() {
  isTicking = true;

  const tick = () => {
    const now = Date.now();
    const result: any[] = [];

    // ── Phase 1: 각 유닛의 ratio 계산 ──
    const unitRatios = new Map<string, number>();
    for (const [id, unit] of state) {
      if (unit.deathTime !== null && now - unit.deathTime > FADE_OUT_MS) continue;
      const elapsed = now - unit.lastUpdateTime;
      const ratio   = computeRatio(unit, elapsed);
      unitRatios.set(id, ratio);
    }

    // ── Phase 2: 충돌 방지 ──
    enforceTrainOrder(unitRatios);

    // ── Phase 3: 렌더링 ──
    for (const [id, unit] of state) {
      if (unit.deathTime !== null && now - unit.deathTime > FADE_OUT_MS) {
        state.delete(id);
        continue;
      }

      const ratio = unitRatios.get(id);
      if (ratio === undefined) continue;

      let pos: [number, number];
      let bearingTarget: [number, number];

      if (ratio <= 1.0) {
        const t = easeInOut(ratio);
        if (unit.waypoints && unit.waypoints.length >= 2) {
          pos           = interpolateAlongPath(unit.waypoints, t);
          bearingTarget = pathLookAhead(unit.waypoints, t);
        } else {
          pos           = lerp(unit.lastPos, unit.nextPos, t);
          bearingTarget = unit.nextPos;
        }
      } else {
        const overT = Math.min(1.0, ratio - 1.0);
        const t     = easeInOut(overT);
        if (unit.nextWaypoints && unit.nextWaypoints.length >= 2) {
          pos           = interpolateAlongPath(unit.nextWaypoints, t);
          bearingTarget = pathLookAhead(unit.nextWaypoints, t);
        } else {
          pos           = lerp(unit.nextPos, unit.futurePos ?? unit.nextPos, t);
          bearingTarget = unit.futurePos ?? unit.nextPos;
        }
      }

      // 베어링 스무딩
      // bearingInitialized=false(초기 0)이면 첫 비-0 방위각에서 스냅 → 북향 깜박임 방지
      const targetBearing = calcBearing(pos, bearingTarget);
      if (!unit.bearingInitialized) {
        if (targetBearing !== 0) {
          unit.currentBearing     = targetBearing;
          unit.bearingInitialized = true;
        }
      } else {
        const bearingDiff = Math.abs(((targetBearing - unit.currentBearing + 540) % 360) - 180);
        const lerpT = bearingDiff > 30 ? 0.20 : 0.10;
        unit.currentBearing = lerpBearing(unit.currentBearing, targetBearing, lerpT);
      }

      // 불투명도 (페이드 인/아웃)
      let opacity = 1;
      const age = now - unit.birthTime;
      if (age < FADE_IN_MS) opacity = age / FADE_IN_MS;
      if (unit.deathTime !== null) {
        opacity = Math.max(0, 1 - (now - unit.deathTime) / FADE_OUT_MS);
      }

      result.push({
        id,
        type:            unit.type,
        pos,
        bearing:         unit.currentBearing,
        lineName:        unit.lineName,
        lineColor:       unit.lineColor,
        label:           unit.label,
        isSimulated:     unit.isSimulated,
        opacity:         Math.round(opacity * 100) / 100,
        updnLine:        (unit as any).updnLine,
        currentStationName: (unit as any).currentStationName,
      });
    }

    if (result.length > 0) {
      self.postMessage({ type: 'TICK_UPDATE', data: result });
    }

    if (state.size > 0) {
      setTimeout(tick, state.size > 150 ? 1000/15 : state.size > 80 ? 1000/20 : TICK_INTERVAL);
    } else {
      isTicking = false;
    }
  };

  tick();
}

// ─────────────────────────────────────────────────────────────────────────────
// 충돌 방지: 같은 노선·방향 열차를 순서대로 정렬하고 최소 간격 강제
// ─────────────────────────────────────────────────────────────────────────────
function enforceTrainOrder(unitRatios: Map<string, number>) {
  const groups = new Map<string, string[]>();
  for (const [id, unit] of state) {
    if (unit.type !== 'subway') continue;
    if (unit.deathTime !== null) continue;
    if (unitRatios.get(id) === undefined) continue;
    const key = `${unit.lineName}:${unit.lineDir}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  }

  for (const [key, ids] of groups) {
    if (ids.length < 2) continue;

    const colonIdx = key.lastIndexOf(':');
    const lineDir  = parseInt(key.slice(colonIdx + 1), 10);

    ids.sort((a, b) => {
      const ua = state.get(a)!;
      const ub = state.get(b)!;
      const ra = unitRatios.get(a)!;
      const rb = unitRatios.get(b)!;
      return computeProgress(ub.lineStationIdx, rb, lineDir)
           - computeProgress(ua.lineStationIdx, ra, lineDir);
    });

    for (let i = 1; i < ids.length; i++) {
      const leadId   = ids[i - 1];
      const followId = ids[i];
      const leadUnit   = state.get(leadId)!;
      const followUnit = state.get(followId)!;
      const leadRatio   = unitRatios.get(leadId)!;
      const followRatio = unitRatios.get(followId)!;

      const leadProg   = computeProgress(leadUnit.lineStationIdx,   leadRatio,   lineDir);
      const followProg = computeProgress(followUnit.lineStationIdx, followRatio, lineDir);
      const gap = leadProg - followProg;

      if (gap < MIN_TRAIN_GAP) {
        const maxFollowProg  = leadProg - MIN_TRAIN_GAP;
        const maxFollowRatio = computeMaxRatio(followUnit.lineStationIdx, maxFollowProg, lineDir);
        unitRatios.set(followId, Math.max(0.01, Math.min(followRatio, maxFollowRatio)));
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸리티 — progress 계산
// ─────────────────────────────────────────────────────────────────────────────
function computeProgress(stationIdx: number, ratio: number, lineDir: number): number {
  return lineDir > 0
    ? stationIdx - 1 + ratio
    : ratio - stationIdx - 1;
}

function computeMaxRatio(stationIdx: number, maxProgress: number, lineDir: number): number {
  return lineDir > 0
    ? maxProgress - stationIdx + 1
    : maxProgress + stationIdx + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 수학 유틸리티
// ─────────────────────────────────────────────────────────────────────────────
// easeInOutSine: cubic보다 훨씬 부드럽고 중간 구간 이동이 잘 보임.
// cubic은 시작·끝 30%에서 이동량이 6% 밖에 안 돼 열차가 정지한 것처럼 보임.
// sine은 시작·끝 25%에서도 ~30%의 이동량을 확보해 항상 움직임이 시각적으로 보임.
function easeInOut(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * OSM 선로 waypoints를 따라 매개변수 t(0→1)에서의 위치를 반환.
 * 직선 lerp보다 실제 선로 곡선을 따름.
 */
function interpolateAlongPath(pts: [number,number][], t: number): [number,number] {
  if (pts.length < 2) return pts[0] ?? [0, 0];
  if (t <= 0) return pts[0];
  if (t >= 1) return pts[pts.length - 1];

  // 누적 거리 계산
  const d: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0];
    const dy = pts[i][1] - pts[i-1][1];
    d.push(d[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  const total  = d[d.length - 1];
  if (total === 0) return pts[0];
  const target = t * total;

  // 이진 탐색으로 해당 세그먼트 찾기
  let lo = 0, hi = d.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    d[mid + 1] < target ? (lo = mid + 1) : (hi = mid);
  }
  const segLen = d[lo + 1] - d[lo];
  const segT   = segLen > 0 ? (target - d[lo]) / segLen : 0;
  return [
    pts[lo][0] + (pts[lo+1][0] - pts[lo][0]) * segT,
    pts[lo][1] + (pts[lo+1][1] - pts[lo][1]) * segT,
  ];
}

/**
 * waypoints 위의 t 위치에서 약간 앞(5%)을 보는 방향 벡터의 끝점.
 * 열차 방향 화살표가 선로 곡선을 따르게 함.
 */
function pathLookAhead(pts: [number,number][], t: number): [number,number] {
  return interpolateAlongPath(pts, Math.min(1.0, t + 0.06));
}

function lerp(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function lerpBearing(start: number, end: number, t: number): number {
  const diff = ((end - start + 180) % 360) - 180;
  return (start + diff * t + 360) % 360;
}

function calcBearing(a: [number, number], b: [number, number]): number {
  if (a[0] === b[0] && a[1] === b[1]) return 0;
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
