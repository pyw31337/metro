/* eslint-disable no-restricted-globals */
export {};

interface TransitUnit {
  id: string;
  type: 'bus' | 'subway';
  lastPos: [number, number];
  nextPos: [number, number];
  futurePos?: [number, number]; // ✅ 추가: 다다음 역 위치
  lastUpdateTime: number;
  nextUpdateTime: number;
  lineName: string;
  lineColor: string;
  label: string;
  status?: string; // arvlCd: 0:진입, 1:도착, 2:출발, 99:운행중
  currentBearing: number;
}

const transitState: Map<string, TransitUnit> = new Map();
let isTicking = false;

// 12초 주기에 맞춘 애니메이션 지속 시간 (실제 폴링 주기와 근접하게 설정)
const ANIM_DURATION = 12000;

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === 'UPDATE_UNITS') {
    processUpdates(data);
    if (!isTicking) startTick();
  } else if (type === 'CLEAR_SIMULATED') {
    for (const id of transitState.keys()) {
      if (id.toLowerCase().includes('sim')) {
        transitState.delete(id);
      }
    }
  } else if (type === 'CLEAR_REAL') {
    for (const id of transitState.keys()) {
      if (!id.toLowerCase().includes('sim') && id.includes('train')) {
        transitState.delete(id);
      }
    }
  }
};

function processUpdates(units: any[]) {
  const now = Date.now();
  units.forEach((unit) => {
    const existing = transitState.get(unit.id);

    if (!existing) {
      const startPos = (unit.prevPos && 
        (unit.prevPos[0] !== unit.nextPos[0] || unit.prevPos[1] !== unit.nextPos[1]))
        ? unit.prevPos
        : unit.nextPos;
      
      transitState.set(unit.id, {
        ...unit,
        lastPos: startPos,
        lastUpdateTime: now,
        nextUpdateTime: now + ANIM_DURATION,
        currentBearing: calculateBearing(startPos, unit.nextPos),
      });
    } else {
      // ✅ Smooth transition: 현재 시각적 위치 계산
      const elapsed = now - existing.lastUpdateTime;
      // 이전 이동 비율 (0~1: last->next, 1~2: next->future)
      let oldRatio = elapsed / ANIM_DURATION;
      
      let visualCurrentPos;
      if (oldRatio <= 1.0) {
        visualCurrentPos = interpolate(existing.lastPos, existing.nextPos, easeInOutCubic(oldRatio));
      } else {
        // 이미 오버슈팅 중이었던 경우
        const overT = Math.min(1.0, oldRatio - 1.0);
        visualCurrentPos = interpolate(existing.nextPos, existing.futurePos || existing.nextPos, easeInOutCubic(overT));
      }

      existing.lastPos = visualCurrentPos;
      existing.nextPos = unit.nextPos;
      existing.futurePos = unit.futurePos;
      existing.lastUpdateTime = now;
      existing.nextUpdateTime = now + ANIM_DURATION;
      existing.lineName = unit.lineName;
      existing.lineColor = unit.lineColor;
      existing.label = unit.label;
      existing.status = unit.status;
    }
  });

  for (const [id, unit] of transitState.entries()) {
    if (now - unit.lastUpdateTime > 90000) {
      transitState.delete(id);
    }
  }
}

function startTick() {
  isTicking = true;
  const tick = () => {
    const now = Date.now();
    const result: any[] = [];

    for (const unit of transitState.values()) {
      const elapsed = now - unit.lastUpdateTime;
      let ratio = elapsed / ANIM_DURATION;

      // ✅ API 상태(status/arvlCd) 기반 보정
      if (unit.status === '1') {
        ratio = Math.min(1.0, ratio); // 도착(1)이면 역에 멈춤
      } else {
        // 주행 중이면 최대 1.5배(다다음 역 방향으로 50%)까지 관성 이동 허용
        ratio = Math.min(1.5, ratio); 
      }

      // ✅ 위치 계산
      let currentPos: [number, number];
      let targetForBearing: [number, number];

      if (ratio <= 1.0) {
        // 구간 1: 이전 역 -> 목표 역
        currentPos = interpolate(unit.lastPos, unit.nextPos, easeInOutCubic(ratio));
        targetForBearing = unit.nextPos;
      } else {
        // 구간 2: 목표 역 -> 다다음 역 (오버슈팅/관성 이동)
        // ratio 1.0~1.5 범위를 0.0~0.5로 변환
        const overT = ratio - 1.0;
        currentPos = interpolate(unit.nextPos, unit.futurePos || unit.nextPos, easeInOutCubic(overT));
        targetForBearing = unit.futurePos || unit.nextPos;
      }

      // ✅ Bearing Smoothing
      const targetBearing = calculateBearing(currentPos, targetForBearing);
      unit.currentBearing = lerpBearing(unit.currentBearing, targetBearing, 0.08);

      result.push({
        id: unit.id,
        type: unit.type,
        pos: currentPos,
        lineName: unit.lineName,
        lineColor: unit.lineColor,
        label: unit.label,
        bearing: unit.currentBearing
      });
    }

    if (result.length > 0) {
      self.postMessage({ type: 'TICK_UPDATE', data: result });
    }

    if (transitState.size > 0) {
      setTimeout(tick, 1000 / 30);
    } else {
      isTicking = false;
    }
  };
  tick();
}

// Cubic Easing (In/Out)
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Linear Interpolation
function interpolate(last: [number, number], next: [number, number], ratio: number): [number, number] {
  return [
    last[0] + (next[0] - last[0]) * ratio,
    last[1] + (next[1] - last[1]) * ratio
  ];
}

// Bearing Interpolation (Avoids 360->0 snap)
function lerpBearing(start: number, end: number, t: number): number {
  let diff = (end - start + 180) % 360 - 180;
  return (start + diff * t + 360) % 360;
}

function calculateBearing(start: [number, number], end: [number, number]): number {
  if (start[0] === end[0] && start[1] === end[1]) return 0;
  const lat1 = start[1] * Math.PI / 180;
  const lat2 = end[1] * Math.PI / 180;
  const dLng = (end[0] - start[0]) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
