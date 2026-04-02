import fs from 'fs';
import path from 'path';

/**
 * process-master-data.ts
 * Purpose: Fetch and Pre-process ALL subway materials at BUILD TIME.
 * Priority: 1. Build a local JSON DB from APIs. 2. Handle failures gracefully with partial data.
 */

const API_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';
const DATA_GO_KR_KEY = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || 'sample';
const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const RAW_DIR = path.join(process.cwd(), 'src', 'data', 'raw');

async function fetchWithRetry(url: string, retries = 3, timeout = 10000) {
    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn(`[Retry ${i + 1}/${retries}] Failed to fetch ${url}:`, e instanceof Error ? e.message : String(e));
            if (i === retries - 1) return null;
            await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
        }
    }
}

async function processToilets() {
    console.log('🚽 Processing Seoul Toilets (OA-22726/POI)...');
    const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/SearchPublicToiletAndStation/1/1000/`;
    const json = await fetchWithRetry(url);
    const items = json?.SearchPublicToiletAndStation?.row || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-toilets.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} Seoul toilets.`);
    }
}

async function processNationalToilets() {
    if (DATA_GO_KR_KEY === 'sample') return;
    console.log('🌍 Processing National Toilets (15012892)...');
    const url = `https://api.odcloud.kr/api/15012892/v1/uddi:25c8ddd6-c0a4-4abb-bece-d9b6b0ce85a0?page=1&perPage=1000&serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}`;
    const json = await fetchWithRetry(url);
    const items = json?.data || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-national-toilets.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} National toilets.`);
    }
}

async function processElevators() {
    console.log('🛗 Processing Elevators...');
    const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/SearchSubwayStationElevator/1/1000/`;
    const json = await fetchWithRetry(url);
    const items = json?.SearchSubwayStationElevator?.row || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-elevators.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} elevators.`);
    }
}

async function processLifts() {
    console.log('♿ Processing Lifts...');
    const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/SearchSubwayStationWheelchairLift/1/1000/`;
    const json = await fetchWithRetry(url);
    const items = json?.SearchSubwayStationWheelchairLift?.row || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-lifts.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} lifts.`);
    }
}

async function processDistances() {
    console.log('📏 Processing Distances...');
    const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/SearchStationDistance/1/1000/`;
    const json = await fetchWithRetry(url);
    const items = json?.SearchStationDistance?.row || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-distances.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} distance records.`);
    }
}

async function processDetails() {
    console.log('📞 Processing Detailed Info (Adres/Tel)...');
    const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/StationAdresTelno/1/1000/`;
    const json = await fetchWithRetry(url);
    const items = json?.StationAdresTelno?.row || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-details.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} detailed station records.`);
    }
}

async function processTransfers() {
    if (DATA_GO_KR_KEY === 'sample') return;
    console.log('⚡ Processing Fast Transfers (15151816)...');
    const url = `https://api.odcloud.kr/api/15151816/v1/uddi:e9c2bb71-05e8-4767-8397-9df787ee70f6?page=1&perPage=5000&serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}`;
    const json = await fetchWithRetry(url);
    const items = json?.data || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-transfers.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} fast transfer records.`);
    }
}

async function processParking() {
    if (DATA_GO_KR_KEY === 'sample') return;
    console.log('🚗 Processing Parking Lots (15086929)...');
    const url = `https://api.odcloud.kr/api/15086929/v1/uddi:5e2b02a7-5735-464a-85b5-779836365735?page=1&perPage=1000&serviceKey=${encodeURIComponent(DATA_GO_KR_KEY)}`;
    const json = await fetchWithRetry(url);
    const items = json?.data || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-parking.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} parking lots.`);
    }
}

async function processMetadata() {
    console.log('🆔 Processing Universal Station Metadata...');
    const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/SearchSTNBySubwayLineService/1/1000/`;
    const json = await fetchWithRetry(url);
    const items = json?.SearchSTNBySubwayLineService?.row || [];
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-metadata.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} metadata records.`);
    }
}

async function main() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

    // Run parallel categorization tasks
    const tasks = [
        processToilets(),
        processNationalToilets(),
        processElevators(),
        processLifts(),
        processDistances(),
        processDetails(),
        processTransfers(),
        processParking(),
        processMetadata()
    ];

    await Promise.all(tasks);
    console.log('✨ Full Master Database Build Cycle Complete.');
}

main().catch(console.error);
