const fs = require('fs');
const path = require('path');
const { safeSaveJson } = require('./lib/safe-data');

/**
 * Bulk Ingestion Hub: Ingests nationwide data from CSV/JSON bulk files.
 * This script is the core of the 'File-First' architecture.
 */

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const RAW_DIR = path.resolve(process.cwd(), 'data', 'raw');

if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

/**
 * Normalizes CSV row into a structured object based on header mapping.
 */
function parseCsv(content, mapping) {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1);

    return rows.map(row => {
        const values = row.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        for (const [key, csvHeader] of Object.entries(mapping)) {
            const index = headers.indexOf(csvHeader);
            if (index !== -1) {
                obj[key] = values[index];
            }
        }
        return obj;
    });
}

/**
 * 1. SEOUL METRO TRANSFER INFO
 * Source: 서울교통공사_서울 도시철도 환승정보
 */
async function ingestTransfers() {
    console.log('🔄 Ingesting Seoul Metro Transfer Info (CSV)...');
    const csvPath = path.join(RAW_DIR, 'seoul-metro-transfers.csv');
    if (!fs.existsSync(csvPath)) {
        console.warn(`⚠️  Raw file ${csvPath} not found. Skipping.`);
        return;
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const mapping = {
        stationName: 'STIN_NM',
        fromLine: 'LN_NM',
        toLine: 'CHTN_LN_CD',
        platform: 'TRNSIT_POS',
        fastCar: 'CAR_ORDR',
        fastDoor: 'CAR_ETRC_NO'
    };

    const parsed = parseCsv(content, mapping);
    if (parsed.length > 0) {
        safeSaveJson(path.join(DATA_DIR, 'master-transfers.json'), parsed);
    }
}

/**
 * 2. NATIONWIDE PUBLIC TOILETS
 * Source: 전국공중화장실표준데이터
 */
async function ingestToilets() {
    console.log('🚽 Ingesting Nationwide Public Toilets (CSV)...');
    const csvPath = path.join(RAW_DIR, 'nationwide-toilets.csv');
    if (!fs.existsSync(csvPath)) {
        console.warn(`⚠️  Raw file ${csvPath} not found. Skipping.`);
        return;
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const mapping = {
        name: '화장실명',
        lat: '위도',
        lng: '경도',
        address: '소재지도로명주소',
        accessible: '남녀공용화장실여부', // Needs better mapping for accessible
        bell: '비상벨설치여부',
        diaper: '기저귀교환대지점',
        openTime: '개방시간명'
    };

    const parsed = parseCsv(content, mapping).map(t => ({
        ...t,
        lat: parseFloat(t.lat),
        lng: parseFloat(t.lng),
        accessible: t.accessible === 'Y',
        emergencyBell: t.bell === 'Y',
        diapers: t.diaper && t.diaper !== '없음'
    })).filter(t => !isNaN(t.lat) && !isNaN(t.lng));

    if (parsed.length > 0) {
        safeSaveJson(path.join(DATA_DIR, 'master-toilets.json'), parsed);
    }
}

// TODO: Add more bulk ingesters for Bus Stops and Facilities

async function main() {
    const args = process.argv.slice(2);
    const type = args[0];

    if (type === 'transfers') await ingestTransfers();
    else if (type === 'toilets') await ingestToilets();
    else {
        await ingestTransfers();
        await ingestToilets();
    }

    console.log('✅ Bulk ingestion complete.');
}

main().catch(console.error);
