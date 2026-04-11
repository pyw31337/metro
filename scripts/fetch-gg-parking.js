/**
 * fetch-gg-parking.js
 * 경기도 공영주차장 현황 수집 (openapi.gg.go.kr / ParkingPlace)
 * 총 2,595개
 *
 * 출력: public/data/gg-parking.json
 * 포맷: [{ id, name, city, type, capacity, lat, lng, hours, fee, phone }]
 */

const fs   = require('fs');
const path = require('path');

const GG_KEY    = 'c6c35ab2b20a4a209edabcaf1836ad8a';
const PAGE_SIZE = 1000;
const OUT_FILE  = path.resolve(__dirname, '../public/data/gg-parking.json');
const DELAY_MS  = 300;

async function fetchPage(page) {
  const url =
    `https://openapi.gg.go.kr/ParkingPlace` +
    `?KEY=${GG_KEY}&Type=json&pIndex=${page}&pSize=${PAGE_SIZE}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res  = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const json = await res.json();
      const head = json?.ParkingPlace?.[0]?.head;
      const rows = json?.ParkingPlace?.[1]?.row;

      if (!head) throw new Error('Unexpected response');

      const resultCode = head.find(h => h.RESULT)?.RESULT?.CODE;
      if (resultCode && resultCode !== 'INFO-000') throw new Error(resultCode);

      const totalCount = head.find(h => h.list_total_count)?.list_total_count ?? 0;
      return { rows: rows ?? [], totalCount };
    } catch (e) {
      if (attempt === 2) throw e;
      console.warn(`  retry ${attempt + 1}: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log('🅿️  Fetching 경기도 주차장 from openapi.gg.go.kr/ParkingPlace ...');

  const first  = await fetchPage(1);
  const total  = first.totalCount;
  const pages  = Math.ceil(total / PAGE_SIZE);
  console.log(`   총 ${total.toLocaleString()}개, ${pages} 페이지`);

  const allRows = [...first.rows];
  for (let p = 2; p <= pages; p++) {
    const { rows } = await fetchPage(p);
    allRows.push(...rows);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const parking = allRows
    .filter(r => r.REFINE_WGS84_LAT && r.REFINE_WGS84_LOGT)
    .map(r => ({
      id:       r.PARKPLC_MANAGE_NO,
      name:     r.PARKPLC_NM,
      city:     r.SIGUN_NM,
      sigunCd:  r.SIGUN_CD,
      divType:  r.PARKPLC_DIV_NM,   // 공영 / 민영
      lotType:  r.PARKPLC_TYPE,     // 노외 / 노상 / 부설
      capacity: r.PARKNG_COMPRT_PLANE_CNT ?? 0,
      lat:      parseFloat(r.REFINE_WGS84_LAT),
      lng:      parseFloat(r.REFINE_WGS84_LOGT),
      // Operating hours
      wkdayOpen:  r.WKDAY_OPERT_BEGIN_TM,
      wkdayClose: r.WKDAY_OPERT_END_TM,
      satOpen:    r.SAT_OPERT_BEGIN_TM,
      satClose:   r.SAT_OPERT_END_TM,
      holOpen:    r.HOLIDAY_OPERT_BEGIN_TM,
      holClose:   r.HOLIDAY_OPERT_END_TM,
      // Fee
      feeType:    r.CHRG_INFO,          // 유료 / 무료
      baseMins:   r.PARKNG_BASIS_TM,    // 기본시간(분)
      baseFee:    r.PARKNG_BASIS_USE_CHRG, // 기본요금(원)
      addUnit:    r.ADD_UNIT_TM,
      addFee:     r.ADD_UNIT_TM2_WITHIN_USE_CHRG,
      phone:      r.CONTCT_NO ?? null,
      address:    r.LOCPLC_LOTNO_ADDR ?? r.LOCPLC_ROADNM_ADDR ?? null,
    }));

  const skipped = allRows.length - parking.length;
  if (skipped > 0) console.warn(`  ⚠️  좌표 없는 항목 ${skipped}개 제외`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(parking, null, 0));
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`\n✅ 저장: ${OUT_FILE}`);
  console.log(`   총 ${parking.length.toLocaleString()}개 주차장, ${kb} KB`);

  const free = parking.filter(p => p.feeType === '무료').length;
  console.log(`   무료: ${free}, 유료: ${parking.length - free}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
