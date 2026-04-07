const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scripts = [
    'scripts/ingest-station-mappings.js',
    'scripts/ingest-route-paths.js',
    'scripts/consolidate-data.js',
    'scripts/ingest-schedules.js'
];

async function runStep(script) {
    console.log(`\n\n🚀 Starting Step: ${script}`);
    console.log('--------------------------------------------------');
    try {
        // Run with increased memory and GC support
        execSync(`node --max-old-space-size=4096 --expose-gc ${script}`, { stdio: 'inherit' });
        console.log(`\n✅ Step Complete: ${script}`);
    } catch (e) {
        console.error(`\n❌ Step Failed: ${script}`);
        console.error(e.message);
        // We continue to next steps if failure is non-fatal for building
    }
}

async function main() {
    console.log('🏁 Resuming Transit Data Pipeline Workflow');
    
    for (const script of scripts) {
        await runStep(script);
    }
    
    console.log('\n\n🏗️  Starting Final Build...');
    try {
        execSync('npm run build', { stdio: 'inherit' });
        console.log('\n✅ Build Complete!');
    } catch (e) {
        console.error('\n❌ Build Failed!');
    }
    
    console.log('\n✨ Workflow Resume Finished.');
}

main();
