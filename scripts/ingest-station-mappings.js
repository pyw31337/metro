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

const DATA_GO_KR_KEY_DECODED = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";
const SEOUL_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const ROUTES_FILE = path.join(DATA_DIR, 'master-bus-routes.json');
const STATIONS_FILE = path.join(DATA_DIR, 'master-route-stations.json');
const PARTIAL_FILE = path.join(DATA_DIR, 'master-route-stations-partial.json');

async function fetchWithRetry(url, retries = 3) {
    const keys = [process.env.NEXT_PUBLIC_DATA_GO_KR_KEY, DATA_GO_KR_KEY_DECODED].filter(Boolean);
    
    for (const key of keys) {
        // Try both encoded and literal for the key (some APIs want literal, some want encoded)
        const keyVersions = [
            key.startsWith('%') ? key : encodeURIComponent(key), 
            key // Literal version
        ];

        for (const targetKey of Array.from(new Set(keyVersions))) {
            const targetUrl = url.replace(/serviceKey=[^&]+/, `serviceKey=${targetKey}`);
            
            for (let i = 0; i < retries; i++) {
                try {
                    const res = await fetch(targetUrl, { 
                        signal: AbortSignal.timeout(20000), 
                        headers: { 
                            'Accept': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        } 
                    });
                    
                    if (res.status === 401 || res.status === 403) break; // Try next key/version
                    if (res.status === 429) {
                        console.warn(`⚠️ Rate limited (429). Waiting 30s... (Attempt ${i+1}/${retries})`);
                        await new Promise(r => setTimeout(r, 30000));
                        continue;
                    }
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);

                    const text = await res.text();
                    try {
                        const parsed = JSON.parse(text);
                        const resCode = parsed?.response?.header?.resultCode || parsed?.header?.resultCode || parsed?.comMsgHeader?.returnCode;
                        
                        // Handle standard "00" or "0" success codes
                        if (resCode && resCode !== '00' && resCode !== '0') {
                            // If it's an auth error, break to try next key
                            if (resCode === '30' || resCode === '01' || text.includes('인증실패')) break;
                            throw new Error(`API_${resCode}`);
                        }
                        return parsed;
                    } catch (e) {
                        if (text.includes('<resultCode>00</resultCode>')) return { _xml: true, _raw: text };
                        throw e;
                    }
                } catch (e) {
                    if (i === retries - 1 && targetKey === keyVersions[keyVersions.length-1] && key === keys[keys.length-1]) throw e;
                    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                }
            }
        }
    }
    throw new Error('All authentication attempts failed');
}

async function fetchSeoulRouteStations(routeId) {
    const url = `http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute?serviceKey=placeholder&busRouteId=${routeId}&resultType=json`;


    try {
        const json = await fetchWithRetry(url);
        const items = json?.msgBody?.itemList || [];
        if (items.length > 0) {
            return items.map(it => ({
                id: String(it.station),
                name: String(it.stationNm),
                idx: parseInt(it.seq)
            })).sort((a, b) => a.idx - b.idx);
        }
    } catch (e) {
        // Falls back to TAGO if possible
    }
    return null;
}


async function fetchGyeonggiRouteStations(routeId) {
    const url = `http://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteStationListv2?serviceKey=placeholder&routeId=${routeId}&format=json`;
    try {
        const json = await fetchWithRetry(url);
        const items = json?.response?.msgBody?.busRouteStationList || [];
        if (items.length > 0) {
            return items.map(it => ({
                id: String(it.stationId),
                name: String(it.stationName),
                idx: parseInt(it.stationSeq)
            })).sort((a, b) => a.idx - b.idx);
        }
    } catch (e) {
        // Falls back to TAGO if possible
    }
    return null;
}

async function main() {

    process.stdout.write('\x1Bc');
    console.log('🔗 Starting Master Route-Station Mapping Ingestion');
    console.log('--------------------------------------------------');

    if (!fs.existsSync(ROUTES_FILE)) return console.error('❌ master-bus-routes.json not found!');
    const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));

    let mapping = {};
    if (fs.existsSync(STATIONS_FILE)) {
        try { mapping = JSON.parse(fs.readFileSync(STATIONS_FILE, 'utf8')); } catch (e) {}
    }
    if (fs.existsSync(PARTIAL_FILE)) {
        try { Object.assign(mapping, JSON.parse(fs.readFileSync(PARTIAL_FILE, 'utf8'))); } catch (e) {}
    }

    const args = process.argv.slice(2);
    const cityFilter = args.find(a => a.startsWith('--city='))?.split('=')[1];
    const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
    const limit = limitArg ? parseInt(limitArg) : 100000;

    const priorities = ['11', '23', '31', '41'];
    const remaining = routes
        .filter(r => !mapping[r.id] && (!cityFilter || r.cityCode === cityFilter))
        .sort((a, b) => {
            const aP = priorities.indexOf(String(a.cityCode));
            const bP = priorities.indexOf(String(b.cityCode));
            if (aP !== -1 && bP !== -1) return aP - bP;
            if (aP !== -1) return -1;
            if (bP !== -1) return 1;
            return 0;
        })
        .slice(0, limit);
    
    console.log(`📊 Total: ${routes.length} routes. Filtered/Remaining: ${remaining.length}`);


    const startTime = Date.now();
    const BATCH_SIZE = 5;
    
    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
        const batch = remaining.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (route) => {
            try {
                // process.stdout.write(`\n   🛠️  Processing ${route.no} (${route.id})... `);
                let rows = null;
                if (route.cityCode === '11') {
                    rows = await fetchSeoulRouteStations(route.id);
                } else if (route.cityCode === '41' || String(route.cityCode).startsWith('41')) {
                    rows = await fetchGyeonggiRouteStations(route.id);
                }


                if (!rows) {
                    const url = `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList?serviceKey=placeholder&_type=json&cityCode=${route.cityCode}&routeId=${route.id}&numOfRows=400`;
                    const json = await fetchWithRetry(url);
                    const items = json?.response?.body?.items?.item || [];
                    const tagoRows = Array.isArray(items) ? items : items ? [items] : [];
                    if (tagoRows.length > 0) {
                        rows = tagoRows.map(it => ({ id: String(it.nodeid), name: String(it.nodenm), idx: parseInt(it.nodeord) })).sort((a, b) => a.idx - b.idx);
                    }
                }

                if (rows && rows.length > 0) {
                    mapping[route.id] = rows;
                    // console.log(`✅ ${route.no}: ${rows.length} stations.`);
                }
            } catch (e) {
                // console.error(`❌ ${route.no}: ${e.message}`);
            }
        }));



        const elapsed = (Date.now() - startTime) / 1000;
        const processed = i + batch.length;
        const progress = (routes.length - remaining.length + processed) / routes.length;
        const eta = progress > 0 ? (elapsed / (processed/remaining.length) - elapsed) : 0;

        process.stdout.write(`\r   > Progress: ${Math.round(progress * 100)}% | Processed: ${processed}/${remaining.length} | ETA: ${Math.round(eta/60)}m `);

        if (i % 50 === 0 || i + BATCH_SIZE >= remaining.length) {
            fs.writeFileSync(PARTIAL_FILE, JSON.stringify(mapping));
        }
        await new Promise(r => setTimeout(r, 400));
    }

    fs.writeFileSync(STATIONS_FILE, JSON.stringify(mapping));
    if (fs.existsSync(PARTIAL_FILE)) fs.unlinkSync(PARTIAL_FILE);
    console.log('\n\n✅ Station Mapping Ingestion Complete!');
}

main().catch(console.error);
