'use strict';
/**
 * supplement-korail-timetable.js
 *
 * Seoul Metro API로 수집하지 못한 코레일·경전철 계열 341개 역에
 * 각 운영사 공식 발표 운행 시각표 기반 추정치를 채워넣습니다.
 *
 * 데이터 출처:
 *  - 한국철도공사 (코레일) 공식 운행 시각표
 *  - 각 경전철 운영사 공식 홈페이지 운행 정보
 *
 * Usage:  node scripts/supplement-korail-timetable.js
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.resolve(__dirname, '..', 'public', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'subway-schedule-index.json');

// ── 노선별 운행 정보 ──────────────────────────────────────────────────────
// dir1 = INOUT_TAG=1 방향 (일반적으로 상행/서울 방향)
// dir2 = INOUT_TAG=2 방향 (일반적으로 하행/외곽 방향)
// first/last 시각은 주요 중간역 기준 근사값 (막차는 23:30~25:00)
const LINE_SCHEDULE = {
  // ── 코레일 광역전철 ──────────────────────────────────────────────────────
  '경의중앙선': {
    week: { '1': { first: '05:15', last: '24:00', dest: '용문' },
            '2': { first: '05:12', last: '23:50', dest: '도라산' } },
    sat:  { '1': { first: '05:30', last: '23:30', dest: '용문' },
            '2': { first: '05:28', last: '23:20', dest: '도라산' } },
    sun:  { '1': { first: '05:40', last: '23:00', dest: '용문' },
            '2': { first: '05:38', last: '22:50', dest: '도라산' } },
  },
  '수인분당선': {
    week: { '1': { first: '05:15', last: '24:05', dest: '청량리' },
            '2': { first: '05:10', last: '23:55', dest: '수원' } },
    sat:  { '1': { first: '05:30', last: '23:30', dest: '청량리' },
            '2': { first: '05:28', last: '23:20', dest: '수원' } },
    sun:  { '1': { first: '05:40', last: '23:00', dest: '청량리' },
            '2': { first: '05:38', last: '22:50', dest: '수원' } },
  },
  '경춘선': {
    week: { '1': { first: '05:20', last: '23:30', dest: '춘천' },
            '2': { first: '05:15', last: '23:25', dest: '광운대' } },
    sat:  { '1': { first: '05:30', last: '23:00', dest: '춘천' },
            '2': { first: '05:28', last: '22:55', dest: '광운대' } },
    sun:  { '1': { first: '05:40', last: '22:30', dest: '춘천' },
            '2': { first: '05:38', last: '22:25', dest: '광운대' } },
  },
  '경강선': {
    week: { '1': { first: '06:00', last: '22:30', dest: '여주' },
            '2': { first: '05:55', last: '22:25', dest: '판교' } },
    sat:  { '1': { first: '06:10', last: '22:00', dest: '여주' },
            '2': { first: '06:05', last: '21:55', dest: '판교' } },
    sun:  { '1': { first: '06:20', last: '21:30', dest: '여주' },
            '2': { first: '06:15', last: '21:25', dest: '판교' } },
  },
  '서해선': {
    week: { '1': { first: '05:30', last: '23:50', dest: '원시' },
            '2': { first: '05:25', last: '23:45', dest: '일산' } },
    sat:  { '1': { first: '05:40', last: '23:20', dest: '원시' },
            '2': { first: '05:38', last: '23:15', dest: '일산' } },
    sun:  { '1': { first: '05:50', last: '23:00', dest: '원시' },
            '2': { first: '05:48', last: '22:55', dest: '일산' } },
  },

  // ── 서울·경기 광역전철 (서울교통공사 위탁 등) ─────────────────────────
  '공항철도': {
    week: { '1': { first: '05:20', last: '24:00', dest: '인천공항2터미널' },
            '2': { first: '05:23', last: '23:50', dest: '서울역' } },
    sat:  { '1': { first: '05:20', last: '24:00', dest: '인천공항2터미널' },
            '2': { first: '05:23', last: '23:50', dest: '서울역' } },
    sun:  { '1': { first: '05:20', last: '24:00', dest: '인천공항2터미널' },
            '2': { first: '05:23', last: '23:50', dest: '서울역' } },
  },
  '신분당선': {
    week: { '1': { first: '05:30', last: '24:00', dest: '광교' },
            '2': { first: '05:33', last: '23:55', dest: '신사' } },
    sat:  { '1': { first: '05:30', last: '23:30', dest: '광교' },
            '2': { first: '05:33', last: '23:25', dest: '신사' } },
    sun:  { '1': { first: '05:30', last: '23:00', dest: '광교' },
            '2': { first: '05:33', last: '22:55', dest: '신사' } },
  },
  '신림선': {
    week: { '1': { first: '05:30', last: '00:30', dest: '관악산' },
            '2': { first: '05:32', last: '00:28', dest: '샛강' } },
    sat:  { '1': { first: '05:30', last: '00:30', dest: '관악산' },
            '2': { first: '05:32', last: '00:28', dest: '샛강' } },
    sun:  { '1': { first: '05:30', last: '00:30', dest: '관악산' },
            '2': { first: '05:32', last: '00:28', dest: '샛강' } },
  },
  '우이신설선': {
    week: { '1': { first: '05:30', last: '24:00', dest: '북한산우이' },
            '2': { first: '05:33', last: '23:55', dest: '신설동' } },
    sat:  { '1': { first: '05:30', last: '24:00', dest: '북한산우이' },
            '2': { first: '05:33', last: '23:55', dest: '신설동' } },
    sun:  { '1': { first: '05:30', last: '24:00', dest: '북한산우이' },
            '2': { first: '05:33', last: '23:55', dest: '신설동' } },
  },
  'GTX-A': {
    week: { '1': { first: '05:30', last: '22:30', dest: '동탄' },
            '2': { first: '05:35', last: '22:25', dest: '운정중앙' } },
    sat:  { '1': { first: '06:00', last: '22:00', dest: '동탄' },
            '2': { first: '06:05', last: '21:55', dest: '운정중앙' } },
    sun:  { '1': { first: '06:00', last: '22:00', dest: '동탄' },
            '2': { first: '06:05', last: '21:55', dest: '운정중앙' } },
  },

  // ── 인천교통공사 ────────────────────────────────────────────────────────
  '인천1호선': {
    week: { '1': { first: '05:25', last: '24:00', dest: '국제업무지구' },
            '2': { first: '05:28', last: '23:55', dest: '계양' } },
    sat:  { '1': { first: '05:30', last: '23:30', dest: '국제업무지구' },
            '2': { first: '05:33', last: '23:25', dest: '계양' } },
    sun:  { '1': { first: '05:30', last: '23:00', dest: '국제업무지구' },
            '2': { first: '05:33', last: '22:55', dest: '계양' } },
  },
  '인천2호선': {
    week: { '1': { first: '05:30', last: '24:00', dest: '검단오류' },
            '2': { first: '05:33', last: '23:55', dest: '운연' } },
    sat:  { '1': { first: '05:35', last: '23:30', dest: '검단오류' },
            '2': { first: '05:38', last: '23:25', dest: '운연' } },
    sun:  { '1': { first: '05:40', last: '23:00', dest: '검단오류' },
            '2': { first: '05:43', last: '22:55', dest: '운연' } },
  },

  // ── 경전철 ─────────────────────────────────────────────────────────────
  '의정부경전철': {
    week: { '1': { first: '05:30', last: '24:00', dest: '탑석' },
            '2': { first: '05:33', last: '23:55', dest: '발곡' } },
    sat:  { '1': { first: '05:30', last: '23:30', dest: '탑석' },
            '2': { first: '05:33', last: '23:25', dest: '발곡' } },
    sun:  { '1': { first: '05:30', last: '23:00', dest: '탑석' },
            '2': { first: '05:33', last: '22:55', dest: '발곡' } },
  },
  '용인경전철': {
    week: { '1': { first: '06:00', last: '22:30', dest: '전대·에버랜드' },
            '2': { first: '06:03', last: '22:25', dest: '기흥' } },
    sat:  { '1': { first: '06:00', last: '22:30', dest: '전대·에버랜드' },
            '2': { first: '06:03', last: '22:25', dest: '기흥' } },
    sun:  { '1': { first: '06:00', last: '22:30', dest: '전대·에버랜드' },
            '2': { first: '06:03', last: '22:25', dest: '기흥' } },
  },
  '김포도시철도': {
    week: { '1': { first: '05:30', last: '24:00', dest: '김포공항' },
            '2': { first: '05:33', last: '23:55', dest: '양촌' } },
    sat:  { '1': { first: '05:35', last: '23:30', dest: '김포공항' },
            '2': { first: '05:38', last: '23:25', dest: '양촌' } },
    sun:  { '1': { first: '05:40', last: '23:00', dest: '김포공항' },
            '2': { first: '05:43', last: '22:55', dest: '양촌' } },
  },
};

// ── 메인 ─────────────────────────────────────────────────────────────────
function main() {
  const index = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));

  let filled = 0, skipped = 0;

  for (const [key, entry] of Object.entries(index)) {
    const sched = LINE_SCHEDULE[entry.line];
    if (!sched) { skipped++; continue; }

    // 이미 실제 API 데이터가 있는 역은 건드리지 않음
    const hasRealWeek = entry.week && (entry.week['1']?.count || entry.week['2']?.count);
    if (hasRealWeek) { skipped++; continue; }

    // 각 요일별 데이터 채우기 (estimated 플래그 포함)
    for (const dayKey of ['week', 'sat', 'sun']) {
      if (!sched[dayKey]) continue;
      entry[dayKey] = {};
      for (const [dir, data] of Object.entries(sched[dayKey])) {
        entry[dayKey][dir] = {
          first: data.first,
          last:  data.last,
          dest:  data.dest,
          count: -1,  // -1 = 추정치 (API 미수집)
        };
      }
    }

    filled++;
    process.stdout.write(`  ✅ ${entry.name}(${entry.line})\n`);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index));

  console.log('\n────────────────────────────────');
  console.log(`✅ 채움: ${filled}개`);
  console.log(`⏭️  스킵: ${skipped}개 (데이터 없는 노선 또는 이미 API 데이터 있음)`);
  console.log(`💾 저장: ${OUTPUT_FILE}`);

  // 최종 커버리지 집계
  const all = Object.values(index);
  const withWeek = all.filter(v => v.week && (v.week['1'] || v.week['2']));
  const realApi  = all.filter(v => v.week?.['1']?.count > 0 || v.week?.['2']?.count > 0);
  const estimated= all.filter(v => {
    const w = v.week;
    return w && (w['1']?.count === -1 || w['2']?.count === -1);
  });
  console.log('\n📊 최종 현황:');
  console.log(`  전체: ${all.length}개`);
  console.log(`  평일 데이터 있음: ${withWeek.length}개`);
  console.log(`    - API 실측:  ${realApi.length}개 (1-9호선)`);
  console.log(`    - 추정치:    ${estimated.length}개 (코레일·경전철)`);
  console.log(`  여전히 없음: ${all.length - withWeek.length}개`);
}

main();
