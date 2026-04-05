const fs = require('fs');
const path = require('path');
const { safeSaveJson } = require('./lib/safe-data');

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

async function fetchWithRetry(url, retries = 5) {
    const keys = [DATA_GO_KR_KEY_ENCODED, DATA_GO_KR_KEY_DECODED].filter(Boolean);
    
    for (const key of keys) {
        // Try both encoded and literal for the key
        const keyVersions = [
            key.startsWith('%') ? key : encodeURIComponent(key), 
            key // Literal version
        ];

        for (const targetKey of Array.from(new Set(keyVersions))) {
            const targetUrl = url.replace(/serviceKey=[^&]+/, `serviceKey=${targetKey}`);
            
            for (let i = 0; i < retries; i++) {
                try {
                    const res = await fetch(targetUrl, { 
                        signal: AbortSignal.timeout(30000),
                        headers: { 'Accept': 'application/json' }
                    });
                    
                    if (res.status === 401 || res.status === 403) {
                        break; // Try next key/version
                    }
                    if (res.status === 500 || res.status === 503 || !res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }

                    const text = await res.text();
                    try {
                        const parsed = JSON.parse(text);
                        const resCode = parsed?.response?.header?.resultCode || parsed?.header?.resultCode;
                        if (resCode && resCode !== '00' && resCode !== '0') {
                            throw new Error(resCode);
                        }
                        return parsed;
                    } catch (e) {
                         if (text.includes('<resultCode>00</resultCode>')) {
                             return { _xml: true, _raw: text };
                         }
                         throw e;
                    }
                } catch (e) {
                    if (i === retries - 1 && targetKey === keyVersions[keyVersions.length-1] && key === keys[keys.length-1]) {
                        throw e;
                    }
                    await new Promise(r => setTimeout(r, 2000 * (i + 1))); 
                }
            }
        }
    }
    throw new Error('All authentication attempts failed for: ' + url.substring(0, 50));
}

async function fetchSeoul(url, retries = 3) {
    if (!SEOUL_KEY || SEOUL_KEY === 'sample') return null;
    const targetUrl = url.replace(/\{KEY\}/, SEOUL_KEY);
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(targetUrl, { signal: AbortSignal.timeout(15000) });
            return await res.json();
        } catch (e) {
            if (i === retries - 1) return null;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * 1. MOIS Public Toilet Info (1741000)
 */
async function ingestNationwideToilets() {
    console.log('🚽 Starting Massive Nationwide Toilet Ingestion (MOIS 1741000)...');
    
    const PARTIAL_FILE = path.join(DATA_DIR, 'master-toilets-partial.json');
    let allToilets = [];
    let startPage = 1;

    // RESUME LOGIC (Enhanced with Page Tracker)
    if (fs.existsSync(PARTIAL_FILE)) {
        try {
            const checkpoint = JSON.parse(fs.readFileSync(PARTIAL_FILE, 'utf8'));
            if (checkpoint.toilets && checkpoint.lastPage) {
                allToilets = checkpoint.toilets;
                startPage = checkpoint.lastPage + 1;
                console.log(`🔄 Resuming from Page ${startPage} (${allToilets.length} valid records processed)`);
            } else if (Array.isArray(checkpoint)) {
                // Legacy fallback: assume 100 per page for older checkpoints
                allToilets = checkpoint;
                startPage = Math.floor(allToilets.length / 100) + 1;
                console.log(`🔄 Resuming Legacy Page ${startPage} (${allToilets.length} records)`);
            }
        } catch (e) {
            console.warn('⚠️ Could not load partial file. Starting fresh.');
        }
    }
    
    try {
        const baseUrl = `https://apis.data.go.kr/1741000/public_restroom_info/info?serviceKey=placeholder&type=json&numOfRows=100`;
        const initialJson = await fetchWithRetry(`${baseUrl}&pageNo=1`);
        const totalCount = parseInt(initialJson?.response?.body?.totalCount || '53452');
        
        console.log(`📊 Total records to fetch: ${totalCount}`);
        const PAGE_SIZE = 100; 
        const CHUNK_SIZE = 2; // Maximum stability
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);

        for (let i = startPage; i <= totalPages; i += CHUNK_SIZE) {
            const promises = [];
            for (let j = 0; j < CHUNK_SIZE && (i + j) <= totalPages; j++) {
                const page = i + j;
                promises.push(fetchWithRetry(`${baseUrl}&pageNo=${page}`).then(json => ({ page, json })));
            }
            
            try {
                const results = await Promise.all(promises);
                let currentMaxPage = i;
                for (const { page, json } of results) {
                    if (page > currentMaxPage) currentMaxPage = page;
                    let items = json?.response?.body?.items?.item || json?.response?.body?.items || [];
                    if (!Array.isArray(items) && items) items = [items];

                    if (items.length > 0) {
                        const mapped = items.map(it => {
                            let lat = parseFloat(String(it.WGS84_LAT || it.la || '0').trim());
                            let lng = parseFloat(String(it.WGS84_LOT || it.lo || '0').trim());
                            const name = String(it.RSTRM_NM || it.fcltyNm || '화장실');

                            if (!(lat > 30 && lng > 120)) {
                                const match = (subwayStations || []).find(s => name.includes(s.name));
                                if (match) { lat = match.lat; lng = match.lng; }
                            }

                            return {
                                id: String(it.MNG_NO || it.id || Math.random()),
                                name,
                                lat,
                                lng,
                                address: String(it.LCTN_ROAD_NM_ADDR || it.LCTN_LOTNO_ADDR || ''),
                                ms: parseInt(it.MALE_TOILT_CNT || '0'), 
                                fs: parseInt(it.FEMALE_TOILT_CNT || '0'),
                                bell: it.EMRGNCBLL_INSTL_YN === 'Y',
                                ot: String(it.OPN_HR_DTL || it.OPN_HR || '24시간'),
                                type: 'WC',
                                source: 'MOIS'
                            };
                        }).filter(it => it.lat > 30 && it.lng > 120);
                        allToilets.push(...mapped);
                    }
                }
                
                process.stdout.write(`\r   > Progress: ${allToilets.length}/${totalCount} (${Math.round((i/totalPages)*100)}%) [Page ${i}/${totalPages}]`);
                
                // Save checkpoint with metadata
                if (i % 10 === 1 || i + CHUNK_SIZE > totalPages) {
                    fs.writeFileSync(PARTIAL_FILE, JSON.stringify({ toilets: allToilets, lastPage: currentMaxPage }));
                }
                await new Promise(r => setTimeout(r, 800)); 
            } catch (err) {
                console.error(`\n❌ Fatal Error at page ${i}:`, err.message);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        console.log('\n✅ Nationwide Toilet Ingestion Complete.');
        return allToilets;
    } catch (e) {
        console.error('\n❌ Ingestion Failed:', e.message);
        return allToilets;
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

async function ingestNationalBusStops() {
    console.log('\n🚌 Starting Massive National Bus Stop Ingestion (TAGO City Codes)...');
    
    // All 16 major administrative regions in Korea
    const cityCodes = [
        { code: '11', name: '서울' }, { code: '21', name: '부산' }, { code: '22', name: '대구' },
        { code: '23', name: '인천' }, { code: '24', name: '광주' }, { code: '25', name: '대전' },
        { code: '26', name: '울산' }, 
        // Gyeonggi-do Sub-cities (to ensure full coverage via TAGO)
        { code: '31010', name: '수원' }, { code: '31020', name: '성남' }, { code: '31030', name: '의정부' },
        { code: '31040', name: '안양' }, { code: '31050', name: '부천' }, { code: '31060', name: '광명' },
        { code: '31070', name: '평택' }, { code: '31080', name: '동두천' }, { code: '31090', name: '안산' },
        { code: '31100', name: '고양' }, { code: '31110', name: '과천' }, { code: '31120', name: '구리' },
        { code: '31130', name: '남양주' }, { code: '31140', name: '오산' }, { code: '31150', name: '시흥' },
        { code: '31160', name: '군포' }, { code: '31170', name: '의왕' }, { code: '31180', name: '하남' },
        { code: '31190', name: '용인' }, { code: '31200', name: '파주' }, { code: '31210', name: '이천' },
        { code: '31220', name: '안성' }, { code: '31230', name: '김포' }, { code: '31240', name: '화성' },
        { code: '31250', name: '광주' }, { code: '31260', name: '양주' }, { code: '31270', name: '포천' },
        { code: '31320', name: '여주' }, { code: '31350', name: '연천' }, { code: '31370', name: '가평' },
        { code: '31380', name: '양평' },
        { code: '32', name: '강원' }, { code: '33', name: '충북' }, { code: '34', name: '충남' },
        { code: '35', name: '전북' }, { code: '36', name: '전남' }, { code: '37', name: '경북' },
        { code: '38', name: '경남' }, { code: '39', name: '제주' }
    ];

    let allStops = [];
    for (const city of cityCodes) {
        try {
            process.stdout.write(`   > Fetching stops for ${city.name} (${city.code}): `);
            let cityStops = [];
            for (let page = 1; page <= 10; page++) { // Max 10,000 per city
                const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&_type=json&cityCode=${city.code}&pageNo=${page}&numOfRows=1000`;
                const json = await fetchWithRetry(url);
                const items = json?.response?.body?.items?.item || [];
                const rows = Array.isArray(items) ? items : items ? [items] : [];
                
                if (rows.length === 0) break;

                const mapped = rows.map(it => ({
                    id: String(it.nodeid),
                    name: String(it.nodenm),
                    lat: parseFloat(it.gpslati),
                    lng: parseFloat(it.gpslong),
                    arsId: String(it.nodeno || ''),
                    type: 'BUS',
                    region: city.name,
                    cityCode: city.code,
                    source: 'NATIONAL'
                })).filter(s => s.lat > 30 && s.lng > 120);
                
                cityStops.push(...mapped);
                process.stdout.write(`.`);
                if (rows.length < 1000) break;
                await new Promise(r => setTimeout(r, 300));
            }
            allStops.push(...cityStops);
            console.log(` ${cityStops.length} stops.`);
        } catch (e) {
            console.log(`❌ Failed: ${e.message}`);
        }
    }
    return allStops;
}

async function ingestSeoulHighFidelityBusStops() {
    console.log('\n🏙️  Starting Seoul High-Fidelity Bus Station Ingestion (Seoul Open Data)...');
    let seoulStops = [];
    try {
        const PAGE_SIZE = 1000;
        for (let i = 1; i <= 15000; i += PAGE_SIZE) {
            const start = i;
            const end = i + PAGE_SIZE - 1;
            const url = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/busStopLocationXyInfo/${start}/${end}`;
            const json = await fetch(url).then(res => res.json()).catch(() => null);
            
            const rows = json?.busStopLocationXyInfo?.row || [];
            if (rows.length === 0) break;

            const mapped = rows.map(it => ({
                id: `SEOUL_BUS_${it.STOPS_NO || Math.random()}`,
                name: String(it.STOPS_NM),
                lat: parseFloat(it.YCRD),
                lng: parseFloat(it.XCRD),
                arsId: String(it.STOPS_NO || ''),
                type: 'BUS',
                region: '서울',
                source: 'SEOUL_HF'
            })).filter(s => s.lat > 30 && s.lng > 120);

            seoulStops.push(...mapped);
            process.stdout.write(`.`);
            if (rows.length < PAGE_SIZE) break;
            await new Promise(r => setTimeout(r, 300));
        }
        console.log(` ✅ ${seoulStops.length} Seoul HF stops fetched.`);
        return seoulStops;
    } catch (e) {
        console.error('❌ Seoul HF Ingestion Failed:', e.message);
        return seoulStops;
    }
}

async function ingestGyeonggiHighFidelityBusStops() {
    console.log('\n🏡 Starting Gyeonggi High-Fidelity Bus Station Ingestion (Gyeonggi Data Portal)...');
    let gyeonggiStops = [];
    const PARTIAL_FILE = path.join(DATA_DIR, 'master-bus-stops-partial.json');
    
    try {
        const baseUrl = `https://apis.data.go.kr/6410000/busstationservice/getBusStationList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY_DECODED)}&_type=json`;
        
        for (let page = 1; page <= 50; page++) {
            const url = `${baseUrl}&pageNo=${page}&numOfRows=1000`;
            const json = await fetchWithRetry(url);
            const items = json?.response?.body?.items?.item || [];
            const rows = Array.isArray(items) ? items : items ? [items] : [];
            
            if (rows.length === 0) break;

            const mapped = rows.map(it => ({
                id: `GG_BUS_${it.stationId}`,
                name: String(it.stationName),
                lat: parseFloat(it.y),
                lng: parseFloat(it.x),
                arsId: String(it.mobileNo || ''),
                type: 'BUS',
                region: '경기',
                source: 'GG_HF'
            })).filter(s => s.lat > 30 && s.lng > 120);

            gyeonggiStops.push(...mapped);
            process.stdout.write(`.`);
            
            if (page % 5 === 0) {
                fs.writeFileSync(PARTIAL_FILE, JSON.stringify({ busStops: gyeonggiStops, lastPage: page }));
            }

            if (rows.length < 1000) break;
            await new Promise(r => setTimeout(r, 500));
        }
        
        console.log(` ✅ ${gyeonggiStops.length} Gyeonggi HF stops fetched.`);
        return gyeonggiStops;
    } catch (e) {
        console.error('❌ Gyeonggi HF Ingestion Failed:', e.message);
        return gyeonggiStops;
    }
}

function deduplicateBusStops(allStops) {
    console.log(`\n🧹 Deduplicating ${allStops.length} total bus stops...`);
    const unique = new Map();
    
    const priority = { 'SEOUL_HF': 3, 'GG_HF': 2, 'NATIONAL': 1 };

    for (const stop of allStops) {
        // Round coordinates to 5 decimal places (~1 meter) for collision detection
        const coordKey = `${stop.lat.toFixed(5)}_${stop.lng.toFixed(5)}`;
        // Use ARS ID if available as primary unique key
        const arsKey = stop.arsId && stop.arsId !== '0' ? `ARS_${stop.region}_${stop.arsId}` : null;
        
        const existingByArs = arsKey ? unique.get(arsKey) : null;
        const existingByCoord = unique.get(coordKey);
        
        const existing = existingByArs || existingByCoord;
        
        if (!existing || (priority[stop.source] > priority[existing.source])) {
            if (arsKey) unique.set(arsKey, stop);
            unique.set(coordKey, stop);
        }
    }
    
    // Convert back to array ensuring unique IDs
    const finalMap = new Map();
    for (const stop of unique.values()) {
        finalMap.set(stop.id, stop);
    }
    
    const final = Array.from(finalMap.values());
    console.log(`✨ Deduplication complete: ${allStops.length} -> ${final.length} unique stops.`);
    return final;
}

async function main() {
    console.log('🚀 Final Definitive Restoration Ingestion (V5 - Phase 2 High-Fidelity)');
    
    const args = process.argv.slice(2);
    const busOnly = args.includes('--bus-only');
    const force = args.includes('--force');

    if (!busOnly) {
        // 1. Subway Baseline
        console.log('🚄 Loading Full Subway Baseline...');
        const rawSubway = JSON.parse(fs.readFileSync(METRO_DATA_FILE, 'utf8'));
        const subwayStations = rawSubway.map(s => ({
            id: String(s.name),
            name: s.name,
            lat: s.lat || s.latitude,
            lng: s.lng || s.longitude,
            lines: s.lines || []
        }));
        safeSaveJson(path.join(DATA_DIR, 'master-subway.json'), subwayStations, { force, minRatio: 0.95 });

        // 2. Toilets
        const nationwide = await ingestNationwideToilets();
        const seoulSubway = await ingestSeoulSubwayToilets();
        const combinedToilets = [...nationwide, ...seoulSubway];
        if (combinedToilets.length > 0) {
            safeSaveJson(path.join(DATA_DIR, 'master-toilets.json'), combinedToilets, { force });
        }
    }

    // 3. Bus Stops (Phase 2 Expanded)
    const nationalBusStops = await ingestNationalBusStops();
    const seoulHFStops = await ingestSeoulHighFidelityBusStops();
    const gyeonggiHFStops = await ingestGyeonggiHighFidelityBusStops();
    
    const allBusStops = [
        ...nationalBusStops,
        ...seoulHFStops, 
        ...gyeonggiHFStops
    ];
    
    const uniqueBusStops = deduplicateBusStops(allBusStops);
    
    if (uniqueBusStops.length > 0) {
        safeSaveJson(path.join(DATA_DIR, 'master-bus-stops.json'), uniqueBusStops, { force });
        console.log(`🎉 Phase 2 Ingestion Complete!`);
    }

    // Cleanup
    const PARTIAL_BUS = path.join(DATA_DIR, 'master-bus-stops-partial.json');
    if (fs.existsSync(PARTIAL_BUS)) fs.unlinkSync(PARTIAL_BUS);
}

main().catch(console.error);
