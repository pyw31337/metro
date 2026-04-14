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
 *   { "2호선": [[[lng, lat], ...], [[lng, lat], ...]], ... }
 *   MultiLineString 형식: 노선명 → 세그먼트 배열 (본선 + 지선 각각 독립 폴리라인)
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
// Chain deduplication helpers
// ─────────────────────────────────────────────────────────────────────────────

// Returns true if chains a and b represent the same physical route
// (start/end endpoints within D metres of each other in either orientation)
function sameRoute(a, b, D = 5000) {
  const dFwd = distM(a[0], b[0]) + distM(a[a.length - 1], b[b.length - 1]);
  const dRev = distM(a[0], b[b.length - 1]) + distM(a[a.length - 1], b[0]);
  return Math.min(dFwd, dRev) < D;
}

// Returns true if every sampled point of `cand` falls within `thM` metres
// of some point in `existing`.  Uses a stride to stay O(samples × n/stride).
function isSubsumed(cand, existing, thM = 500) {
  const samples = [0, 0.25, 0.5, 0.75, 1.0].map(
    t => cand[Math.floor(t * (cand.length - 1))]
  );
  for (const pt of samples) {
    let minD = Infinity;
    for (let i = 0; i < existing.length; i += 5) {
      const d = distM(pt, existing[i]);
      if (d < minD) minD = d;
    }
    if (minD > thM) return false;
  }
  return true;
}

// Given all chains for a line (sorted longest-first), select only:
//   1. Non-duplicate same-route chains (keep the longest per route)
//   2. Non-spatially-subsumed chains (don't add a chain fully covered by a longer one)
// This reduces 96 1호선 relations → 5 representative chains,
// and prevents parallel reverse-direction tracks from being double-rendered.
function selectRepresentativeChains(chains) {
  const sorted = [...chains].sort((a, b) => b.length - a.length);
  const selected = [];
  for (const c of sorted) {
    if (selected.some(s => sameRoute(s, c))) continue;   // same route, different direction
    if (selected.some(s => isSubsumed(c, s)))  continue; // fully covered by a longer chain
    selected.push(c);
  }
  return selected;
}


// ─────────────────────────────────────────────────────────────────────────────
// OSM Overpass — single bulk request (large bbox covers all Seoul metro lines)
// ─────────────────────────────────────────────────────────────────────────────
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// 넓은 bbox: 신창(36.77) 포함하도록 남쪽 36.7까지 확장, 지평(127.63) 동쪽까지 포함
const BBOX = '[bbox:36.7,126.3,38.1,127.85]';

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
// Loop deduplication — OSM relation이 왕복(outbound+inbound)을 하나의 체인으로
// 수집하면 start ≈ end가 되고, 종착역에서 U턴이 생긴다.
// 실제 순환 노선(2호선·6호선)은 제외하고 선형 노선만 절반으로 자른다.
// ─────────────────────────────────────────────────────────────────────────────
// 실제 순환 노선 이름 목록 (start ≈ end가 정상인 노선)
const CIRCULAR_LINES = new Set(['2호선', '6호선']);

function deduplicateLoop(chain, lineName) {
  if (CIRCULAR_LINES.has(lineName)) return chain; // 순환선은 건드리지 않음
  if (chain.length < 10) return chain;

  const [s0, s1] = chain[0];
  const [e0, e1] = chain[chain.length - 1];
  const startEndDist = distM([s0, s1], [e0, e1]);

  // start-end 거리가 500m 이상이면 루프가 아닌 선형 노선으로 간주
  if (startEndDist > 500) return chain;

  // 루프 확인됨 — 출발점에서 가장 먼 인덱스(종착역)를 찾아 절반으로 자름
  let maxD = 0, turnIdx = 0;
  for (let i = 1; i < chain.length; i++) {
    const d = distM(chain[0], chain[i]);
    if (d > maxD) { maxD = d; turnIdx = i; }
  }

  // turnIdx 기준 두 절반: 첫 절반이 더 긴 경우(~50%) 첫 절반, 아니면 둘 다 검토
  // 비율이 40~60%이면 대칭 루프 → 첫 절반 사용
  // 그 외(경춘선처럼 25% 등)는 더 긴 절반이 실제 운행 구간
  const firstHalf  = chain.slice(0, turnIdx + 1);
  const secondHalf = chain.slice(turnIdx);
  const ratio = turnIdx / chain.length;
  const chosen = (ratio >= 0.4 && ratio <= 0.6) ? firstHalf
               : (firstHalf.length >= secondHalf.length ? firstHalf : secondHalf);
  process.stdout.write(
    `     ↳ 루프 감지(${(startEndDist/1000).toFixed(1)}km) → ${chain.length}pt → ${chosen.length}pt 절반 유지\n`
  );
  return chosen;
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

  // Group ALL relations by canonical line name first
  const lineRelations = new Map(); // lineName → [relation, ...]

  let matched = 0, unmatched = 0;
  for (const rel of osmRelations) {
    const lineName = osmNameToLine(rel.tags ?? {});
    if (!lineName) { unmatched++; continue; }
    matched++;
    if (!lineRelations.has(lineName)) lineRelations.set(lineName, []);
    lineRelations.get(lineName).push(rel);
  }

  console.log(`\n매칭: ${matched}개 / 미매칭: ${unmatched}개`);

  // Build final output: { lineName: [[lng, lat], ...] }
  const output = {};
  for (const lineName of LINE_NAMES) {
    const rels = lineRelations.get(lineName);
    if (!rels || rels.length === 0) {
      console.log(`  ⚠️  ${lineName}: OSM 데이터 없음`);
      continue;
    }

    // Build chain for every relation, then deduplicate:
    //   - Remove same-route duplicates (same physical route, different direction or service variant)
    //   - Remove chains spatially subsumed by a longer chain
    // This prevents 96 1호선 relations from creating a 48,000-point mess of
    // overlapping forward/reverse parallel tracks.
    const allChains = rels
      .map(r => buildChain(r.members ?? []))
      .filter(Boolean);

    if (allChains.length === 0) {
      console.log(`  ⚠️  ${lineName}: 유효한 체인 없음`);
      continue;
    }

    const chains = selectRepresentativeChains(allChains);

    // MultiLineString: 각 대표 체인을 독립 세그먼트로 출력.
    // out-and-back(왕복) 방식의 attachBranches 제거 → 지선이 별도 폴리라인으로 렌더됨.
    // 이로써 2호선 신정지선 직선+곡선 겹침, 1호선 구로역 중복선 문제 근본 해결.
    const segments = chains
      .map(c => deduplicateLoop(c, lineName))
      .map(c => simplify(c, 15))
      .filter(c => c.length >= 2)
      .map(c => c.map(([lat, lon]) => [lon, lat]));

    if (segments.length === 0) { console.log(`  ⚠️  ${lineName}: 유효한 세그먼트 없음`); continue; }

    output[lineName] = segments;
    const totalPts = segments.reduce((s, seg) => s + seg.length, 0);
    console.log(`  ✅ ${lineName.padEnd(8)}: ${rels.length}개 relation → ${chains.length}개 세그먼트 → 총 ${totalPts}pts`);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(output));
  console.log(`\n💾 저장 완료: subway-track-geometry.json (${Object.keys(output).length}개 노선)`);
}

main().catch(err => { console.error('💥 오류:', err); process.exit(1); });
