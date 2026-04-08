const fs = require('fs');
const path = require('path');

/**
 * Safely saves JSON data to a file by validating it against existing data.
 * Prevents "empty data" resets when APIs fail but don't throw errors.
 * 
 * @param {string} filePath - Path to save the JSON file.
 * @param {any} newData - Data to save (typically an array or object).
 * @param {Object} options - Validation options.
 * @param {number} [options.minRatio=0.7] - Minimum ratio of new records compared to old records (0.0 to 1.0).
 * @param {boolean} [options.merge=false] - If true, merges new data into old data instead of replacing.
 * @param {string} [options.uniqueKey='id'] - Key to use for deduplication during merge.
 * @param {boolean} [options.force=false] - If true, ignores validation and overwrites.
 */
function safeSaveJson(filePath, newData, options = {}) {
    const { minRatio = 0.7, merge = false, uniqueKey = 'id', force = false } = options;
    
    console.log(`💾 Safe-Saving: ${path.basename(filePath)}...`);

    let oldData = null;
    const shouldReadOld = (merge || minRatio > 0) && !force;

    if (shouldReadOld && fs.existsSync(filePath)) {
        try {
            // Memory optimization: only read if really needed
            oldData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.warn(`⚠️  Existing file ${filePath} is corrupt. Proceeding with overwrite.`);
        }
    }

    // 1. Basic Type Validation
    if (!newData || (Array.isArray(newData) && newData.length === 0 && !force)) {
        if (oldData) {
            console.error(`❌ Validation Failed: New data is empty, but old data exists. Aborting to prevent reset.`);
            return false;
        }
    }

    // 2. Count-based Validation (for Arrays)
    if (Array.isArray(newData) && Array.isArray(oldData) && !force) {
        const ratio = newData.length / oldData.length;
        if (ratio < minRatio) {
            console.error(`❌ Validation Failed: New data size (${newData.length}) is < ${Math.round(minRatio * 100)}% of old data (${oldData.length}). Aborting.`);
            console.error(`👉 Use --force or check your API quota.`);
            return false;
        }
    }

    // 3. Merging (Optional)
    let finalData = newData;
    if (merge && Array.isArray(newData) && Array.isArray(oldData)) {
        console.log(`🔄 Merging ${newData.length} new records into ${oldData.length} existing records...`);
        const map = new Map();
        oldData.forEach(item => map.set(item[uniqueKey], item));
        newData.forEach(item => map.set(item[uniqueKey], item));
        finalData = Array.from(map.values());
    }

    // 4. Atomic-ish Write
    try {
        const tempPath = `${filePath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(finalData, null, 2));
        fs.renameSync(tempPath, filePath);
        console.log(`✅ ${path.basename(filePath)} saved successfully (${Array.isArray(finalData) ? finalData.length : 'Object'} records).`);
        return true;
    } catch (e) {
        console.error(`❌ Write Failed: ${e.message}`);
        return false;
    }
}

module.exports = { safeSaveJson };
