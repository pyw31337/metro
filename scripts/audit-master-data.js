const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const ROUTES_FILE = path.join(DATA_DIR, 'master-bus-routes.json');
const STOPS_FILE = path.join(DATA_DIR, 'master-bus-stops.json');
const STATIONS_FILE = path.join(DATA_DIR, 'master-route-stations.json');
const SHARDS_DIR = path.join(DATA_DIR, 'paths');

async function audit() {
    process.stdout.write('\x1Bc');
    console.log('🧐 Starting Advanced Data Integrity & Quality Audit (V2)');
    console.log('------------------------------------------------------');

    const issues = [];
    const KR_BOUNDS = { lat: [33.0, 39.0], lng: [124.0, 131.0] };

    // 1. Audit master-bus-routes.json
    let totalRoutes = 0;
    if (fs.existsSync(ROUTES_FILE)) {
        const routes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
        totalRoutes = routes.length;
        console.log(`🚌 Routes: ${totalRoutes} items`);
        
        const invalidRoutes = routes.filter(r => !r.id || !r.no || !r.cityCode);
        if (invalidRoutes.length > 0) {
            issues.push({ level: 'CRITICAL', type: 'INVALID_FIELDS', msg: `${invalidRoutes.length} routes have missing ID, No, or cityCode` });
        }

        const ids = routes.map(r => r.id);
        const uniqueIds = new Set(ids);
        if (ids.length !== uniqueIds.size) {
            issues.push({ level: 'WARNING', type: 'DUPLICATE_IDS', msg: `${ids.length - uniqueIds.size} duplicate Route IDs found` });
        }
    }

    // 2. Audit master-bus-stops.json (Sanity + Coords)
    let stopMap = new Set();
    if (fs.existsSync(STOPS_FILE)) {
        const stops = JSON.parse(fs.readFileSync(STOPS_FILE, 'utf8'));
        console.log(`🚏 Stops: ${stops.length} items`);
        
        const outOfBounds = stops.filter(s => 
            s.lat < KR_BOUNDS.lat[0] || s.lat > KR_BOUNDS.lat[1] ||
            s.lng < KR_BOUNDS.lng[0] || s.lng > KR_BOUNDS.lng[1]
        );
        if (outOfBounds.length > 0) {
            issues.push({ level: 'CRITICAL', type: 'OUT_OF_BOUNDS', msg: `${outOfBounds.length} stops outside South Korea territory`, sample: outOfBounds[0].name });
        }

        stops.forEach(s => stopMap.add(String(s.id)));
    }

    // 3. Audit master-route-stations.json (Integration)
    if (fs.existsSync(STATIONS_FILE)) {
        const stations = JSON.parse(fs.readFileSync(STATIONS_FILE, 'utf8'));
        const routeIds = Object.keys(stations);
        console.log(`🔗 Route-Station Mapping: ${routeIds.length} routes`);
        
        const coverage = (routeIds.length / totalRoutes * 100).toFixed(2);
        console.log(`   📉 Coverage: ${coverage}%`);
        
        if (routeIds.length < totalRoutes * 0.9) {
            issues.push({ level: 'CRITICAL', type: 'GAPPED_DATA', msg: `Station mapping coverage is dangerously low: ${coverage}%` });
        }

        let missingStops = 0;
        routeIds.slice(0, 100).forEach(rid => {
            stations[rid].forEach(s => {
                if (!stopMap.has(String(s.id))) missingStops++;
            });
        });
        if (missingStops > 0) {
            issues.push({ level: 'WARNING', type: 'ORPHANED_STATIONS', msg: `Found ${missingStops} station IDs in mapping not present in master-bus-stops.json (sampled first 100 routes)` });
        }
    }

    // 4. Audit Shards (Integrity)
    if (fs.existsSync(SHARDS_DIR)) {
        const files = fs.readdirSync(SHARDS_DIR).filter(f => f.endsWith('.json'));
        let fatalJson = 0;
        let emptyShards = 0;
        
        files.forEach(f => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(SHARDS_DIR, f), 'utf8'));
                if (Object.keys(data).length === 0) emptyShards++;
            } catch (e) { fatalJson++; }
        });
        
        if (fatalJson > 0) issues.push({ level: 'FATAL', type: 'JSON_ERR', msg: `${fatalJson} shard files have invalid JSON syntax` });
        if (emptyShards > 0) issues.push({ level: 'INFO', type: 'PROGRESS', msg: `${emptyShards} shards initialized but empty (pending collection)` });
    }

    console.log('\n--- 📝 Audit Summary ---');
    if (issues.length === 0) {
        console.log('✅ Crystal Clear! No major issues found in existing data.');
    } else {
        console.table(issues);
    }
}

audit();
