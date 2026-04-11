#!/usr/bin/env node
/**
 * Collect 빠른하차정보 (quick exit / optimal car door info) from Seoul Transportation Corp API.
 * Endpoint: https://apis.data.go.kr/B553766/inout/getFstExit
 * Total: ~2358 records, paginated (returns XML regardless of _type param)
 *
 * Output: public/data/fast-exit.json
 *   { "<lineNm>:<stnCd>:<upbdnbSe>": [{ door, facility, facPstn }, ...] }
 *
 * Run: node scripts/fetch-fast-exit.js
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

const BASE_URL = 'https://apis.data.go.kr/B553766/inout/getFstExit';
const PAGE_SIZE = 500;
const OUT_FILE  = path.resolve(__dirname, '../public/data/fast-exit.json');

// Simple XML tag extractor
function extractTags(xml, tag) {
  const results = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, 'g');
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
  return m ? m[1] : '';
}

function parseItems(xml) {
  const items = extractTags(xml, 'item');
  return items.map(item => ({
    lineNm:   extractTag(item, 'lineNm'),
    stnCd:    extractTag(item, 'stnCd'),
    stnNm:    extractTag(item, 'stnNm'),
    stnNo:    extractTag(item, 'stnNo'),
    upbdnbSe: extractTag(item, 'upbdnbSe'),   // 상행/하행
    drtnInfo: extractTag(item, 'drtnInfo'),   // destination station name
    door:     extractTag(item, 'qckgffVhclDoorNo'), // e.g. "2-3"
    facility: extractTag(item, 'plfmCmgFac'), // 에스컬레이터/엘리베이터/계단
    facPstn:  extractTag(item, 'facPstnNm'),  // human-readable position description
    fwkPstn:  extractTag(item, 'fwkPstnNm'),  // framework position
  }));
}

function parseTotalCount(xml) {
  return parseInt(extractTag(xml, 'totalCount')) || 0;
}

async function fetchPage(page) {
  const url = `${BASE_URL}?serviceKey=${encodeURIComponent(API_KEY)}&pageNo=${page}&numOfRows=${PAGE_SIZE}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  console.log('Fetching 빠른하차정보 from B553766 API...');

  // First page to get total count
  const firstXml = await fetchPage(1);
  const total    = parseTotalCount(firstXml);
  const pages    = Math.ceil(total / PAGE_SIZE);
  console.log(`Total: ${total} records, ${pages} pages`);

  const allItems = parseItems(firstXml);

  for (let p = 2; p <= pages; p++) {
    process.stdout.write(`\r  Page ${p}/${pages}...`);
    const xml = await fetchPage(p);
    allItems.push(...parseItems(xml));
  }
  console.log(`\n  Fetched ${allItems.length} items`);

  // Group by station+line+direction
  // Key: "<lineNm>|<stnCd>|<upbdnbSe>"
  const grouped = {};
  for (const item of allItems) {
    if (!item.stnCd || !item.door) continue;  // skip empty
    const key = `${item.lineNm}|${item.stnCd}|${item.upbdnbSe}`;
    if (!grouped[key]) {
      grouped[key] = {
        lineNm:   item.lineNm,
        stnCd:    item.stnCd,
        stnNm:    item.stnNm,
        stnNo:    item.stnNo,
        upbdnbSe: item.upbdnbSe,
        drtnInfo: item.drtnInfo,
        exits:    [],
      };
    }
    // Only add if facility is meaningful (skip 계단 with no details)
    if (item.facility && item.facility !== '계단') {
      grouped[key].exits.push({
        door:     item.door,
        facility: item.facility,
        facPstn:  item.facPstn,
      });
    } else if (item.facility === '계단' && item.facPstn) {
      grouped[key].exits.push({
        door:     item.door,
        facility: item.facility,
        facPstn:  item.facPstn,
      });
    }
  }

  // Also create a stnCd-indexed lookup for quick station lookup
  const byStn = {};
  for (const [key, val] of Object.entries(grouped)) {
    if (!byStn[val.stnCd]) byStn[val.stnCd] = { stnNm: val.stnNm, directions: {} };
    byStn[val.stnCd].directions[`${val.lineNm}|${val.upbdnbSe}`] = {
      lineNm:   val.lineNm,
      upbdnbSe: val.upbdnbSe,
      drtnInfo: val.drtnInfo,
      exits:    val.exits,
    };
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(byStn));
  console.log(`✅ Done: ${Object.keys(byStn).length} stations → fast-exit.json`);
}

main().catch(e => { console.error('\nFatal:', e); process.exit(1); });
