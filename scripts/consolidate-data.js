const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const SHARDS_DIR = path.join(DATA_DIR, 'paths');
const OUTPUT_FILE = path.join(DATA_DIR, 'master-bus-route-paths.json');

async function main() {
    console.log('📦 Consolidating Bus Route Path Shards...');
    
    if (!fs.existsSync(SHARDS_DIR)) {
        console.error('❌ Shards directory not found!');
        process.exit(1);
    }

    const files = fs.readdirSync(SHARDS_DIR).filter(f => f.endsWith('.json'));
    console.log(`🔍 Found ${files.length} shards.`);

    const masterPaths = {};
    let totalRoutes = 0;
    let emptyShards = 0;

    for (const file of files) {
        const filePath = path.join(SHARDS_DIR, file);
        try {
            const stats = fs.statSync(filePath);
            if (stats.size <= 2) {
                emptyShards++;
                continue;
            }

            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const keys = Object.keys(data);
            if (keys.length > 0) {
                Object.assign(masterPaths, data);
                totalRoutes += keys.length;
                process.stdout.write('.');
            }
        } catch (e) {
            console.error(`\n⚠️  Failed to parse ${file}: ${e.message}`);
        }
    }

    console.log(`\n✨ Consolidation complete. Total routes with paths: ${totalRoutes}`);
    if (emptyShards > 0) console.log(`⚠️  Skipped ${emptyShards} empty shards.`);
    
    if (totalRoutes > 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(masterPaths));
        console.log(`💾 Saved to ${OUTPUT_FILE}`);
    } else {
        console.error('❌ No valid paths found to consolidate!');
    }
}

main().catch(console.error);
