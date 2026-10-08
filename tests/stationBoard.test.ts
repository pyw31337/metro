import { describe, it, expect } from 'vitest';
import { buildBoard, buildBoardTrain, formatEta, stopsBetween } from '@/services/stationBoard';

const KST = (s: string) => Date.parse(s.replace(' ', 'T') + '+09:00');

// 2026-10-08 10:40 실제 응답(성수역)에서 발췌
const ROWS = [
  { subwayId: '1002', updnLine: '외선', trainLineNm: '성수행 - 뚝섬방면', statnNm: '성수', arvlMsg2: '전역 도착', arvlMsg3: '건대입구', arvlCd: '5', barvlDt: '100', bstatnNm: '성수', btrainNo: '2201', btrainSttus: '일반', recptnDt: '2026-10-08 10:40:18' },
  { subwayId: '1002', updnLine: '외선', trainLineNm: '성수행 - 뚝섬방면', statnNm: '성수', arvlMsg2: '4분 30초 후', arvlMsg3: '강변', arvlCd: '99', barvlDt: '270', bstatnNm: '성수', btrainNo: '2203', btrainSttus: '일반', recptnDt: '2026-10-08 10:40:18' },
  { subwayId: '1002', updnLine: '외선', trainLineNm: '성수행 - 뚝섬방면', statnNm: '성수', arvlMsg2: '7분 후', arvlMsg3: '잠실나루', arvlCd: '99', barvlDt: '420', bstatnNm: '성수', btrainNo: '2205', btrainSttus: '일반', recptnDt: '2026-10-08 10:40:18' },
  { subwayId: '1002', updnLine: '내선', trainLineNm: '성수행 - 건대입구방면', statnNm: '성수', arvlMsg2: '2분 20초 후', arvlMsg3: '한양대', arvlCd: '99', barvlDt: '140', bstatnNm: '성수', btrainNo: '2102', btrainSttus: '일반', recptnDt: '2026-10-08 10:40:18' },
  { subwayId: '1002', updnLine: '내선', trainLineNm: '성수행 - 건대입구방면', statnNm: '성수', arvlMsg2: '성수 출발', arvlMsg3: '성수', arvlCd: '2', barvlDt: '0', bstatnNm: '성수', btrainNo: '2100', btrainSttus: '일반', recptnDt: '2026-10-08 10:40:18' },
];

describe('station board', () => {
  const now = KST('2026-10-08 10:40:48'); // 데이터 생성 30초 후

  it('groups by line+direction, keeps the next 2 trains and subtracts data age from barvlDt', () => {
    const board = buildBoard(ROWS, now);
    const outer = board.find(g => g.updnLine === '외선')!;
    expect(outer.heading).toBe('뚝섬방면');
    expect(outer.trains.map(t => t.trainNo)).toEqual(['2201', '2203']);
    expect(outer.trains[0].etaSec).toBe(70);              // 100 − 30
    expect(outer.trains[0].etaKind).toBe('reported');
    expect(outer.trains[0].ageSec).toBe(30);
    expect(outer.trains[1].stopsAway).toBe(3);            // 강변 → 구의 → 건대입구 → 성수
  });

  it('drops trains that already departed the station', () => {
    const inner = buildBoard(ROWS, now).find(g => g.updnLine === '내선')!;
    expect(inner.trains.map(t => t.trainNo)).toEqual(['2102']);
  });

  it('marks ETAs estimated when barvlDt is not provided (1호선)', () => {
    const t = buildBoardTrain({ subwayId: '1001', updnLine: '상행', trainLineNm: '광운대행 - 시청방면', statnNm: '서울', arvlMsg2: '[3]번째 전역 (노량진)', arvlMsg3: '노량진', arvlCd: '99', barvlDt: '0', bstatnNm: '광운대', btrainNo: '0060', recptnDt: '2026-10-08 10:44:30' }, '1호선', KST('2026-10-08 10:45:00'))!;
    expect(t.stopsAway).toBe(3);
    expect(t.etaKind).toBe('estimated');
    expect(t.etaSec).toBe(3 * 120 - 30);
    expect(formatEta(t)).toBe('약 6분');
  });

  it('hides ghost records older than 10 minutes and flags stale ones', () => {
    const ghost = { ...ROWS[0], recptnDt: '2026-10-08 10:24:04' };
    expect(buildBoardTrain(ghost, '2호선', now)).toBeNull();
    const stale = buildBoardTrain({ ...ROWS[1], recptnDt: '2026-10-08 10:38:00' }, '2호선', now)!;
    expect(stale.stale).toBe(true);
  });

  it('hides at-station records older than 150s and trains that are long overdue', () => {
    expect(buildBoardTrain({ ...ROWS[0], arvlCd: '1', arvlMsg2: '성수 도착', recptnDt: '2026-10-08 10:37:00' }, '2호선', now)).toBeNull();
    expect(buildBoardTrain({ ...ROWS[0], barvlDt: '60', recptnDt: '2026-10-08 10:36:00' }, '2호선', now)).toBeNull();
  });

  it('counts stops along loop direction on line 2', () => {
    expect(stopsBetween('2호선', '역삼', '강남', '내선')).toBe(1);
    expect(stopsBetween('2호선', '교대', '강남', '외선')).toBe(1);
    expect(stopsBetween('2호선', '역삼', '강남', '외선')).toBeGreaterThan(40); // 반대 방향으로 한 바퀴
  });

  it('formats at-station / reported times', () => {
    const at = buildBoardTrain({ ...ROWS[0], arvlCd: '1', arvlMsg2: '성수 도착' }, '2호선', now)!;
    expect(formatEta(at)).toBe('도착');
    expect(formatEta({ ...at, etaKind: 'reported', etaSec: 125 })).toBe('2분 05초');
  });
});
