/**
 * Master Station Registry
 * Resolves naming discrepancies (e.g. "서울" vs "서울역") and provides canonical identification.
 */

export interface StationAlias {
    canonical: string;
    aliases: string[];
    codes?: Record<string, string>; // Line -> Code mapping
}

const STATION_ALIASES: StationAlias[] = [
    {
        canonical: "서울역",
        aliases: ["서울", "서울(1)", "서울(4)", "서울(경의중앙)", "서울(공항철도)"],
        codes: {
            "1호선": "0150",
            "4호선": "0426",
            "경의중앙선": "1291",
            "공항철도": "4201"
        }
    },
    {
        canonical: "남영",
        aliases: ["남영역"]
    },
    {
        canonical: "용산역",
        aliases: ["용산"]
    },
    {
        canonical: "청량리역",
        aliases: ["청량리", "청량리(지상)", "청량리(광장)"]
    },
    {
        canonical: "회기",
        aliases: ["회기역"]
    },
    {
        canonical: "인천역",
        aliases: ["인천"]
    },
    {
        canonical: "수원역",
        aliases: ["수원"]
    }
];

/**
 * Normalizes a station name to its canonical version.
 */
export const getCanonicalName = (name: string): string => {
    const clean = name.trim().replace(/역+$/, ''); 
    const entry = STATION_ALIASES.find(t => 
        t.canonical === clean || 
        t.canonical === name ||
        t.aliases.includes(clean) || 
        t.aliases.includes(name)
    );
    return entry ? entry.canonical : clean; 
};

/**
 * Returns all possible names (canonical + aliases) for a station.
 * Useful for broad database searches.
 */
export const getAllStationNames = (name: string): string[] => {
    const clean = name.trim().replace(/역+$/, ''); 
    const entry = STATION_ALIASES.find(t => 
        t.canonical === clean || 
        t.canonical === name ||
        t.aliases.includes(clean) || 
        t.aliases.includes(name)
    );
    if (!entry) return [clean, `${clean}역`];
    return Array.from(new Set([entry.canonical, ...entry.aliases]));
};
