/**
 * Standardizes station names for display and internal logic.
 * Handles "(5)", "5호선", and suffixes like "(내 위치)".
 */
export const normalizeStationName = (s: string): string => {
    if (!s) return "";
    
    // 1. Remove markers like (내 위치), (출발), etc.
    let name = s.split(' : ').pop() || s;
    name = name.replace(/\(내 위치\)|\(출발\)|\(도착\)|\(경유\)/g, '').trim();
    
    // 2. Remove trailing "역" if it's not part of the base name (e.g., 서울역 -> 서울)
    // Most stations in our data are just "강남", "홍대입구".
    if (name.endsWith("역") && name.length > 2) {
        name = name.slice(0, -1);
    }
    
    // 3. Keep only the base part for searching if it's "Name (Line)"
    // but we need to be careful with "Yangpyeong (5)" -> "Yangpyeong"
    name = name.split(' ')[0].trim();
    
    return name;
};

/**
 * Resolves a potentially varied user input to an exact graph key.
 * Example: "양평 (5)", "양평 5", "양평 5호선" -> "양평(5호선)"
 */
export const resolveGraphNode = (name: string, graphKeys: string[]): string => {
    if (!name) return name;
    
    const keysSet = new Set(graphKeys);
    if (keysSet.has(name)) return name;

    // Standardize input
    let clean = name.replace(/\s+/g, "");
    clean = clean.replace(/\((\d+)\)/, "($1호선)"); // (5) -> (5호선)
    if (!clean.includes("호선") && clean.match(/\d+$/)) {
        clean = clean.replace(/(\d+)$/, "($1호선)"); // 양평 5 -> 양평(5호선)
    }

    if (keysSet.has(clean)) return clean;

    // Fuzzy match: If input is "양평", and there is "양평(5호선)", take the first match
    for (const key of graphKeys) {
        if (key === clean) return key;
        if (key.startsWith(clean + "(")) return key; // Exact base match with suffix
        if (key.includes(clean)) return key;
    }
    
    return name;
};

/**
 * Formats a station for display in lists or input fields.
 * Example: { name: "양평(5호선)", lines: ["5호선"] } -> "양평 (5)"
 */
export const formatStationDisplay = (name: string, line: string = ""): string => {
    let base = name;
    let suffix = line.replace('호선', '');
    
    // If name is "양평(5호선)", extract base
    if (name.includes('(')) {
        const match = name.match(/^(.*)\((.*)\)$/);
        if (match) {
            base = match[1];
            if (!suffix) suffix = match[2].replace('호선', '');
        }
    }
    
    return suffix ? `${base} (${suffix})` : base;
};
