#!/usr/bin/env node
/**
 * build-tiles.js
 * 31MB master-bus-stops.json + 8.3MB master-toilets.json을
 * 0.1도 그리드 타일로 분할합니다.
 *
 * 출력:
 *   public/data/bus-tiles/{latFloor}_{lngFloor}.json
 *   public/data/bus-tiles/_index.json
 *   public/data/wc-tiles/{latFloor}_{lngFloor}.json
 *   public/data/wc-tiles/_index.json
 */

const fs = require('fs');
const path = require('path');

const TILE_SIZE = 0.1; // degrees

function tileKey(lat, lng) {
    const latFloor = Math.floor(lat / TILE_SIZE);
    const lngFloor = Math.floor(lng / TILE_SIZE);
    return `${latFloor}_${lngFloor}`;
}

function buildTiles(inputPath, outputDir, getLatLng) {
    console.log(`\n▶ Processing ${path.basename(inputPath)}...`);
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    console.log(`  ${data.length.toLocaleString()} items`);

    fs.mkdirSync(outputDir, { recursive: true });

    const tiles = new Map();
    let skipped = 0;

    for (const item of data) {
        const { lat, lng } = getLatLng(item);
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) { skipped++; continue; }
        const key = tileKey(lat, lng);
        if (!tiles.has(key)) tiles.set(key, []);
        tiles.get(key).push(item);
    }

    const index = [];
    let maxSize = 0;
    let totalBytes = 0;

    for (const [key, items] of tiles) {
        const [latFloor, lngFloor] = key.split('_').map(Number);
        const json = JSON.stringify(items);
        const bytes = Buffer.byteLength(json, 'utf8');
        fs.writeFileSync(path.join(outputDir, `${key}.json`), json);
        index.push({ key, count: items.length, lat: latFloor * TILE_SIZE, lng: lngFloor * TILE_SIZE });
        if (bytes > maxSize) maxSize = bytes;
        totalBytes += bytes;
    }

    fs.writeFileSync(path.join(outputDir, '_index.json'), JSON.stringify(index));

    console.log(`  ✓ ${tiles.size} tiles written to ${outputDir}`);
    console.log(`  Largest tile: ${(maxSize / 1024).toFixed(1)} KB`);
    console.log(`  Total tile data: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Skipped (no coords): ${skipped}`);
}

// ── 버스 정류장 ──────────────────────────────────────────────────────────────
buildTiles(
    'public/data/master-bus-stops.json',
    'public/data/bus-tiles',
    item => ({ lat: item.lat, lng: item.lng })
);

// ── 화장실 ───────────────────────────────────────────────────────────────────
buildTiles(
    'public/data/master-toilets.json',
    'public/data/wc-tiles',
    item => ({ lat: item.lat, lng: item.lng })
);

console.log('\n✅ Done.');
