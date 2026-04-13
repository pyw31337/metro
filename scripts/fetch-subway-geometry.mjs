#!/usr/bin/env node
/**
 * fetch-subway-geometry.mjs
 *
 * Seoul subway track geometry collector via OpenStreetMap Overpass API.
 * Fetches all subway route relations, matches them to our line names,
 * stitches way members into a continuous coordinate chain, and outputs
 * per-line full-path geometry for waypoint-based train interpolation.
 *
 * Output: public/data/subway-track-geometry.json
 *   { "2호선": [[lng, lat], ...], "경의중앙선": [[lng, lat], ...], ... }
 *   (GeoJSON coordinate order: [longitude, latitude])
 *
 * Usage:
 *   node scripts/fetch-subway-geometry.mjs
 *   node scripts/fetch-subway-geometry.mjs --force   (ignore cache)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = path.resolve(__dirname, '..', 'public', 'data');
const OUT_FILE   = path.join(DATA_DIR, 'subway-track-geometry.json');
const CACHE_FILE = path.join(DATA_DIR, '_osm-subway-cache.json');

// ─────────────────────────────────────────────────────────────────────────────
// Line name normalisation — map any OSM name/ref tag → our canonical name
// ─────────────────────────────────────────────────────────────────────────────
const LINE_NAMES = [
  '1호선','2호선','3호선','4호선','5호선','6호선','7호선','8호선','9호선',
  '경의중앙선','공항철도','수인분당선','신분당선','경춘선','신림선','우이신설선',
];

function osmNameToLine(tags = {}) {
  const text = [tags.name, tags.ref, tags['name:ko'], tags.network]
    .filter(Boolean).join(' ');

  if (/1호선/.test(text))                     return '1호선';
  if (/2호선/.test(text))                     return '2호선';
  if (/3호선/.test(text))                     return '3호선';
  if (/4호선/.test(text))                     return '4호선';
  if (/5호선/.test(text))                     return '5호선';
  if (/6호선/.test(text))                     return '6호선';
  if (/7호선/.test(text))                     return '7호선';
  if (/8호선/.test(text))                     return '8호선';
  if (/9호선/.test(text))                     return '9호선';
  if (/경의.*중앙|중앙.*경의|경의중앙/.test(text)) return '경의중앙선';
  if (/공항|AREX|arex/.test(text))            return '공항철도';
  if (/수인.*분당|분당.*수인|수인분당/.test(text)) return '수인분당선';
  if (/신분당/.test(text))                    return '신분당선';
  if (/경춘/.test(text))                      return '경춘선';
  if (/신림/.test(text))                      return '신림선';
  if (/우이|신설경전철|우이신설/.test(text))    return '우이신설선';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain stitching — identical to fetch-osm-bus-paths.js
// ─────────────────────────────────────────────────────────────────────────────
const EPS = 0.0002;

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

function buildChain(members) {
  const ways = members.filter(m =>
    m.type === 'way' &&
    !['stop','stop_entry_only','stop_exit_only',
      'platform','platform_entry_only','platform_exit_only'].includes(m.role) &&
    m.geometry && m.geometry.length >= 2
  );
  if (ways.length === 0) return null;

  const chain = []; // [[lat, lon], ...]

  for (const way of ways) {
    const pts = way.geometry.map(p => [p.lat, p.lon]);
    if (chain.length === 0) { chain.push(...pts); continue; }

    const last = chain[chain.length - 1];
    const dFwd = Math.abs(last[0]-pts[0][0]) + Math.abs(last[1]-pts[0][1]);
    const dRev = Math.abs(last[0]-pts[pts.length-1][0]) + Math.abs(last[1]-pts[pts.length-1][1]);
    const chosen = dFwd <= dRev ? pts : [...pts].reverse();
    const start  = samePoint(last, chosen[0]) ? 1 : 0;
    chain.push(...chosen.slice(start));
  }

  return chain.length >= 2 ? chain : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Haversine distance (metres) between two [lat,lon] points
// ─────────────────────────────────────────────────────────────────────────────
function distM(a, b) {
  const R  = 6_371_000;
  const φ1 = a[0] * Math.PI / 180, φ2 = b[0] * Math.PI / 180;
  const Δφ = (b[0] - a[0]) * Math.PI / 180;
  const Δλ = (b[1] - a[1]) * Math.PI / 180;
  const s  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge multiple chains for the same line into one best representative path.
// Strategy: keep the longest chain; attempt to attach shorter chains at either end.
// ─────────────────────────────────────────────────────────────────────────────
function mergeChains(chains) {
  if (chains.length === 0) return null;
  if (chains.length === 1) return chains[0];

  // Sort by length descending, start with the longest
  const sorted = [...chains].sort((a, b) => b.length - a.length);
  let merged = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i];
    const mFirst = merged[0], mLast = merged[merged.length - 1];
    const cFirst = c[0],      cLast = c[c.length - 1];

    const d_mLast_cFirst  = distM(mLast,  cFirst);
    const d_mLast_cLast   = distM(mLast,  cLast);
    const d_mFirst_cFirst = distM(mFirst, cFirst);
    const d_mFirst_cLast  = distM(mFirst, cLast);

    const minDist = Math.min(d_mLast_cFirst, d_mLast_cLast,
                             d_mFirst_cFirst, d_mFirst_cLast);

    if (minDist > 500) continue; // too far away — likely a branch, skip for now

    if (minDist === d_mLast_cFirst) {
      // append c to end of merged
      const skip = samePoint(mLast, cFirst) ? 1 : 0;
      merged = [...merged, ...c.slice(skip)];
    } else if (minDist === d_mLast_cLast) {
      const cRev = [...c].reverse();
      const skip = samePoint(mLast, cRev[0]) ? 1 : 0;
      merged = [...merged, ...cRev.slice(skip)];
    } else if (minDist === d_mFirst_cLast) {
      const skip = samePoint(mFirst, cLast) ? 1 : 0;
      merged = [...c.slice(0, c.length - skip), ...merged];
    } else {
      const cRev = [...c].reverse();
      const skip = samePoint(mFirst, cRev[cRev.length-1]) ? 1 : 0;
      merged = [...cRev.slice(0, cRev.length - skip), ...merged];
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// OSM Overpass — single bulk request (large bbox covers all Seoul metro lines)
// ─────────────────────────────────────────────────────────────────────────────
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// Wide bbox: Incheon ↔ Yangpyeong, Uijeongbu ↔ Osan — covers all lines
const BBOX = '[bbox:36.9,126.3,38.1,127.8]';

async function fetchOSMRelations(force = false) {
  if (!force && fs.existsSync(CACHE_FILE)) {
    const age = Date.now() - fs.statSync(CACHE_FILE).mtimeMs;
    if (age < 7 * 24 * 3600 * 1000) {
      process.stdout.write('📦 캐시된 OSM 데이터 사용 중...\n');
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  }

  process.stdout.write('🌐 OSM Overpass에서 서울권 지하철 노선 전체 다운로드 중...\n');
  // Seoul metropolitan transit uses "subway", "light_rail", and "train" route types
  const query = `[out:json][timeout:180]${BBOX};
(
  relation["type"="route"]["route"="subway"];
  relation["type"="route"]["route"="light_rail"];
  relation["type"="route"]["route"="train"]["network"~"수도권|서울|경의|분당|경춘|공항|신림|우이",i];
);
out geom;`;

  const res = await fetch(OVERPASS_URL, {
    method:  'POST',
    body:    'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal:  AbortSignal.timeout(200_000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${await res.text().catch(()=>'')}`);

  const json = await res.json();
  const relations = (json.elements ?? []).filter(e => e.type === 'relation');
  process.stdout.write(`   ✅ ${relations.length}개 relation 수신\n`);

  fs.writeFileSync(CACHE_FILE, JSON.stringify(relations));
  return relations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simplify path — remove intermediate points closer than `minDistM` metres
// ─────────────────────────────────────────────────────────────────────────────
function simplify(latLonArr, minDistM = 15) {
  if (latLonArr.length < 3) return latLonArr;
  const out = [latLonArr[0]];
  for (let i = 1; i < latLonArr.length - 1; i++) {
    if (distM(out[out.length - 1], latLonArr[i]) >= minDistM) {
      out.push(latLonArr[i]);
    }
  }
  out.push(latLonArr[latLonArr.length - 1]);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const force = process.argv.includes('--force');

  console.log('🚇 OSM 서울 지하철 선로 geometry 수집기');
  console.log('─────────────────────────────────────────');

  const osmRelations = await fetchOSMRelations(force);

  // Group chains by canonical line name
  // Multiple relations per line (directions, branches) → merge into one chain
  const lineChains = new Map(); // lineName → [chain, ...]

  let matched = 0, unmatched = 0;
  for (const rel of osmRelations) {
    const lineName = osmNameToLine(rel.tags ?? {});
    if (!lineName) { unmatched++; continue; }
    matched++;

    const chain = buildChain(rel.members ?? []);
    if (!chain) continue;

    if (!lineChains.has(lineName)) lineChains.set(lineName, []);
    lineChains.get(lineName).push(chain);
  }

  console.log(`\n매칭: ${matched}개 / 미매칭: ${unmatched}개`);

  // Build final output: { lineName: [[lng, lat], ...] }
  const output = {};
  for (const lineName of LINE_NAMES) {
    const chains = lineChains.get(lineName);
    if (!chains || chains.length === 0) {
      console.log(`  ⚠️  ${lineName}: OSM 데이터 없음`);
      continue;
    }

    const merged  = mergeChains(chains);
    if (!merged) { console.log(`  ⚠️  ${lineName}: chain 병합 실패`); continue; }

    const simple  = simplify(merged, 15);
    // Convert from [lat, lon] to [lng, lat] (GeoJSON order)
    output[lineName] = simple.map(([lat, lon]) => [lon, lat]);

    console.log(`  ✅ ${lineName.padEnd(8)}: ${chains.length}개 relation → ${simple.length}pts`);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(output));
  console.log(`\n💾 저장 완료: subway-track-geometry.json (${Object.keys(output).length}개 노선)`);
}

main().catch(err => { console.error('💥 오류:', err); process.exit(1); });
