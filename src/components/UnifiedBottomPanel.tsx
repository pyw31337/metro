"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { Train, Bus, Bath, MapPin, Navigation, Locate, X, RotateCcw, Baby, Accessibility, Clock, Bell, ArrowUpDown, Share2 } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import * as Hangul from "hangul-js";
import { Station, SUBWAY_LINES, STATION_LINE_IDX } from "@/data/subway-lines";
import { formatStationDisplay, getLineShortName, normalizeStationName, getLineLongName } from "@/utils/stationUtils";
import type { PathResult } from "@/types/metro";
import type { PathStrategy } from "@/store/useRouteStore";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import type { BusPathResult } from "@/utils/busRouting";
import { useIngestion } from "@/hooks/useIngestion";
import IngestionProgress from "./IngestionProgress";
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
    onSelectBusRoute?: (routeNum: string, cityCode?: string) => void;
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

const matchChosung = (query: string, target: string) => {
    if (!query) return false;
    const disassembledQuery = Hangul.disassemble(query).join("");
    const disassembledTarget = Hangul.disassemble(target).join("");
    const isAllChosung = query.split("").every(char => {
        const code = char.charCodeAt(0);
        return code >= 0x3131 && code <= 0x314E;
    });
    if (isAllChosung) {
        const targetChosung = Hangul.disassemble(target, true).map(j => j[0]).join("");
        return targetChosung.includes(query);
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

export default function UnifiedBottomPanel({
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
    activePath,
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
    const { waypoints, removeWaypoint } = useRouteStore();
    const setSelectedBusStop = useSubwayStore(s => s.setSelectedBusStop);
    const { history, addToHistory, clearHistory } = useSearchHistory();
    const [destination, setDestination] = useState("");
    const [source, setSource] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const [activeField, setActiveField] = useState<"source" | "dest" | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [shareCopied, setShareCopied] = useState(false);
    const [noRouteStale, setNoRouteStale] = useState(false); // persists until input changes or route found
    const [now, setNow] = useState(() => Date.now());
    const { tasks, isIngesting } = useIngestion();

    const sourceInputRef = useRef<HTMLInputElement>(null);
    const destInputRef = useRef<HTMLInputElement>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Module-level line color map (static, never changes)
    const lineColorById = useMemo(() => new Map(SUBWAY_LINES.map(l => [l.id, l.color])), []);

    // Per-route memos — only recompute when activePath changes
    const segmentByStation = useMemo(() => {
        const m = new Map<string, { line: string; color: string }>();
        if (!activePath?.segments) return m;
        activePath.segments.forEach(seg => {
            const color = lineColorById.get(seg.line) || LINE_COLORS[seg.line] || '#6b7280';
            seg.stations.forEach(s => m.set(s, { line: seg.line, color }));
        });
        return m;
    }, [activePath, lineColorById]);

    const transferByStation = useMemo(() => {
        const m = new Map(activePath?.transfers?.map(t => [t.stationName, t]) ?? []);
        return m;
    }, [activePath]);

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
        const cleanName = selectedStationName.replace(/역+$/, '');
        const entries = STATION_LINE_IDX.get(cleanName) ?? STATION_LINE_IDX.get(cleanName + '역') ?? [];
        return entries.map(e => ({ num: getLineShortName(e.lineName), color: e.color, lineName: e.lineName }));
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

    const handleSearch = (val: string, type: "source" | "dest") => {
        setNoRouteStale(false);
        if (type === "dest") {
            setDestination(val);
            onSetDestination?.(val);
        } else {
            setSource(val);
            onSetSource?.(val);
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
            const q = raw.replace(/역$/, '').trim() || raw;
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

            const filteredBus = (busStops || [])
                .filter(s => s.name.toLowerCase().includes(q) || s.name.toLowerCase().includes(raw))
                .map(s => ({ ...s, type: 'bus' }))
                .slice(0, 3);

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

        if (activeField === "dest") {
            setDestination(fullName);
            onSetDestination?.(fullName);
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
            <motion.div 
                layout
                className="max-w-lg w-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border-t border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] pointer-events-auto rounded-t-[28px] overflow-visible"
                style={{ paddingBottom: keyboardOffset > 0 ? "8px" : "calc(env(safe-area-inset-bottom) + 8px)" }}
                initial={{ y: 200 }}
                animate={{ y: isCollapsed ? "calc(100% - 44px)" : 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
            >
                <div onClick={() => { hapticLight(); setIsCollapsed(!isCollapsed); }} className="w-full py-2.5 flex items-center justify-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                    <div className="w-12 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600 transition-colors" />
                </div>

                <div className={`flex flex-col p-3 pt-0 gap-2 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 h-0 pointer-events-none' : 'opacity-100'}`}>
                    {activeTab === "subway" && noRouteStale && !pathResults && !isCalculating && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-rose-500/8 dark:bg-rose-500/12 border border-rose-500/20 mb-1"
                        >
                            <span className="text-[12px] font-black text-rose-500">경로를 찾을 수 없습니다</span>
                            <span className="text-[10px] font-bold text-rose-400/70">· 역명을 확인해주세요</span>
                        </motion.div>
                    )}

                    {activeTab === "subway" && pathResults && pathResults.time && pathResults.transfer && (
                        <div className="flex flex-col gap-2 mb-2">
                            <div className="flex items-center justify-between gap-1.5 bg-zinc-100 dark:bg-white/5 rounded-2xl p-0.5 border border-black/5 dark:border-white/5 relative">
                                <button onClick={() => { hapticLight(); if (selectedStrategy === "time") setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration"); else { onStrategyChange("time"); setTimeDisplayMode("duration"); } }} className={`flex-[1.5] flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${selectedStrategy === "time" ? "bg-blue-500 text-white shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${selectedStrategy === "time" ? "text-white/80" : "opacity-60"}`}>최소시간</span>
                                    <span className="text-[13px] font-black">{timeDisplayMode === "duration" ? `${Math.round(pathResults.time.totalWeight || 0)}분` : new Date(now + (pathResults.time.totalWeight || 0) * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                </button>
                                <button onClick={() => { hapticLight(); if (selectedStrategy === "transfer") setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration"); else { onStrategyChange("transfer"); setTimeDisplayMode("duration"); } }} className={`flex-[1.5] flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${selectedStrategy === "transfer" ? "bg-blue-500 text-white shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${selectedStrategy === "transfer" ? "text-white/80" : "opacity-60"}`}>최소환승</span>
                                    <span className="text-[13px] font-black">{timeDisplayMode === "duration" ? `${Math.round(pathResults.transfer.totalWeight || 0)}분` : new Date(now + (pathResults.transfer.totalWeight || 0) * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                </button>
                                <div className="w-px h-3 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />
                                <button onClick={() => { hapticLight(); onToggleShowAll(); }} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${showAllRouteBubbles ? "bg-zinc-800 dark:bg-white text-white dark:text-black shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${showAllRouteBubbles ? "opacity-80" : "opacity-60"}`}>{showAllRouteBubbles ? "축소" : "상세"}</span>
                                    <Navigation size={12} className={showAllRouteBubbles ? "animate-pulse" : ""} />
                                </button>
                            </div>
                            
                            <div className="px-1 py-1">
                                <IngestionProgress tasks={tasks} isVisible={isIngesting} />
                            </div>

                            {/* Premium Route Timeline */}
                            {showAllRouteBubbles && activePath && (
                                <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    className="bg-zinc-50 dark:bg-black/10 rounded-2xl border border-black/5 dark:border-white/5 overflow-hidden"
                                >
                                    <div className="max-h-[240px] overflow-y-auto no-scrollbar p-4 flex flex-col">
                                        {activePath.path.map((stationName, idx) => {
                                            const isStart = idx === 0;
                                            const isEnd = idx === activePath.path.length - 1;
                                            const weight = activePath.weights[idx] ?? 0;
                                            const arrivalTime = new Date(now + weight * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                            const transfer = transferByStation.get(stationName);
                                            const seg = segmentByStation.get(stationName);
                                            const lineColor = seg?.color || '#3b82f6';
                                            const tc = transfer
                                                ? (lineColorById.get(transfer.toLine) || LINE_COLORS[transfer.toLine] || '#3b82f6')
                                                : '#3b82f6';

                                            return (
                                                <div key={idx} className="flex gap-4">
                                                    {/* Timeline Bar */}
                                                    <div className="flex flex-col items-center w-4 relative">
                                                        {!isEnd && (
                                                            <div
                                                                className="absolute top-2 bottom-0 w-[3px] rounded-full"
                                                                style={{ backgroundColor: transfer ? '#d1d5db' : `${lineColor}50` }}
                                                            />
                                                        )}
                                                        <div
                                                            className={`z-10 rounded-full border-2 bg-white dark:bg-zinc-900 mt-1.5 ${isStart || isEnd ? 'h-[12px] w-[12px]' : 'w-[10px] h-[10px]'}`}
                                                            style={{ borderColor: lineColor }}
                                                        />
                                                    </div>

                                                    {/* Station Info */}
                                                    <div className={`flex-1 flex items-center justify-between pb-4 ${!isEnd ? 'border-b border-black/[0.03] dark:border-white/[0.03]' : ''}`}>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[13px] font-bold ${isStart || isEnd ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                                                    {stationName}
                                                                </span>
                                                                {transfer && (
                                                                    <div
                                                                        className="flex items-center gap-1.5 px-2 py-1 rounded-full border shadow-sm"
                                                                        style={{
                                                                            backgroundColor: `${tc}15`,
                                                                            borderColor: `${tc}30`
                                                                        }}
                                                                    >
                                                                        <span className="text-[9px] font-black" style={{ color: tc }}>환승</span>
                                                                        <span className="text-[9px] font-black truncate max-w-[40px] uppercase tracking-tighter" style={{ color: tc }}>{getLineShortName(transfer.toLine)}</span>
                                                                        {transfer.fastTransfer && (
                                                                            <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-blue-500/20">
                                                                                <Clock size={10} className="text-yellow-500 fill-yellow-500/10" />
                                                                                <span className="text-[9px] text-zinc-900 dark:text-white font-black">{transfer.fastTransfer}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="text-[11px] font-black text-zinc-400 font-mono tracking-tight">
                                                            {isStart ? new Date(now).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : arrivalTime}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {/* Fare Information + Share */}
                                        <div className="mt-2 pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-zinc-500 dark:text-zinc-400 font-bold">
                                            <span className="text-[11px]">성인 교통카드 기준</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[13px] text-zinc-900 dark:text-white font-black">{activePath.fare?.toLocaleString()}원</span>
                                                <button
                                                    onClick={() => {
                                                        hapticLight();
                                                        const start = activePath.path[0];
                                                        const end = activePath.path[activePath.path.length - 1];
                                                        const mins = Math.round(activePath.totalWeight || 0);
                                                        const transfers = activePath.transferCount || 0;
                                                        const fare = activePath.fare?.toLocaleString() || '1400';
                                                        const base = `${window.location.origin}${window.location.pathname}`;
                                                        const url = `${base}?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`;
                                                        const text = `[Metro Live] ${start} → ${end}\n소요: ${mins}분 | 환승: ${transfers}회 | 요금: ${fare}원\n${url}`;
                                                        if (navigator.share) {
                                                            navigator.share({ title: 'Metro Live 경로', text, url });
                                                        } else {
                                                            navigator.clipboard?.writeText(text).then(() => {
                                                                hapticSuccess();
                                                                setShareCopied(true);
                                                                setTimeout(() => setShareCopied(false), 2000);
                                                            });
                                                        }
                                                    }}
                                                    className={`p-1 rounded-lg transition-all active:scale-90 ${shareCopied ? 'bg-green-100 dark:bg-green-500/20 text-green-500' : 'bg-zinc-100 dark:bg-white/10 text-zinc-400 hover:text-blue-500'}`}
                                                    title={shareCopied ? '복사됨!' : '경로 공유'}
                                                >
                                                    <Share2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {activeField && (() => {
                            const query = (activeField === "source" ? source : destination).trim();
                            if (searchResults.length > 0) return (
                                <motion.div key="results" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-black/5 dark:border-white/5 mb-2">
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
                                </motion.div>
                            );
                            if (query.length >= 1) return (
                                <motion.div key="no-results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-2 text-center text-[11px] font-bold text-zinc-400 dark:text-zinc-500 mb-1">
                                    &apos;{query}&apos; 검색 결과가 없습니다
                                </motion.div>
                            );
                            if (history.length > 0) return (
                                <motion.div key="history" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-black/5 dark:border-white/5 mb-2">
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
                                </motion.div>
                            );
                            return null;
                        })()}
                    </AnimatePresence>


                    {activeTab === "wc" && <WCPanel />}

                    {activeTab !== "wc" && (
                        <div className="flex flex-col gap-2 mt-0.5 relative">
                            {isLocating && (
                                <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-500 text-white text-[11px] font-black px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2">
                                        <Locate size={12} className="animate-pulse" />
                                        현재 위치 조회 중... {locatingTimer}초
                                    </motion.div>
                                </div>
                            )}
                            {(externalValidationError || validationError) && (
                                <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-zinc-800 text-[11px] px-4 py-1.5 rounded-full shadow-lg border border-red-500/20 pointer-events-auto">
                                        {(externalValidationError || validationError) === "source" ? 
                                            <><span className="text-red-600 font-bold">출발지</span>를 입력해 주세요</> : 
                                            (externalValidationError || validationError) === "dest" ? 
                                            <><span className="text-red-600 font-bold">도착지</span>를 입력해 주세요</> : 
                                            <span className="text-red-600 font-black">경로를 찾을 수 없습니다</span>
                                        }
                                    </motion.div>
                                </div>
                            )}
                            {/* Source (Departure) First */}
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
                            {/* Waypoints */}
                            {waypoints.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    {waypoints.map((wp, idx) => (
                                        <div key={idx} className="flex items-center px-3 h-9 bg-violet-50 dark:bg-violet-950/30 rounded-xl border border-violet-200/50 dark:border-violet-700/30">
                                            <span className="text-[11px] font-black text-violet-500 shrink-0 mr-1">경유</span>
                                            <span className="flex-1 text-[13px] font-bold text-zinc-900 dark:text-white truncate px-2">
                                                {wp.replace(/ \((내 위치|출발|도착|경유)\)/g, '').replace(/^.*? : /, '')}
                                            </span>
                                            <button
                                                onClick={() => { hapticLight(); removeWaypoint(idx); }}
                                                className="p-1 text-violet-400 hover:text-violet-600 transition-all shrink-0"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Swap Button */}
                            {(source || destination) && waypoints.length === 0 && (
                                <div className="flex justify-end -my-0.5 pr-1 z-10 relative">
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
                                        className="p-1.5 rounded-full bg-zinc-200/80 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-blue-100 hover:text-blue-500 dark:hover:bg-blue-500/20 dark:hover:text-blue-400 transition-all active:scale-90 shadow-sm"
                                        title="출발/도착 바꾸기"
                                    >
                                        <ArrowUpDown size={12} />
                                    </button>
                                </div>
                            )}
                            {/* Destination Second */}
                            <div className={`relative flex items-center px-3 h-9 bg-zinc-100 dark:bg-white/5 rounded-xl border transition-all ${activeField === "dest" ? "border-rose-500 ring-1 ring-rose-500/20" : "border-transparent"}`}>
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
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <LayoutGroup id="tab-bar">
                        <div className="flex-1 flex items-center gap-1 p-0.5 bg-black/5 dark:bg-white/5 rounded-xl relative">
                            {TABS.map((tab) => (
                                <button key={tab.id} onClick={() => { hapticLight(); onTabChange(tab.id); }} className={`flex-1 relative flex flex-col items-center justify-center py-1 rounded-lg transition-colors ${activeTab === tab.id ? "text-zinc-900 dark:text-white" : "text-zinc-400"}`}>
                                    {activeTab === tab.id && (
                                        <motion.div
                                            layoutId="tab-indicator"
                                            className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-lg shadow-sm"
                                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        />
                                    )}
                                    <span className="relative z-10">{tab.icon}</span>
                                    <span className="relative z-10 text-[9px] font-black mt-0.5">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        </LayoutGroup>
                        {activeTab !== "wc" && (
                            <>
                                <button disabled={isLocating || isCalculating} onClick={() => { if (!source) { hapticLight(); setValidationError("source"); return; } if (!destination) { hapticLight(); setValidationError("dest"); return; } hapticMedium(); onSearch(source, destination); }} className={`h-9 px-5 rounded-xl font-black text-[13px] transition-all ${isLocating || isCalculating ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed' : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 active:scale-95'}`}>{isCalculating ? '조회중...' : '길찾기'}</button>
                                <button onClick={() => { hapticLight(); onReset?.(); }} className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-400"><RotateCcw size={16} /></button>
                            </>
                        )}
                    </div>

                    {activeTab === 'bus' && selectedBusStop && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-2 p-4 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-black/5 dark:border-white/5 overflow-hidden relative">
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
                        </motion.div>
                    )}

                    {activeTab === 'bus' && busPathResult && !selectedBusStop && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-2 p-4 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-white/20 dark:border-white/5 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">
                                    {busPathResult.type === 'direct' ? '직행 버스' : '환승 버스'}
                                </span>
                                <span className="text-[12px] font-bold text-zinc-400">약 {Math.round(busPathResult.distanceWeight)}분</span>
                            </div>
                            {busPathResult.type === 'direct' ? (
                                <>
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        {busPathResult.commonRoutes.map((r, i) => (
                                            <span key={i} className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[13px] font-black shadow-sm">{r}</span>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-bold">
                                        <MapPin size={10} className="text-blue-500 shrink-0" />
                                        <span>{busPathResult.startStop.name}</span>
                                        <span className="text-zinc-300 dark:text-zinc-600">→</span>
                                        <MapPin size={10} className="text-rose-500 shrink-0" />
                                        <span>{busPathResult.endStop.name}</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            {busPathResult.commonRoutes.map((r, i) => (
                                                <span key={i} className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[13px] font-black shadow-sm">{r}</span>
                                            ))}
                                            <span className="text-[11px] text-zinc-400 font-bold">타고 →</span>
                                            {busPathResult.transferStop && (
                                                <span className="text-[11px] font-black text-zinc-700 dark:text-zinc-300">{busPathResult.transferStop.name}</span>
                                            )}
                                        </div>
                                        {busPathResult.transferRoutes && (
                                            <div className="flex items-center gap-2">
                                                {busPathResult.transferRoutes.map((r, i) => (
                                                    <span key={i} className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-[13px] font-black shadow-sm">{r}</span>
                                                ))}
                                                <span className="text-[11px] text-zinc-400 font-bold">환승</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-bold mt-2">
                                        <MapPin size={10} className="text-blue-500 shrink-0" />
                                        <span>{busPathResult.startStop.name}</span>
                                        <span className="text-zinc-300 dark:text-zinc-600">→</span>
                                        <MapPin size={10} className="text-rose-500 shrink-0" />
                                        <span>{busPathResult.endStop.name}</span>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
