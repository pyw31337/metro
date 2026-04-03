const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
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

// Configuration
const DATA_GO_KR_KEY_ENCODED = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || '';
const DATA_GO_KR_KEY_DECODED = "+wF9V/FmtnPwFyVA23nnj8bPMr6408AqX7SOvjeKVxwn/9NdHD9lY3vlQ0SckYijlvhHdjIPmDttxD4bd9YvwQ==";
const SEOUL_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';
const DATA_GO_KR_KEY = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || 'sample';

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const METRO_DATA_FILE = path.resolve(process.cwd(), 'src', 'data', 'capitalStations.json');

// Pre-load stations for matching
let subwayStations = [];
if (fs.existsSync(METRO_DATA_FILE)) {
    subwayStations = JSON.parse(fs.readFileSync(METRO_DATA_FILE, 'utf8'));
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function fetchWithRetry(url, retries = 3) {
    // Try encoded key first, then decoded key if 401
    const keys = [DATA_GO_KR_KEY_ENCODED, DATA_GO_KR_KEY_DECODED];
    
    for (const key of keys) {
        if (!key) continue;
        const targetUrl = url.replace(/serviceKey=[^&]+/, `serviceKey=${encodeURIComponent(key)}`);
        
        for (let i = 0; i < retries; i++) {
            try {
                const res = await fetch(targetUrl, { signal: AbortSignal.timeout(20000) });
                const text = await res.text();
                if (res.status === 401) {
                    console.log(`   [Auth Failed] Key index ${keys.indexOf(key)}`);
                    break; 
                }
                if (!res.ok) {
                    console.log(`   [HTTP Error] ${res.status} for ${targetUrl.substring(0, 80)}...`);
                    throw new Error(`HTTP ${res.status}`);
                }
                
                try {
                    const parsed = JSON.parse(text);
                    // Check for API-level errors in JSON (0 or 00 is success)
                    const resCode = parsed?.response?.header?.resultCode;
                    if (resCode && resCode !== '00' && resCode !== '0') {
                        console.log(`   [API Error] ${resCode}: ${parsed.response.header.resultMsg}`);
                        throw new Error(parsed.response.header.resultMsg);
                    }
                    return parsed;
                } catch (e) {
                    // Possible XML or bad JSON
                    if (text.includes('<response>')) {
                        if (text.includes('<resultCode>00</resultCode>')) return { _xml: true, _raw: text };
                        const code = text.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1];
                        const msg = text.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1];
                        console.log(`   [XML API Error] ${code}: ${msg}`);
                    }
                    throw e;
                }
            } catch (e) {
                if (i === retries - 1) break;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
    throw new Error('All keys and retries failed for: ' + url);
}

async function fetchSeoul(url, retries = 3) {
    if (!SEOUL_KEY || SEOUL_KEY === 'sample') return null;
    const targetUrl = url.replace(/\{KEY\}/, SEOUL_KEY);
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
            return await res.json();
        } catch (e) {
            if (i === retries - 1) return null;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * 1. MOIS Public Toilet Info (Nationwide 52,255 records)
 */
async function ingestNationwideToilets() {
    console.log('🚽 Starting Massive Nationwide Toilet Ingestion (MOIS)...');
    let allToilets = [];
    
    try {
        const initialUrl = `https://apis.data.go.kr/1741000/public_restroom_info/info?serviceKey=placeholder&type=json&numOfRows=1&pageNo=1`;
        const initialJson = await fetchWithRetry(initialUrl);
        const totalCount = parseInt(initialJson?.response?.body?.totalCount || '0');
        
        if (totalCount === 0) {
            console.log('⚠️ No toilets found. Check API key or endpoint structure.');
            return [];
        }

        console.log(`📊 Found ${totalCount} records. Starting chunked parallel loop...`);
        
        const PAGE_SIZE = 100; 
        const CHUNK_SIZE = 10; // Fetch 10 pages in parallel
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);

        for (let i = 1; i <= totalPages; i += CHUNK_SIZE) {
            const promises = [];
            for (let j = 0; j < CHUNK_SIZE && (i + j) <= totalPages; j++) {
                const page = i + j;
                const url = `https://apis.data.go.kr/1741000/public_restroom_info/info?serviceKey=placeholder&type=json&numOfRows=${PAGE_SIZE}&pageNo=${page}`;
                promises.push(fetchWithRetry(url).then(json => ({ page, json })));
            }
            
            try {
                const results = await Promise.all(promises);
                for (const { page, json } of results) {
                    let rows = json?.response?.body?.items?.item || [];
                    if (!Array.isArray(rows) && rows) rows = [rows];

                    if (rows.length > 0) {
                        const mapped = rows.map(it => {
                            let lat = parseFloat(String(it.WGS84_LAT || it.la || '0').trim());
                            let lng = parseFloat(String(it.WGS84_LOT || it.lo || '0').trim());
                            const name = String(it.RSTRM_NM || it.fcltyNm || '화장실');
                            const mng = String(it.MNG_INST_NM || '');

                            // Rescue Station Toilets without coordinates
                            if (!(lat > 30 && lng > 120)) {
                                const match = subwayStations.find(s => 
                                    name.includes(s.name) || 
                                    mng.includes(s.name) ||
                                    (s.name.length > 1 && (name.includes(s.name.replace(/역+$/, '')) || mng.includes(s.name.replace(/역+$/, ''))))
                                );
                                if (match) {
                                    lat = match.latitude || match.lat;
                                    lng = match.longitude || match.lng;
                                }
                            }

                            return {
                                id: String(it.MNG_NO || it.id || Math.random()),
                                name,
                                lat,
                                lng,
                                address: String(it.LCTN_ROAD_NM_ADDR || it.LCTN_LOTNO_ADDR || ''),
                                type: 'WC',
                                source: 'MOIS'
                            };
                        }).filter(it => it.lat > 30 && it.lng > 120);
                        allToilets.push(...mapped);
                    }
                }
                
                process.stdout.write(`\r   > Progress: ${allToilets.length}/${totalCount} (${Math.round((i/totalPages)*100)}%) [Page ${i + CHUNK_SIZE - 1}/${totalPages}]`);
                
                if (i % 50 === 1) {
                    fs.writeFileSync(path.join(DATA_DIR, 'master-toilets-partial.json'), JSON.stringify(allToilets));
                }
                await new Promise(r => setTimeout(r, 200)); // Small delay between chunks to avoid rate limit
            } catch (err) {
                console.error(`\n❌ Error in chunk starting at page ${i}:`, err.message);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        console.log('\n✅ MOIS Nationwide Toilet Ingestion Complete.');
        return allToilets;
    } catch (e) {
        console.error('\n❌ MOIS Ingestion Failed:', e.message);
        return [];
    }
}

/**
 * 2. Seoul Subway Toilets (Open Data 312 records)
 */
async function ingestSeoulSubwayToilets() {
    console.log('\n🚇 Starting Seoul Subway Toilet Ingestion (SEOUL-OPEN-DATA)...');
    try {
        const url = `http://openapi.seoul.go.kr:8088/{KEY}/json/SearchPublicToiletService/1/1000/`;
        const json = await fetchSeoul(url);
        if (json?.RESULT?.CODE === 'INFO-200' || json?.row?.length === 0) {
            console.warn('⚠️ Seoul API returned no records or error:', json?.RESULT?.MESSAGE);
            return [];
        }
        const dataSet = json?.SearchPublicToiletService;
        const totalCount = dataSet?.list_total_count || 0;
        const rows = dataSet?.row || [];
        console.log(`   > Fetched ${rows.length}/${totalCount} toilets from Seoul API.`);
        return rows.map(it => ({
            id: `SEOUL_WC_${it.POI_ID || Math.random()}`,
            name: it.FNAME || '화장실',
            lat: parseFloat(it.Y_WGS84),
            lng: parseFloat(it.X_WGS84),
            address: it.ADDR_NEW || it.ADDR_OLD || '',
            type: 'WC',
            source: 'SEOUL'
        }));
    } catch (e) {
        console.warn('⚠️ Seoul Subway Toilet Ingestion Failed:', e.message);
        return [];
    }
}

async function ingestNationalBusHubs() {
    console.log('🚌 Starting National Bus Hub Ingestion (TAGO)...');
    const hubs = [
        { name: '강남역', lat: 37.4979, lng: 127.0276 },
        { name: '서울역', lat: 37.5546, lng: 126.9725 },
        { name: '대구역', lat: 35.8762, lng: 128.5976 },
        { name: '부산역', lat: 35.1147, lng: 129.0416 },
        { name: '광주역', lat: 35.1654, lng: 126.9092 }
    ];
    let allHubs = [];
    for (const hub of hubs) {
        try {
            const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList?serviceKey=placeholder&_type=json&gpsLati=${hub.lat}&gpsLong=${hub.lng}&numOfRows=100`;
            const json = await fetchWithRetry(url);
            const items = json?.response?.body?.items?.item || [];
            const rows = Array.isArray(items) ? items : items ? [items] : [];
            allHubs.push(...rows.map(it => ({
                id: String(it.nodeid),
                name: String(it.nodenm),
                lat: parseFloat(it.gpslati),
                lng: parseFloat(it.gpslong),
                type: 'BUS',
                region: hub.name
            })));
            process.stdout.write(`.`);
        } catch (e) { /* skip hub error */ }
    }
    console.log(`\n✅ ${allHubs.length} Bus hubs ingested.`);
    return allHubs;
}

async function main() {
    console.log('🚀 Final Definitive Restoration Ingestion (V5)');
    
    // 1. Subway Baseline (Full Restoration)
    console.log('🚄 Loading Full Subway Baseline...');
    const CAPITAL_STATIONS_PATH = path.join(process.cwd(), 'src/data/capitalStations.json');
    let subwayStations = [];
    if (fs.existsSync(CAPITAL_STATIONS_PATH)) {
        const rawSubway = JSON.parse(fs.readFileSync(CAPITAL_STATIONS_PATH, 'utf8'));
        subwayStations = rawSubway.map(s => ({
            id: String(s.name), // Using name as ID for baseline stability
            name: s.name,
            lat: s.lat || s.latitude,
            lng: s.lng || s.longitude,
            lines: s.lines || []
        }));
        console.log(`✅ Loaded ${subwayStations.length} subway stations from local data.`);
    } else {
        subwayStations = [{ id: '1001', name: '서울역', lat: 37.554648, lng: 126.972559 }];
        console.warn('⚠️ capitalStations.json not found. Using minimal baseline.');
    }
    fs.writeFileSync(path.join(DATA_DIR, 'master-subway.json'), JSON.stringify(subwayStations, null, 2));

    // 2. Toilets (The Big Restoration)
    const nationwide = await ingestNationwideToilets();
    const seoulSubway = await ingestSeoulSubwayToilets();
    
    const combinedToilets = [...nationwide, ...seoulSubway];
    
    // Safety guard: Final record count check before saving
    if (combinedToilets.length > 0) {
        // [OPTIMIZATION] Avoid indentation for 50k+ records to prevent memory crash
        console.log(`\n💾 Saving ${combinedToilets.length} toilets to ${path.join(DATA_DIR, 'master-toilets.json')}...`);
        fs.writeFileSync(path.join(DATA_DIR, 'master-toilets.json'), JSON.stringify(combinedToilets)); 
        console.log(`✨ Successfully saved ${combinedToilets.length} total toilets (minified for performance).`);
        
        if (combinedToilets.length < 52000) {
            console.log(`🚨 WARNING: Captured ${combinedToilets.length} records. MOIS total was expected nearer 52k.`);
        } else {
            console.log('🎖️ Target reached! Pre-deployment verification passed.');
        }
    } else {
        console.log('❌ CRITICAL: No toilets ingested. Aborting save.');
    }

    // 3. Bus Stops (Core Hubs)
    const busHubs = await ingestNationalBusHubs();
    if (busHubs.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-bus-hubs.json'), JSON.stringify(busHubs, null, 2));
    }
}

main().catch(console.error);
