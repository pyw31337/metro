import { describe, it, expect } from 'vitest';
import { parseSeoulTime, lagMsFrom, classifySeoulResponse, limitForSampleKey } from '@/services/seoulApi';
import { arrivalItemToPosition, TrainPosition } from '@/services/arrivalApi';
import { __test__ } from '@/services/TransitRealtimeService';

const { resolveTimeline, buildLiveUnit, DWELL_MS } = __test__;

// 2026-10-08 실제 응답(sample 키)에서 발췌한 값
const POSITION_ROW = {
  subwayId: '1002', subwayNm: '2호선', statnId: '1002000222', statnNm: '강남',
  trainNo: '2112', lastRecptnDt: '20261008', recptnDt: '2026-10-08 09:27:11',
  updnLine: '1', statnTid: '1002000211', statnTnm: '성수종착', trainSttus: '2', directAt: '0', lstcarAt: '0',
};

const toPosition = (row: typeof POSITION_ROW): TrainPosition => ({
  subwayId: row.subwayId, subwayNm: row.subwayNm, statnId: row.statnId, statnNm: row.statnNm,
  trainNo: row.trainNo, recptnDt: row.recptnDt, lastRecptnDt: row.lastRecptnDt, updnLine: row.updnLine,
  directAt: row.directAt, trainSttus: row.trainSttus, lstnyNm: row.statnTnm.replace(/종착$/, ''),
  statnTnm: row.statnTnm, arrivalNm: row.statnNm, source: 'position',
});

const KST = (s: string) => Date.parse(s.replace(' ', 'T') + '+09:00');

describe('seoulApi time parsing', () => {
  it('parses recptnDt as KST regardless of client timezone', () => {
    expect(parseSeoulTime('2026-10-08 09:27:11')).toBe(Date.UTC(2026, 9, 8, 0, 27, 11));
  });
  it('rejects date-only lastRecptnDt (realtimePosition) instead of returning now', () => {
    expect(Number.isNaN(parseSeoulTime('20261008'))).toBe(true);
  });
  it('clamps future timestamps (server clock skew) to zero lag', () => {
    const now = KST('2026-10-08 09:28:53');
    expect(lagMsFrom('2026-10-08 09:31:24', now)).toBe(0);
    expect(lagMsFrom('2026-10-08 09:27:53', now)).toBe(60_000);
  });
});

describe('seoulApi response classification', () => {
  it('distinguishes ok / no-data / quota / invalid key', () => {
    expect(classifySeoulResponse({ errorMessage: { status: 200, code: 'INFO-000' }, realtimePositionList: [] })).toBe('ok');
    expect(classifySeoulResponse({ status: 500, code: 'INFO-200', message: '해당하는 데이터가 없습니다.' })).toBe('no-data');
    expect(classifySeoulResponse({ status: 500, code: 'ERROR-337' })).toBe('quota');
    expect(classifySeoulResponse({ status: 500, code: 'INFO-100' })).toBe('invalid-key');
    expect(classifySeoulResponse({ status: 500, code: 'ERROR-336' })).toBe('error');
  });
});

describe('arrival API → position', () => {
  const base = { subwayId: '1004', updnLine: '상행', statnNm: '서울', recptnDt: '2026-10-08 09:27:30', btrainSttus: '일반' };

  it('never places a train at bstatnNm (terminal)', () => {
    const p = arrivalItemToPosition({ ...base, trainLineNm: '불암산행 - 회현방면', btrainNo: '4540', bstatnNm: '불암산', arvlMsg2: '서울 도착', arvlMsg3: '서울', arvlCd: '1', barvlDt: '0' })!;
    expect(p.statnNm).toBe('서울');
    expect(p.trainSttus).toBe('1');
    expect(p.lstnyNm).toBe('불암산');
  });

  it('uses arvlMsg3 for trains still several stations away', () => {
    const p = arrivalItemToPosition({ ...base, subwayId: '1002', updnLine: '외선', statnNm: '강남', trainLineNm: '성수행 - 역삼방면', btrainNo: '3119', bstatnNm: '성수', arvlMsg2: '전역 도착', arvlMsg3: '교대', arvlCd: '5', barvlDt: '90' })!;
    expect(p.statnNm).toBe('교대');
    expect(p.trainSttus).toBe('1');
  });

  it('keeps barvlDt only when the train is heading to the queried station', () => {
    const p = arrivalItemToPosition({ ...base, btrainNo: '1', arvlCd: '3', arvlMsg3: '회현', barvlDt: '70' })!;
    expect(p.statnNm).toBe('서울');
    expect(p.trainSttus).toBe('3');
    expect(p.barvlDt).toBe(70);
  });

  it('skips rows without a usable position', () => {
    expect(arrivalItemToPosition({ ...base, btrainNo: '0000', arvlCd: '1' })).toBeNull();
    expect(arrivalItemToPosition({ ...base, btrainNo: '5036', arvlCd: '99', arvlMsg3: '[3]번째 전역 (공덕)' })).toBeNull();
  });
});

describe('timeline from realtimePosition events', () => {
  it('uses trainSttus: departed train starts past the reported station', () => {
    const tl = resolveTimeline('2호선', '강남', '성수', '1', '2', 0)!;
    expect(tl.stationName).toBe('강남');
    expect(tl.elapsedMs).toBe(tl.segmentMs + DWELL_MS);     // 출발 = 정차 종료 시점
    const arrived = resolveTimeline('2호선', '강남', '성수', '1', '1', 0)!;
    expect(arrived.elapsedMs).toBe(arrived.segmentMs);       // 도착 = 정차 시작
    const leftPrev = resolveTimeline('2호선', '강남', '성수', '1', '3', 0)!;
    expect(leftPrev.elapsedMs).toBe(0);                      // 전역출발 = 이전역 출발 직후
  });

  it('advances by now - recptnDt and moves on to later stations', () => {
    const tl0 = resolveTimeline('2호선', '강남', '성수', '1', '2', 0)!;
    const tl = resolveTimeline('2호선', '강남', '성수', '1', '2', 4 * 60_000)!;
    expect(tl.stationName).not.toBe(tl0.stationName);
    // 2호선 외선(1)은 반시계방향: 강남 → 역삼 → 선릉
    expect(['역삼', '선릉']).toContain(tl.stationName);
    // 내선(0)은 시계방향: 강남 → 교대 → 서초
    const inner = resolveTimeline('2호선', '강남', '성수', '0', '2', 4 * 60_000)!;
    expect(['교대', '서초']).toContain(inner.stationName);
  });

  it('derives direction from the destination when updnLine disagrees', () => {
    // GTX-A 구성 → 수서 (북행). updnLine 을 일부러 반대로 줘도 종착역 기준으로 판단
    const tl = resolveTimeline('GTX-A', '구성', '수서', '1', '2', 0)!;
    expect(tl.dir).toBe(-1);
  });

  it('drops ghost trains with very old events and clamps future timestamps', () => {
    const train = toPosition(POSITION_ROW);
    const now = KST('2026-10-08 09:27:11');
    expect(buildLiveUnit(train, now + 11 * 60_000)).toBeNull();
    const future = buildLiveUnit({ ...train, recptnDt: '2026-10-08 09:30:00' }, now)!;
    expect(future).not.toBeNull();
    expect(now - future.timelineStartMs).toBe(future.segmentMs + DWELL_MS); // 미래 시각 → 지연 0
    expect(future.eventKey).toContain('강남|2|');
  });
});

describe('sample key range', () => {
  it('rewrites large ranges to 0/5 for the sample key', () => {
    expect(limitForSampleKey('json/realtimePosition/0/150/2호선')).toBe('json/realtimePosition/0/5/2호선');
    expect(limitForSampleKey('json/realtimeStationArrival/0/40/서울')).toBe('json/realtimeStationArrival/0/5/서울');
  });
});
