/**
 * fetch-gg-bus-stops.js
 * 경기도 버스 정류소 현황 전체 수집 (openapi.gg.go.kr / BusStation)
 * 총 34,585개, 1000건/페이지 기준 ~35 요청
 *
 * 출력: public/data/gg-bus-stops.json
 * 포맷: [{ id, name, city, sigunCd, lat, lng, type, engName }]
 */

const fs   = require('fs');
const path = require('path');

// KEY2 = 0 (무제한), KEY1 = 210/일
const GG_KEY     = 'c6c35ab2b20a4a209edabcaf1836ad8a';
const PAGE_SIZE  = 1000;
const OUT_FILE   = path.resolve(__dirname, '../public/data/gg-bus-stops.json');
const DELAY_MS   = 300;  // rate-limit safety

async function fetchPage(page) {
  const url =
    `https://openapi.gg.go.kr/BusStation` +
    `?KEY=${GG_KEY}&Type=json&pIndex=${page}&pSize=${PAGE_SIZE}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res  = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const json = await res.json();
      const head = json?.BusStation?.[0]?.head;
      const rows = json?.BusStation?.[1]?.row;

      if (!head) throw new Error('Unexpected response structure');

      const resultCode = head.find(h => h.RESULT)?.RESULT?.CODE;
      if (resultCode && resultCode !== 'INFO-000') {
        throw new Error(`API error: ${resultCode}`);
      }

      const totalCount = head.find(h => h.list_total_count)?.list_total_count ?? 0;
      return { rows: rows ?? [], totalCount };
    } catch (e) {
      if (attempt === 2) throw e;
      console.warn(`  retry ${attempt + 1} for page ${page}: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log('📦 Fetching 경기도 버스 정류소 from openapi.gg.go.kr/BusStation ...');

  // 1st page to get total count
  const first = await fetchPage(1);
  const total     = first.totalCount;
  const pages     = Math.ceil(total / PAGE_SIZE);
  console.log(`   총 ${total.toLocaleString()}개, ${pages} 페이지`);

  const allRows = [...first.rows];

  for (let p = 2; p <= pages; p++) {
    process.stdout.write(`   페이지 ${p}/${pages} ...`);
    const { rows } = await fetchPage(p);
    allRows.push(...rows);
    process.stdout.write(` +${rows.length} (누계: ${allRows.length})\n`);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Normalise to compact format
  const stops = allRows
    .filter(r => r.WGS84_LAT && r.WGS84_LOGT)
    .map(r => ({
      id:      r.STATION_ID,          // e.g. "234000706"
      manageNo: r.STATION_MANAGE_NO, // internal manage number
      name:    r.STATION_NM_INFO,
      engName: r.ENG_STATION_NM_INFO ?? null,
      city:    r.SIGUN_NM,            // e.g. "광주시"
      sigunCd: r.SIGUN_CD,            // e.g. "41610"
      type:    r.STATION_DIV_NM,      // e.g. "노변정류장"
      lat:     parseFloat(r.WGS84_LAT),
      lng:     parseFloat(r.WGS84_LOGT),
    }));

  const skipped = allRows.length - stops.length;
  if (skipped > 0) console.warn(`  ⚠️  좌표 없는 항목 ${skipped}개 제외`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(stops, null, 0));
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`\n✅ 저장: ${OUT_FILE}`);
  console.log(`   총 ${stops.length.toLocaleString()}개 정류장, ${kb} KB`);

  // Print city breakdown
  const byCityMap = {};
  stops.forEach(s => { byCityMap[s.city] = (byCityMap[s.city] ?? 0) + 1; });
  const byCity = Object.entries(byCityMap).sort((a, b) => b[1] - a[1]);
  console.log('\n   시군별:');
  byCity.slice(0, 10).forEach(([city, cnt]) =>
    console.log(`     ${city}: ${cnt.toLocaleString()}`));
  if (byCity.length > 10) console.log(`     ... 외 ${byCity.length - 10}개 시군`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
