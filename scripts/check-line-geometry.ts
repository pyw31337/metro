/**
 * 노선 선형 점검 스크립트 (디버그용)
 *   npm run check:geometry                       # 노선 데이터만 점검
 *   npm run check:geometry -- capture.jsonl      # + 실제 API 응답(위치 API)의 역이 그래프에서 풀리는지
 *
 * 점검 항목
 *  1. 각 지선의 인접 역 쌍이 모두 경로(edge)로 풀리는지
 *  2. 분기역 좌표가 지선마다 5m 이상 다른지 (통일 좌표로 그리므로 정보용)
 *  3. 한 지선 안에 같은 역이 중복되는지(순환선 시작/끝 제외)
 *  4. 노선 그래프가 끊어져 있는지 (연결 요소 수)
 *  5. (선택) 캡처한 realtimePosition 응답의 역/종착역이 그래프에서 다음 역까지 풀리는지
 * 실패가 하나라도 있으면 exit code 1.
 */
import fs from 'node:fs';
import { SUBWAY_LINES } from '@/data/subway-lines';
import { allLineGraphs, edgePath, stationKey, resolveMotion } from '@/geo/lineNetwork';
import { distM } from '@/geo/geoMath';

const failures: string[] = [];
const notes: string[] = [];

for (const line of SUBWAY_LINES) {
  const keys = line.stations.map(s => stationKey(s.name));
  const seen = new Map<string, number>();
  let oneWay = false;
  keys.forEach((k, i) => {
    const isLoopEnd = i === keys.length - 1 && k === keys[0];
    if (seen.has(k) && !isLoopEnd) {
      // 단방향 순환 구간(같은 역으로 돌아옴)은 한 번만 허용
      if (!oneWay && i - seen.get(k)! > 2) { oneWay = true; notes.push(`[단방향 순환] ${line.name}: ${keys.slice(seen.get(k)!, i + 1).join('→')}`); }
      else failures.push(`[중복] ${line.id} ${line.name}: ${k}`);
    }
    if (!seen.has(k)) seen.set(k, i);
  });
  for (let i = 1; i < keys.length; i++) {
    if (keys[i - 1] === keys[i]) continue;
    if (!edgePath(line.name, keys[i - 1], keys[i])) failures.push(`[구간 없음] ${line.id} ${keys[i - 1]}-${keys[i]}`);
  }
}

for (const g of allLineGraphs()) {
  // 좌표 불일치 (정보)
  for (const line of SUBWAY_LINES.filter(l => l.name === g.name)) {
    for (const s of line.stations) {
      const n = g.nodes.get(stationKey(s.name));
      if (!n) continue;
      const d = distM(n.coord, [s.lng, s.lat]);
      if (d > 5) notes.push(`[좌표 통일] ${g.name} ${s.name}: ${line.id} 좌표와 ${d.toFixed(0)}m 차이 → 통일 좌표 사용`);
    }
  }
  // 연결 요소
  const left = new Set(g.nodes.keys());
  let comps = 0;
  while (left.size) {
    comps++;
    const stack = [left.values().next().value as string];
    while (stack.length) {
      const k = stack.pop()!;
      if (!left.delete(k)) continue;
      for (const nb of g.nodes.get(k)!.neighbors) if (left.has(nb)) stack.push(nb);
    }
  }
  if (comps > 1) failures.push(`[끊김] ${g.name}: 연결 요소 ${comps}개`);
}

// 캡처 데이터 점검
const capturePath = process.argv[2];
if (capturePath && fs.existsSync(capturePath)) {
  const reasons = new Map<string, number>();
  const unresolved = new Map<string, number>();
  let total = 0;
  for (const lineText of fs.readFileSync(capturePath, 'utf8').split('\n')) {
    if (!lineText.trim()) continue;
    const r = JSON.parse(lineText);
    if (r.service !== 'realtimePosition') continue;
    const body = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
    for (const t of body.realtimePositionList ?? []) {
      total++;
      const lineName = String(t.subwayNm).replace(/[·\s]/g, '');
      const dest = String(t.statnTnm ?? '').replace(/종착$/, '');
      const m = resolveMotion(lineName, t.statnNm, dest, t.updnLine);
      const reason = !m ? 'station-not-on-line' : m.next ? 'ok' : m.reason;
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      if (!m) {
        const k = `${lineName} ${t.statnNm}`;
        unresolved.set(k, (unresolved.get(k) ?? 0) + 1);
      }
    }
  }
  console.log(`\n캡처 점검: 위치 보고 ${total}건`);
  for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(30)} ${v} (${((v / total) * 100).toFixed(1)}%)`);
  for (const [k, v] of unresolved) notes.push(`[그래프에 없는 역] ${k} ×${v} → 지도에 표시하지 않음`);
}

console.log(`\n노선 그래프 ${allLineGraphs().length}개, 지선 ${SUBWAY_LINES.length}개`);
notes.forEach(n => console.log('  · ' + n));
if (failures.length) {
  console.log(`\n실패 ${failures.length}건`);
  failures.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('\n✓ 모든 인접 역 구간이 선형 위에서 풀립니다');
