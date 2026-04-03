import fs from 'fs';
import path from 'path';
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

const DATA_GO_KR_KEY = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || 'sample';
const KRIC_API_KEY = process.env.NEXT_PUBLIC_KRIC_API_KEY || 'sample';
const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');

async function fetchWithRetry(url: string, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                // Return text if not JSON (might be XML or error)
                return text;
            }
        } catch (e) {
            if (i === retries - 1) return null;
            await new Promise(r => setTimeout(r, 1500 * (i + 1))); 
        }
    }
}

/**
 * 1. MOIS Public Toilet Service (API 15155058)
 * Endpoint: https://apis.data.go.kr/1741000/public_restroom_info/info
 */
async function ingestToilets() {
    console.log('🚽 Starting Massive Nationwide Toilet Ingestion (MOIS)...');
    let allToilets: any[] = [];
    const PAGE_SIZE = 1000;

    try {
        // Initial fetch to get total count
        const initialUrl = `https://apis.data.go.kr/1741000/public_restroom_info/info?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&type=json&numOfRows=1&pageNo=1`;
        const initialJson = await fetchWithRetry(initialUrl);
        const totalCount = parseInt(initialJson?.response?.body?.totalCount || '0');
        
        if (totalCount === 0) {
            console.log('⚠️ No toilets found in MOIS API.');
            return;
        }
        
        console.log(`📊 Found ${totalCount} restrooms. Fetching in ${Math.ceil(totalCount / PAGE_SIZE)} pages...`);

        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        for (let page = 1; page <= totalPages; page++) {
            process.stdout.write(`   > Page ${page}/${totalPages}... `);
            const url = `https://apis.data.go.kr/1741000/public_restroom_info/info?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&type=json&numOfRows=${PAGE_SIZE}&pageNo=${page}`;
            const json = await fetchWithRetry(url);
            
            const items = json?.response?.body?.items?.item || [];
            const rows = Array.isArray(items) ? items : items ? [items] : [];
            
            if (rows.length === 0) {
                console.log('EMPTY (Unexpected)');
                break;
            }

            const mapped = rows.map((it: any) => ({
                id: `mois-${it.MNG_NO || Math.random().toString(36).substr(2, 9)}`,
                name: it.RSTRM_NM || '공중화장실',
                lat: parseFloat(it.WGS84_LAT || '0'),
                lng: parseFloat(it.WGS84_LOT || '0'),
                address: it.LCTN_ROAD_NM_ADDR || it.LCTN_LOTNO_ADDR || '',
                accessible: it.FEMALE_FRDBL_TOILT_CNT > 0 || it.MALE_FRDBL_TOILT_CNT > 0,
                femaleStalls: parseInt(it.FEMALE_TOILT_CNT || '0'),
                maleStalls: parseInt(it.MALE_TOILT_CNT || '0'),
                maleUrinals: parseInt(it.MALE_URNL_CNT || '0'),
                openTime: it.OPN_HR_DTL || it.OPN_HR || '24시간',
                tel: it.TELNO || '',
                source: 'MOIS'
            })).filter((t: any) => t.lat > 30 && t.lng > 120);
            
            allToilets = [...allToilets, ...mapped];
            console.log(`OK (+${mapped.length}, Total: ${allToilets.length})`);
            
            // Safety break for testing if needed (uncomment for full run)
            // if (page >= 5) break; 
            
            await new Promise(r => setTimeout(r, 100)); // Minor buffer
        }
    } catch (e) {
        console.error('❌ Toilet Ingestion Failed:', e);
    }

    if (allToilets.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-toilets.json'), JSON.stringify(allToilets, null, 2));
        console.log(`✅ Total ${allToilets.length} Toilets ingested and saved to master-toilets.json.`);
    }
}

/**
 * 2. TAGO National Bus Stop Info (15098534)
 * Endpoint: https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList
 */
async function ingestBusStops() {
    console.log('🚌 Starting Nationwide Bus Stop Ingestion (TAGO)...');
    // For nationwide, we iterate through city codes (GetCtyCodeList)
    const cityCodes = [
        { code: '11', name: '서울' }, { code: '21', name: '부산' }, { code: '22', name: '대구' },
        { code: '23', name: '인천' }, { code: '24', name: '광주' }, { code: '25', name: '대전' },
        { code: '26', name: '울산' }, { code: '31', name: '경기' }, { code: '32', name: '강원' }
    ];

    let allStops: any[] = [];
    for (const city of cityCodes) {
        process.stdout.write(`   > Fetching ${city.name}... `);
        try {
            const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&_type=json&cityCode=${city.code}&numOfRows=1000&pageNo=1`;
            const json = await fetchWithRetry(url);
            const items = json?.response?.body?.items?.item || [];
            const rows = Array.isArray(items) ? items : items ? [items] : [];
            
            if (rows.length > 0) {
                const mapped = rows.map((it: any) => ({
                    id: String(it.nodeid || ''),
                    name: String(it.nodenm || ''),
                    lat: parseFloat(it.gpslati || '0'),
                    lng: parseFloat(it.gpslong || '0'),
                    region: city.name,
                    source: 'TAGO'
                }));
                allStops = [...allStops, ...mapped];
                console.log(`OK (${mapped.length})`);
            } else {
                console.log('EMPTY');
            }
        } catch (e) {
            console.log('FAIL');
        }
    }

    if (allStops.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-bus-stops.json'), JSON.stringify(allStops, null, 2));
        console.log(`✅ Total ${allStops.length} Bus stops ingested.`);
    }
}

/**
 * 3. TAGO Subway Station Data
 * Endpoint: https://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList
 */
async function ingestSubwayInfo() {
    console.log('🚇 Starting Nationwide Subway Ingestion (TAGO)...');
    try {
        const url = `https://apis.data.go.kr/1613000/SubwayInfo/GetKwrdFndSubwaySttnList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&_type=json&numOfRows=2000&pageNo=1`;
        const json = await fetchWithRetry(url);
        const items = json?.response?.body?.items?.item || [];
        
        if (items.length > 0) {
            const mapped = items.map((it: any) => ({
                STATION_NM: String(it.subwayStationName || ''),
                LINE_NUM: String(it.subwayRouteName || ''),
                STATION_CD: String(it.subwayStationId || ''),
                LAT: String(it.latitude || ''),
                LNG: String(it.longitude || ''),
                address: String(it.address || '')
            }));
            
            // Fetch Exit Facilities for major stations (Top 50 to avoid rate limit/slow build)
            console.log('   > Fetching Exit Facilities for major hubs...');
            const majorHubs = mapped.slice(0, 50);
            const exitFacilities: any[] = [];
            
            for (const hub of majorHubs) {
                try {
                    const exitUrl = `https://apis.data.go.kr/1613000/SubwayInfo/GetSubwaySttnExitAcctoCfrFcltyList?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&_type=json&subwayStationId=${hub.STATION_CD}&numOfRows=100`;
                    const exitJson = await fetchWithRetry(exitUrl);
                    const exitItems = exitJson?.response?.body?.items?.item || [];
                    const exitRows = Array.isArray(exitItems) ? exitItems : exitItems ? [exitItems] : [];
                    
                    exitRows.forEach((ex: any) => {
                        exitFacilities.push({
                            stationCd: hub.STATION_CD,
                            exitNo: String(ex.exitNo || ''),
                            facilityNm: String(ex.cfrFcltyNm || ''),
                            lat: parseFloat(ex.latitude || '0'),
                            lng: parseFloat(ex.longitude || '0')
                        });
                    });
                } catch (e) {}
                await new Promise(r => setTimeout(r, 100));
            }

            fs.writeFileSync(path.join(DATA_DIR, 'master-metadata.json'), JSON.stringify(mapped, null, 2));
            fs.writeFileSync(path.join(DATA_DIR, 'master-exit-facilities.json'), JSON.stringify(exitFacilities, null, 2));
            console.log(`✅ ${mapped.length} Subway stations and ${exitFacilities.length} exit facilities ingested.`);
        }
    } catch (e) {
        console.error('❌ Subway Ingestion Failed:', e);
    }
}

/**
 * 4. KRic Rail Portal (openapi.kric.go.kr) - Integration Placeholder
 */
async function ingestRailPortalData() {
    if (KRIC_API_KEY === 'sample') {
        console.log('ℹ️ Rail Portal Key missing. Skipping KRic ingestion.');
        return;
    }
    console.log('🛤️ Fetching detailed station toilets from Rail Portal (KRic)...');
    // Implement KRic specific logic here if key is provided
}

async function main() {
    console.log('🚀 Starting Nationwide Master Ingestion V2...');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    try {
        await ingestSubwayInfo();
        await ingestToilets();
        await ingestBusStops();
        await ingestRailPortalData();
        console.log('✨ Nationwide Database Rebuild Complete.');
    } catch (err) {
        console.error('❌ Build Cycle Failed:', err);
        process.exit(1);
    }
}

main();
