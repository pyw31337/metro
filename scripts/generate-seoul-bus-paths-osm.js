#!/usr/bin/env node
// OSM Overpass API로 서울 버스 노선 경로 생성
// bus-paths-11.json (서울, cityCode=11)을 채움
// 노선 relation의 way geometry → encoded polyline

const fs = require('fs');
const path = require('path');

const OUT_FILE = path.resolve(__dirname, '../public/data/paths/bus-paths-11.json');
const ROUTES_FILE = path.resolve(__dirname, '../public/data/master-bus-routes.json');

// Google Polyline Encoding
function encodePolyline(coords) {
  // coords: [{lat, lng}]
  let output = '';
  let prevLat = 0, prevLng = 0;
  for (const { lat, lng } of coords) {
    const dlat = Math.round((lat - prevLat) * 1e5);
    const dlng = Math.round((lng - prevLng) * 1e5);
    prevLat = lat; prevLng = lng;
    output += encodeValue(dlat) + encodeValue(dlng);
  }
  return output;
}
function encodeValue(v) {
  let n = v < 0 ? ~(v << 1) : (v << 1);
  let s = '';
  while (n >= 0x20) {
    s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return s + String.fromCharCode(n + 63);
}

// Overpass 요청 (재시도 포함)
async function overpassQuery(query, retries = 3) {
  const url = 'https://overpass-api.de/api/interpreter';
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(180_000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.startsWith('{')) throw new Error('non-JSON response: ' + text.substring(0, 100));
      return JSON.parse(text);
    } catch (e) {
      console.warn(`  Overpass attempt ${i+1} failed: ${e.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw new Error('All overpass attempts failed');
}

// way geometry → 정렬된 좌표 배열
// OSM relation members의 ways를 연결순으로 정렬
function buildOrderedCoords(ways) {
  if (!ways.length) return [];

  // way geometry [{lat, lon}] → 앞/뒤 끝점 기준으로 체인 연결
  const segments = ways.map(w => ({
    coords: (w.geometry || []).map(p => ({ lat: p.lat, lng: p.lon })),
    used: false
  }));

  // 첫 segment를 기준으로 greedy 연결
  const result = [...segments[0].coords];
  segments[0].used = true;

  for (let iter = 0; iter < segments.length; iter++) {
    const tail = result[result.length - 1];
    let bestIdx = -1, bestReverse = false, bestDist = 5; // 5° 이내

    for (let j = 0; j < segments.length; j++) {
      if (segments[j].used) continue;
      const sc = segments[j].coords;
      if (!sc.length) continue;
      const head = sc[0], headR = sc[sc.length - 1];
      const dHead = Math.abs(tail.lat - head.lat) + Math.abs(tail.lng - head.lng);
      const dTail = Math.abs(tail.lat - headR.lat) + Math.abs(tail.lng - headR.lng);
      if (dHead < bestDist) { bestDist = dHead; bestIdx = j; bestReverse = false; }
      if (dTail < bestDist) { bestDist = dTail; bestIdx = j; bestReverse = true; }
    }

    if (bestIdx === -1) break; // 연결할 segment 없으면 중단
    const seg = segments[bestIdx];
    seg.used = true;
    const coords = bestReverse ? [...seg.coords].reverse() : seg.coords;
    // 앞 점 중복 방지
    result.push(...coords.slice(1));
  }

  return result;
}

async function main() {
  // 기존 데이터 로드 (있으면 merge)
  const existing = fs.existsSync(OUT_FILE)
    ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'))
    : {};

  // Seoul route: no → id 매핑
  const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
  const seoulRoutes = routes.filter(r => String(r.cityCode) === '11');
  const noToIds = {};
  for (const r of seoulRoutes) {
    if (!noToIds[r.no]) noToIds[r.no] = [];
    noToIds[r.no].push(r.id);
  }
  console.log(`서울 노선 수: ${seoulRoutes.length}, 고유 노선번호: ${Object.keys(noToIds).length}`);

  // OSM에서 서울 bbox 내 모든 버스 route relation + geometry 조회
  console.log('\nOverpass API 조회 중... (서울 전체, 시간 소요됨)');
  const query = `[out:json][timeout:300];
relation["type"="route"]["route"="bus"](37.4,126.7,37.7,127.2);
out geom;`;

  const data = await overpassQuery(query);
  console.log(`OSM relations 수: ${data.elements?.length}`);

  const result = { ...existing };
  let matched = 0, notMatched = 0, multiDir = 0;

  // 한국어 문자 제거한 정규화 함수 (110B국민대 → 110B)
  function normalize(s) {
    return s.replace(/[가-힣]+/g, '').trim();
  }

  // 정규화된 매핑 테이블 추가 구성
  const noToIdsNorm = {};
  for (const [no, ids] of Object.entries(noToIds)) {
    const nno = normalize(no);
    if (nno && nno !== no) {
      if (!noToIdsNorm[nno]) noToIdsNorm[nno] = [];
      noToIdsNorm[nno].push(...ids);
    }
  }

  function lookupIds(ref) {
    return noToIds[ref] || noToIdsNorm[normalize(ref)] || null;
  }

  // relation → routeId 매핑
  const relationsByRef = {};
  for (const el of (data.elements || [])) {
    const ref = el.tags?.ref;
    if (!ref) continue;
    if (!relationsByRef[ref]) relationsByRef[ref] = [];
    relationsByRef[ref].push(el);
  }

  for (const [ref, rels] of Object.entries(relationsByRef)) {
    const ids = lookupIds(ref);
    if (!ids) { notMatched++; continue; }

    // 방향이 여러 개인 경우 → 각각 다른 routeId에 매핑하거나 첫 번째만 사용
    // rels[0] = 첫 번째 방향 (보통 정방향)
    if (rels.length > 1) multiDir++;

    // 각 relation 처리
    for (let ri = 0; ri < Math.min(rels.length, ids.length); ri++) {
      const rel = rels[ri];
      const routeId = ids[Math.min(ri, ids.length - 1)];

      const ways = rel.members?.filter(m => m.type === 'way' && m.geometry?.length > 0) || [];
      if (!ways.length) continue;

      const coords = buildOrderedCoords(ways);
      if (coords.length < 2) continue;

      // 중복 좌표 제거 (연속 동일 포인트)
      const deduped = coords.filter((c, i) => {
        if (i === 0) return true;
        return Math.abs(c.lat - coords[i-1].lat) > 1e-6 || Math.abs(c.lng - coords[i-1].lng) > 1e-6;
      });

      result[routeId] = encodePolyline(deduped);
      matched++;
    }
  }

  console.log(`\n매핑 완료: ${matched}개 노선, 미매핑: ${notMatched}개, 양방향: ${multiDir}개`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(result));
  console.log(`✅ ${OUT_FILE} 저장 완료 (${Object.keys(result).length}개 노선)`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
