const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const STOPS_FILE = path.join(DATA_DIR, 'master-bus-stops.json');
const SEARCH_DIR = path.join(DATA_DIR, 'search');

if (!fs.existsSync(SEARCH_DIR)) fs.mkdirSync(SEARCH_DIR, { recursive: true });

async function main() {
    console.log('🔍 Generating Optimized Search Indices...');
    
    if (!fs.existsSync(STOPS_FILE)) return console.error('❌ master-bus-stops.json not found!');
    const stops = JSON.parse(fs.readFileSync(STOPS_FILE, 'utf8'));
    console.log(`   ✅ Loaded ${stops.length} bus stops.`);

    const shards = {};
    for (const s of stops) {
        // Use cityCode if available, fallback to some regional grouping
        // cityCode often starts with region prefix (11=Seoul, 23=Incheon, 41=Gyeonggi)
        const regionPrefix = s.cityCode ? String(s.cityCode).substring(0, 2) : 'unknown';
        if (!shards[regionPrefix]) shards[regionPrefix] = [];
        
        // Minify search record: [name, id, lat, lng, arsId]
        shards[regionPrefix].push([
            s.name,
            s.id,
            parseFloat(s.lat),
            parseFloat(s.lng),
            s.arsId || ""
        ]);
    }

    for (const [prefix, data] of Object.entries(shards)) {
        const shardFile = path.join(SEARCH_DIR, `search-${prefix}.json`);
        fs.writeFileSync(shardFile, JSON.stringify(data));
        console.log(`   💾 Saved ${data.length} stops to search-${prefix}.json (${Math.round(fs.statSync(shardFile).size / 1024)} KB)`);
    }

    // Also create a master "region-manifest" for the frontend to know which shard to load
    const manifest = Object.keys(shards).sort();
    fs.writeFileSync(path.join(SEARCH_DIR, 'manifest.json'), JSON.stringify(manifest));

    console.log('🎉 Search Index Generation Complete!');
}

main().catch(console.error);
