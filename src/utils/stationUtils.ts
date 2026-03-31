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

/**
 * Shortens subway line names for circular badges.
 * Examples: "1호선" -> "1", "공항철도" -> "공항", "GTX-A" -> "G-A", "경의중앙선" -> "경의"
 */
export const getLineShortName = (lineName: string): string => {
    if (!lineName) return "";
    const clean = lineName.replace(/[()]/g, "").trim();

    // Specific overrides
    if (clean === "공항철도") return "공항";
    if (clean === "GTX-A") return "G-A";
    if (clean === "경의중앙선") return "경의";
    if (clean === "수인분당선") return "수인";
    if (clean === "신분당선") return "신분";
    if (clean === "경춘선") return "경춘";
    if (clean === "우이신설선") return "우이";
    if (clean === "신림선") return "신림";
    if (clean === "의정부경전철") return "의정";
    if (clean === "에버라인") return "용인";
    if (clean === "김포골드라인") return "김포";
    if (clean === "서해선") return "서해";
    if (clean === "인천1호선") return "인1";
    if (clean === "인천2호선") return "인2";

    // Default: Remove common suffixes and take first character
    return clean.replace(/호선|철도|중앙선|분당선|인천|선/g, "").substring(0, 1).toUpperCase();
};
