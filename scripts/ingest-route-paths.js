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
    if (stationMap && stopCoords) return; // Already loaded
    
    console.log('📦 Pre-loading massive datasets into memory...');
    if (fs.existsSync(STATIONS_FILE)) {
        try { 
            stationMap = JSON.parse(fs.readFileSync(STATIONS_FILE, 'utf8')); 
            console.log(`   ✅ Loaded ${Object.keys(stationMap).length} station mappings.`);
        } catch (e) { stationMap = {}; }
    }
    if (fs.existsSync(STOPS_FILE)) {
        try {
            const stopsArr = JSON.parse(fs.readFileSync(STOPS_FILE, 'utf8'));
            stopCoords = {};
            stopsArr.forEach(s => { stopCoords[s.id] = [parseFloat(s.lat), parseFloat(s.lng)]; });
            console.log(`   ✅ Loaded ${stopsArr.length} bus stop coordinates.`);
        } catch (e) { stopCoords = {}; }
    }
}

/**
 * Google Polyline Encoding Algorithm
 */
function encodePolyline(points) {
    if (!points || points.length < 2) return "";
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
    const keys = [process.env.NEXT_PUBLIC_DATA_GO_KR_KEY, DATA_GO_KR_KEY_DECODED].filter(Boolean);
    
    for (const key of keys) {
        const keyVersions = [
            key.startsWith('%') ? key : encodeURIComponent(key), 
            key 
        ];

        for (const targetKey of Array.from(new Set(keyVersions))) {
            const targetUrl = url.replace(/serviceKey=[^&]+/, `serviceKey=${targetKey}`);
            
            for (let i = 0; i < retries; i++) {
                try {
                    const res = await fetch(targetUrl, { 
                        signal: AbortSignal.timeout(20000), 
                        headers: { 
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        } 
                    });
                    
                    if (res.status === 401 || res.status === 403) break; 
                    if (!res.ok) {
                        if (res.status === 429) throw new Error('QUOTA_EXCEEDED');
                        throw new Error(`HTTP ${res.status}`);
                    }
                    const text = await res.text();
                    
                    if (text.includes('Key인증실패') || text.includes('SERVICE ACCESS DENIED') || text.includes('LIMITED_NUMBER_OF_SERVICE') || text.includes('인증실패')) {
                        break; // Try next key
                    }

                    try { 
                        const parsed = JSON.parse(text);
                        const resCode = parsed?.response?.header?.resultCode || parsed?.header?.resultCode || parsed?.comMsgHeader?.returnCode;
                        if (resCode && resCode !== '00' && resCode !== '0') {
                            if (resCode === '30' || resCode === '01') break; // Try next key
                            throw new Error(`API_${resCode}`);
                        }
                        return parsed; 
                    } catch (e) {
                        if (text.includes('<resultCode>00</resultCode>')) return { _xml: true, _raw: text };
                        if (text.includes('<resultCode>')) throw new Error('XML_ERROR_CODE');
                        throw e;
                    }
                } catch (e) {
                    if (e.message === 'QUOTA_EXCEEDED') throw e; 
                    if (i === retries - 1 && targetKey === keyVersions[keyVersions.length-1] && key === keys[keys.length-1]) throw e;
                    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                }
            }
        }
    }
    throw new Error('All authentication attempts failed');
}

/**
 * OSRM Road-Following Routing API
 * Fetches actual road path between coordinates.
 */
async function fetchOSRMRoute(coordinates) {
    if (coordinates.length < 2) return coordinates;
    
    // Chunk coordinates since OSRM has URL length limits (approx 50-100 points per chunk)
    const MAX_POINTS = 40; // Safer chunk size
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
                allPathPoints.push(...chunk);
            }
        } catch (e) {
            allPathPoints.push(...chunk);
            await new Promise(r => setTimeout(r, 1000)); // Cool down
        }
        await new Promise(r => setTimeout(r, 400)); // Be nice to OSRM public API
    }
    
    return allPathPoints;
}

async function getPathFromLocalStations(routeId) {
    loadLocalData();
    const stations = stationMap?.[routeId] || [];
    if (stations.length < 2) return null;

    const coords = stations
        .map(s => stopCoords?.[s.id || s])
        .filter(c => c && c[0] > 0);

    if (coords.length < 2) return null;

    // We have coordinates! Now let's use OSRM to find the REAL road path between them.
    // console.log(`   🛠️  [Fallback] Routing ${coords.length} stations for ${routeId}...`);
    return await fetchOSRMRoute(coords);
}

async function getPathForRoute(route) {
    const { id, cityCode, region } = route;

    try {
        // 1. Try Official Geometry APIs first
        if (region === '서울' || cityCode === '11') {
            const url = `http://ws.bus.go.kr/api/rest/busRouteInfo/getRoutePath?serviceKey=placeholder&busRouteId=${id}&resultType=json`;
            const json = await fetchWithRetry(url);
            const items = json?.msgBody?.itemList || [];
            if (items.length > 0) return items.map(it => [parseFloat(it.gpsY), parseFloat(it.gpsX)]);
        } else if (region === '경기' || cityCode === '41' || String(cityCode).startsWith('41')) {
            // Version 2 Gyeonggi API
            const urlv2 = `http://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteLineListv2?serviceKey=placeholder&routeId=${id}&format=json`;
            const jsonv2 = await fetchWithRetry(urlv2);
            const itemsv2 = jsonv2?.response?.msgBody?.busRouteLineList || [];
            if (itemsv2.length > 0) {
                return itemsv2.map(it => [parseFloat(it.y), parseFloat(it.x)]);
            }

            // Fallback to legacy
            const url = `https://apis.data.go.kr/6410000/busrouteservice/getBusRouteLineInqire?serviceKey=placeholder&_type=json&routeId=${id}`;
            const json = await fetchWithRetry(url);
            const items = json?.response?.body?.items?.item || [];
            const rows = Array.isArray(items) ? items : items ? [items] : [];
            if (rows.length > 0 && rows[0].x) return rows.map(it => [parseFloat(it.y), parseFloat(it.x)]);

        } else if (cityCode) {
            const url = `https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRoutePathList?serviceKey=placeholder&_type=json&cityCode=${cityCode}&routeId=${id}`;
            const json = await fetchWithRetry(url);
            const items = json?.response?.body?.items?.item || [];
            const rows = Array.isArray(items) ? items : items ? [items] : [];
            if (rows.length > 0 && rows[0].gpslati) return rows.map(it => [parseFloat(it.gpslati), parseFloat(it.gpslong)]);
        }
    } catch (e) {
        // AUTH_FAILED or QUOTA_EXCEEDED fall through here to getPathFromLocalStations
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

    const args = process.argv.slice(2);
    const cityFilter = args.find(a => a.startsWith('--city='))?.split('=')[1];
    const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
    const limit = limitArg ? parseInt(limitArg) : 5000; 

    // Handle multiple cities if comma-separated
    const filterCities = cityFilter ? cityFilter.split(',') : null;
    const priorities = ['11', '23', '41'];
    const otherKeys = Object.keys(shards).filter(k => !priorities.includes(k)).sort();
    
    // Determine which city keys to process
    let cityKeys = [];
    if (filterCities) {
        cityKeys = filterCities;
    } else {
        cityKeys = [...priorities.filter(k => shards[k]), ...otherKeys];
    }
    
    const startTime = Date.now();
    let totalProcessed = 0;

    for (const code of cityKeys) {
        const group = shards[code];
        if (!group) continue;
        const shardFile = path.join(SHARDS_DIR, `bus-paths-${code}.json`);
        let pathData = {};

        if (fs.existsSync(shardFile)) {
            try { 
                const content = fs.readFileSync(shardFile, 'utf8');
                if (content.trim()) pathData = JSON.parse(content); 
            } catch (e) {
                console.error(`   ❌ Error reading ${shardFile}:`, e.message);
            }
        }

        const remaining = group.filter(r => !pathData[r.id] || pathData[r.id].length < 2).slice(0, limit);
        
        if (remaining.length === 0) {
            console.log(`✅ [${code}] Shard already complete (${group.length} routes).`);
            totalProcessed += group.length;
            continue;
        }

        console.log(`🚀 [${code}] Processing ${remaining.length} / ${group.length} routes...`);

        const BATCH_SIZE = 5; 
        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
            const batch = remaining.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(async (route) => {
                try {
                    const points = await getPathForRoute(route);
                    if (points && points.length > 1) {
                        return { id: route.id, polyline: encodePolyline(points) };
                    }
                } catch (e) {}
                return null;
            }));

            for (const res of results) if (res) pathData[res.id] = res.polyline;

            const progressRatio = (totalProcessed + i + batch.length) / routes.length;
            process.stdout.write(`\r   📊 Progress: ${Math.round(progressRatio * 100)}% | [${code}] ${i + batch.length}/${remaining.length} (Shard: ${Object.keys(pathData).length}) `);

            if (i % 20 === 0) {
                fs.writeFileSync(shardFile, JSON.stringify(pathData));
            }
            await new Promise(r => setTimeout(r, 400)); 
        }

        totalProcessed += group.length;
        fs.writeFileSync(shardFile, JSON.stringify(pathData));
        console.log(`\n💾 [${code}] Shard saved with ${Object.keys(pathData).length} routes.`);
        
        pathData = null;
        if (global.gc) global.gc();
    }


    console.log(`\n🎉 ALL SHARDS COMPLETE! Total Time: ${Math.round((Date.now() - startTime)/1000/60)}m`);
}

main().catch(console.error);
