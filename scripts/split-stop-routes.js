'use strict';
/**
 * split-stop-routes.js
 *
 * stop-routes.json (43.5MB, 196,916 stops) 를 cityCode 기반으로 4개 shard로 분할합니다.
 *
 * 출력:
 *   stop-routes-11.json   — 서울 (cityCode 11, ~21k stops)
 *   stop-routes-23.json   — 인천 (cityCode 23, ~6.9k stops)
 *   stop-routes-gg.json   — 경기 (cityCode 31xxx, ~33k stops)
 *   stop-routes-etc.json  — 기타 전국 (나머지, ~135k stops)
 *
 * Usage:
 *   node scripts/split-stop-routes.js
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'public', 'data');
const SRC      = path.join(DATA_DIR, 'stop-routes.json');

console.log('📂 Reading stop-routes.json …');
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
console.log(`  Total stops: ${Object.keys(data).length.toLocaleString()}`);

const shards = { '11': {}, '23': {}, gg: {}, etc: {} };

for (const [stopId, routes] of Object.entries(data)) {
  const cc = routes[0]?.cityCode || '';
  if (cc === '11')            shards['11'][stopId] = routes;
  else if (cc === '23')       shards['23'][stopId] = routes;
  else if (cc.startsWith('31')) shards.gg[stopId]  = routes;
  else                        shards.etc[stopId]   = routes;
}

const FILES = {
  '11': 'stop-routes-11.json',
  '23': 'stop-routes-23.json',
  gg:   'stop-routes-gg.json',
  etc:  'stop-routes-etc.json',
};

for (const [key, shard] of Object.entries(shards)) {
  const outPath = path.join(DATA_DIR, FILES[key]);
  const json    = JSON.stringify(shard);
  fs.writeFileSync(outPath, json);
  const mb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);
  console.log(`  ✅ ${FILES[key]}: ${Object.keys(shard).length.toLocaleString()} stops, ${mb} MB`);
}

console.log('\n✅ 분할 완료');
