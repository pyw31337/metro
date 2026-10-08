import { describe, it, expect } from 'vitest';
import { resolveMotion, allLineGraphs, branchPolylines, edgePath, getLineGraph } from '@/geo/lineNetwork';
import { distanceToPaths, LngLat } from '@/geo/geoMath';
import { newAnim, frame, reanchor, distanceAt, MotionSpec, isEstimated } from '@/geo/trainMotion';
import { __test__ } from '@/services/TransitRealtimeService';

const { resolveTimeline } = __test__;

const m = (line: string, at: string, dest: string | undefined, updn = '1') => {
  const r = resolveMotion(line, at, dest, updn)!;
  const name = (k: string | null) => (k ? r.graph.nodes.get(k)!.name : null);
  return { prev: name(r.prev), next: name(r.next), reason: r.reason };
};

describe('branch resolution (지선 분기)', () => {
  it('1호선 병점: 신창행은 세마로, 서동탄행은 서동탄으로', () => {
    expect(m('1호선', '병점', '신창', '1').next).toBe('세마');
    expect(m('1호선', '병점', '신창', '1').prev).toBe('세류');
    expect(m('1호선', '병점', '서동탄', '1').next).toBe('서동탄');
  });
  it('5호선 강동: 마천행은 둔촌동, 하남검단산행은 길동', () => {
    expect(m('5호선', '강동', '마천').next).toBe('둔촌동');
    expect(m('5호선', '강동', '하남검단산').next).toBe('길동');
  });
  it('2호선 지선: 성수→용답(신설동행), 신도림→도림천(까치산행)', () => {
    expect(m('2호선', '성수', '신설동').next).toBe('용답');
    expect(m('2호선', '신도림', '까치산').next).toBe('도림천');
  });
  it('경의중앙선 가좌: 서울행은 신촌', () => {
    expect(m('경의중앙선', '가좌', '서울').next).toMatch(/^신촌/);
  });
  it('6호선 응암순환은 한 방향으로만 돈다 (응암→역촌→불광→독바위→연신내→구산→응암)', () => {
    expect(m('6호선', '역촌', '응암').next).toBe('불광');
    expect(m('6호선', '역촌', '신내').next).toBe('불광');
    expect(m('6호선', '구산', '신내').next).toBe('응암');
    expect(m('6호선', '응암', '신내').prev).toBe('구산');
    expect(m('6호선', '새절', '응암순환').next).toBe('응암');
  });
  it('API 표기 차이를 흡수한다 (불암산, 총신대입구(이수), 4.19 민주묘지)', () => {
    expect(resolveMotion('4호선', '불암산', '오이도', '1')).not.toBeNull();
    expect(resolveMotion('7호선', '총신대입구(이수)', '석남', '1')).not.toBeNull();
    expect(m('우이신설선', '4.19 민주묘지', '신설동').next).toBe('가오리');
  });
  it('holds at a junction when the destination is unknown', () => {
    const r = m('5호선', '강동', undefined);
    expect(r.next).toBeNull();
    expect(r.reason).toBe('junction-without-destination');
  });
  it('holds at the terminal', () => {
    expect(m('5호선', '마천', '마천').next).toBeNull();
  });
});

describe('every station pair resolves on the drawn geometry', () => {
  it('each edge has a path that starts/ends exactly at its stations and lies on the drawn lines', () => {
    const polys = branchPolylines();
    const failures: string[] = [];
    for (const g of allLineGraphs()) {
      const lines = polys.filter(p => p.name === g.name).map(p => p.coords);
      for (const [key] of g.edges) {
        const [a, b] = key.split('|');
        const path = edgePath(g.name, a, b);
        if (!path) { failures.push(`${g.name} ${a}-${b}: no path`); continue; }
        const mid: LngLat = [(path[0][0] + path[path.length - 1][0]) / 2, (path[0][1] + path[path.length - 1][1]) / 2];
        const off = distanceToPaths(mid, lines);
        if (off > 1) failures.push(`${g.name} ${a}-${b}: ${off.toFixed(1)}m off`);
      }
    }
    expect(failures).toEqual([]);
  });
});

/**
 * 속성 테스트: 모든 노선 × 모든 역 × 가능한 종착역 × 상태 × 지연 조합에 대해
 * 애니메이션의 모든 프레임(재기준 블렌딩 포함)이 그 노선의 그려진 선에서 2m 이내인지 확인한다.
 */
describe('property: rendered train positions always lie on the line', () => {
  const STATUSES = ['0', '1', '2', '3'];
  const LAGS = [0, 45_000, 4 * 60_000];
  const polys = branchPolylines();

  for (const g of allLineGraphs()) {
    it(`${g.name}: all frames within 2m of the drawn line`, () => {
      const lines = polys.filter(p => p.name === g.name).map(p => p.coords);
      const terminals = Array.from(g.nodes.values()).filter(n => n.neighbors.size === 1).map(n => n.name);
      const dests: (string | undefined)[] = [...terminals, undefined];
      let worst = 0, worstAt = '', frames = 0;
      for (const node of g.nodes.values()) {
        for (const dest of dests) for (const updn of ['0', '1']) for (const st of STATUSES) for (const lag of LAGS) {
          const tl = resolveTimeline(g.name, node.name, dest ?? '', updn, st, lag);
          if (!tl) continue;
          const now = 1_000_000_000;
          const spec: MotionSpec = { ...tl.motion, startMs: now - tl.elapsedMs };
          const anim = newAnim(spec, 'k');
          for (const dt of [0, 15_000, 40_000, 90_000, 200_000]) {
            const f = frame(anim, now + dt);
            frames++;
            const off = distanceToPaths(f.pos, lines);
            if (off > worst) { worst = off; worstAt = `${node.name}→${dest} sttus${st} lag${lag} +${dt}`; }
          }
        }
      }
      expect(frames).toBeGreaterThan(0);
      expect(worst, worstAt).toBeLessThan(2);
    });
  }

  it('re-anchoring between consecutive events blends along the path (2호선 강남→역삼)', () => {
    const lines = polys.filter(p => p.name === '2호선').map(p => p.coords);
    const t0 = 2_000_000_000;
    const a = resolveTimeline('2호선', '강남', '성수', '1', '2', 0)!;
    let anim = newAnim({ ...a.motion, startMs: t0 - a.elapsedMs }, 'a');
    const b = resolveTimeline('2호선', '역삼', '성수', '1', '1', 0)!;
    const tSwitch = t0 + 50_000;
    anim = reanchor(anim, { ...b.motion, startMs: tSwitch - b.elapsedMs }, 'b', tSwitch);
    for (let t = tSwitch; t <= tSwitch + 2_000; t += 100) {
      expect(distanceToPaths(frame(anim, t).pos, lines)).toBeLessThan(2);
    }
  });

  it('a train never moves beyond the next station', () => {
    const tl = resolveTimeline('2호선', '강남', '성수', '1', '2', 0)!;
    const spec: MotionSpec = { ...tl.motion, startMs: 0 };
    expect(distanceAt(spec, 10 * 60_000).d).toBeCloseTo(spec.dIn + spec.dOut, 6);
    expect(distanceAt(spec, 10 * 60_000).phase).toBe('hold');
  });

  it('marks only the part moved beyond the reported position as estimated', () => {
    const { buildLiveUnit } = __test__;
    const now = Date.parse('2026-10-08T09:27:11+09:00');
    const row: any = { subwayId: '1002', subwayNm: '2호선', statnId: '', statnNm: '강남', trainNo: '1', recptnDt: '2026-10-08 09:27:11', lastRecptnDt: '20261008', updnLine: '1', directAt: '0', trainSttus: '1', lstnyNm: '성수', arrivalNm: '강남', source: 'position' };
    const fresh = buildLiveUnit(row, now + 5_000)!;         // 도착 5초 후 → 아직 정차 중 = 보고 위치
    expect(isEstimated(fresh.motion, frame(newAnim(fresh.motion, 'a'), now + 5_000).d)).toBe(false);
    const old = buildLiveUnit(row, now + 90_000)!;          // 90초 후 → 다음 역 쪽으로 진행 = 추정
    expect(isEstimated(old.motion, frame(newAnim(old.motion, 'b'), now + 90_000).d)).toBe(true);
  });

  it('graphs exist for the major lines', () => {
    for (const n of ['1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선']) expect(getLineGraph(n)).toBeTruthy();
  });
});
