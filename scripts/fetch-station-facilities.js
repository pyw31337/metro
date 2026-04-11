#!/usr/bin/env node
/**
 * Collect station facility info from Seoul Transportation Corp API (B553766/facility).
 * Collects: elevator, escalator, restroom, ATM, nursing room, locker
 *
 * All endpoints return XML (not JSON). Paginates automatically.
 *
 * Output: public/data/station-facilities.json
 *   { "<stnCd>": { stnNm, lineNm, stnNo, elevator: [...], escalator: [...], restroom: [...], atm: [...], nursery: [...], locker: [...] } }
 *
 * Run: node scripts/fetch-station-facilities.js
 */

const fs   = require('fs');
const path = require('path');

const API_KEY = process.env.NEXT_PUBLIC_BUS_API_KEY
  || readEnv('NEXT_PUBLIC_BUS_API_KEY')
  || readEnv('NEXT_PUBLIC_DATA_GO_KR_KEY');

function readEnv(key) {
  try {
    const env = fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8');
    const line = env.split('\n').find(l => l.startsWith(key + '='));
    return line ? line.slice(key.length + 1).trim() : '';
  } catch { return ''; }
}

if (!API_KEY) { console.error('API key not found'); process.exit(1); }

const BASE_URL   = 'https://apis.data.go.kr/B553766/facility';
const PAGE_SIZE  = 500;
const OUT_FILE   = path.resolve(__dirname, '../public/data/station-facilities.json');
const SAVE_INT   = 2; // save after every N endpoint fetches

// ── Simple XML helpers ────────────────────────────────────────────
function extractTags(xml, tag) {
  const results = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

function tag(xml, t) {
  const m = xml.match(new RegExp(`<${t}>([^<]*)<\\/${t}>`));
  return m ? m[1].trim() : '';
}

function parseTotalCount(xml) {
  return parseInt(tag(xml, 'totalCount')) || 0;
}

async function fetchPage(endpoint, page) {
  const url = `${BASE_URL}/${endpoint}?serviceKey=${encodeURIComponent(API_KEY)}&pageNo=${page}&numOfRows=${PAGE_SIZE}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchAll(endpoint) {
  const firstXml = await fetchPage(endpoint, 1);
  const total = parseTotalCount(firstXml);
  if (!total) return [];
  const pages = Math.ceil(total / PAGE_SIZE);
  const xmlPages = [firstXml];
  for (let p = 2; p <= pages; p++) {
    xmlPages.push(await fetchPage(endpoint, p));
  }
  return xmlPages.flatMap(xml => extractTags(xml, 'item'));
}

// ── Facility parsers ──────────────────────────────────────────────
function parseElevator(item) {
  return {
    name:     tag(item, 'fcltNm'),
    stnFloor: `${tag(item, 'bgngFlr')}→${tag(item, 'endFlr')}`,
    entrance: tag(item, 'vcntEntrcNo'),
    detail:   tag(item, 'dtlPstn') || tag(item, 'bgngFlrDtlPstn'),
    serial:   tag(item, 'elvtrSn'),
    status:   tag(item, 'oprtngSitu'), // M=운행중
  };
}

function parseEscalator(item) {
  return {
    name:      tag(item, 'fcltNm'),
    direction: tag(item, 'upbdnbSe'), // 상행/하행
    stnFloor:  `${tag(item, 'bgngFlr')}→${tag(item, 'endFlr')}`,
    entrance:  tag(item, 'vcntEntrcNo'),
    detail:    tag(item, 'bgngFlrDtlPstn'),
    serial:    tag(item, 'elvtrSn'),
    status:    tag(item, 'oprtngSitu'),
  };
}

function parseRestroom(item) {
  return {
    name:     tag(item, 'fcltNm'),
    floor:    tag(item, 'stnFlr'),
    entrance: tag(item, 'vcntEntrcNo'),
    detail:   tag(item, 'dtlPstn'),
    info:     tag(item, 'rstrmInfo'),
    wheelcha: tag(item, 'whlchrAcsPsbltyYn') === 'Y',
    inside:   tag(item, 'gateInoutSe') === '내부',
  };
}

function parseAtm(item) {
  return {
    floor:    tag(item, 'stnFlr'),
    detail:   tag(item, 'dtlPstn'),
    bank:     tag(item, 'fnstNm'),
    hours:    tag(item, 'utztnPsbltyHr'),
  };
}

function parseNursery(item) {
  return {
    name:     tag(item, 'fcltNm'),
    floor:    tag(item, 'stnFlr'),
    detail:   tag(item, 'dtlPstn'),
    inside:   tag(item, 'gateInoutSe') === '내부',
    hours:    tag(item, 'utztnHr'),
    exit:     tag(item, 'exitNo'),
  };
}

function parseLocker(item) {
  return {
    id:     tag(item, 'lckrId'),
    detail: tag(item, 'lckrDtlLocNm'),
    count:  parseInt(tag(item, 'lckrCnt')) || 0,
    addr:   tag(item, 'fcltRoadNmAddr'),
  };
}

// ── Main ──────────────────────────────────────────────────────────
const ENDPOINTS = [
  { name: 'getFcElvtr',  key: 'elevator',  parse: parseElevator,  label: '엘리베이터' },
  { name: 'getFcEsctr',  key: 'escalator', parse: parseEscalator, label: '에스컬레이터' },
  { name: 'getFcRstrm',  key: 'restroom',  parse: parseRestroom,  label: '화장실' },
  { name: 'getFcAtm',    key: 'atm',       parse: parseAtm,       label: 'ATM' },
  { name: 'getFcNrsrm',  key: 'nursery',   parse: parseNursery,   label: '수유실' },
  { name: 'getFcLckr',   key: 'locker',    parse: parseLocker,    label: '물품보관함' },
];

async function main() {
  // Load existing output (resume support)
  const existing = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : {};
  const result = { ...existing };

  for (let i = 0; i < ENDPOINTS.length; i++) {
    const ep = ENDPOINTS[i];
    process.stdout.write(`[${i+1}/${ENDPOINTS.length}] ${ep.label} (${ep.name})... `);

    try {
      const items = await fetchAll(ep.name);
      let count = 0;

      for (const item of items) {
        const stnCd  = tag(item, 'stnCd');
        const stnNm  = tag(item, 'stnNm');
        const lineNm = tag(item, 'lineNm');
        const stnNo  = tag(item, 'stnNo');
        if (!stnCd) continue;

        if (!result[stnCd]) {
          result[stnCd] = { stnNm, lineNm, stnNo, elevator: [], escalator: [], restroom: [], atm: [], nursery: [], locker: [] };
        }
        // Ensure all keys exist (for stations seen by later endpoints first)
        for (const key of ['elevator','escalator','restroom','atm','nursery','locker']) {
          if (!result[stnCd][key]) result[stnCd][key] = [];
        }

        const parsed = ep.parse(item);
        result[stnCd][ep.key].push(parsed);
        count++;
      }

      console.log(`${count} records (${items.length} raw)`);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }

    // Save periodically
    if ((i + 1) % SAVE_INT === 0 || i === ENDPOINTS.length - 1) {
      fs.writeFileSync(OUT_FILE, JSON.stringify(result));
    }
  }

  const stnCount = Object.keys(result).length;
  console.log(`\n✅ Done: ${stnCount} stations → station-facilities.json`);
}

main().catch(e => { console.error('\nFatal:', e); process.exit(1); });
