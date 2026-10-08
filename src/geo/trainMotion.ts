/**
 * 열차 한 대의 화면 위치 모델 (순수 함수, worker 와 테스트에서 공용).
 *
 * 경로(path)는 [직전 역 → 보고된 역 → 다음 역] 구간을 이어 붙인 노선 선형 그대로다.
 * 위치는 이 경로 위의 "거리(m)" 하나로만 표현하므로, 어떤 보간/블렌딩을 해도 선을 벗어날 수 없다.
 *
 *   [0, segInMs)                 : 직전 역 → 보고된 역 주행    d: 0 → dIn
 *   [segInMs, segInMs+dwellMs)   : 보고된 역 정차              d = dIn
 *   [segInMs+dwellMs, …)         : 보고된 역 → 다음 역 주행    d: dIn → dIn+dOut
 *   경과 시간은 maxElapsedMs 에서 멈춘다 → 다음 역(또는 보고된 역)을 절대 넘지 않는다.
 */
import { LngLat, cumulative, pointAlong, bearingAlong, projectOnPath } from './geoMath';

export interface MotionSpec {
  path: LngLat[];
  dIn: number;          // 직전 역 → 보고된 역 거리 (m)
  dOut: number;         // 보고된 역 → 다음 역 거리 (m)
  segInMs: number;
  dwellMs: number;
  segOutMs: number;
  startMs: number;      // 타임라인 0 시점 (epoch ms)
  maxElapsedMs: number; // 이 이상 진행하지 않는다
  /** 보고된 상태 그대로의 위치(경로상 거리). 화면 위치가 여기서 벗어나면 "추정" 구간 */
  reportedD?: number;
}

/** 화면 위치가 보고된 위치에서 이 거리(m) 넘게 벗어나면 추정으로 표시 */
export const ESTIMATE_THRESHOLD_M = 30;
export function isEstimated(spec: MotionSpec, d: number): boolean {
  return spec.reportedD === undefined ? false : Math.abs(d - spec.reportedD) > ESTIMATE_THRESHOLD_M;
}

export type MotionPhase = 'run-in' | 'dwell' | 'run-out' | 'hold';

// 가감속을 단순화한 완만한 S 커브 (시작/끝 속도 0)
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function cumOf(spec: MotionSpec): number[] {
  return cumulative(spec.path);
}

/** now 시점의 경로상 거리와 단계 */
export function distanceAt(spec: MotionSpec, now: number): { d: number; phase: MotionPhase } {
  const e = Math.max(0, Math.min(now - spec.startMs, spec.maxElapsedMs));
  const capped = now - spec.startMs >= spec.maxElapsedMs;
  const { segInMs, dwellMs, segOutMs, dIn, dOut } = spec;
  if (e < segInMs) return { d: dIn * ease(e / segInMs), phase: 'run-in' };
  if (e < segInMs + dwellMs) return { d: dIn, phase: capped ? 'hold' : 'dwell' };
  if (segOutMs <= 0 || dOut <= 0) return { d: dIn, phase: 'hold' };
  const t = (e - segInMs - dwellMs) / segOutMs;
  if (t >= 1) return { d: dIn + dOut, phase: 'hold' };
  return { d: dIn + dOut * ease(t), phase: capped ? 'hold' : 'run-out' };
}

export function positionAt(spec: MotionSpec, cum: number[], d: number): { pos: LngLat; bearing: number | null } {
  return { pos: pointAlong(spec.path, cum, d), bearing: bearingAlong(spec.path, cum, d) };
}

/** 이전 화면 위치를 새 경로 위 거리로 환산 (선 위에 있지 않으면 null → 블렌딩하지 않고 바로 이동) */
export function locateOnPath(spec: MotionSpec, cum: number[], p: LngLat, toleranceM = 3): number | null {
  const r = projectOnPath(spec.path, cum, p);
  return r.offM <= toleranceM ? r.d : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 애니메이션 상태 (재기준 + 블렌딩). 블렌딩도 "경로상 거리"를 보간하므로 선을 벗어나지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
export const BLEND_MS = 900;

export interface TrainAnim {
  spec: MotionSpec;
  cum: number[];
  eventKey: string;
  blendFromD: number | null;
  blendStart: number;
}

export function newAnim(spec: MotionSpec, eventKey: string): TrainAnim {
  return { spec, cum: cumulative(spec.path), eventKey, blendFromD: null, blendStart: 0 };
}

export interface TrainFrame { pos: LngLat; bearing: number | null; phase: MotionPhase; d: number }

export function frame(anim: TrainAnim, now: number): TrainFrame {
  const { d: target, phase } = distanceAt(anim.spec, now);
  let d = target;
  if (anim.blendFromD !== null) {
    const t = (now - anim.blendStart) / BLEND_MS;
    if (t >= 1 || t < 0) anim.blendFromD = null;
    else d = anim.blendFromD + (target - anim.blendFromD) * ease(t);
  }
  const { pos, bearing } = positionAt(anim.spec, anim.cum, d);
  // 뒤로 블렌딩하는 동안에는 방위각을 진행 방향으로 유지
  return { pos, bearing, phase, d };
}

/** 새 이벤트로 재기준. 이전 화면 위치가 새 경로 위에 있으면 그 지점부터 경로를 따라 이어 간다 */
export function reanchor(anim: TrainAnim, spec: MotionSpec, eventKey: string, now: number): TrainAnim {
  const prev = frame(anim, now);
  const next = newAnim(spec, eventKey);
  const d0 = locateOnPath(spec, next.cum, prev.pos);
  if (d0 !== null) {
    next.blendFromD = d0;
    next.blendStart = now;
  }
  return next;
}
