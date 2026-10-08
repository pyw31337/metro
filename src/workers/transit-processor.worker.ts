/**
 * 실시간 차량 애니메이션 worker (30fps).
 *
 * 지하철: 서비스가 보낸 MotionSpec(노선 선형 위의 경로 + 시간)만으로 위치를 계산한다.
 *   - 위치는 경로상 거리 하나로 표현 → 보간/재기준/블렌딩 어떤 경우에도 노선 선을 벗어나지 않는다.
 *   - 다음 역(또는 보고된 역)에서 멈추며 그 너머로 외삽하지 않는다.
 *   - 열차끼리 간격을 강제로 벌리던 보정(enforceTrainOrder)은 실제 위치를 왜곡해서 제거했다.
 * 버스: 직전 위치 → 현재 위치를 폴링 주기 동안 이동 (도로 위 GPS 좌표라 노선 선형 개념 없음).
 */
import { MotionSpec, TrainAnim, newAnim, reanchor, frame, isEstimated } from '@/geo/trainMotion';

type LngLat = [number, number];

interface Common {
  id: string;
  lineName: string;
  lineColor: string;
  label: string;
  status: string;
  isSimulated: boolean;
  lastSeenTime: number;
  birthTime: number;
  deathTime: number | null;
  currentBearing: number;
  bearingInitialized: boolean;
  colorFadeStart: number | null;
  updnLine?: string;
  currentStationName?: string;
  nextStationName?: string | null;
  eventText?: string;
  eventTs?: number;
}

interface TrainState extends Common { kind: 'subway'; anim: TrainAnim }
interface BusState extends Common { kind: 'bus'; lastPos: LngLat; nextPos: LngLat; startMs: number; segmentMs: number }
type UnitState = TrainState | BusState;

const FADE_IN_MS     = 1_500;
const FADE_OUT_MS    = 1_500;
const EXPIRE_MS      = 120_000; // 공개 프록시 사용 시 폴링 1~2회 누락까지 허용
const TICK_INTERVAL  = 1000 / 30;
const COLOR_FADE_MS  = 300;

const state = new Map<string, UnitState>();
let isTicking = false;

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;
  switch (type) {
    case 'UPDATE_UNITS':
      processUpdates(data as IncomingUnit[]);
      if (!isTicking) startTick();
      break;
    case 'CLEAR_LINE_SIM':
    case 'CLEAR_SIMULATED':
      // 시뮬레이션 열차는 더 이상 만들지 않는다 (호환용 no-op)
      break;
    case 'STOP':
      isTicking = false;
      state.clear();
      break;
  }
};

interface IncomingUnit {
  id: string;
  type: 'bus' | 'subway';
  lineName: string;
  lineColor: string;
  label: string;
  status?: string;
  isSimulated?: boolean;
  motion?: MotionSpec;
  eventKey?: string;
  eventTs?: number;
  eventText?: string;
  updnLine?: string;
  currentStationName?: string;
  nextStationName?: string | null;
  directionBearing?: number;
  prevPos?: LngLat;
  nextPos?: LngLat;
  segmentMs?: number;
}

function processUpdates(units: IncomingUnit[]) {
  const now = Date.now();
  for (const u of units) {
    const existing = state.get(u.id);
    if (u.type === 'subway') {
      if (!u.motion) continue;
      const key = u.eventKey ?? '';
      if (existing && existing.kind === 'subway') {
        applyMeta(existing, u, now);
        if (existing.anim.eventKey !== key) existing.anim = reanchor(existing.anim, u.motion, key, now);
      } else {
        const anim = newAnim(u.motion, key);
        const b = frame(anim, now).bearing ?? u.directionBearing ?? 0;
        const st: TrainState = { ...baseState(u, now, b), kind: 'subway', anim };
        state.set(u.id, st);
      }
    } else {
      const nextPos = u.nextPos;
      if (!nextPos) continue;
      if (existing && existing.kind === 'bus') {
        applyMeta(existing, u, now);
        existing.lastPos = busPos(existing, now);
        existing.nextPos = nextPos;
        existing.startMs = now;
        existing.segmentMs = u.segmentMs ?? 20_000;
      } else {
        const st: BusState = {
          ...baseState(u, now, 0), kind: 'bus',
          lastPos: u.prevPos ?? nextPos, nextPos, startMs: now, segmentMs: u.segmentMs ?? 20_000,
        };
        state.set(u.id, st);
      }
    }
  }
  for (const [, unit] of state) {
    if (now - unit.lastSeenTime > EXPIRE_MS && !unit.deathTime) unit.deathTime = now;
  }
}

function baseState(u: IncomingUnit, now: number, bearing: number): Common {
  return {
    id: u.id, lineName: u.lineName, lineColor: u.lineColor, label: u.label,
    status: u.status ?? '99', isSimulated: !!u.isSimulated,
    lastSeenTime: now, birthTime: now, deathTime: null,
    currentBearing: bearing, bearingInitialized: bearing !== 0, colorFadeStart: now,
    updnLine: u.updnLine, currentStationName: u.currentStationName, nextStationName: u.nextStationName,
    eventText: u.eventText, eventTs: u.eventTs,
  };
}

function applyMeta(s: Common, u: IncomingUnit, now: number) {
  s.lineName = u.lineName; s.lineColor = u.lineColor; s.label = u.label;
  s.status = u.status ?? '99'; s.isSimulated = !!u.isSimulated;
  s.lastSeenTime = now;
  s.updnLine = u.updnLine; s.currentStationName = u.currentStationName; s.nextStationName = u.nextStationName;
  s.eventText = u.eventText; s.eventTs = u.eventTs;
  if (s.deathTime !== null) { s.deathTime = null; s.birthTime = now; }
}

function busPos(b: BusState, now: number): LngLat {
  const t = Math.max(0, Math.min(1, (now - b.startMs) / Math.max(1, b.segmentMs)));
  return [b.lastPos[0] + (b.nextPos[0] - b.lastPos[0]) * t, b.lastPos[1] + (b.nextPos[1] - b.lastPos[1]) * t];
}

function lerpBearing(start: number, end: number, t: number): number {
  const diff = ((end - start + 540) % 360) - 180;
  return (start + diff * t + 360) % 360;
}

function calcBearing(a: LngLat, b: LngLat): number {
  if (a[0] === b[0] && a[1] === b[1]) return 0;
  const lat1 = a[1] * Math.PI / 180, lat2 = b[1] * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function startTick() {
  isTicking = true;
  const tick = () => {
    const now = Date.now();
    const result: unknown[] = [];

    for (const [id, unit] of state) {
      if (unit.deathTime !== null && now - unit.deathTime > FADE_OUT_MS) { state.delete(id); continue; }

      let pos: LngLat;
      let targetBearing: number | null;
      let isDwelling = false;
      let phase: string | undefined;
      let estimated = false;
      if (unit.kind === 'subway') {
        const f = frame(unit.anim, now);
        // 보고된 위치에서 30m 넘게 진행시킨 부분은 추정 → 지도에서 살짝 흐리게
        estimated = isEstimated(unit.anim.spec, f.d);
        pos = f.pos;
        targetBearing = f.bearing;
        phase = f.phase;
        isDwelling = f.phase === 'dwell' || f.phase === 'hold';
      } else {
        pos = busPos(unit, now);
        targetBearing = (now - unit.startMs) < unit.segmentMs ? calcBearing(unit.lastPos, unit.nextPos) : null;
        if (targetBearing === 0) targetBearing = null;
      }

      if (targetBearing !== null && !isDwelling) {
        if (!unit.bearingInitialized) {
          unit.currentBearing = targetBearing;
          unit.bearingInitialized = true;
          unit.colorFadeStart = now;
        } else {
          const diff = Math.abs(((targetBearing - unit.currentBearing + 540) % 360) - 180);
          unit.currentBearing = lerpBearing(unit.currentBearing, targetBearing, diff > 30 ? 0.2 : 0.1);
        }
      }

      const colorProgress = unit.colorFadeStart !== null ? Math.min(1, (now - unit.colorFadeStart) / COLOR_FADE_MS) : 0;
      let opacity = 1;
      const age = now - unit.birthTime;
      if (age < FADE_IN_MS) opacity = age / FADE_IN_MS;
      if (unit.deathTime !== null) opacity = Math.max(0, 1 - (now - unit.deathTime) / FADE_OUT_MS);


      result.push({
        id,
        type: unit.kind,
        pos,
        bearing: unit.currentBearing,
        lineName: unit.lineName,
        lineColor: unit.lineColor,
        label: unit.label,
        isSimulated: unit.isSimulated,
        opacity: Math.round(opacity * 100) / 100,
        colorProgress: Math.round(colorProgress * 100) / 100,
        isDwelling: isDwelling || !unit.bearingInitialized,
        estimated,
        phase,
        updnLine: unit.updnLine,
        currentStationName: unit.currentStationName,
        nextStationName: unit.nextStationName,
        eventText: unit.eventText,
        eventTs: unit.eventTs,
      });
    }

    if (result.length > 0) self.postMessage({ type: 'TICK_UPDATE', data: result });
    if (state.size > 0) {
      setTimeout(tick, state.size > 150 ? 1000 / 15 : state.size > 80 ? 1000 / 20 : TICK_INTERVAL);
    } else {
      isTicking = false;
    }
  };
  tick();
}
