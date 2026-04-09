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
  birthTime: number;   // 페이드-인 시작 시각
  deathTime: number | null; // 페이드-아웃 시작 시각 (null = 살아있음)
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────
const ANIM_DURATION  = 12_000;  // 애니메이션 주기 (ms)
const FADE_IN_MS     = 1_500;   // 페이드-인 시간
const FADE_OUT_MS    = 1_500;   // 페이드-아웃 시간
const EXPIRE_MS      = 90_000;  // 업데이트 없으면 사라지는 시간
const TICK_INTERVAL  = 1000 / 30; // 30fps

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
      // 신규 등장 — 페이드-인 시작
      const startPos: [number, number] =
        unit.prevPos &&
        (unit.prevPos[0] !== unit.nextPos[0] || unit.prevPos[1] !== unit.nextPos[1])
          ? unit.prevPos
          : unit.nextPos;

      state.set(unit.id, {
        ...unit,
        lastPos: startPos,
        lastUpdateTime: now,
        currentBearing: calcBearing(startPos, unit.nextPos),
        birthTime: now,
        deathTime: null,
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

      existing.lastPos        = visualPos;
      existing.nextPos        = unit.nextPos;
      existing.futurePos      = unit.futurePos ?? unit.nextPos;
      existing.lastUpdateTime = now;
      existing.lineName       = unit.lineName;
      existing.lineColor      = unit.lineColor;
      existing.label          = unit.label;
      existing.status         = unit.status ?? '99';
      existing.isSimulated    = unit.isSimulated;
      // 실측 데이터로 교체될 때 페이드-아웃 취소
      if (!unit.isSimulated && existing.deathTime !== null) {
        existing.deathTime = null;
        existing.birthTime = now; // 실측 전환 시 페이드-인 재생
      }
    }
  }

  // 오래된 유닛 페이드-아웃 예약
  for (const [id, unit] of state) {
    if (now - unit.lastUpdateTime > EXPIRE_MS && !unit.deathTime) {
      unit.deathTime = now;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 30fps Tick 루프
// ─────────────────────────────────────────────────────────────────────────────
function startTick() {
  isTicking = true;

  const tick = () => {
    const now    = Date.now();
    const result: any[] = [];

    for (const [id, unit] of state) {
      // 페이드-아웃이 완료된 유닛 제거
      if (unit.deathTime !== null && now - unit.deathTime > FADE_OUT_MS) {
        state.delete(id);
        continue;
      }

      // 위치 계산
      const elapsed = now - unit.lastUpdateTime;
      let ratio = Math.min(1.5, elapsed / ANIM_DURATION);

      if (unit.status === '1') ratio = Math.min(1.0, ratio); // 도착 정차

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

      // 불투명도 계산 (페이드 인/아웃)
      let opacity = 1;
      const age = now - unit.birthTime;
      if (age < FADE_IN_MS) opacity = age / FADE_IN_MS;
      if (unit.deathTime !== null) {
        const dying = now - unit.deathTime;
        opacity = Math.max(0, 1 - dying / FADE_OUT_MS);
      }

      result.push({
        id:              unit.id,
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
      setTimeout(tick, TICK_INTERVAL);
    } else {
      isTicking = false;
    }
  };

  tick();
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸리티
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
