'use strict';
/**
 * collect-subway-timetable.js
 *
 * 서울시 openapi.seoul.go.kr:8088 시간표 API를 이용해
 * 전체 799개 역사의 운행 첫차/막차/행선지 데이터를 수집합니다.
 *
 * 출력: public/data/subway-schedule-index.json
 *
 * Usage:
 *   node scripts/collect-subway-timetable.js              # 평일(week_tag=1) 전체
 *   node scripts/collect-subway-timetable.js --week 2     # 토요일
 *   node scripts/collect-subway-timetable.js --week 3     # 일요일
 *   node scripts/collect-subway-timetable.js --all        # 평일+토+일 (3배 호출)
 *   node scripts/collect-subway-timetable.js --dry-run    # 처음 10개만
 *
 * API 할당량: 하루 1000건 (추정). 평일 단독 수집 = ~800건으로 1일 내 완료.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.resolve(__dirname, '..', 'public', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'subway-schedule-index.json');
const CKPT_FILE   = path.join(DATA_DIR, '_timetable-checkpoint.json');

const API_KEY     = process.env.NEXT_PUBLIC_SEOUL_API_KEY || '634179436a7079773730786f4d5445';
const BASE_URL    = `http://openapi.seoul.go.kr:8088/${API_KEY}/json`;

const DELAY_MS    = 300; // 호출 간격 (ms) — 초당 ~3건

// ── 노선명 정규화: API → 앱 내부명 ──────────────────────────────────────
const LINE_NAME_MAP = {
  '01호선': '1호선',  '02호선': '2호선',  '03호선': '3호선',
  '04호선': '4호선',  '05호선': '5호선',  '06호선': '6호선',
  '07호선': '7호선',  '08호선': '8호선',  '09호선': '9호선',
  '경의선':  '경의중앙선',
  '인천선':  '인천1호선',
  '우이신설경전철': '우이신설선',
};
function normLine(raw) {
  return LINE_NAME_MAP[raw] || raw;
}

// ── API 호출 헬퍼 ─────────────────────────────────────────────────────────
async function callApi(path, attempt = 1) {
  const url = `${BASE_URL}/${path}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    // XML 오류 응답 체크
    if (text.startsWith('<')) {
      const code = (text.match(/<CODE>([^<]+)/) || [])[1] || 'UNKNOWN';
      const msg  = (text.match(/<MESSAGE>([^<]+)/) || [])[1] || text.slice(0, 80);
      if (code === 'ERROR-337') throw new Error(`API 일일 할당량 초과 (ERROR-337)`);
      throw new Error(`API XML 오류: ${code} — ${msg}`);
    }
    return JSON.parse(text);
  } catch (e) {
    if (attempt < 3 && !String(e.message).includes('ERROR-337')) {
      await sleep(1000 * attempt);
      return callApi(path, attempt + 1);
    }
    throw e;
  }
}

// ── 1. 전체 역 목록 조회 ─────────────────────────────────────────────────
async function fetchAllStations() {
  process.stdout.write('📋 전체 역 목록 조회 중...\n');
  const data = await callApi('SearchInfoBySubwayNameService/1/999/');
  const svc  = data?.SearchInfoBySubwayNameService;
  if (!svc || svc.RESULT?.CODE !== 'INFO-000') throw new Error('역 목록 조회 실패');
  const rows = svc.row || [];
  process.stdout.write(`   ✅ ${rows.length}개 역-노선 조합 수신\n`);
  return rows;
}

// ── 2. 역별 시간표 첫차/막차 조회 ────────────────────────────────────────
/**
 * @param {string} frCode  역 FR_CODE
 * @param {number} weekTag 1=평일, 2=토, 3=일
 * @param {number} inout   1 또는 2 (방향)
 * @returns {{ first: string, last: string, dest: string, count: number } | null}
 */
async function fetchFirstLast(frCode, weekTag, inout) {
  // 첫 10건 조회 (첫차 + total_count 파악)
  const p1 = `SearchSTNTimeTableByFRCodeService/1/10/${frCode}/${weekTag}/${inout}`;
  const d1  = await callApi(p1);
  const svc = d1?.SearchSTNTimeTableByFRCodeService;
  if (!svc || !svc.list_total_count) return null;

  const total = parseInt(svc.list_total_count, 10);
  if (!total || total === 0) return null;

  const rows1 = svc.row || [];
  if (rows1.length === 0) return null;

  const firstRow = rows1[0];
  const firstTime = toHHMM(firstRow.ARRIVETIME);
  const dest = firstRow.SUBWAYENAME || firstRow.SUBWAYSNAME || '';

  // 막차: 마지막 10건 조회
  let lastTime = null;
  if (total <= 10) {
    lastTime = toHHMM(rows1[rows1.length - 1].ARRIVETIME);
  } else {
    const start = Math.max(1, total - 9);
    const p2   = `SearchSTNTimeTableByFRCodeService/${start}/${total}/${frCode}/${weekTag}/${inout}`;
    try {
      const d2  = await callApi(p2);
      await sleep(DELAY_MS);
      const svc2 = d2?.SearchSTNTimeTableByFRCodeService;
      const rows2 = svc2?.row || [];
      if (rows2.length > 0) lastTime = toHHMM(rows2[rows2.length - 1].ARRIVETIME);
    } catch { /* 막차 취득 실패 시 스킵 */ }
  }

  return { first: firstTime, last: lastTime, dest, count: total };
}

function toHHMM(timeStr) {
  // "05:35:30" → "05:35"  /  "25:00:00" → "25:00"
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  return `${parts[0]}:${parts[1]}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── 메인 ─────────────────────────────────────────────────────────────────
async function main() {
  const args    = process.argv.slice(2);
  const isDry   = args.includes('--dry-run');
  const doAll   = args.includes('--all');
  const weekArg = args.find(a => a.startsWith('--week'));
  const singleWeek = weekArg ? parseInt(weekArg.split('=')[1] || args[args.indexOf(weekArg)+1], 10) : null;

  const weekTags = doAll ? [1, 2, 3] : singleWeek ? [singleWeek] : [1];
  const inouts   = [1, 2];

  console.log('🚇 지하철 시간표 수집기');
  console.log('────────────────────────────────');
  console.log(`수집 대상: WEEK_TAG=${weekTags.join(',')} × INOUT=${inouts.join(',')}`);
  if (isDry) console.log('⚠️  DRY-RUN: 처음 10개 역만');
  console.log();

  // 기존 결과 로드 (이어받기)
  let index = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    index = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    console.log(`📂 기존 데이터 로드: ${Object.keys(index).length}개 역`);
  }

  // 체크포인트
  let ckpt = {};
  if (fs.existsSync(CKPT_FILE)) {
    ckpt = JSON.parse(fs.readFileSync(CKPT_FILE, 'utf8'));
  }

  // 1. 역 목록
  let stations;
  if (ckpt.stations) {
    stations = ckpt.stations;
    console.log(`📋 체크포인트에서 역 목록 복원: ${stations.length}개`);
  } else {
    stations = await fetchAllStations();
    ckpt.stations = stations;
    fs.writeFileSync(CKPT_FILE, JSON.stringify(ckpt));
  }

  const targets = isDry ? stations.slice(0, 10) : stations;

  let callCount = 0, updated = 0, skipped = 0, errors = 0;

  for (const st of targets) {
    const key    = `${st.STATION_NM}__${normLine(st.LINE_NUM)}`;  // "신촌__경의중앙선"
    const frCode = st.FR_CODE;

    if (!index[key]) index[key] = {
      name:    st.STATION_NM,
      line:    normLine(st.LINE_NUM),
      frCode,
      stationCd: st.STATION_CD,
    };

    const entry = index[key];

    let needsUpdate = false;
    for (const wt of weekTags) {
      const wk = wt === 1 ? 'week' : wt === 2 ? 'sat' : 'sun';
      if (!entry[wk]) { entry[wk] = {}; needsUpdate = true; }
      for (const io of inouts) {
        const ioKey = String(io);
        if (!entry[wk][ioKey]) needsUpdate = true;
      }
    }
    if (!needsUpdate) { skipped++; continue; }

    process.stdout.write(`  ${st.STATION_NM}(${normLine(st.LINE_NUM)}) [${frCode}]`);

    try {
      for (const wt of weekTags) {
        const wk = wt === 1 ? 'week' : wt === 2 ? 'sat' : 'sun';
        if (!entry[wk]) entry[wk] = {};

        for (const io of inouts) {
          const ioKey = String(io);
          if (entry[wk][ioKey]) continue; // 이미 있음

          await sleep(DELAY_MS);
          callCount++;
          const result = await fetchFirstLast(frCode, wt, io);
          callCount++; // 막차 조회 포함 시 +1 (실제론 fetchFirstLast 내에서 추가 호출)

          if (result) {
            entry[wk][ioKey] = result;
            process.stdout.write(` ✓[w${wt}d${io}:${result.first}→${result.dest}]`);
          } else {
            process.stdout.write(` ✗[w${wt}d${io}]`);
          }
        }
      }
      process.stdout.write('\n');
      updated++;
    } catch (e) {
      process.stdout.write(` ❌ ${e.message}\n`);
      errors++;
      if (e.message.includes('ERROR-337')) {
        console.error('\n🚫 일일 API 할당량 초과. 내일 재시도하세요.');
        break;
      }
    }

    // 50개마다 중간 저장
    if ((updated + skipped) % 50 === 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index));
      process.stdout.write(`   💾 중간 저장 (${updated + skipped}개 처리)\n`);
    }
  }

  // 최종 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index));
  // 완료 시 체크포인트 제거
  if (!isDry && errors === 0) {
    try { fs.unlinkSync(CKPT_FILE); } catch {}
  }

  console.log('\n────────────────────────────────');
  console.log(`✅ 업데이트: ${updated}개`);
  console.log(`⏭️  스킵(기존):  ${skipped}개`);
  console.log(`❌ 오류:     ${errors}개`);
  console.log(`📞 API 호출: 약 ${callCount}건`);
  console.log(`💾 저장 위치: ${OUTPUT_FILE}`);
  console.log(`📊 총 역-노선: ${Object.keys(index).length}개`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
