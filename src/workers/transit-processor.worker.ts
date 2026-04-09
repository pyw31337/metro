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
  }
};

function processUpdates(units: any[]) {
  const now = Date.now();
  units.forEach((unit) => {
    const existing = transitState.get(unit.id);
    
    if (!existing) {
      transitState.set(unit.id, {
        ...unit,
        lastPos: unit.nextPos,
        lastUpdateTime: now - 15000,
        nextUpdateTime: now,
      });
    } else {
      existing.lastPos = existing.nextPos;
      existing.nextPos = unit.nextPos;
      existing.lastUpdateTime = existing.nextUpdateTime;
      existing.nextUpdateTime = now;
      existing.lineName = unit.lineName;
      existing.lineColor = unit.lineColor;
      existing.label = unit.label;
    }
  });

  for (const [id, unit] of transitState.entries()) {
    if (now - unit.nextUpdateTime > 60000) {
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
      let ratio = duration > 0 ? (now - unit.lastUpdateTime) / duration : 1;
      
      // 1.5배까지는 부드럽게 예측 주행 (Dead Reckoning)
      ratio = Math.min(1.5, ratio); 

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
      setTimeout(tick, 1000 / 60); // 60fps
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
  const y = Math.sin(end[1] - start[1]) * Math.cos(end[0]);
  const x = Math.cos(start[0]) * Math.sin(end[0]) - Math.sin(start[0]) * Math.cos(end[0]) * Math.cos(end[1] - start[1]);
  const brng = Math.atan2(y, x);
  return (brng * 180 / Math.PI + 360) % 360;
}
