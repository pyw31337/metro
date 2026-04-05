const fs = require('fs');
const path = require('path');

/**
 * Decodes a Google Polyline string into a list of [lat, lng] coordinates.
 */
function decodePolyline(encoded) {
    const points = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;
    while (index < len) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;
        shift = 0; result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;
        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
}

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const SHARDS_DIR = path.join(DATA_DIR, 'paths');
const ROUTES_FILE = path.join(DATA_DIR, 'master-bus-routes.json');

async function verify() {
    process.stdout.write('\x1Bc'); // Clear screen
    console.log('🧪 Starting Advanced Shard Data Integrity & Quality Check');
    console.log('---------------------------------------------------------');

    if (!fs.existsSync(SHARDS_DIR)) return console.error('❌ Shards directory not found.');
    if (!fs.existsSync(ROUTES_FILE)) return console.error('❌ master-bus-routes.json not found.');

    const allRoutes = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    const files = fs.readdirSync(SHARDS_DIR).filter(f => f.endsWith('.json'));
    
    console.log(`📊 Total Master Routes: ${allRoutes.length}`);
    console.log(`📂 Found ${files.length} shard files.`);

    const report = [];
    let totalPathsInShards = 0;
    let totalInvalidPoints = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(SHARDS_DIR, file);
        const cityCode = file.match(/bus-paths-(\w+)\.json/)?.[1] || 'unknown';
        
        process.stdout.write(`\r🔍 Verifying [${cityCode}] (${i + 1}/${files.length})...`);

        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const ids = Object.keys(data);
            const count = ids.length;
            totalPathsInShards += count;

            if (count === 0) {
                report.push({ city: cityCode, status: 'EMPTY', count: 0, quality: '-' });
                continue;
            }

            let avgPoints = 0;
            let invalidInShard = 0;
            
            // Validate ALL paths in shard for coordinate sanity
            for (const id of ids) {
                const encoded = data[id];
                const points = decodePolyline(encoded);
                
                avgPoints += points.length;
                const isSane = points.every(p => 
                    p[0] > 33.0 && p[0] < 39.0 && // Korea Latitude
                    p[1] > 124.0 && p[1] < 131.0  // Korea Longitude
                );
                
                if (!isSane || points.length < 2) invalidInShard++;
            }

            totalInvalidPoints += invalidInShard;
            avgPoints = Math.round(avgPoints / count);

            // Determine Quality Level
            // High: > 20 points avg (Curved geometry)
            // Medium: 5-20 points (Likely OSRM or many stops)
            // Low: < 5 points (Likely basic fallback)
            let quality = 'High';
            if (avgPoints < 5) quality = 'Low';
            else if (avgPoints < 20) quality = 'Medium';

            report.push({ 
                city: cityCode, 
                status: invalidInShard > 0 ? `INVALID(${invalidInShard})` : 'OK', 
                count, 
                avgPoints,
                quality
            });

        } catch (e) {
            report.push({ city: cityCode, status: 'FATAL', error: e.message });
        }
    }

    console.log('\n\n✅ Verification Complete!\n');
    console.table(report);

    const coverage = (totalPathsInShards / allRoutes.length * 100).toFixed(2);
    console.log('---------------------------------------------------------');
    console.log(`📈 GLOBAL COVERAGE: ${coverage}% (${totalPathsInShards}/${allRoutes.length})`);
    console.log(`🚫 INVALID PATHS: ${totalInvalidPoints}`);
    console.log(`💎 DATA QUALITY: ${report.filter(r => r.quality === 'High').length} High, ${report.filter(r => r.quality === 'Medium').length} Mid, ${report.filter(r => r.quality === 'Low').length} Low`);
    console.log('---------------------------------------------------------');
}

verify().catch(console.error);
