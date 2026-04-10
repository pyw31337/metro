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
  lastUpdateTime: number;
  lineName: string;
  lineColor: string;
  label: string;
  status: string;
  currentBearing: number;
  isSimulated: boolean;
  birthTime: number;        // 페이드-인 시작 시각
  deathTime: number | null; // 페이드-아웃 시작 시각 (null = 살아있음)
  // ── 충돌 방지용 노선 순서 정보 ──
  lineStationIdx: number;   // nextPos에 해당하는 역의 노선 인덱스
  lineDir: number;          // +1 = 하행(idx 증가), -1 = 상행(idx 감소)
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────
const ANIM_DURATION  = 12_000;  // 애니메이션 주기 (ms)
const FADE_IN_MS     = 1_500;   // 페이드-인 시간
const FADE_OUT_MS    = 1_500;   // 페이드-아웃 시간
const EXPIRE_MS      = 90_000;  // 업데이트 없으면 사라지는 시간
const TICK_INTERVAL  = 1000 / 30; // 30fps

// 같은 방향 열차 간 최소 간격 (역 구간 단위)
// 0.35 = 두 역 사이 거리의 35% 이상 유지
const MIN_TRAIN_GAP  = 0.35;

const state = new Map<string, TransitUnit>();
let isTicking = false;

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

    // 특정 노선의 시뮬레이션 열차를 페이드-아웃 후 제거
    case 'CLEAR_LINE_SIM': {
      const now = Date.now();
      for (const [id, unit] of state) {
        if (unit.isSimulated && unit.lineName === lineName && !unit.deathTime) {
          unit.deathTime = now;
        }
      }
      break;
    }

    // 전체 시뮬레이션 열차 즉시 제거 (긴급 정리용)
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

    if (!existing) {
      // 신규 등장 — initialRatio로 올바른 위치에서 시작 (페이드-인)
      const startPos: [number, number] =
        unit.prevPos &&
        (unit.prevPos[0] !== unit.nextPos[0] || unit.prevPos[1] !== unit.nextPos[1])
          ? unit.prevPos
          : unit.nextPos;

      const startRatio = unit.initialRatio ?? 0;
      const backwardMs = Math.min(startRatio * ANIM_DURATION, 1.5 * ANIM_DURATION);

      const bearingTarget: [number, number] = startRatio >= 1.0
        ? (unit.futurePos ?? unit.nextPos)
        : unit.nextPos;

      state.set(unit.id, {
        ...unit,
        lastPos: startPos,
        lastUpdateTime: now - backwardMs,
        currentBearing: calcBearing(startPos, bearingTarget),
        birthTime: now,
        deathTime: null,
        lineStationIdx: unit.lineStationIdx ?? 0,
        lineDir:        unit.lineDir ?? 1,
      });

    } else {
      // 기존 유닛 업데이트 — 현재 시각적 위치에서 이어서 이동
      const elapsed = now - existing.lastUpdateTime;
      let ratio = Math.min(1.5, elapsed / ANIM_DURATION);

      let visualPos: [number, number];
      if (ratio <= 1.0) {
        visualPos = lerp(existing.lastPos, existing.nextPos, easeInOut(ratio));
      } else {
        const overT = Math.min(1.0, ratio - 1.0);
        visualPos = lerp(existing.nextPos, existing.futurePos ?? existing.nextPos, easeInOut(overT));
      }

      const newInitialRatio = unit.initialRatio ?? 0.5;
      const correctedUpdateTime = (newInitialRatio >= 1.0 && ratio < 1.0)
        ? now - newInitialRatio * ANIM_DURATION
        : now;

      existing.lastPos         = visualPos;
      existing.nextPos         = unit.nextPos;
      existing.futurePos       = unit.futurePos ?? unit.nextPos;
      existing.lastUpdateTime  = correctedUpdateTime;
      existing.lineName        = unit.lineName;
      existing.lineColor       = unit.lineColor;
      existing.label           = unit.label;
      existing.status          = unit.status ?? '99';
      existing.isSimulated     = unit.isSimulated;
      existing.lineStationIdx  = unit.lineStationIdx ?? existing.lineStationIdx;
      existing.lineDir         = unit.lineDir ?? existing.lineDir;
      if (!unit.isSimulated && existing.deathTime !== null) {
        existing.deathTime = null;
        existing.birthTime = now;
      }
    }
  }

  // 오래된 유닛 페이드-아웃 예약
  for (const [, unit] of state) {
    if (Date.now() - unit.lastUpdateTime > EXPIRE_MS && !unit.deathTime) {
      unit.deathTime = Date.now();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 30fps Tick 루프
// ─────────────────────────────────────────────────────────────────────────────
function startTick() {
  isTicking = true;

  const tick = () => {
    const now = Date.now();
    const result: any[] = [];

    // ── Phase 1: 각 유닛의 unclamped ratio 계산 ──
    const unitRatios = new Map<string, number>();
    for (const [id, unit] of state) {
      if (unit.deathTime !== null && now - unit.deathTime > FADE_OUT_MS) continue;
      const elapsed = now - unit.lastUpdateTime;
      let ratio = Math.min(1.5, elapsed / ANIM_DURATION);
      if (unit.status === '1') ratio = Math.min(1.0, ratio); // 당역 정차
      unitRatios.set(id, ratio);
    }

    // ── Phase 2: 충돌 방지 — 같은 노선·방향 열차 간격 강제 ──
    enforceTrainOrder(unitRatios);

    // ── Phase 3: 렌더링 ──
    for (const [id, unit] of state) {
      // 페이드-아웃 완료된 유닛 제거
      if (unit.deathTime !== null && now - unit.deathTime > FADE_OUT_MS) {
        state.delete(id);
        continue;
      }

      const ratio = unitRatios.get(id);
      if (ratio === undefined) continue;

      let pos: [number, number];
      let bearingTarget: [number, number];

      if (ratio <= 1.0) {
        pos = lerp(unit.lastPos, unit.nextPos, easeInOut(ratio));
        bearingTarget = unit.nextPos;
      } else {
        const overT = Math.min(1.0, ratio - 1.0);
        pos = lerp(unit.nextPos, unit.futurePos ?? unit.nextPos, easeInOut(overT));
        bearingTarget = unit.futurePos ?? unit.nextPos;
      }

      // 베어링 스무딩
      const targetBearing = calcBearing(pos, bearingTarget);
      unit.currentBearing = lerpBearing(unit.currentBearing, targetBearing, 0.08);

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
//
// 각 열차의 "노선 위 1차원 위치(progress)"를 계산:
//   하행(lineDir=+1): progress = stationIdx - 1 + ratio  (높을수록 앞)
//   상행(lineDir=-1): progress = ratio - stationIdx - 1  (높을수록 앞)
//
// progress 내림차순 정렬 후, 인접 쌍(선두, 후속)마다:
//   gap = progress_lead - progress_follow
//   gap < MIN_TRAIN_GAP 이면 후속 열차의 ratio를 클램프
// ─────────────────────────────────────────────────────────────────────────────
function enforceTrainOrder(unitRatios: Map<string, number>) {
  // 그룹: 노선명 + 방향으로 묶기
  const groups = new Map<string, string[]>(); // key → [id, ...]
  for (const [id, unit] of state) {
    if (unit.type !== 'subway') continue;
    if (unit.deathTime !== null) continue; // 사라지는 중인 열차 제외
    const ratio = unitRatios.get(id);
    if (ratio === undefined) continue;
    const key = `${unit.lineName}:${unit.lineDir}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  }

  for (const [key, ids] of groups) {
    if (ids.length < 2) continue;

    // 키에서 lineDir 파싱 (마지막 ':' 이후 값)
    const colonIdx = key.lastIndexOf(':');
    const lineDir  = parseInt(key.slice(colonIdx + 1), 10); // 1 또는 -1

    // progress 내림차순 정렬 (선두 열차가 앞)
    ids.sort((a, b) => {
      const ua = state.get(a)!;
      const ub = state.get(b)!;
      const ra = unitRatios.get(a)!;
      const rb = unitRatios.get(b)!;
      return computeProgress(ub.lineStationIdx, rb, lineDir)
           - computeProgress(ua.lineStationIdx, ra, lineDir);
    });

    // 인접 쌍마다 간격 강제
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
        // 후속 열차의 최대 허용 progress → 그에 맞는 최대 ratio 계산
        const maxFollowProg  = leadProg - MIN_TRAIN_GAP;
        const maxFollowRatio = computeMaxRatio(followUnit.lineStationIdx, maxFollowProg, lineDir);
        // 최소 0.01 보장 (위치가 완전히 역행하지 않도록)
        unitRatios.set(followId, Math.max(0.01, Math.min(followRatio, maxFollowRatio)));
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸리티 — progress 계산
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 노선 위 1차원 위치값.
 * 하행(+1): stationIdx - 1 + ratio  → 높을수록 앞
 * 상행(-1): ratio - stationIdx - 1  → 높을수록 앞 (덜 음수)
 *
 * 유도:
 *   ratio=0 → lastPos (이전 역)
 *   ratio=1 → nextPos (현재 역 = stationIdx)
 *   ratio=1.5 → futurePos (다음 역)
 *   하행: 실제 인덱스 위치 = (stationIdx - 1) + ratio
 *   상행: lastPos = stationIdx+1, nextPos = stationIdx, futurePos = stationIdx-1
 *         실제 "진행도" = -(stationIdx + 1) + ratio = ratio - stationIdx - 1
 */
function computeProgress(stationIdx: number, ratio: number, lineDir: number): number {
  return lineDir > 0
    ? stationIdx - 1 + ratio    // 하행
    : ratio - stationIdx - 1;  // 상행
}

/**
 * 주어진 최대 progress에서 해당 열차의 최대 ratio 역산.
 */
function computeMaxRatio(stationIdx: number, maxProgress: number, lineDir: number): number {
  return lineDir > 0
    ? maxProgress - stationIdx + 1    // 하행: ratio = progress - (stationIdx - 1)
    : maxProgress + stationIdx + 1;  // 상행: ratio = progress + stationIdx + 1
}

// ─────────────────────────────────────────────────────────────────────────────
// 수학 유틸리티
// ─────────────────────────────────────────────────────────────────────────────
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
