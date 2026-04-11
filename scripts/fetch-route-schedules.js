#!/usr/bin/env node
/**
 * Pre-collect route schedules (firstBus/lastBus/headway/startName/endName) for all non-Seoul routes
 * via TAGO API (getRouteInfoIem) and GBIS API (getBusRouteInfoItem).
 *
 * Output: public/data/route-schedules.json
 *   { routeId: { startName, endName, firstBus, lastBus, headwayPeak } }
 *
 * Run: node scripts/fetch-route-schedules.js
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.NEXT_PUBLIC_BUS_API_KEY
  || require('fs').readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8')
     .split('\n').find(l => l.startsWith('NEXT_PUBLIC_BUS_API_KEY='))
     ?.split('=').slice(1).join('=').trim()
  || '';

if (!API_KEY) { console.error('API key not found'); process.exit(1); }

const ROUTES_FILE   = path.resolve(__dirname, '../public/data/master-bus-routes.json');
const OUT_FILE      = path.resolve(__dirname, '../public/data/route-schedules.json');
const TAGO_URL      = 'https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteInfoIem';
const GBIS_URL      = 'https://apis.data.go.kr/6410000/busrouteservice/getBusRouteInfoItem';
const CONCURRENCY   = 5;
const SAVE_INTERVAL = 500; // save checkpoint every N routes

// ── 도시코드 → provider ───────────────────────────────────────────
function getProvider(cityCode) {
  const c = String(cityCode);
  if (c === '11') return 'SKIP';   // Seoul: ws.bus.go.kr blocked from Node.js
  if (c === '41') return 'GBIS';
  return 'TAGO';
}

// ── 시간 포맷: "0640" → "06:40" ──────────────────────────────────
function fmt(s) {
  if (!s || s.length < 4) return '';
  return `${String(s).slice(0, 2)}:${String(s).slice(2, 4)}`;
}

// ── TAGO fetch ────────────────────────────────────────────────────
async function fetchTago(cityCode, routeId) {
  const url = `${TAGO_URL}?serviceKey=${encodeURIComponent(API_KEY)}&_type=json&cityCode=${cityCode}&routeId=${routeId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const json = await res.json();
  const item = json?.response?.body?.items?.item;
  if (!item) return null;
  return {
    startName: String(item.startnodenm || item.startVehicleNodeName || ''),
    endName:   String(item.endnodenm   || item.endVehicleNodeName   || ''),
    firstBus:  fmt(item.startvehicletime || item.firstBusTm || ''),
    lastBus:   fmt(item.endvehicletime   || item.lastBusTm  || ''),
    headwayPeak: parseInt(item.intervaltime || item.peekAlloc || '0') || 0,
  };
}

// ── GBIS fetch ────────────────────────────────────────────────────
async function fetchGBIS(routeId) {
  const url = `${GBIS_URL}?serviceKey=${encodeURIComponent(API_KEY)}&_type=json&routeId=${routeId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const json = await res.json();
  const item = json?.response?.body?.busRouteInfoItem;
  if (!item) return null;
  return {
    startName: String(item.startNodeNm || ''),
    endName:   String(item.endNodeNm   || ''),
    firstBus:  fmt(item.firstBusTm || ''),
    lastBus:   fmt(item.lastBusTm  || ''),
    headwayPeak: parseInt(item.peekAlloc || '0') || 0,
  };
}

// ── Concurrency pool ──────────────────────────────────────────────
async function runWithConcurrency(tasks, concurrency, onProgress) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = await tasks[i]();
      } catch {
        results[i] = null;
      }
      onProgress(idx, tasks.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── main ──────────────────────────────────────────────────────────
async function main() {
  const allRoutes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
  const targets = allRoutes.filter(r => getProvider(r.cityCode) !== 'SKIP');
  console.log(`Collecting schedules for ${targets.length} routes (${CONCURRENCY} concurrent)...`);

  // Load existing output (for resume support)
  const existing = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : {};
  const result = { ...existing };

  // Skip already collected
  const todo = targets.filter(r => !result[r.id]);
  console.log(`Already collected: ${targets.length - todo.length}, remaining: ${todo.length}`);
  if (!todo.length) { console.log('Nothing to do.'); return; }

  let done = 0, errors = 0, lastSave = 0;
  const startTime = Date.now();

  const tasks = todo.map(route => async () => {
    const provider = getProvider(route.cityCode);
    try {
      const info = provider === 'GBIS'
        ? await fetchGBIS(route.id)
        : await fetchTago(route.cityCode, route.id);
      if (info) result[route.id] = info;
      else errors++;
    } catch {
      errors++;
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY, (completed, total) => {
    done = completed;
    // Save checkpoint every SAVE_INTERVAL routes
    if (done - lastSave >= SAVE_INTERVAL || done === total) {
      fs.writeFileSync(OUT_FILE, JSON.stringify(result));
      lastSave = done;
    }
    // Progress log every 500
    if (done % 500 === 0 || done === total) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const eta = done > 0 ? ((total - done) * (Date.now() - startTime) / done / 1000).toFixed(0) : '?';
      process.stdout.write(`\r${done}/${total} (${errors} errors) — ${elapsed}s elapsed, ~${eta}s remaining`);
    }
  });

  console.log(`\n✅ Done: ${Object.keys(result).length} routes in route-schedules.json`);
}

main().catch(e => { console.error('\nFatal:', e); process.exit(1); });
