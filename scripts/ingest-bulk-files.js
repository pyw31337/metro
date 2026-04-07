const fs = require('fs');
const path = require('path');
const { safeSaveJson } = require('./lib/safe-data');

const CSV_PATH = path.resolve(process.cwd(), 'data', 'raw', 'nationwide-bus-stops-utf8.csv');
const OUTPUT_PATH = path.resolve(process.cwd(), 'public', 'data', 'master-bus-stops.json');

async function processBusStops() {
    console.log('📖 Reading nationwide-bus-stops-utf8.csv...');
    if (!fs.existsSync(CSV_PATH)) {
        console.error(`❌ File not found: ${CSV_PATH}`);
        return;
    }

    const content = fs.readFileSync(CSV_PATH, 'utf8');
    const lines = content.split('\n');
    const headers = lines[0].split(',');
    
    console.log(`📊 Processing ${lines.length - 1} records...`);

    // Column mapping (based on previous head -n 5 output)
    // 0: 정류소번호 (stopId/nodeId)
    // 1: 정류소명 (name)
    // 2: 위도 (lat)
    // 3: 경도 (lng)
    // 6: 지자체코드 (cityCode)
    // 7: 관할시군 (region)

    const busStops = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const columns = lines[i].split(',');
        
        if (columns.length < 7) continue;

        const stop = {
            id: columns[0].trim(),
            name: columns[1].trim(),
            lat: parseFloat(columns[2]),
            lng: parseFloat(columns[3]),
            cityCode: columns[6].trim(),
            region: columns[7].trim()
        };

        if (!isNaN(stop.lat) && !isNaN(stop.lng)) {
            busStops.push(stop);
        }

        if (i % 10000 === 0) console.log(`   > ${i} records processed...`);
    }

    console.log(`✨ Processed ${busStops.length} valid bus stops.`);

    // Save using safe-save utility
    safeSaveJson(OUTPUT_PATH, busStops, {
        merge: true,
        uniqueKey: 'id',
        force: true // Forced as we are migrating from API to File-First
    });
}

processBusStops().catch(console.error);
