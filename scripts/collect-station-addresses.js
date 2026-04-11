'use strict';
/**
 * collect-station-addresses.js
 *
 * master-subway.json의 각 역 좌표를 Nominatim reverse geocoding으로 조회하여
 * station-addresses.json에 저장합니다.
 *
 * Output: public/data/station-addresses.json
 *   { "역명": { road, suburb, borough, city, postcode } }
 *
 * Usage:
 *   node scripts/collect-station-addresses.js
 *   node scripts/collect-station-addresses.js --resume
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.resolve(__dirname, '..', 'public', 'data');
const SUBWAY_FILE = path.join(DATA_DIR, 'master-subway.json');
const OUT_FILE    = path.join(DATA_DIR, 'station-addresses.json');
const CKPT_FILE   = path.join(DATA_DIR, '_addr-checkpoint.json');

const DELAY_MS = 1100; // Nominatim rate limit: 1 req/sec max
const doResume = process.argv.includes('--resume');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko&zoom=17`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MetroLiveApp/1.0 (station address collection)' }
    });
    const d = await res.json();
    const a = d.address || {};

    // 한국 행정구역 구조로 정규화
    return {
      road:     a.road || a.pedestrian || a.footway || '',
      suburb:   a.neighbourhood || a.suburb || '',
      borough:  a.borough || a.city_district || '',
      district: a.county || '',
      city:     a.city || a.town || a.municipality || '',
      postcode: a.postcode || '',
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  const subway = JSON.parse(fs.readFileSync(SUBWAY_FILE, 'utf8'));

  // 기존 결과 로드
  let result = {};
  if (fs.existsSync(OUT_FILE)) {
    result = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  }

  // 체크포인트
  let processed = new Set();
  if (doResume && fs.existsSync(CKPT_FILE)) {
    processed = new Set(JSON.parse(fs.readFileSync(CKPT_FILE, 'utf8')));
    console.log(`재개: 이미 처리 ${processed.size}개`);
  }

  // 역명 기준 dedup (같은 역명이 여러 노선에 있는 경우 첫 번째만)
  const seen = new Set();
  const targets = subway.filter(s => {
    if (!s.lat || !s.lng) return false;
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });

  console.log(`주소 수집 대상: ${targets.length}개 역\n`);

  let done = 0, failed = 0, skipped = 0;

  for (const station of targets) {
    if (doResume && processed.has(station.name)) {
      skipped++;
      continue;
    }

    await sleep(DELAY_MS);
    const addr = await reverseGeocode(station.lat, station.lng);

    if (addr) {
      result[station.name] = addr;
      const loc = [addr.borough || addr.district, addr.city].filter(Boolean).join(' ');
      process.stdout.write(`  ${station.name} → ${addr.road || '?'} (${loc})\n`);
      done++;
    } else {
      process.stdout.write(`  ${station.name} → ❌\n`);
      failed++;
    }

    processed.add(station.name);

    // 30개마다 중간 저장
    if ((done + failed) % 30 === 0) {
      fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
      fs.writeFileSync(CKPT_FILE, JSON.stringify([...processed]));
      console.log(`  💾 중간 저장 (${done + failed}개 처리)`);
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  fs.writeFileSync(CKPT_FILE, JSON.stringify([...processed]));

  console.log(`\n✅ 완료: ${done}개 / 실패: ${failed}개 / 스킵: ${skipped}개`);
  console.log(`📊 station-addresses.json: ${Object.keys(result).length}개 역`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
