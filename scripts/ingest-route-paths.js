const fs = require('fs');
const path = require('path');

// Load .env.local for development keys
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    env.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && (value || value === "")) process.env[key.trim()] = (value || "").trim();
    });
}

// Configuration
const DATA_GO_KR_KEY_DECODED = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";
const SEOUL_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const ROUTES_FILE = path.join(DATA_DIR, 'master-bus-routes.json');
const STATIONS_FILE = path.join(DATA_DIR, 'master-route-stations.json');
const STOPS_FILE = path.join(DATA_DIR, 'master-bus-stops.json');
const SHARDS_DIR = path.join(DATA_DIR, 'paths');

if (!fs.existsSync(SHARDS_DIR)) fs.mkdirSync(SHARDS_DIR, { recursive: true });

// Global caches to prevent redundant loading
let stationMap = null; // routeId -> [nodeId, nodeId, ...]
let stopCoords = null; // nodeId -> [lat, lng]

function loadLocalData() {
    if (!stationMap && fs.existsSync(STATIONS_FILE)) {
        try { stationMap = JSON.parse(fs.readFileSync(STATIONS_FILE, 'utf8')); } catch (e) { stationMap = {}; }
    }
    if (!stopCoords && fs.existsSync(STOPS_FILE)) {
        try {
            const stopsArr = JSON.parse(fs.readFileSync(STOPS_FILE, 'utf8'));
            stopCoords = {};
            stopsArr.forEach(s => { stopCoords[s.id] = [parseFloat(s.lat), parseFloat(s.lng)]; });
        } catch (e) { stopCoords = {}; }
    }
}

/**
 * Google Polyline Encoding Algorithm
 */
function encodePolyline(points) {
    let lastLat = 0, lastLng = 0, result = "";
    function encodeValue(value) {
        value = value < 0 ? ~(value << 1) : (value << 1);
        while (value >= 0x20) {
            result += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
            value >>= 5;
        }
        result += String.fromCharCode(value + 63);
    }
    for (const point of points) {
        const lat = Math.round(point[0] * 1e5), lng = Math.round(point[1] * 1e5);
        encodeValue(lat - lastLat); encodeValue(lng - lastLng);
        lastLat = lat; lastLng = lng;
    }
    return result;
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, { 
                signal: AbortSignal.timeout(15000), 
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                } 
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            try { return JSON.parse(text); } catch (e) {
                if (text.includes('<resultCode>00</resultCode>')) return { _xml: true, _raw: text };
                throw e;
            }
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

/**
 * OSRM Road-Following Routing API
 * Fetches actual road path between coordinates.
 */
async function fetchOSRMRoute(coordinates) {
    if (coordinates.length < 2) return coordinates;
    
    // Chunk coordinates since OSRM has URL length limits (approx 50-100 points per chunk)
    const MAX_POINTS = 50;
    const allPathPoints = [];

    for (let i = 0; i < coordinates.length - 1; i += (MAX_POINTS - 1)) {
        const chunk = coordinates.slice(i, i + MAX_POINTS);
        if (chunk.length < 2) break;

        const coordsStr = chunk.map(c => `${c[1]},${c[0]}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

        try {
            const data = await fetchWithRetry(url);
            if (data?.routes?.[0]?.geometry?.coordinates) {
                const points = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                // Avoid duplicating junction points
                if (allPathPoints.length > 0) allPathPoints.pop();
                allPathPoints.push(...points);
            } else {
                // Fallback to straight lines for this chunk if routing fails
                allPathPoints.push(...chunk);
            }
        } catch (e) {
            allPathPoints.push(...chunk);
        }
        await new Promise(r => setTimeout(r, 200)); // Be nice to OSRM public API
    }
    
    return allPathPoints;
}

async function getPathFromLocalStations(routeId) {
    loadLocalData();
    const stations = stationMap[routeId] || [];
    if (stations.length < 2) return null;

    const coords = stations
        .map(s => stopCoords[s.id || s])
        .filter(c => c && c[0] > 0);

    if (coords.length < 2) return null;

    // We have coordinates! Now let's use OSRM to find the REAL road path between them.
    console.log(`\n   🛠️  [Fallback] Routing ${coords.length} stations for ${routeId}...`);
    return await fetchOSRMRoute(coords);
}

async function getPathForRoute(route) {
    const { id, cityCode, region } = route;

    try {
        // 1. Try Official Geometry APIs first
        if (region === '서울' || cityCode === '11') {
            const url = `http://ws.bus.go.kr/api/rest/busRouteInfo/getRoutePath?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&busRouteId=${id}&resultType=json`;
            const json = await fetchWithRetry(url);
            const items = json?.msgBody?.itemList || [];
            if (items.length > 0) return items.map(it => [parseFloat(it.gpsY), parseFloat(it.gpsX)]);
        } else if (region === '경기' || cityCode === '41' || String(cityCode).startsWith('31')) {
            const url = `https://apis.data.go.kr/6410000/busrouteservice/getBusRouteLineInqire?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&_type=json&routeId=${id}`;
            const json = await fetchWithRetry(url);
            const items = json?.response?.body?.items?.item || [];
            const rows = Array.isArray(items) ? items : [items];
            if (rows.length > 0 && rows[0].x) return rows.map(it => [parseFloat(it.y), parseFloat(it.x)]);
        } else if (cityCode) {
            const url = `https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRoutePathList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&_type=json&cityCode=${cityCode}&routeId=${id}`;
            const json = await fetchWithRetry(url);
            const items = json?.response?.body?.items?.item || [];
            const rows = Array.isArray(items) ? items : [items];
            if (rows.length > 0 && rows[0].gpslati) return rows.map(it => [parseFloat(it.gpslati), parseFloat(it.gpslong)]);
        }
    } catch (e) {
        // If API fails, we continue to OSRM Fallback
    }

    // 2. Ultimate "Perfect" Fallback: OSRM Routing between known stations
    return await getPathFromLocalStations(id);
}

async function main() {
    process.stdout.write('\x1Bc'); // Clear screen
    console.log('💎 Starting High-Precision Bus Route Ingestion (OSRM Powered)');
    console.log('------------------------------------------------------------');
    
    if (!fs.existsSync(ROUTES_FILE)) return console.error('❌ master-bus-routes.json not found!');
    const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    
    const shards = {};
    for (const r of routes) {
        const key = r.cityCode || 'unknown';
        if (!shards[key]) shards[key] = [];
        shards[key].push(r);
    }

    const cityKeys = Object.keys(shards).sort();
    const startTime = Date.now();
    let totalProcessed = 0;

    for (const code of cityKeys) {
        const group = shards[code];
        const shardFile = path.join(SHARDS_DIR, `bus-paths-${code}.json`);
        let pathData = {};

        if (fs.existsSync(shardFile)) {
            try { pathData = JSON.parse(fs.readFileSync(shardFile, 'utf8')); } catch (e) {}
        }

        const remaining = group.filter(r => !pathData[r.id]);
        if (remaining.length === 0) {
            totalProcessed += group.length;
            continue;
        }

        console.log(`🚀 [${code}] Processing ${remaining.length} routes...`);
        
        // Split processing: Try Official API for all, then OSRM for failures
        const BATCH_SIZE = 10; 
        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
            const batch = remaining.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(async (route) => {
                try {
                    // Try Official API first (Higher weight, faster)
                    const points = await getPathForRoute(route);
                    if (points && points.length > 1) {
                        return { id: route.id, polyline: encodePolyline(points) };
                    }
                } catch (e) {}
                return null;
            }));

            for (const res of results) if (res) pathData[res.id] = res.polyline;

            const progressRatio = (totalProcessed + i + batch.length) / routes.length;
            process.stdout.write(`\r   📊 Total: ${Math.round(progressRatio * 100)}% | [${code}] ${i + batch.length}/${remaining.length} `);

            if (i % 20 === 0) fs.writeFileSync(shardFile, JSON.stringify(pathData));
            await new Promise(r => setTimeout(r, 200));
        }

        totalProcessed += group.length;
        fs.writeFileSync(shardFile, JSON.stringify(pathData));
        console.log(`\n💾 [${code}] Shard updated.`);
        pathData = null;
    }

    console.log(`\n🎉 ALL SHARDS COMPLETE! Total Time: ${Math.round((Date.now() - startTime)/1000/60)}m`);
}

main().catch(console.error);
