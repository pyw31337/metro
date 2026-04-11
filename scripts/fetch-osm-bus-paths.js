/**
 * fetch-osm-bus-paths.js
 *
 * Seoul bus route path collector via OpenStreetMap Overpass API.
 * Downloads all Seoul bus route relations in a SINGLE bulk request,
 * then matches them to master-bus-routes.json and encodes as polyline
 * into the existing bus-paths-11.json shard.
 *
 * Targets:
 *   1. Missing routes (no shard data at all)
 *   2. Jumpy routes  (shard exists but has coordinate teleports >0.05°)
 *
 * Usage:  node scripts/fetch-osm-bus-paths.js
 *         node scripts/fetch-osm-bus-paths.js --dry-run   (report only)
 *         node scripts/fetch-osm-bus-paths.js --force     (overwrite clean routes too)
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────
const DATA_DIR   = path.resolve(__dirname, '..', 'public', 'data');
const SHARD_FILE = path.join(DATA_DIR, 'paths', 'bus-paths-11.json');
const ROUTES_FILE= path.join(DATA_DIR, 'master-bus-routes.json');
const CACHE_FILE = path.join(DATA_DIR, '_osm-seoul-bus-cache.json'); // temp download cache

// ─────────────────────────────────────────────────────────────────────────────
// Polyline encode / decode
// ─────────────────────────────────────────────────────────────────────────────
function encodePolyline(points) {
    if (!points || points.length < 2) return '';
    let lastLat = 0, lastLng = 0, out = '';
    function enc(v) {
        v = v < 0 ? ~(v << 1) : (v << 1);
        while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
        out += String.fromCharCode(v + 63);
    }
    for (const [la, ln] of points) {
        const la5 = Math.round(la * 1e5), ln5 = Math.round(ln * 1e5);
        enc(la5 - lastLat); enc(ln5 - lastLng);
        lastLat = la5; lastLng = ln5;
    }
    return out;
}

function decodePolyline(encoded) {
    const pts = []; let i = 0, len = encoded.length, lat = 0, lng = 0;
    while (i < len) {
        let b, shift = 0, r = 0;
        do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (r & 1) ? ~(r >> 1) : (r >> 1);
        shift = 0; r = 0;
        do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (r & 1) ? ~(r >> 1) : (r >> 1);
        pts.push([lat / 1e5, lng / 1e5]);
    }
    return pts;
}

function hasJump(polylineStr, maxDeg = 0.05) {
    if (!polylineStr || polylineStr.length < 5) return false;
    const pts = decodePolyline(polylineStr);
    for (let i = 1; i < pts.length; i++) {
        if (Math.abs(pts[i][0] - pts[i-1][0]) > maxDeg ||
            Math.abs(pts[i][1] - pts[i-1][1]) > maxDeg) return true;
    }
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// OSM geometry — stitch ordered way members into a single coordinate chain
// ─────────────────────────────────────────────────────────────────────────────
const EPS = 0.0002; // ~20m — tolerance for "same point"

function samePoint(a, b) {
    return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

function buildChain(wayMembers) {
    // Filter to ways that actually have geometry
    const ways = wayMembers.filter(m =>
        m.type === 'way' &&
        !['stop','stop_entry_only','stop_exit_only','platform','platform_entry_only','platform_exit_only'].includes(m.role) &&
        m.geometry && m.geometry.length >= 2
    );
    if (ways.length === 0) return null;

    const chain = []; // [[lat, lng], ...]

    for (const way of ways) {
        const pts = way.geometry.map(p => [p.lat, p.lon]);

        if (chain.length === 0) {
            chain.push(...pts);
            continue;
        }

        const last = chain[chain.length - 1];
        const fwd0 = pts[0];
        const rev0 = pts[pts.length - 1];
        const dFwd = Math.abs(last[0]-fwd0[0]) + Math.abs(last[1]-fwd0[1]);
        const dRev = Math.abs(last[0]-rev0[0]) + Math.abs(last[1]-rev0[1]);

        const chosen = (dFwd <= dRev) ? pts : [...pts].reverse();
        // Skip first point if it's the same as `last` to avoid duplicates
        const start = samePoint(last, chosen[0]) ? 1 : 0;
        chain.push(...chosen.slice(start));
    }

    return chain.length >= 2 ? chain : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route-number normalisation for matching
// ─────────────────────────────────────────────────────────────────────────────
function normNo(s) {
    return String(s || '').replace(/^0+/, '').toUpperCase();
}

function routeMatches(ourNo, osmRef) {
    const a = normNo(ourNo), b = normNo(osmRef);
    if (!a || !b) return false;
    return a === b || ourNo === osmRef;
}

// ─────────────────────────────────────────────────────────────────────────────
// OSM Overpass bulk fetch (Seoul bbox)
// ─────────────────────────────────────────────────────────────────────────────
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const SEOUL_BBOX   = '[bbox:37.3,126.6,37.82,127.32]';

async function fetchOSMRelations() {
    // Re-use cached download if it's fresh (< 7 days)
    if (fs.existsSync(CACHE_FILE)) {
        const age = Date.now() - fs.statSync(CACHE_FILE).mtimeMs;
        if (age < 7 * 24 * 3600 * 1000) {
            process.stdout.write('📦 캐시된 OSM 데이터 사용 중...\n');
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        }
    }

    process.stdout.write('🌐 OSM Overpass에서 서울 버스 노선 전체 다운로드 중 (약 40MB)...\n');
    const query = `[out:json][timeout:180]${SEOUL_BBOX};
relation["type"="route"]["route"="bus"];
out geom;`;

    const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(190_000),
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

    const json = await res.json();
    const relations = (json.elements || []).filter(e => e.type === 'relation');
    process.stdout.write(`   ✅ ${relations.length}개 relation 수신\n`);

    fs.writeFileSync(CACHE_FILE, JSON.stringify(relations));
    return relations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    const isDryRun = process.argv.includes('--dry-run');
    const isForce  = process.argv.includes('--force');

    console.log('🚌 OSM 서울 버스 경로 수집기');
    console.log('─────────────────────────────────────────');
    if (isDryRun) console.log('ℹ️  DRY-RUN 모드 — 파일 수정 없음');

    // 1. Load master routes & existing shard
    const allRoutes  = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    const seoulRoutes= allRoutes.filter(r => r.cityCode === '11');
    const shardData  = fs.existsSync(SHARD_FILE)
        ? JSON.parse(fs.readFileSync(SHARD_FILE, 'utf8'))
        : {};

    // Categorise Seoul routes
    const missing = seoulRoutes.filter(r => !shardData[r.id] || shardData[r.id].length < 5);
    const jumpy   = seoulRoutes.filter(r => shardData[r.id] && shardData[r.id].length >= 5 && hasJump(shardData[r.id]));
    const targets = isForce ? seoulRoutes : [...missing, ...jumpy];

    console.log(`서울 전체 노선: ${seoulRoutes.length}개`);
    console.log(`수집 대상: 누락 ${missing.length}개 + 왜곡 ${jumpy.length}개 = ${targets.length}개`);
    if (isForce) console.log('  (--force: 전체 재수집)');
    console.log();

    // 2. Bulk download OSM data
    const osmRelations = await fetchOSMRelations();

    // 3. Build OSM index: ref → [relations]  (one ref may have multiple directions/variants)
    const osmIndex = new Map(); // normRef → relation[]
    for (const rel of osmRelations) {
        const ref = rel.tags?.ref;
        if (!ref) continue;
        const key = normNo(ref);
        if (!osmIndex.has(key)) osmIndex.set(key, []);
        osmIndex.get(key).push(rel);
    }
    console.log(`OSM 인덱스: ${osmIndex.size}개 고유 노선번호\n`);

    // 4. Process each target route
    let updated = 0, notFound = 0, failed = 0;
    const notFoundList = [];

    for (const route of targets) {
        const key = normNo(route.no);
        const candidates = osmIndex.get(key) || [];

        if (candidates.length === 0) {
            notFound++;
            notFoundList.push(route.no);
            continue;
        }

        // Pick the relation with the most way geometry (most complete)
        let bestChain = null;
        for (const rel of candidates) {
            const chain = buildChain(rel.members || []);
            if (chain && (!bestChain || chain.length > bestChain.length)) {
                bestChain = chain;
            }
        }

        if (!bestChain) {
            failed++;
            process.stdout.write(`  ⚠️  ${route.no} (${route.id}): geometry 조합 실패\n`);
            continue;
        }

        const poly = encodePolyline(bestChain);
        if (!poly || poly.length < 5) { failed++; continue; }

        if (!isDryRun) shardData[route.id] = poly;

        const wasJumpy = jumpy.includes(route);
        process.stdout.write(
            `  ✅ ${route.no.padEnd(12)} (${route.id}) → ${bestChain.length}pts` +
            (wasJumpy ? ' [왜곡→수정]' : '') + '\n'
        );
        updated++;
    }

    // 5. Save
    if (!isDryRun && updated > 0) {
        fs.writeFileSync(SHARD_FILE, JSON.stringify(shardData));
        console.log(`\n💾 저장 완료: bus-paths-11.json (${Object.keys(shardData).length}개 노선)`);
    }

    // 6. Summary
    console.log('\n─────────────────────────────────────────');
    console.log(`✅ 성공:   ${updated}개`);
    console.log(`❌ OSM 없음: ${notFound}개`);
    console.log(`⚠️  조합 실패: ${failed}개`);
    if (notFoundList.length > 0) {
        console.log(`\nOSM에 없는 노선 (${notFoundList.length}개):`);
        // Group into lines of 10
        for (let i = 0; i < notFoundList.length; i += 10) {
            console.log('  ' + notFoundList.slice(i, i+10).join(', '));
        }
    }

    // Validate final state
    if (!isDryRun) {
        const finalShard = JSON.parse(fs.readFileSync(SHARD_FILE, 'utf8'));
        const covered  = seoulRoutes.filter(r => finalShard[r.id] && finalShard[r.id].length >= 5);
        const stillJumpy = covered.filter(r => hasJump(finalShard[r.id]));
        console.log('\n─────────────────────────────────────────');
        console.log('📊 최종 현황:');
        console.log(`  경로 있음: ${covered.length}/${seoulRoutes.length}개 (${Math.round(covered.length/seoulRoutes.length*100)}%)`);
        console.log(`  여전히 왜곡: ${stillJumpy.length}개`);
        console.log(`  누락: ${seoulRoutes.length - covered.length}개`);
    }
}

main().catch(err => { console.error('💥 오류:', err); process.exit(1); });
