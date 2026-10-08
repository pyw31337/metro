/**
 * 지도 위 거리/보간 유틸 (순수 함수).
 * 서울권(위도 37.5°) 범위에서는 등장방형 근사로 충분히 정확하다(오차 < 0.1%).
 */
export type LngLat = [number, number];

const R = 6371008.8;
const RAD = Math.PI / 180;

/** 두 점 사이 거리 (m) */
export function distM(a: LngLat, b: LngLat): number {
  const mLat = (a[1] + b[1]) / 2 * RAD;
  const dx = (b[0] - a[0]) * RAD * Math.cos(mLat) * R;
  const dy = (b[1] - a[1]) * RAD * R;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 폴리라인 누적 거리 (m). cum[0] = 0 */
export function cumulative(path: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + distM(path[i - 1], path[i]));
  return cum;
}

/** 폴리라인을 따라 d(m) 지점의 좌표. 범위 밖은 양 끝으로 클램프 */
export function pointAlong(path: LngLat[], cum: number[], d: number): LngLat {
  const n = path.length;
  if (n === 0) return [0, 0];
  if (n === 1 || d <= 0) return path[0];
  const total = cum[n - 1];
  if (d >= total) return path[n - 1];
  // 이진 탐색
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }
  const segLen = cum[hi] - cum[lo];
  const t = segLen > 0 ? (d - cum[lo]) / segLen : 0;
  const a = path[lo], b = path[hi];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** 진행 방향 방위각 (0 = 북, 시계방향 도) */
export function bearing(a: LngLat, b: LngLat): number {
  if (a[0] === b[0] && a[1] === b[1]) return 0;
  const φ1 = a[1] * RAD, φ2 = b[1] * RAD;
  const dλ = (b[0] - a[0]) * RAD;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** 폴리라인을 따라 d 지점에서의 진행 방위각 (길이 0 이면 null) */
export function bearingAlong(path: LngLat[], cum: number[], d: number): number | null {
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 0) return null;
  const a = pointAlong(path, cum, Math.min(d, total - 1));
  const b = pointAlong(path, cum, Math.min(total, Math.max(d, 0) + 1));
  if (a[0] === b[0] && a[1] === b[1]) return null;
  return bearing(a, b);
}

/** 점을 폴리라인에 투영: 폴리라인상의 거리 d 와 수직 거리(m) */
export function projectOnPath(path: LngLat[], cum: number[], p: LngLat): { d: number; offM: number } {
  if (path.length === 0) return { d: 0, offM: Infinity };
  if (path.length === 1) return { d: 0, offM: distM(path[0], p) };
  const cosLat = Math.cos(p[1] * RAD);
  let best = { d: 0, offM: Infinity };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const ax = a[0] * cosLat, ay = a[1], bx = b[0] * cosLat, by = b[1], px = p[0] * cosLat, py = p[1];
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
    const q: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const off = distM(q, p);
    if (off < best.offM) best = { d: cum[i - 1] + (cum[i] - cum[i - 1]) * t, offM: off };
  }
  return best;
}

/** 점과 여러 폴리라인 사이 최소 거리 (m) */
export function distanceToPaths(p: LngLat, paths: LngLat[][]): number {
  let best = Infinity;
  for (const path of paths) {
    const r = projectOnPath(path, cumulative(path), p);
    if (r.offM < best) best = r.offM;
  }
  return best;
}
