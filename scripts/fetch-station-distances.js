#!/usr/bin/env node
/**
 * Collect inter-station distances and travel times from Seoul Open API.
 * Endpoint: StationDstncReqreTimeHm (278 records total)
 *
 * Output: public/data/station-distances.json
 *   Array of { line, station, travelTimeSec, distKm, acmlDist }
 *
 * Run: node scripts/fetch-station-distances.js
 */

const fs   = require('fs');
const path = require('path');

const SEOUL_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY
  || readEnv('NEXT_PUBLIC_SEOUL_API_KEY');

function readEnv(key) {
  try {
    const env = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8');
    const line = env.split('\n').find(l => l.startsWith(key + '='));
    return line ? line.slice(key.length + 1).trim() : '';
  } catch { return ''; }
}

if (!SEOUL_KEY) { console.error('NEXT_PUBLIC_SEOUL_API_KEY not found'); process.exit(1); }

const OUT_FILE = path.resolve(__dirname, '../public/data/station-distances.json');

// HM format: "2:00" → seconds
function hmToSec(hm) {
  if (!hm || !hm.includes(':')) return 0;
  const [m, s] = hm.split(':').map(Number);
  return m * 60 + (s || 0);
}

// Line name normalizer: "1" → "01호선", "2" → "02호선", etc.
function normLine(raw) {
  const n = parseInt(raw);
  if (!isNaN(n) && n >= 1 && n <= 9) return `0${n}호선`;
  const map = {
    'A': '공항철도',
    '경의': '경의선',
    '중앙': '경의선',
    '경춘': '경춘선',
    '수인': '수인분당선',
    '분당': '수인분당선',
    'K': 'KTX',
  };
  for (const [k, v] of Object.entries(map)) {
    if (raw.includes(k)) return v;
  }
  return raw;
}

async function main() {
  const url = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/StationDstncReqreTimeHm/1/278/`;
  console.log('Fetching station distances from Seoul Open API...');
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) { console.error(`HTTP ${res.status}`); process.exit(1); }
  const json = await res.json();

  const rows = json?.StationDstncReqreTimeHm?.row;
  if (!rows || !rows.length) { console.error('No data'); process.exit(1); }

  const result = rows.map(r => ({
    line:          normLine(r.SBWY_ROUT_LN || ''),
    station:       String(r.SBWY_STNS_NM || ''),
    travelTimeSec: hmToSec(r.HM),
    distKm:        parseFloat(r.DIST_KM) || 0,
    acmlDist:      parseFloat(r.ACML_DIST) || 0,
  }));

  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`✅ Done: ${result.length} records → station-distances.json`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
