const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data');
const ROUTES_FILE = path.join(DATA_DIR, 'master-bus-routes.json');
const PARTIAL_FILE = path.join(DATA_DIR, 'master-bus-routes-partial.json');

function merge() {
    if (!fs.existsSync(PARTIAL_FILE)) {
        console.log('❌ No partial file found.');
        return;
    }

    const checkpoint = JSON.parse(fs.readFileSync(PARTIAL_FILE, 'utf8'));
    console.log(`📦 Merging ${checkpoint.routes.length} collected routes into master...`);

    let existing = [];
    if (fs.existsSync(ROUTES_FILE)) {
        existing = JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf8'));
    }

    const unique = new Map();
    existing.forEach(r => unique.set(r.id, r));
    checkpoint.routes.forEach(r => unique.set(r.id, r));

    const final = Array.from(unique.values());
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(final, null, 2));
    
    console.log(`✅ Merged! Total Unique Routes: ${final.length}`);
    if (fs.existsSync(PARTIAL_FILE)) fs.unlinkSync(PARTIAL_FILE);
}

merge();
