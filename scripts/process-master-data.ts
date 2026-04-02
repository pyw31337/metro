import fs from 'fs';
import path from 'path';

/**
 * process-master-data.ts
 * Purpose: Fetch and Pre-process ALL subway materials at BUILD TIME.
 * Final Edition: Includes Gyeonggi, National, Weak Accessibility, and Bus Hubs.
 */

const SEOUL_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';
const DATA_GO_KR_KEY = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || 'sample';
const GG_KEY = process.env.NEXT_PUBLIC_GG_API_KEY || 'bb76ade40706413f977749ddd28d5e38'; // Default fallback

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

async function fetchWithRetry(url: string, retries = 3, timeout = 15000) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (i === retries - 1) return null;
            await new Promise(r => setTimeout(r, 2000 * (i + 1))); 
        }
    }
}

async function processSeoulToilets() {
    console.log('🚽 Processing Seoul Toilets...');
    const url = `https://openapi.seoul.go.kr:443/${SEOUL_KEY}/json/SearchPublicToiletAndStation/1/1000/`;
    const json = await fetchWithRetry(url);
    const items = json?.SearchPublicToiletAndStation?.row || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-toilets.json'), JSON.stringify(items, null, 2));
    }
}

async function processGyeonggiToilets() {
    console.log('🏙️ Processing Gyeonggi Toilets...');
    const url = `https://openapi.gg.go.kr/PubToilet?KEY=${GG_KEY}&Type=json&pIndex=1&pSize=1000`;
    const json = await fetchWithRetry(url);
    const items = json?.PubToilet?.[1]?.row || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-gg-toilets.json'), JSON.stringify(items, null, 2));
    }
}

async function processNationalToilets() {
    if (DATA_GO_KR_KEY === 'sample') return;
    console.log('🌍 Processing National Toilets...');
    // 전국공중화장실표준데이터
    const uuid = '9893d932-b677-4b18-b26a-986a4225e365';
    const url = `https://api.odcloud.kr/api/15013116/v1/uddi:${uuid}?page=1&perPage=2000&serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}`;
    const json = await fetchWithRetry(url);
    const items = json?.data || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-nat-toilets.json'), JSON.stringify(items, null, 2));
    }
}

async function processTrafficWeak() {
    console.log('♿ Processing Traffic Weak Accessibility (Toilets)...');
    const url = `https://openapi.seoul.go.kr/${SEOUL_KEY}/json/tbTraficWheelChrAdit/1/1000/`;
    const json = await fetchWithRetry(url);
    const items = json?.tbTraficWheelChrAdit?.row || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-weak-toilets.json'), JSON.stringify(items, null, 2));
    }
}

async function processFacilities() {
    console.log('🛗 Processing Elevators & Lifts...');
    const [el, lift] = await Promise.all([
        fetchWithRetry(`https://openapi.seoul.go.kr:443/${SEOUL_KEY}/json/SearchSubwayStationElevator/1/1000/`),
        fetchWithRetry(`https://openapi.seoul.go.kr:443/${SEOUL_KEY}/json/SearchSubwayStationWheelchairLift/1/1000/`)
    ]);
    if (el?.SearchSubwayStationElevator?.row) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-elevators.json'), JSON.stringify(el.SearchSubwayStationElevator.row, null, 2));
    }
    if (lift?.SearchSubwayStationWheelchairLift?.row) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-lifts.json'), JSON.stringify(lift.SearchSubwayStationWheelchairLift.row, null, 2));
    }
}

async function processOperational() {
    console.log('📏 Processing Distances & Details...');
    const [dist, det] = await Promise.all([
        fetchWithRetry(`https://openapi.seoul.go.kr:443/${SEOUL_KEY}/json/SearchStationDistance/1/1000/`),
        fetchWithRetry(`https://openapi.seoul.go.kr:443/${SEOUL_KEY}/json/StationAdresTelno/1/1000/`)
    ]);
    if (dist?.SearchStationDistance?.row) fs.writeFileSync(path.join(DATA_DIR, 'master-distances.json'), JSON.stringify(dist.SearchStationDistance.row, null, 2));
    if (det?.StationAdresTelno?.row) fs.writeFileSync(path.join(DATA_DIR, 'master-details.json'), JSON.stringify(det.StationAdresTelno.row, null, 2));
}

async function processMetadata() {
    console.log('🆔 Processing Station Metadata...');
    const url = `https://openapi.seoul.go.kr/443/${SEOUL_KEY}/json/SearchSTNBySubwayLineService/1/1000/`;
    const json = await fetchWithRetry(url);
    if (json?.SearchSTNBySubwayLineService?.row) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-metadata.json'), JSON.stringify(json.SearchSTNBySubwayLineService.row, null, 2));
    }
}

async function processBusHubs() {
    if (DATA_GO_KR_KEY === 'sample') return;
    console.log('🚌 Processing Major Bus Hubs (Proof of Concept)...');
    // Top 5 Busiest Transfer Hubs (Coords approximate)
    const hubs = [
        { name: '강남', lat: 37.4979, lng: 127.0276 },
        { name: '잠실', lat: 37.5133, lng: 127.1001 },
        { name: '서울역', lat: 37.5546, lng: 126.9706 },
        { name: '홍대입구', lat: 37.5575, lng: 126.9245 },
        { name: '고속터미널', lat: 37.5045, lng: 127.0049 }
    ];

    let allStops: any[] = [];
    for (const hub of hubs) {
        const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getBusSttnListByPosInqire?serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}&_type=json&gpsLati=${hub.lat}&gpsLong=${hub.lng}`;
        const json = await fetchWithRetry(url);
        const items = json?.response?.body?.items?.item || [];
        if (Array.isArray(items)) allStops = [...allStops, ...items];
        else if (items) allStops.push(items);
    }

    if (allStops.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-bus-hubs.json'), JSON.stringify(allStops, null, 2));
        console.log(`✅ Saved ${allStops.length} major bus stops.`);
    }
}

async function main() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    const tasks = [
        processSeoulToilets(),
        processGyeonggiToilets(),
        processNationalToilets(),
        processTrafficWeak(),
        processFacilities(),
        processOperational(),
        processMetadata(),
        processBusHubs()
    ];

    await Promise.all(tasks);
    console.log('✨ Complete Master Database Build Cycle Finished.');
}

main().catch(console.error);
