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
const DATA_GO_KR_KEY = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || DATA_GO_KR_KEY_DECODED;
const SEOUL_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const ROUTES_FILE = path.join(DATA_DIR, 'master-bus-routes.json');
const PARTIAL_FILE = path.join(DATA_DIR, 'master-bus-routes-partial.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function fetchWithRetry(url, retries = 5) {
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
                        signal: AbortSignal.timeout(30000),
                        headers: { 
                            'Accept': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });
                    
                    if (res.status === 401 || res.status === 403) break; 
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);

                    const text = await res.text();
                    if (text.includes('인증실패') || text.includes('SERVICE ACCESS DENIED') || text.includes('LIMITED_NUMBER_OF_SERVICE')) {
                        break; // Try next key/version
                    }

                    try {
                        const parsed = JSON.parse(text);
                        const resCode = parsed?.response?.header?.resultCode || parsed?.header?.resultCode;
                        if (resCode && resCode !== '00' && resCode !== '0') {
                             if (resCode === '30' || resCode === '01') break;
                             throw new Error(resCode);
                        }
                        return parsed;
                    } catch (e) {
                         if (text.includes('<resultCode>00</resultCode>')) return { _xml: true, _raw: text };
                         throw e;
                    }
                } catch (e) {
                    if (i === retries - 1 && targetKey === keyVersions[keyVersions.length-1] && key === keys[keys.length-1]) throw e;
                    await new Promise(r => setTimeout(r, 2000 * (i + 1))); 
                }
            }
        }
    }
    throw new Error('All auth attempts failed');
}

async function ingestSeoulRoutes() {
    console.log('🏙️  Ingesting Seoul Bus Routes (Seoul Open Data)...');
    try {
        const url = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/busRoute/1/1000/`;
        const res = await fetch(url);
        const json = await res.json();
        const items = json?.busRoute?.row || [];
        console.log(`   > Fetched ${items.length} Seoul routes.`);
        return items.map(it => ({
            id: String(it.RTE_ID),
            no: String(it.RTE_NM),
            type: '서울버스',
            region: '서울',
            cityCode: '11'
        }));
    } catch (e) {
        console.error('❌ Seoul Ingestion Failed:', e.message);
        return [];
    }
}

async function ingestRegionalRoutes(cityCode, cityName) {
    console.log(`🏡 Ingesting ${cityName} Bus Routes (${cityCode}) via TAGO...`);
    let allRoutes = [];
    let pageNo = 1;
    let totalCount = 1; // Initial dummy value

    while (allRoutes.length < totalCount) {
        const url = `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteNoList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&_type=json&cityCode=${cityCode}&numOfRows=1000&pageNo=${pageNo}`;
        try {
            const json = await fetchWithRetry(url);
            const body = json?.response?.body;
            const items = body?.items?.item || [];
            const rows = Array.isArray(items) ? items : [items].filter(Boolean);
            
            allRoutes.push(...rows);
            totalCount = body?.totalCount || allRoutes.length;
            
            console.log(`   > Received page ${pageNo}: ${rows.length} routes (Total so far: ${allRoutes.length}/${totalCount}).`);
            if (rows.length === 0 || allRoutes.length >= totalCount) break;
            pageNo++;
            await new Promise(r => setTimeout(r, 600)); // Delay between pages
        } catch (e) {
            console.error(`❌ ${cityName} Page ${pageNo} Failed:`, e.message);
            break;
        }
    }

    return allRoutes.map(it => ({
        id: String(it.routeid),
        no: String(it.routeno),
        type: String(it.routetp),
        region: cityName,
        cityCode: String(cityCode)
    }));
}

async function main() {
    console.log('🚀 Starting Master Bus Route Ingestion (V3 Granular City Discovery)...');
    
    let checkpoint = { routes: [], completed: [] };
    if (fs.existsSync(PARTIAL_FILE)) {
        try {
            checkpoint = JSON.parse(fs.readFileSync(PARTIAL_FILE, 'utf8'));
            console.log(`🔄 Resuming: ${checkpoint.routes.length} routes already collected. Completed Cities: ${checkpoint.completed.length}`);
        } catch (e) {
            console.warn('⚠️ Could not load partial file. Starting fresh.');
        }
    }

    const saveCheckpoint = () => {
        fs.writeFileSync(PARTIAL_FILE, JSON.stringify(checkpoint));
    };

    // 1. Seoul (Open Data)
    if (!checkpoint.completed.includes('서울')) {
        const seoul = await ingestSeoulRoutes();
        if (seoul.length > 0) {
            checkpoint.routes.push(...seoul);
            checkpoint.completed.push('서울');
            saveCheckpoint();
        }
    }

    // 2. Discover all City Codes via TAGO
    console.log('🔍 Discovering All Nationwide City Codes via TAGO...');
    let cityCodes = [];
    try {
        const url = `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getCtyCodeList?serviceKey=placeholder&_type=json`;
        const json = await fetchWithRetry(url);
        const items = json?.response?.body?.items?.item || [];
        cityCodes = Array.isArray(items) ? items : [items].filter(Boolean);
        console.log(`   > Found ${cityCodes.length} cities to process.`);
    } catch (e) {
        console.error('❌ Failed to fetch city codes:', e.message);
    }
    
    // Crucial Gyeonggi granular cities (often missing from master discovery)
    const gyeonggiCities = [
        { citycode: '31010', cityname: '수원시' }, { citycode: '31020', cityname: '성남시' },
        { citycode: '31030', cityname: '의정부시' }, { citycode: '31040', cityname: '안양시' },
        { citycode: '31050', cityname: '부천시' }, { citycode: '31060', cityname: '광명시' },
        { citycode: '31070', cityname: '평택시' }, { citycode: '31080', cityname: '동두천시' },
        { citycode: '31090', cityname: '안산시' }, { citycode: '31100', cityname: '고양시' },
        { citycode: '31110', cityname: '과천시' }, { citycode: '31120', cityname: '구리시' },
        { citycode: '31130', cityname: '남양주시' }, { citycode: '31140', cityname: '오산시' },
        { citycode: '31150', cityname: '시흥시' }, { citycode: '31160', cityname: '군포시' },
        { citycode: '31170', cityname: '의왕시' }, { citycode: '31180', cityname: '하남시' },
        { citycode: '31190', cityname: '용인시' }, { citycode: '31200', cityname: '파주시' },
        { citycode: '31210', cityname: '이천시' }, { citycode: '31220', cityname: '안성시' },
        { citycode: '31230', cityname: '김포시' }, { citycode: '31240', cityname: '화성시' },
        { citycode: '31250', cityname: '광주시' }, { citycode: '31260', cityname: '양주시' },
        { citycode: '31270', cityname: '포천시' }, { citycode: '31320', cityname: '여주시' },
        { citycode: '31350', cityname: '연천군' }, { citycode: '31370', cityname: '가평군' },
        { citycode: '31380', cityname: '양평군' }
    ];

    // Combine discovery and hardcoded fallback
    const allTargetCities = [...gyeonggiCities];
    cityCodes.forEach(c => {
        if (!allTargetCities.find(t => String(t.citycode) === String(c.citycode))) {
            allTargetCities.push({ citycode: String(c.citycode), cityname: c.cityname });
        }
    });

    // 3. Prioritized Processing: Seoul, Incheon, Gyeonggi
    const priorities = [
        { citycode: '11', cityname: '서울' },
        { citycode: '23', cityname: '인천' },
        ...gyeonggiCities
    ];

    for (const city of priorities) {
        const { citycode: code, cityname: name } = city;
        if (checkpoint.completed.includes(name) || checkpoint.completed.includes(String(code))) continue;
        
        try {
            console.log(`🌟 Priority Processing: ${name} (${code})...`);
            const routes = await ingestRegionalRoutes(code, name);
            if (routes.length > 0) {
                // Deduplicate within the current routes list
                const existingIds = new Set(checkpoint.routes.map(r => r.id));
                const newRoutes = routes.filter(r => !existingIds.has(r.id));
                checkpoint.routes.push(...newRoutes);
                checkpoint.completed.push(name);
                saveCheckpoint();
            }
            await new Promise(r => setTimeout(r, 600));
        } catch (e) {
            console.error(`❌ Fatal Error for ${name}:`, e.message);
        }
    }

    // 4. Process all other cities
    for (const city of allTargetCities) {
        const { citycode: code, cityname: name } = city;
        if (checkpoint.completed.includes(name) || checkpoint.completed.includes(String(code))) continue;
        
        try {
            const routes = await ingestRegionalRoutes(code, name);
            if (routes.length > 0) {
                const existingIds = new Set(checkpoint.routes.map(r => r.id));
                const newRoutes = routes.filter(r => !existingIds.has(r.id));
                checkpoint.routes.push(...newRoutes);
                checkpoint.completed.push(name);
                saveCheckpoint();
            }
            await new Promise(r => setTimeout(r, 600));
        } catch (e) {
            console.error(`❌ Fatal Error for ${name}:`, e.message);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // Deduplicate by ID
    const unique = new Map();
    checkpoint.routes.forEach(r => unique.set(r.id, r));
    
    const final = Array.from(unique.values());
    console.log(`\n✨ Total Unique Routes: ${final.length}`);
    
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(final));
    console.log(`💾 Saved to ${ROUTES_FILE}`);

    // Cleanup checkpoint
    if (fs.existsSync(PARTIAL_FILE)) fs.unlinkSync(PARTIAL_FILE);
    console.log('🎉 Done!');
}

main().catch(console.error);
