import fs from 'fs';
import path from 'path';
const { safeSaveJson } = require('./lib/safe-data');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envData = fs.readFileSync(envPath, 'utf8');
    envData.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim();
        }
    });
}

// Global force flag
const args = process.argv.slice(2);
const force = args.includes('--force');

// Loaded from .env.local
const SEOUL_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';
const DATA_GO_KR_KEY = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || 'sample';
const GG_KEY = process.env.NEXT_PUBLIC_GG_API_KEY || 'sample';

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const METRO_DATA_FILE = path.resolve(process.cwd(), 'src', 'data', 'capitalStations.json');
const WC_DATA_FILE = path.resolve(process.cwd(), 'src', 'data', 'wc.json');
const BUS_DATA_FILE = path.resolve(process.cwd(), 'src', 'data', 'bus-stops.json');

async function fetchWithRetry(url: string, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (i === retries - 1) return null;
            await new Promise(r => setTimeout(r, 1000 * (i + 1))); 
        }
    }
}

async function fetchWithTagoKey(url: string, key: string) {
    if (!key || key === 'sample') return null;
    const finalKey = encodeURIComponent(key);
    const finalUrl = url.replace('__KEY__', finalKey);
    return await fetchWithRetry(finalUrl);
}

async function processMetadata() {
    console.log('🆔 Restoring Subway Metadata...');
    if (!fs.existsSync(METRO_DATA_FILE)) {
        console.warn('⚠️  Local source NOT found.');
        return;
    }
    const stations = JSON.parse(fs.readFileSync(METRO_DATA_FILE, 'utf8'));
    const mapped = stations.map((s: any) => ({
        STATION_NM: s.name,
        LINE_NUM: s.lines?.[0] || 'Unknown',
        STATION_CD: String(s.id || ''),
        XPOINT_WGS: String(s.lat || s.latitude || ''),
        YPOINT_WGS: String(s.lng || s.longitude || '')
    }));
    
    safeSaveJson(path.join(DATA_DIR, 'master-metadata.json'), mapped, { force });
}

async function processToilets() {
    console.log('🚽 Restoring Nationwide Toilets (Hybrid)...');
    let allMapped: any[] = [];

    // 1. Local Backup
    if (fs.existsSync(WC_DATA_FILE)) {
        const localWc = JSON.parse(fs.readFileSync(WC_DATA_FILE, 'utf8'));
        allMapped = localWc.map((it: any) => ({
            FNAME: it.name,
            Y_WGS84: String(it.lat),
            X_WGS84: String(it.lng),
            ANAME: it.address,
            accessible: it.accessible,
            isInsideGate: it.isInsideGate
        }));
        console.log(`   > Loaded ${allMapped.length} from local backup.`);
    }

    // 2. Seoul API Fallback
    if (SEOUL_KEY !== 'sample') {
        const seoulUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/SearchPublicToiletService/1/1000/`;
        const json = await fetchWithRetry(seoulUrl);
        const items = json?.SearchPublicToiletService?.row || [];
        if (items.length > 0) {
            const mapped = items.map((it: any) => ({
                FNAME: it.FNAME,
                Y_WGS84: String(it.Y_WGS84),
                X_WGS84: String(it.X_WGS84),
                ANAME: it.ANAME,
                region: 'Seoul'
            }));
            allMapped = [...allMapped, ...mapped];
            console.log(`   > Combined ${items.length} from Seoul API.`);
        }
    }

    // 3. National API Fallback
    if (DATA_GO_KR_KEY !== 'sample') {
        const natUrl = `https://api.odcloud.kr/api/15013116/v1/uddi:9893d932-b677-4b18-b26a-986a4225e365?page=1&perPage=500&serviceKey=__KEY__`;
        const json = await fetchWithTagoKey(natUrl, DATA_GO_KR_KEY);
        const items = json?.data || [];
        if (items.length > 0) {
            const mapped = items.map((it: any) => ({
                FNAME: it["화장실명"] || "공중화장실",
                Y_WGS84: String(it["위도"] || ""),
                X_WGS84: String(it["경도"] || ""),
                ANAME: it["소재지도로명주소"] || ""
            })).filter((t: any) => t.Y_WGS84);
            allMapped = [...allMapped, ...mapped];
            console.log(`   > Combined ${mapped.length} from National API.`);
        }
    }

    if (allMapped.length > 0) {
        safeSaveJson(path.join(DATA_DIR, 'master-toilets.json'), allMapped, { force });
    }
}

async function processBusHubs() {
    console.log('🚌 Restoring Bus Hubs (Hybrid)...');
    let allStops: any[] = [];

    // 1. Local Backup
    if (fs.existsSync(BUS_DATA_FILE)) {
        allStops = JSON.parse(fs.readFileSync(BUS_DATA_FILE, 'utf8'));
        console.log(`   > Loaded ${allStops.length} from local backup.`);
    }

    // 2. Tago API Fallback (Gangnam example)
    if (DATA_GO_KR_KEY !== 'sample') {
        const hub = { name: 'Seoul-Gangnam', lat: 37.4979, lng: 127.0276 };
        const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getBusSttnListByPosInqire?serviceKey=__KEY__&_type=json&gpsLati=${hub.lat}&gpsLong=${hub.lng}&numOfRows=100`;
        const json = await fetchWithTagoKey(url, DATA_GO_KR_KEY);
        const items = json?.response?.body?.items?.item || [];
        const rows = Array.isArray(items) ? items : items ? [items] : [];
        if (rows.length > 0) {
            const mapped = rows.map((it: any) => ({
                id: String(it.nodeid || ''),
                name: String(it.nodenm || ''),
                lat: parseFloat(it.gpslati || '0'),
                lng: parseFloat(it.gpslong || '0'),
                region: hub.name
            }));
            allStops = [...allStops, ...mapped];
            console.log(`   > Combined ${mapped.length} from Tago API.`);
        }
    }

    if (allStops.length > 0) {
        safeSaveJson(path.join(DATA_DIR, 'master-bus-stops.json'), allStops, { force });
    }
}

async function main() {
    console.log(`🚀 Starting Robust Database Rebuild... (Force: ${force})`);
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    try {
        await processMetadata();
        await processToilets();
        await processBusHubs();
        console.log('✨ Build Complete.');
    } catch (err) {
        console.error('❌ Build Failed:', err);
        process.exit(1);
    }
}

main();
