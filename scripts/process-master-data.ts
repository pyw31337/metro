import fs from 'fs';
import path from 'path';

/**
 * process-master-data.ts
 * Run: npx ts-node scripts/process-master-data.ts
 * Purpose: Fetch static data from APIs at BUILD TIME and save to public/data/
 */

const API_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';
const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const RAW_DIR = path.join(process.cwd(), 'src', 'data', 'raw');

async function fetchJson(url: string) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function processToilets() {
    console.log('🚽 Processing Toilets...');
    let items: any[] = [];
    
    // Check for local CSV first
    const csvPath = path.join(RAW_DIR, 'toilets.csv');
    if (fs.existsSync(csvPath)) {
        console.log('📄 Found local toilets.csv, processing...');
        // Simple CSV parse (placeholder - in real case would use a library like papaparse)
        const content = fs.readFileSync(csvPath, 'utf-8');
        // Logic to parse CSV to JSON
    } else {
        const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/SearchPublicToiletAndStation/1/1000/`;
        const json = await fetchJson(url);
        items = json?.SearchPublicToiletAndStation?.row || [];
    }

    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-toilets.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} toilets.`);
    } else {
        console.warn('⚠️ No toilet data found (API timeout or missing CSV).');
    }
}

async function processElevators() {
    console.log('🛗 Processing Elevators...');
    let items: any[] = [];
    const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/SearchSubwayStationElevator/1/1000/`;
    const json = await fetchJson(url);
    items = json?.SearchSubwayStationElevator?.row || [];
    
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-elevators.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} elevators.`);
    } else {
        console.warn('⚠️ No elevator data found.');
    }
}

async function processLifts() {
    console.log('♿ Processing Lifts...');
    let items: any[] = [];
    const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/SearchSubwayStationWheelchairLift/1/1000/`;
    const json = await fetchJson(url);
    items = json?.SearchSubwayStationWheelchairLift?.row || [];
    
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-lifts.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} lifts.`);
    } else {
        console.warn('⚠️ No lift data found.');
    }
}

async function processMetadata() {
    console.log('🆔 Processing Metadata...');
    let items: any[] = [];
    const url = `https://openapi.seoul.go.kr:443/${API_KEY}/json/SearchSTNBySubwayLineService/1/1000/`;
    const json = await fetchJson(url);
    items = json?.SearchSTNBySubwayLineService?.row || [];
    
    if (items.length > 0) {
        fs.writeFileSync(path.join(DATA_DIR, 'master-metadata.json'), JSON.stringify(items, null, 2));
        console.log(`✅ Saved ${items.length} metadata records.`);
    } else {
        console.warn('⚠️ No metadata found.');
    }
}

async function main() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

    await processToilets();
    await processElevators();
    await processLifts();
    await processMetadata();

    console.log('✨ Master data processing cycle complete.');
}

main().catch(console.error);
