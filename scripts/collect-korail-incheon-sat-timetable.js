'use strict';
/**
 * collect-korail-incheon-sat-timetable.js
 *
 * 코레일(경의중앙선·수인분당선·경춘선·서해선·경강선) 및
 * 인천교통공사(인천1·2호선) 역의 토요일 열차별 시각을
 * SearchSTNTimeTableByFRCodeService API로 수집하여
 * station-arrivals-index.json 의 sat 키를 채웁니다.
 *
 * Usage:
 *   node scripts/collect-korail-incheon-sat-timetable.js
 *   node scripts/collect-korail-incheon-sat-timetable.js --resume
 *   node scripts/collect-korail-incheon-sat-timetable.js --dry-run
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR      = path.resolve(__dirname, '..', 'public', 'data');
const INDEX_FILE    = path.join(DATA_DIR, 'subway-schedule-index.json');
const ARRIVALS_FILE = path.join(DATA_DIR, 'station-arrivals-index.json');
const CKPT_FILE     = path.join(DATA_DIR, '_korail-sat-checkpoint.json');

const API_KEY  = process.env.NEXT_PUBLIC_SEOUL_API_KEY || '634179436a7079773730786f4d5445';
const BASE_URL = `http://openapi.seoul.go.kr:8088/${API_KEY}/json`;
const DELAY_MS = 300;
const PAGE_SIZE = 300;

const TARGET_LINES = new Set([
  '경의중앙선', '수인분당선', '경춘선', '서해선', '경강선',
  '인천1호선', '인천2호선',
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toHHMM(t) {
  if (!t) return null;
  const parts = t.split(':');
  return `${parts[0]}:${parts[1]}`;
}

async function callApi(p, attempt = 1) {
  const url = `${BASE_URL}/${p}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    if (text.startsWith('<')) {
      const code = (text.match(/<CODE>([^<]+)/) || [])[1] || 'UNKNOWN';
      const msg  = (text.match(/<MESSAGE>([^<]+)/) || [])[1] || text.slice(0, 80);
      if (code === 'ERROR-337') throw new Error(`API 할당량 초과 (ERROR-337)`);
      throw new Error(`API 오류: ${code} — ${msg}`);
    }
    return JSON.parse(text);
  } catch (e) {
    if (attempt < 3 && !String(e.message).includes('ERROR-337')) {
      await sleep(1000 * attempt);
      return callApi(p, attempt + 1);
    }
    throw e;
  }
}

async function fetchAllTimes(frCode, weekTag, inout) {
  const p1 = `SearchSTNTimeTableByFRCodeService/1/${PAGE_SIZE}/${frCode}/${weekTag}/${inout}`;
  const d1  = await callApi(p1);
  const svc = d1?.SearchSTNTimeTableByFRCodeService;
  if (!svc || !svc.list_total_count) return null;

  const total = parseInt(svc.list_total_count, 10);
  if (!total) return null;

  const rows1 = svc.row || [];
  let allTimes = rows1.map(r => toHHMM(r.ARRIVETIME)).filter(Boolean);

  if (total > PAGE_SIZE) {
    let start = PAGE_SIZE + 1;
    while (start <= total) {
      const end = Math.min(start + PAGE_SIZE - 1, total);
      await sleep(DELAY_MS);
      const p2 = `SearchSTNTimeTableByFRCodeService/${start}/${end}/${frCode}/${weekTag}/${inout}`;
      const d2 = await callApi(p2);
      const rows2 = d2?.SearchSTNTimeTableByFRCodeService?.row || [];
      allTimes = allTimes.concat(rows2.map(r => toHHMM(r.ARRIVETIME)).filter(Boolean));
      start = end + 1;
    }
  }

  const sorted = [...new Set(allTimes)].sort((a, b) => {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    const am_ = ah < 4 ? (ah + 24) * 60 + am : ah * 60 + am;
    const bm_ = bh < 4 ? (bh + 24) * 60 + bm : bh * 60 + bm;
    return am_ - bm_;
  });

  return sorted;
}

async function main() {
  const args     = process.argv.slice(2);
  const isDry    = args.includes('--dry-run');
  const doResume = args.includes('--resume');

  console.log('🚇 코레일/인천 토요일 시각표 수집기');
  console.log('────────────────────────────────');
  console.log(`대상: ${[...TARGET_LINES].join(', ')}`);
  if (isDry) console.log('⚠️  DRY-RUN: 처음 10개 역만');

  const schedIdx = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));

  // 수집 대상: TARGET_LINES + frCode 있는 역 (week 실측 or 추정 무관)
  const targets = Object.entries(schedIdx)
    .filter(([key, entry]) => TARGET_LINES.has(entry.line) && entry.frCode)
    .map(([key, entry]) => ({ key, name: entry.name, line: entry.line, frCode: entry.frCode }));

  console.log(`대상 역: ${targets.length}개\n`);

  let arrIndex = {};
  if (fs.existsSync(ARRIVALS_FILE)) {
    arrIndex = JSON.parse(fs.readFileSync(ARRIVALS_FILE, 'utf8'));
    console.log(`📂 기존 arrivals index: ${Object.keys(arrIndex).length}개 역`);
  }

  let processed = new Set();
  if (doResume && fs.existsSync(CKPT_FILE)) {
    const ckpt = JSON.parse(fs.readFileSync(CKPT_FILE, 'utf8'));
    processed = new Set(ckpt.processed || []);
    console.log(`📋 체크포인트에서 재개: 이미 처리 ${processed.size}개`);
  }

  const toProcess = isDry ? targets.slice(0, 10) : targets;
  let updated = 0, skipped = 0, errors = 0, callCount = 0;

  for (const { key, name, line, frCode } of toProcess) {
    // sat 이미 있으면 스킵 (resume 모드)
    if (arrIndex[key]?.sat?.['1'] && processed.has(`${key}_sat`)) {
      skipped++;
      continue;
    }

    process.stdout.write(`  ${name}(${line}) [${frCode}]`);

    try {
      if (!arrIndex[key]) arrIndex[key] = {};
      if (!arrIndex[key].sat) arrIndex[key].sat = {};

      for (const inout of [1, 2]) {
        if (arrIndex[key].sat[String(inout)]?.length > 0) {
          process.stdout.write(` ⟳[d${inout}]`);
          continue;
        }

        await sleep(DELAY_MS);
        callCount++;
        const times = await fetchAllTimes(frCode, 2 /* 토요일=2 */, inout);

        if (times && times.length > 0) {
          arrIndex[key].sat[String(inout)] = times;
          process.stdout.write(` ✓[d${inout}:${times.length}편]`);
        } else {
          process.stdout.write(` ✗[d${inout}]`);
        }
      }

      process.stdout.write('\n');
      processed.add(`${key}_sat`);
      updated++;

      if (updated % 30 === 0) {
        fs.writeFileSync(ARRIVALS_FILE, JSON.stringify(arrIndex));
        fs.writeFileSync(CKPT_FILE, JSON.stringify({ processed: [...processed] }));
        console.log(`   💾 중간 저장 (${updated}개 처리)`);
      }

    } catch (e) {
      process.stdout.write(` ❌ ${e.message}\n`);
      errors++;
      if (e.message.includes('ERROR-337')) {
        console.error('\n🚫 API 할당량 초과. --resume 으로 재시도 가능');
        break;
      }
    }
  }

  fs.writeFileSync(ARRIVALS_FILE, JSON.stringify(arrIndex));
  fs.writeFileSync(CKPT_FILE, JSON.stringify({ processed: [...processed] }));

  console.log('\n────────────────────────────────');
  console.log(`✅ 업데이트: ${updated}개`);
  console.log(`⏭️  스킵: ${skipped}개`);
  console.log(`❌ 오류: ${errors}개`);
  console.log(`📞 API 호출: ~${callCount}건`);
  console.log(`📊 arrivals index 총 역 수: ${Object.keys(arrIndex).length}개`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
