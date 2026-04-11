'use strict';
/**
 * fill-missing-station-coords.js
 *
 * master-subway.json에 누락된 신규 역 좌표를 Nominatim(OpenStreetMap) API로 수집합니다.
 * subway-schedule-index.json에 있지만 master-subway.json에 없는 역을 대상으로 합니다.
 *
 * Usage:
 *   node scripts/fill-missing-station-coords.js
 *   node scripts/fill-missing-station-coords.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'public', 'data');
const SUBWAY_FILE = path.join(DATA_DIR, 'master-subway.json');
const SCHED_FILE  = path.join(DATA_DIR, 'subway-schedule-index.json');

const DELAY_MS = 1100; // Nominatim rate limit: 1 req/sec
const isDry = process.argv.includes('--dry-run');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 역명에서 괄호/특수문자 제거
function normName(nm) {
  return nm.replace(/\(.*?\)/g, '').replace(/\./g, '').trim();
}

// 노선 → 주요 도시/지역 힌트
const lineRegion = {
  '1호선': '경기도',
  '4호선': '경기도',
  '8호선': '경기도',
  '경의중앙선': '경기도',
  '서해선': '경기도 부천',
  '인천1호선': '인천',
  '신림선': '서울',
  '용인경전철': '경기도 용인',
  'GTX-A': '경기도',
  '7호선': '서울',
};

async function geocode(name, line) {
  const clean = normName(name);
  const region = lineRegion[line] || '서울';

  // 쿼리 순서: "역명역 지역", "역명역", "역명 지하철역 지역"
  const queries = [
    `${clean}역 ${region}`,
    `${clean}역`,
    `${clean} 지하철 ${region}`,
  ];

  for (const q of queries) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=kr&format=json&limit=3&accept-language=ko`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MetroLiveApp/1.0 (coord-fill script)' }
      });
      const data = await res.json();

      // 지하철 관련 결과 우선 (station, subway, railway)
      const best = data.find(r =>
        r.type === 'station' || r.type === 'subway' ||
        r.class === 'railway' || r.class === 'public_transport' ||
        r.display_name.includes('역')
      ) || data[0];

      if (best) {
        return { lat: parseFloat(best.lat), lng: parseFloat(best.lon), query: q, display: best.display_name };
      }
    } catch (e) {
      console.error(`  [geocode error] ${q}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
  return null;
}

async function main() {
  // 1. 현재 master-subway.json 로드
  const subway = JSON.parse(fs.readFileSync(SUBWAY_FILE, 'utf8'));
  const subwayNames = new Set(subway.map(s => s.name));

  // 2. subway-schedule-index.json에서 누락된 역 찾기
  const schedIdx = JSON.parse(fs.readFileSync(SCHED_FILE, 'utf8'));
  const missingMap = {}; // normName → { name, line, lines:[] }

  Object.values(schedIdx).forEach(e => {
    const nm = normName(e.name || '');
    if (!subwayNames.has(nm) && !subwayNames.has(e.name)) {
      if (!missingMap[nm]) {
        missingMap[nm] = { name: e.name, line: e.line, lines: [] };
      }
      // 여러 노선에 걸친 역은 lines 배열에 모두 수집
      if (!missingMap[nm].lines.includes(e.line)) {
        missingMap[nm].lines.push(e.line);
      }
    }
  });

  const missing = Object.values(missingMap);
  console.log(`누락 역 ${missing.length}개 수집 시작\n`);

  if (isDry) {
    console.log('DRY-RUN: 수집 대상만 출력');
    missing.forEach(m => console.log(`  ${m.name} (${m.lines.join('/')})`));
    return;
  }

  let added = 0, failed = 0;
  const failedList = [];

  for (const { name, line, lines } of missing) {
    process.stdout.write(`  ${name} (${lines.join('/')})`);

    await sleep(DELAY_MS);
    const result = await geocode(name, line);

    if (result) {
      // master-subway.json에 추가
      const allLines = lines.map(l => {
        // 노선명 → 코드 형식 변환 (기존 포맷 참고: "01호선", "경의중앙선" 등)
        const lineMap = {
          '1호선': '01호선', '2호선': '02호선', '3호선': '03호선',
          '4호선': '04호선', '5호선': '05호선', '6호선': '06호선',
          '7호선': '07호선', '8호선': '08호선', '9호선': '09호선',
        };
        return lineMap[l] || l;
      });

      subway.push({
        id: normName(name),
        name: name,
        lat: result.lat,
        lng: result.lng,
        lines: allLines,
      });

      process.stdout.write(` → ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}\n`);
      added++;
    } else {
      process.stdout.write(` → ❌ 좌표 없음\n`);
      failed++;
      failedList.push({ name, lines });
    }
  }

  // 저장
  if (added > 0) {
    fs.writeFileSync(SUBWAY_FILE, JSON.stringify(subway, null, 2));
    console.log(`\n✅ ${added}개 추가 → master-subway.json 저장`);
  }

  if (failedList.length > 0) {
    console.log(`\n❌ 좌표 수집 실패 ${failedList.length}개:`);
    failedList.forEach(f => console.log(`  ${f.name} (${f.lines.join('/')})`));
  }

  console.log(`\n총 master-subway.json 역 수: ${subway.length}`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
