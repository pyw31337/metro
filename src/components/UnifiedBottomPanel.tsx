"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { Train, Bus, Bath, Navigation, Locate, X, RotateCcw, Baby, Accessibility, Bell, ArrowUpDown, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { Station, SUBWAY_LINES } from "@/data/subway-lines";
import { normStation, stationLines } from "@/data/stationRegistry";
import { formatStationDisplay, getLineShortName, normalizeStationName, getLineLongName } from "@/utils/stationUtils";
import type { PathResult } from "@/types/metro";
import type { PathStrategy } from "@/store/useRouteStore";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import type { BusPathResult } from "@/utils/busRouting";
import { getBusRouteStyle } from "@/utils/busRouting";
import { useUIStore } from "@/store/useUIStore";
import { useSubwayStore } from "@/store/useSubwayStore";
import { useRouteStore } from "@/store/useRouteStore";
import { useMapStore } from "@/store/useMapStore";
import { hapticLight, hapticMedium, hapticSuccess } from "@/utils/haptic";
import { useSearchHistory } from "@/hooks/useSearchHistory";

interface UnifiedBottomPanelProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    onSearch: (start: string, end: string) => void;
    onReset?: () => void;
    onLocate?: (type: "source" | "dest") => void;
    startStation: string | null;
    endStation: string | null;
    isDarkMode: boolean;
    stations: Station[];
    busStops: any[];
    selectedStrategy: PathStrategy;
    onStrategyChange: (strategy: PathStrategy) => void;
    pathResults: Record<string, PathResult> | null;
    activePath: PathResult | null;
    timeDisplayMode: "duration" | "arrival";
    setTimeDisplayMode: (mode: "duration" | "arrival") => void;
    isLocating?: boolean;
    locatingTimer?: number;
    isCalculating?: boolean;
    validationError?: "source" | "dest" | "no_route" | null;
    busPathResult?: BusPathResult | null;
    onSetSource?: (val: string) => void;
    onSetDestination?: (val: string) => void;
    showAllRouteBubbles: boolean;
    onToggleShowAll: () => void;
    selectedStationName?: string | null;
    stationArrivals?: any[];
    schedules?: Record<string, any>;
    onSelectStation?: (name: string | null) => void;
    activeLine: string | null;
    onActiveLineChange: (line: string | null) => void;
    selectedBusStop?: any | null;
    onSelectBusRoute?: (routeNum: string, cityCode?: string, routeId?: string) => void;
    userLocation?: [number, number] | null;
    userHeading?: number | null;
}

const LINE_COLORS: Record<string, string> = {
    "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE",
    "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C",
    "9호선": "#BDB092", "수인분당선": "#F5A200", "신분당선": "#D4003B", "경의중앙선": "#77C4A3",
    "공항철도": "#0090D2", "경춘선": "#0C8E72", "인천1호선": "#7CA8D5", "인천2호선": "#ED8B00"
};


const getLineBadge = (lineStr: string) => {
    const cleanLine = lineStr.replace(/[()]/g, "").trim();
    const color = LINE_COLORS[cleanLine] || LINE_COLORS[cleanLine + "호선"] || "#999999";
    const short = getLineShortName(cleanLine);
    return (
        <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black text-white shrink-0 shadow-sm" style={{ backgroundColor: color }}>
            {short}
        </span>
    );
};

const TABS = [
    { id: "subway", label: "지하철", icon: <Train size={14} /> },
    { id: "bus", label: "버스", icon: <Bus size={14} /> },
    { id: "wc", label: "화장실", icon: <Bath size={14} /> },
];

// Inline Korean jamo decomposition (no external dependency)
const _CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const _JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const _JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function _disassemble(str: string): string {
    return str.split('').map(ch => {
        const c = ch.charCodeAt(0);
        if (c < 0xAC00 || c > 0xD7A3) return ch;
        const o = c - 0xAC00;
        return _CHO[Math.floor(o / 28 / 21)] + _JUNG[Math.floor(o / 28) % 21] + _JONG[o % 28];
    }).join('');
}
function _chosung(str: string): string {
    return str.split('').map(ch => {
        const c = ch.charCodeAt(0);
        return (c >= 0xAC00 && c <= 0xD7A3) ? _CHO[Math.floor((c - 0xAC00) / 28 / 21)] : ch;
    }).join('');
}

const matchChosung = (query: string, target: string) => {
    if (!query) return false;
    const disassembledQuery = _disassemble(query);
    const disassembledTarget = _disassemble(target);
    const isAllChosung = query.split("").every(char => {
        const code = char.charCodeAt(0);
        return code >= 0x3131 && code <= 0x314E;
    });
    if (isAllChosung) {
        return _chosung(target).includes(query);
    }
    return disassembledTarget.includes(disassembledQuery);
};

const SuggestionItem = memo(({ 
    item, 
    isActive, 
    onClick, 
    onMouseEnter,
    getLineBadge 
}: { 
    item: any; 
    isActive: boolean; 
    onClick: () => void; 
    onMouseEnter: () => void;
    getLineBadge: (line: string) => React.ReactNode;
}) => (
    <button 
        onClick={onClick} 
        onMouseEnter={onMouseEnter} 
        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
            isActive ? "bg-zinc-100 dark:bg-white/10" : "hover:bg-zinc-100/50 dark:hover:bg-white/5"
        }`}
    >
        <div className="flex items-center gap-2">
            {item.type === 'subway' ? (
                <Train size={14} className={isActive ? "text-blue-500" : "text-zinc-400"} />
            ) : (
                <Bus size={14} className={isActive ? "text-emerald-500" : "text-zinc-400"} />
            )}
            <span className={`font-bold text-[14px] ${isActive ? "text-blue-600 dark:text-blue-400" : "text-zinc-900 dark:text-white"}`}>
                {item.name}
            </span>
            {item.type === 'subway' && item.lines?.map((l: string) => (
                <span key={l}>{getLineBadge(l)}</span>
            ))}
        </div>
        <span className="text-[9px] text-zinc-400 font-black uppercase tracking-tighter">
            {item.line || item.id}
        </span>
    </button>
));

SuggestionItem.displayName = "SuggestionItem";

// ─────────────────────────────────────────────────────────────────────────────
// WC 패널: 검색 + 필터 + 주변 화장실 목록
// ─────────────────────────────────────────────────────────────────────────────
const WCPanel = memo(() => {
    const { wcFilters, updateWcFilter } = useUIStore();
    const { nearestWCs, selectedWC, wcItems } = useSubwayStore();
    const setSelectedWC = useSubwayStore(s => s.setSelectedWC);
    const userLocation = useMapStore(s => s.userLocation);
    const [wcQuery, setWcQuery] = useState("");

    const formatDist = useCallback((wc: typeof nearestWCs[0]) => {
        if (!userLocation) return null;
        const R = 6371000;
        const dLat = (wc.lat - userLocation[0]) * Math.PI / 180;
        const dLon = (wc.lng - userLocation[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(userLocation[0]*Math.PI/180)*Math.cos(wc.lat*Math.PI/180)*Math.sin(dLon/2)**2;
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return d < 1000 ? `${Math.round(d)}m` : `${(d/1000).toFixed(1)}km`;
    }, [userLocation]);

    const filterDefs = [
        { key: 'accessible' as const, icon: <Accessibility size={12} />, label: '장애인' },
        { key: 'diapers'    as const, icon: <Baby size={12} />,          label: '기저귀' },
        { key: 'emergencyBell' as const, icon: <Bell size={12} />,       label: '비상벨' },
    ];

    const applyFilters = useCallback((list: typeof nearestWCs) =>
        list.filter(wc => {
            if (wcFilters.accessible && !wc.accessible) return false;
            if (wcFilters.diapers && !wc.diapers) return false;
            if (wcFilters.emergencyBell && !wc.emergencyBell) return false;
            return true;
        }), [wcFilters]);

    const searchResults = useMemo(() => {
        const q = wcQuery.trim();
        if (!q) return null;
        const lower = q.toLowerCase();
        return wcItems
            .filter(wc => {
                const haystack = [wc.name, wc.station, wc.address, wc.location]
                    .filter(Boolean).join(" ").toLowerCase();
                return haystack.includes(lower);
            })
            .slice(0, 20);
    }, [wcQuery, wcItems]);

    const displayList = searchResults
        ? applyFilters(searchResults)
        : applyFilters(nearestWCs);

    const isSearchMode = searchResults !== null;

    return (
        <div className="flex flex-col gap-2.5 py-1">
            {/* 검색 입력 */}
            <div className="relative">
                <Bath size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                    type="text"
                    value={wcQuery}
                    onChange={e => setWcQuery(e.target.value)}
                    placeholder="역명·지역명으로 검색"
                    className="w-full pl-8 pr-8 py-2 rounded-xl text-[13px] font-bold bg-zinc-100 dark:bg-white/8 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 border border-transparent focus:border-blue-400/50 outline-none transition-all"
                />
                {wcQuery && (
                    <button onClick={() => setWcQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors">
                        <X size={13} />
                    </button>
                )}
            </div>

            {/* 필터 칩 */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest shrink-0">필터</span>
                <div className="flex gap-1.5">
                    {filterDefs.map(({ key, icon, label }) => {
                        const active = wcFilters[key];
                        return (
                            <button
                                key={key}
                                onClick={() => { hapticLight(); updateWcFilter(key, !wcFilters[key]); }}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border transition-all active:scale-95 ${
                                    active
                                        ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                                        : 'bg-zinc-100 dark:bg-white/5 border-transparent text-zinc-500 dark:text-zinc-400'
                                }`}
                            >
                                {icon}
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 화장실 목록 */}
            {!isSearchMode && nearestWCs.length === 0 ? (
                <div className="py-3 text-center text-[11px] font-bold text-zinc-400 dark:text-zinc-500">
                    위 검색창에서 역명으로 찾거나<br/>위치를 허용하면 주변 화장실이 표시됩니다
                </div>
            ) : displayList.length === 0 ? (
                <div className="py-2 text-center text-[11px] font-bold text-zinc-400 dark:text-zinc-500">
                    {isSearchMode ? `"${wcQuery}" 검색 결과 없음` : '필터에 맞는 화장실이 없습니다'}
                </div>
            ) : (
                <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto no-scrollbar">
                    {(isSearchMode ? displayList : displayList.slice(0, 5)).map(wc => {
                        const isSelected = selectedWC?.id === wc.id;
                        return (
                            <button
                                key={wc.id}
                                onClick={() => { hapticLight(); setSelectedWC(isSelected ? null : wc); }}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all active:scale-[0.98] ${
                                    isSelected
                                        ? 'bg-blue-500/10 border-blue-500/30 dark:bg-blue-500/15'
                                        : 'bg-zinc-50 dark:bg-white/5 border-transparent hover:bg-zinc-100 dark:hover:bg-white/10'
                                }`}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <Bath size={12} className={isSelected ? 'text-blue-500' : 'text-zinc-400'} />
                                    <span className={`text-[12px] font-bold truncate ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-800 dark:text-white'}`}>
                                        {wc.name?.replace(' 화장실', '')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                    {wc.accessible && <Accessibility size={10} className="text-blue-400" />}
                                    {wc.diapers    && <Baby size={10}          className="text-amber-400" />}
                                    {wc.emergencyBell && <Bell size={10}       className="text-rose-400" />}
                                    {(() => {
                                        const dist = formatDist(wc);
                                        return dist ? <span className="text-[9px] font-black text-zinc-400">{dist}</span> : null;
                                    })()}
                                    {!userLocation && wc.station && (
                                        <span className="text-[9px] text-zinc-400 font-bold">{wc.station}</span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
});
WCPanel.displayName = "WCPanel";

const UnifiedBottomPanel = memo(function UnifiedBottomPanel({
    activeTab,
    onTabChange,
    onSearch,
    onReset,
    onLocate,
    startStation,
    endStation,
    isDarkMode,
    stations,
    busStops,
    selectedStrategy,
    onStrategyChange,
    pathResults,
    timeDisplayMode,
    setTimeDisplayMode,
    isLocating = false,
    locatingTimer = 0,
    isCalculating = false,
    validationError: externalValidationError = null,
    busPathResult = null,
    onSetSource,
    onSetDestination,
    showAllRouteBubbles,
    onToggleShowAll,
    selectedStationName,
    stationArrivals,
    schedules,
    onSelectStation,
    activeLine,
    onActiveLineChange,
    selectedBusStop,
    onSelectBusRoute
}: UnifiedBottomPanelProps) {
    const { keyboardOffset } = useViewportHeight();
    const { waypoints, addWaypoint, removeWaypoint, moveWaypoint } = useRouteStore();
    const setSelectedBusStop = useSubwayStore(s => s.setSelectedBusStop);
    const { history, addToHistory, clearHistory } = useSearchHistory();
    const [destination, setDestination] = useState("");
    const [source, setSource] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const [activeField, setActiveField] = useState<"source" | "dest" | "waypoint" | null>(null);
    const [waypointInput, setWaypointInput] = useState("");
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const [noRouteStale, setNoRouteStale] = useState(false); // persists until input changes or route found
    const [now, setNow] = useState(() => Date.now());

    const sourceInputRef = useRef<HTMLInputElement>(null);
    const destInputRef = useRef<HTMLInputElement>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const routeUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);


    // O(1) station lookup by name (both "역명" and "역명역" variants)
    const stationByName = useMemo(() => {
        const m = new Map<string, Station>();
        for (const s of stations) {
            m.set(s.name, s);
            if (!s.name.endsWith('역')) m.set(s.name + '역', s);
        }
        return m;
    }, [stations]);

    const badges = useMemo(() => {
        if (!selectedStationName) return [];
        return stationLines(selectedStationName).map(e => ({ num: getLineShortName(e.lineName), color: e.color, lineName: e.lineName }));
    }, [selectedStationName]);

    useEffect(() => {
        if (badges.length > 0 && (!activeLine || !badges.find(b => b.lineName === activeLine))) {
            onActiveLineChange(badges[0].lineName);
        }
    }, [badges, activeLine, onActiveLineChange]);

    // Auto-locate on Bus tab switch
    useEffect(() => {
        if (activeTab === "bus" && !source && onLocate) {
            onLocate("source");
        }
    }, [activeTab, onLocate]);

    useEffect(() => {
        if (validationError) {
            const timer = setTimeout(() => setValidationError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [validationError]);

    // Keep "now" fresh so arrival times in route display don't go stale
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (endStation !== null) setDestination(endStation);
        if (startStation !== null) setSource(startStation);
        if (pathResults) { setSearchResults([]); setIsCollapsed(false); setNoRouteStale(false); }
    }, [startStation, endStation, pathResults]);

    // When external error says no_route, latch the stale state
    useEffect(() => {
        if (externalValidationError === 'no_route') setNoRouteStale(true);
    }, [externalValidationError]);

    const handleSearch = (val: string, type: "source" | "dest" | "waypoint") => {
        setNoRouteStale(false);
        // Local state updates immediately for responsive input display
        if (type === "dest") setDestination(val);
        else if (type === "waypoint") setWaypointInput(val);
        else setSource(val);

        // Debounce store update to avoid triggering route calculation on every keystroke
        if (type !== "waypoint") {
            if (routeUpdateRef.current) clearTimeout(routeUpdateRef.current);
            routeUpdateRef.current = setTimeout(() => {
                if (type === "dest") onSetDestination?.(val);
                else onSetSource?.(val);
            }, 400);
        }

        if (!val || val.trim().length === 0) {
            setSearchResults([]);
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
            return;
        }

        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            const raw = val.toLowerCase().trim();
            // Strip common Korean station suffixes so "강남역" finds "강남"
            const q = normStation(raw) || raw;
            const filteredSubway = stations
                .filter(s => matchChosung(q, s.name) || matchChosung(raw, s.name) || s.name.toLowerCase().includes(q))
                .map(s => ({ ...s, type: 'subway' }))
                .sort((a, b) => {
                    const aName = a.name.toLowerCase();
                    const bName = b.name.toLowerCase();
                    if (aName === q) return -1;
                    if (bName === q) return 1;
                    return (b as any).lines?.length - (a as any).lines?.length;
                });

            // Early-termination bus stop search — can be 50K+ items
            const filteredBus: any[] = [];
            for (const s of (busStops || [])) {
                const n = s.name.toLowerCase();
                if (n.includes(q) || n.includes(raw)) {
                    filteredBus.push({ ...s, type: 'bus' });
                    if (filteredBus.length === 3) break;
                }
            }

            setSearchResults([...filteredSubway, ...filteredBus].slice(0, 8));
            setActiveIndex(-1);
        }, 100);
    };

    const selectLocation = (s: any) => {
        hapticLight();
        const line = s.lines?.[0] || '';
        let fullName = s.name;
        if (line && !s.name.includes(line.replace('호선', ''))) {
            fullName = `${s.name} (${line.replace('호선', '')})`;
        }

        // Cancel any pending debounced route update — we'll set immediately on selection
        if (routeUpdateRef.current) clearTimeout(routeUpdateRef.current);

        if (activeField === "dest") {
            setDestination(fullName);
            onSetDestination?.(fullName);
        } else if (activeField === "waypoint") {
            addWaypoint(fullName);
            setWaypointInput("");
        } else {
            setSource(fullName);
            onSetSource?.(fullName);
        }
        setSearchResults([]);
        setActiveField(null);
        addToHistory({ name: s.name, type: s.type || 'subway', lines: s.lines, id: s.id });
    };


    const formatInputDisplay = (value: string, isDest: boolean = false) => {
        if (!value) return null;
        let stationName = value;
        let lineInfo = "";
        let isMyLocation = false;
        if (value.startsWith("내 위치")) {
            isMyLocation = true;
            const parts = value.split(' : ');
            stationName = parts[1] || value;
            stationName = stationName.replace(/ \((내 위치|출발|도착|경유)\)/g, '').trim();
        }
        const namePart = stationName.split(' : ').pop() || stationName;
        stationName = namePart;
        const lineMatch = namePart.match(/^(.*?)\s*\(?(\d+호선|[\uac00-\ud7af]+\d*선|공항철도|\d+)\)?$/);
        if (lineMatch) {
            stationName = lineMatch[1].trim();
            lineInfo = lineMatch[2].trim();
        }
        if (!lineInfo && stations) {
            const found = stationByName.get(stationName) ?? stationByName.get(stationName + "역");
            if (found && found.lines && found.lines.length > 0) lineInfo = found.lines[0];
        }
        return (
            <div className={`flex items-center gap-1.5 overflow-hidden font-bold ${isMyLocation ? (isDest ? 'text-rose-500' : 'text-blue-500') : ''}`}>
                <span className="truncate">{stationName}</span>
                {lineInfo && getLineBadge(lineInfo)}
                {isMyLocation && <span className="text-[10px] opacity-70 ml-1 font-black shrink-0">내 위치</span>}
            </div>
        );
    };


    return (
        <div className="fixed inset-x-0 bottom-0 z-[5000] pointer-events-none flex flex-col items-center transition-all duration-300" style={{ bottom: `${keyboardOffset}px` }}>
            <div
                className="animate-panel-in max-w-lg w-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border-t border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] pointer-events-auto rounded-t-[28px] overflow-visible"
                style={{
                    paddingBottom: keyboardOffset > 0 ? "8px" : "calc(env(safe-area-inset-bottom) + 8px)",
                    transform: isCollapsed ? 'translateY(calc(100% - 44px))' : 'translateY(0)',
                    transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
            >
                <div onClick={() => { hapticLight(); setIsCollapsed(!isCollapsed); }} className="w-full py-2.5 flex items-center justify-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                    <div className="w-12 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600 transition-colors" />
                </div>

                <div className={`flex flex-col p-3 pt-0 gap-2 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 h-0 pointer-events-none' : 'opacity-100'}`}>
                    {activeTab === "subway" && noRouteStale && !pathResults && !isCalculating && (
                        <div className="animate-fade-in-up flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-rose-500/8 dark:bg-rose-500/12 border border-rose-500/20 mb-1">
                            <span className="text-[12px] font-black text-rose-500">경로를 찾을 수 없습니다</span>
                            <span className="text-[10px] font-bold text-rose-400/70">· 역명을 확인해주세요</span>
                        </div>
                    )}

                    {activeTab === "subway" && pathResults && pathResults.time && pathResults.transfer && (
                        <div className="flex flex-col gap-2 mb-2">
                            <div className="flex items-center justify-between gap-1.5 bg-zinc-100 dark:bg-white/5 rounded-2xl p-0.5 border border-black/5 dark:border-white/5 relative">
                                <button onClick={() => { hapticLight(); if (selectedStrategy === "time") setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration"); else { onStrategyChange("time"); setTimeDisplayMode("duration"); } }} className={`flex-[1.5] flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${selectedStrategy === "time" ? "bg-blue-500 text-white shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${selectedStrategy === "time" ? "text-white/80" : "opacity-60"}`}>최단시간</span>
                                    <span className="text-[13px] font-black">{timeDisplayMode === "duration" ? `${Math.round(pathResults.time.totalWeight || 0)}분` : new Date(now + (pathResults.time.totalWeight || 0) * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                    <span className={`text-[9px] font-semibold ${selectedStrategy === "time" ? "text-white/70" : "text-zinc-400 dark:text-zinc-500"}`}>{pathResults.time.transferCount === 0 ? "직통" : `${pathResults.time.transferCount}환승`}</span>
                                </button>
                                <button onClick={() => { hapticLight(); if (selectedStrategy === "transfer") setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration"); else { onStrategyChange("transfer"); setTimeDisplayMode("duration"); } }} className={`flex-[1.5] flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${selectedStrategy === "transfer" ? "bg-blue-500 text-white shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${selectedStrategy === "transfer" ? "text-white/80" : "opacity-60"}`}>최소환승</span>
                                    <span className="text-[13px] font-black">{timeDisplayMode === "duration" ? `${Math.round(pathResults.transfer.totalWeight || 0)}분` : new Date(now + (pathResults.transfer.totalWeight || 0) * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                    <span className={`text-[9px] font-semibold ${selectedStrategy === "transfer" ? "text-white/70" : "text-zinc-400 dark:text-zinc-500"}`}>{pathResults.transfer.transferCount === 0 ? "직통" : `${pathResults.transfer.transferCount}환승`}</span>
                                </button>
                                <div className="w-px h-3 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />
                                <button onClick={() => { hapticLight(); onToggleShowAll(); }} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${showAllRouteBubbles ? "bg-zinc-800 dark:bg-white text-white dark:text-black shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${showAllRouteBubbles ? "opacity-80" : "opacity-60"}`}>{showAllRouteBubbles ? "축소" : "상세"}</span>
                                    <Navigation size={12} className={showAllRouteBubbles ? "animate-pulse" : ""} />
                                </button>
                            </div>
                            
                        </div>
                    )}

                    {activeField && (() => {
                        const query = (activeField === "source" ? source : activeField === "dest" ? destination : waypointInput).trim();
                        if (searchResults.length > 0) return (
                            <div className="animate-fade-in-up overflow-hidden border-b border-black/5 dark:border-white/5 mb-2">
                                <div className="max-h-[180px] overflow-y-auto no-scrollbar py-1">
                                    {searchResults.map((s, i) => (
                                        <SuggestionItem
                                            key={`${s.type}-${s.id || s.name}-${i}`}
                                            item={s}
                                            isActive={activeIndex === i}
                                            onClick={() => selectLocation(s)}
                                            onMouseEnter={() => setActiveIndex(i)}
                                            getLineBadge={getLineBadge}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                        if (query.length >= 1) return (
                            <div className="animate-fade-in-up py-2 text-center text-[11px] font-bold text-zinc-400 dark:text-zinc-500 mb-1">
                                &apos;{query}&apos; 검색 결과가 없습니다
                            </div>
                        );
                        if (history.length > 0) return (
                            <div className="animate-fade-in-up overflow-hidden border-b border-black/5 dark:border-white/5 mb-2">
                                <div className="flex items-center justify-between px-3 py-1.5">
                                    <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">최근 검색</span>
                                    <button onClick={clearHistory} className="text-[9px] font-bold text-zinc-400 hover:text-rose-500 transition-colors">지우기</button>
                                </div>
                                <div className="py-0.5">
                                    {history.map((h, i) => (
                                        <SuggestionItem
                                            key={`hist-${h.name}-${i}`}
                                            item={h}
                                            isActive={false}
                                            onClick={() => selectLocation(h)}
                                            onMouseEnter={() => {}}
                                            getLineBadge={getLineBadge}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                        return null;
                    })()}


                    {activeTab === "wc" && <WCPanel />}

                    {activeTab !== "wc" && (
                        <div className="flex flex-col gap-2 mt-0.5 relative">
                            {isLocating && (
                                <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
                                    <div className="animate-fade-in-up bg-blue-500 text-white text-[11px] font-black px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2">
                                        <Locate size={12} className="animate-pulse" />
                                        현재 위치 조회 중... {locatingTimer}초
                                    </div>
                                </div>
                            )}
                            {(externalValidationError || validationError) && (
                                <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
                                    <div className="animate-fade-in-up bg-white dark:bg-zinc-800 text-[11px] px-4 py-1.5 rounded-full shadow-lg border border-red-500/20 pointer-events-auto">
                                        {(externalValidationError || validationError) === "source" ?
                                            <><span className="text-red-600 font-bold">출발지</span>를 입력해 주세요</> :
                                            (externalValidationError || validationError) === "dest" ?
                                            <><span className="text-red-600 font-bold">도착지</span>를 입력해 주세요</> :
                                            <span className="text-red-600 font-black">경로를 찾을 수 없습니다</span>
                                        }
                                    </div>
                                </div>
                            )}
                            {/* Row 1: 도착지 입력 + [+경유지][바꾸기] 정사각형 버튼 */}
                            <div className="flex items-center gap-1.5">
                                <div className={`relative flex items-center px-3 h-9 flex-1 bg-zinc-100 dark:bg-white/5 rounded-xl border transition-all ${activeField === "dest" ? "border-rose-500 ring-1 ring-rose-500/20" : "border-transparent"}`}>
                                    <span className="text-[11px] font-black text-rose-500 shrink-0 mr-1">도착</span>
                                    <div className="relative flex-1 h-full flex items-center px-2 overflow-hidden">
                                        {(!activeField || activeField !== "dest") && destination && (<div className="absolute inset-y-0 left-2 flex items-center pointer-events-none font-bold text-[13px] text-zinc-900 dark:text-white">{formatInputDisplay(destination, true)}</div>)}
                                        <input ref={destInputRef} type="text" placeholder={!destination ? "도착역" : ""} value={activeField === "dest" ? destination : ""} onFocus={() => { setActiveField("dest"); setActiveIndex(-1); }} onBlur={() => setTimeout(() => { if(activeField === "dest") setActiveField(null); }, 250)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(p => (p + 1) % searchResults.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(p => (p - 1 + searchResults.length) % searchResults.length); } else if (e.key === 'Enter') { if (activeIndex >= 0 && searchResults[activeIndex]) { const s = searchResults[activeIndex]; selectLocation(s); } else if (destination) { setActiveField(null); } } }} onChange={(e) => handleSearch(e.target.value, "dest")} className={`w-full bg-transparent border-none outline-none font-bold text-[13px] placeholder:text-zinc-400 text-zinc-900 dark:text-white ${(!activeField || activeField !== "dest") && destination ? "opacity-0" : "opacity-100"}`} />
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {destination && (<button onMouseDown={(e) => e.preventDefault()} onClick={() => { setDestination(""); setSearchResults([]); destInputRef.current?.focus(); }} className="p-1 text-zinc-400 hover:text-zinc-600 transition-all"><X size={14} /></button>)}
                                        <button disabled={isLocating} onClick={() => onLocate?.("dest")} className={`p-1 transition-all active:scale-90 ${isLocating ? 'text-zinc-200 cursor-not-allowed' : 'text-zinc-400 hover:text-blue-500'}`}><Locate size={14} /></button>
                                    </div>
                                </div>
                                {/* + 경유지 버튼 (정사각형) */}
                                <button
                                    onClick={() => {
                                        hapticLight();
                                        setWaypointInput("");
                                        setActiveField(activeField === "waypoint" ? null : "waypoint");
                                        setSearchResults([]);
                                    }}
                                    className={`w-9 h-9 flex items-center justify-center rounded-xl shrink-0 transition-all active:scale-90 ${activeField === "waypoint" ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-white/5 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10'}`}
                                    title="경유지 추가"
                                >
                                    <Plus size={16} />
                                </button>
                                {/* 출발↔도착 바꾸기 버튼 (정사각형) */}
                                <button
                                    onClick={() => {
                                        hapticLight();
                                        const prevSource = source;
                                        const prevDest = destination;
                                        setSource(prevDest);
                                        setDestination(prevSource);
                                        onSetSource?.(prevDest);
                                        onSetDestination?.(prevSource);
                                        setSearchResults([]);
                                        setActiveField(null);
                                    }}
                                    className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0 bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:bg-blue-100 hover:text-blue-500 dark:hover:bg-blue-500/20 dark:hover:text-blue-400 transition-all active:scale-90"
                                    title="출발/도착 바꾸기"
                                >
                                    <ArrowUpDown size={16} />
                                </button>
                            </div>
                            {/* Waypoints */}
                            {waypoints.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    {waypoints.map((wp, idx) => (
                                        <div key={idx} className="flex items-center px-2 h-9 bg-violet-50 dark:bg-violet-950/30 rounded-xl border border-violet-200/50 dark:border-violet-700/30">
                                            <span className="text-[11px] font-black text-violet-500 shrink-0 mr-1">경유</span>
                                            <span className="flex-1 text-[13px] font-bold text-zinc-900 dark:text-white truncate px-1">
                                                {wp.replace(/ \((내 위치|출발|도착|경유)\)/g, '').replace(/^.*? : /, '')}
                                            </span>
                                            {/* 순서 이동 버튼 */}
                                            <div className="flex shrink-0">
                                                <button
                                                    disabled={idx === 0}
                                                    onClick={() => { hapticLight(); moveWaypoint(idx, idx - 1); }}
                                                    className="p-1 text-violet-400 disabled:opacity-20 active:scale-90 transition-all"
                                                ><ChevronUp size={13} /></button>
                                                <button
                                                    disabled={idx === waypoints.length - 1}
                                                    onClick={() => { hapticLight(); moveWaypoint(idx, idx + 1); }}
                                                    className="p-1 text-violet-400 disabled:opacity-20 active:scale-90 transition-all"
                                                ><ChevronDown size={13} /></button>
                                            </div>
                                            <button onClick={() => { hapticLight(); removeWaypoint(idx); }} className="p-1 text-violet-400 hover:text-violet-600 transition-all shrink-0"><X size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Waypoint Input Row */}
                            {activeField === "waypoint" && (
                                <div className="flex items-center px-3 h-9 bg-violet-50 dark:bg-violet-950/30 rounded-xl border border-violet-400/50 ring-1 ring-violet-400/20">
                                    <span className="text-[11px] font-black text-violet-500 shrink-0 mr-1">경유</span>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="경유역 검색"
                                        value={waypointInput}
                                        onChange={(e) => handleSearch(e.target.value, "waypoint")}
                                        onKeyDown={(e) => {
                                            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(p => (p + 1) % searchResults.length); }
                                            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(p => (p - 1 + searchResults.length) % searchResults.length); }
                                            else if (e.key === 'Enter') { if (activeIndex >= 0 && searchResults[activeIndex]) selectLocation(searchResults[activeIndex]); }
                                            else if (e.key === 'Escape') { setActiveField(null); setWaypointInput(""); setSearchResults([]); }
                                        }}
                                        onBlur={() => setTimeout(() => { if (activeField === "waypoint") { setActiveField(null); setWaypointInput(""); setSearchResults([]); } }, 250)}
                                        className="flex-1 bg-transparent border-none outline-none font-bold text-[13px] placeholder:text-violet-300 text-zinc-900 dark:text-white px-2"
                                    />
                                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setActiveField(null); setWaypointInput(""); setSearchResults([]); }} className="p-1 text-violet-400 hover:text-violet-600 transition-all"><X size={14} /></button>
                                </div>
                            )}
                            {/* Row 2: 출발지 입력 (전체 너비) */}
                            <div className={`relative flex items-center px-3 h-9 bg-zinc-100 dark:bg-white/5 rounded-xl border transition-all ${activeField === "source" ? "border-blue-500 ring-1 ring-blue-500/20" : "border-transparent"}`}>
                                <span className="text-[11px] font-black text-blue-500 shrink-0 mr-1">출발</span>
                                <div className="relative flex-1 h-full flex items-center px-2 overflow-hidden">
                                    {(!activeField || activeField !== "source") && source && (<div className="absolute inset-y-0 left-2 flex items-center pointer-events-none font-bold text-[13px] text-zinc-900 dark:text-white">{formatInputDisplay(source)}</div>)}
                                    <input ref={sourceInputRef} type="text" placeholder={!source ? "출발역" : ""} value={activeField === "source" ? source : ""} onFocus={() => { setActiveField("source"); setActiveIndex(-1); }} onBlur={() => setTimeout(() => { if(activeField === "source") setActiveField(null); }, 250)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(p => (p + 1) % searchResults.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(p => (p - 1 + searchResults.length) % searchResults.length); } else if (e.key === 'Enter') { if (activeIndex >= 0 && searchResults[activeIndex]) { const s = searchResults[activeIndex]; selectLocation(s); } else if (source) { setActiveField(null); } } }} onChange={(e) => handleSearch(e.target.value, "source")} className={`w-full bg-transparent border-none outline-none font-bold text-[13px] placeholder:text-zinc-400 text-zinc-900 dark:text-white ${(!activeField || activeField !== "source") && source ? "opacity-0" : "opacity-100"}`} />
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {source && (<button onMouseDown={(e) => e.preventDefault()} onClick={() => { setSource(""); setSearchResults([]); sourceInputRef.current?.focus(); }} className="p-1 text-zinc-400 hover:text-zinc-600 transition-all"><X size={14} /></button>)}
                                    <button disabled={isLocating} onClick={() => onLocate?.("source")} className={`p-1 transition-all active:scale-90 ${isLocating ? 'text-zinc-200 cursor-not-allowed' : 'text-zinc-400 hover:text-blue-500'}`}><Locate size={14} /></button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-1 p-0.5 bg-black/5 dark:bg-white/5 rounded-xl relative">
                            {TABS.map((tab) => (
                                <button key={tab.id} onClick={() => { hapticLight(); onTabChange(tab.id); }} className={`flex-1 relative flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${activeTab === tab.id ? "text-zinc-900 dark:text-white" : "text-zinc-400"}`}>
                                    <div className={`absolute inset-0 bg-white dark:bg-zinc-800 rounded-lg shadow-sm transition-opacity duration-200 ${activeTab === tab.id ? 'opacity-100' : 'opacity-0'}`} />
                                    <span className="relative z-10">{tab.icon}</span>
                                    <span className="relative z-10 text-[9px] font-black mt-0.5">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        {activeTab !== "wc" && (
                            <>
                                <button disabled={isLocating || isCalculating} onClick={() => { if (!source) { hapticLight(); setValidationError("source"); return; } if (!destination) { hapticLight(); setValidationError("dest"); return; } hapticMedium(); onSearch(source, destination); }} className={`h-9 px-5 rounded-xl font-black text-[13px] transition-all ${isLocating || isCalculating ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed' : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 active:scale-95'}`}>{isCalculating ? '조회중...' : '길찾기'}</button>
                                <button onClick={() => { hapticLight(); onReset?.(); }} className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-400"><RotateCcw size={16} /></button>
                            </>
                        )}
                    </div>

                    {activeTab === 'bus' && selectedBusStop && (
                        <div className="animate-fade-in-up mb-2 p-4 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-black/5 dark:border-white/5 overflow-hidden relative">
                            <div className="absolute top-2 right-2">
                                <button onClick={() => { hapticLight(); setSelectedBusStop(null); }} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 active:scale-90 transition-all">
                                    <X size={14} />
                                </button>
                            </div>
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                        <Bus size={18} />
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="text-[16px] font-black">{selectedBusStop.name}</h3>
                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{selectedBusStop.region || '경기'} · {selectedBusStop.id}</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    {(typeof selectedBusStop.routes === 'string' ? JSON.parse(selectedBusStop.routes) : (selectedBusStop.routes || [])).map((r: string, i: number) => (
                                        <button
                                            key={i}
                                            onClick={() => { hapticLight(); onSelectBusRoute?.(r, selectedBusStop.cityCode); }}
                                            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 dark:text-emerald-400 hover:text-white text-[12px] font-black border border-emerald-500/20 transition-all active:scale-95"
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <button
                                        onClick={() => { hapticLight(); onSetSource?.(selectedBusStop.name); onSetDestination?.(""); }}
                                        className="h-9 rounded-xl bg-blue-500 text-white text-[12px] font-black shadow-sm active:scale-95 transition-all"
                                    >
                                        출발지로 설정
                                    </button>
                                    <button
                                        onClick={() => { hapticLight(); onSetDestination?.(selectedBusStop.name); }}
                                        className="h-9 rounded-xl bg-rose-500 text-white text-[12px] font-black shadow-sm active:scale-95 transition-all"
                                    >
                                        도착지로 설정
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'bus' && busPathResult && !selectedBusStop && (
                        <div className="animate-fade-in-up mt-2 p-4 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-white/20 dark:border-white/5 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">
                                    {busPathResult.type === 'direct' ? '직행 버스' : '환승 버스'}
                                </span>
                                <span className="text-[12px] font-bold text-zinc-400">약 {Math.round(busPathResult.distanceWeight)}분</span>
                            </div>
                            {/* Timeline visualization */}
                            <div className="flex flex-col">
                                {/* Start stop */}
                                <div className="flex items-start gap-2.5">
                                    <div className="flex flex-col items-center mt-0.5 shrink-0">
                                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-200 dark:ring-blue-900" />
                                        <div className="w-px bg-zinc-200 dark:bg-zinc-700 mt-1" style={{ minHeight: 28 }} />
                                    </div>
                                    <div className="pb-2 min-w-0 flex-1">
                                        <div className="text-[12px] font-black text-zinc-700 dark:text-zinc-200 truncate">{busPathResult.startStop.name}</div>
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {busPathResult.commonRoutes.map((r, i) => {
                                                const s = getBusRouteStyle(r);
                                                return <span key={i} className="px-2.5 py-0.5 rounded-lg text-[12px] font-black shadow-sm" style={{ background: s.bg, color: s.text }}>{r}</span>;
                                            })}
                                            <span className="text-[11px] text-zinc-400 font-bold self-center">탑승</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Transfer stop (only for transfer type) */}
                                {busPathResult.type === 'transfer' && busPathResult.transferStop && (
                                    <div className="flex items-start gap-2.5">
                                        <div className="flex flex-col items-center mt-0.5 shrink-0">
                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-100 dark:ring-amber-900" />
                                            <div className="w-px bg-zinc-200 dark:bg-zinc-700 mt-1" style={{ minHeight: 28 }} />
                                        </div>
                                        <div className="pb-2 min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-amber-500 mb-0.5 uppercase tracking-wide">환승</div>
                                            <div className="text-[12px] font-black text-zinc-700 dark:text-zinc-200 truncate">{busPathResult.transferStop.name}</div>
                                            {busPathResult.transferRoutes && (
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {busPathResult.transferRoutes.map((r, i) => {
                                                        const s = getBusRouteStyle(r);
                                                        return <span key={i} className="px-2.5 py-0.5 rounded-lg text-[12px] font-black shadow-sm" style={{ background: s.bg, color: s.text }}>{r}</span>;
                                                    })}
                                                    <span className="text-[11px] text-zinc-400 font-bold self-center">탑승</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {/* End stop */}
                                <div className="flex items-center gap-2.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200 dark:ring-rose-900 shrink-0 mt-0.5" />
                                    <div className="text-[12px] font-black text-zinc-700 dark:text-zinc-200 truncate">{busPathResult.endStop.name}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default UnifiedBottomPanel;
