/* eslint-disable no-restricted-globals */
export {};

interface TransitUnit {
  id: string;
  type: 'bus' | 'subway';
  lastPos: [number, number];
  nextPos: [number, number];
  lastUpdateTime: number;
  nextUpdateTime: number;
  lineName: string;
  lineColor: string;
  label: string;
}

const transitState: Map<string, TransitUnit> = new Map();
let isTicking = false;

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
      // 첫 등장: nextPos에서 시작 (아직 이동 정보 없음)
      transitState.set(unit.id, {
        ...unit,
        lastPos: unit.nextPos,
        lastUpdateTime: now - 10000,  // 10초 전에 현재 위치에 있었다고 가정
        nextUpdateTime: now + 10000,  // 10초 후에 next로 이동
      });
    } else {
      // ✅ 핵심 픽스: jump-back 방지
      // 이전 애니메이션의 현재 시각적 위치를 계산해서 lastPos로 설정
      const oldDuration = existing.nextUpdateTime - existing.lastUpdateTime;
      const oldRatio = oldDuration > 0
        ? Math.min(1.0, (now - existing.lastUpdateTime) / oldDuration)
        : 1.0;
      const visualCurrentPos = interpolate(existing.lastPos, existing.nextPos, oldRatio);

      existing.lastPos = visualCurrentPos;    // 현재 화면상 위치에서 출발
      existing.nextPos = unit.nextPos;         // 새 목적지 역
      existing.lastUpdateTime = now;
      existing.nextUpdateTime = now + 12000;   // 12초 안에 다음 역에 도달
      existing.lineName = unit.lineName;
      existing.lineColor = unit.lineColor;
      existing.label = unit.label;
    }
  });

  // 오래된 유닛 정리 (마지막 업데이트 후 90초 이상된 경우)
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
      const duration = unit.nextUpdateTime - unit.lastUpdateTime;
      // ✅ ratio는 최대 1.0까지만 (1.5 dead-reckoning 제거 - 노선 이탈 원인)
      let ratio = duration > 0 ? (now - unit.lastUpdateTime) / duration : 1;
      ratio = Math.max(0, Math.min(1.0, ratio));

      const currentPos = interpolate(unit.lastPos, unit.nextPos, ratio);

      result.push({
        id: unit.id,
        type: unit.type,
        pos: currentPos,
        lineName: unit.lineName,
        lineColor: unit.lineColor,
        label: unit.label,
        bearing: calculateBearing(unit.lastPos, unit.nextPos)
      });
    }

    if (result.length > 0) {
      self.postMessage({ type: 'TICK_UPDATE', data: result });
    }

    if (transitState.size > 0) {
      setTimeout(tick, 1000 / 30); // 30fps (충분히 부드럽고 성능 절약)
    } else {
      isTicking = false;
    }
  };
  tick();
}

function interpolate(last: [number, number], next: [number, number], ratio: number): [number, number] {
  return [
    last[0] + (next[0] - last[0]) * ratio,
    last[1] + (next[1] - last[1]) * ratio
  ];
}

function calculateBearing(start: [number, number], end: [number, number]): number {
  if (start[0] === end[0] && start[1] === end[1]) return 0;
  // MapLibre uses [lng, lat], so index 0 = lng, index 1 = lat
  const lat1 = start[1] * Math.PI / 180;
  const lat2 = end[1] * Math.PI / 180;
  const dLng = (end[0] - start[0]) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
