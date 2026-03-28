"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Train, Bus, Map as MapIcon, Bath, MapPin, Navigation, Locate, X, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as Hangul from "hangul-js";
import { Station } from "@/data/subway-lines";
import { THEME } from "@/theme/design-system";
import type { PathResult, PathStrategy } from "@/utils/pathfinding";
import { useViewportHeight } from "@/hooks/useViewportHeight";

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
}

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
    locatingTimer = 0
}: UnifiedBottomPanelProps) {
    const { keyboardOffset } = useViewportHeight();
    const [destination, setDestination] = useState("");
    const [source, setSource] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [activeField, setActiveField] = useState<"source" | "dest" | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const sourceInputRef = useRef<HTMLInputElement>(null);
    const destInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (endStation !== null) setDestination(endStation);
        if (startStation !== null) setSource(startStation);
    }, [startStation, endStation]);

    const handleSearch = (val: string, type: "source" | "dest") => {
        if (type === "dest") setDestination(val);
        else setSource(val);

        if (!val || val.trim().length === 0) {
            setSearchResults([]);
            return;
        }

        const q = val.toLowerCase().trim();
        const filteredSubway = stations
            .filter(s => matchChosung(q, s.name) || s.name.toLowerCase().includes(q))
            .map(s => ({ ...s, type: 'subway' }))
            .sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                if (aName === q) return -1;
                if (bName === q) return 1;
                return (b as any).lines?.length - (a as any).lines?.length;
            });

        const filteredBus = busStops
            .filter(s => s.name.toLowerCase().includes(q))
            .map(s => ({ ...s, type: 'bus' }))
            .slice(0, 3);

        setSearchResults([...filteredSubway, ...filteredBus].slice(0, 8));
    };

    const selectLocation = (name: string) => {
        if (activeField === "dest") setDestination(name);
        else setSource(name);
        setSearchResults([]);
        setActiveField(null);
    };

    const getLineBadge = (lineStr: string) => {
        const lineColors: Record<string, string> = {
            "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE",
            "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C",
            "9호선": "#BDB092", "수인분당선": "#F5A200", "신분당선": "#D4003B", "경의중앙선": "#77C4A3",
            "공항철도": "#0090D2", "경춘선": "#0C8E72", "인천1호선": "#7CA8D5", "인천2호선": "#ED8B00"
        };
        
        // Clean parentheses and 호선 word
        const cleanLine = lineStr.replace(/[()]/g, "").trim();
        const color = lineColors[cleanLine] || lineColors[cleanLine + "호선"] || "#999999";
        const short = cleanLine.replace("호선", "").replace("철도", "").replace("중앙선", "").replace("분당선", "").substring(0, 1).toUpperCase();
        
        return (
            <span 
                className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black text-white shrink-0 shadow-sm"
                style={{ backgroundColor: color }}
            >
                {short}
            </span>
        );
    };

    const formatStationDisplay = (value: string) => {
        if (!value) return null;
        
        // Handle "My Location" format: "내 위치 : 강남 (내 위치)"
        if (value.startsWith("내 위치")) {
            const parts = value.split(' : ');
            const main = parts[1] || value;
            return <span className="truncate font-bold text-blue-500">{main}</span>;
        }

        const namePart = value.split(' : ').pop() || value;
        // Search for station name and line in parentheses: "천왕(7)" or "천왕 (7호선)"
        const match = namePart.match(/^([^(]+)(\([^)]+\))?$/);
        
        if (match) {
            const stationName = match[1].trim();
            const lineName = match[2];
            return (
                <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="truncate">{stationName}</span>
                    {lineName && getLineBadge(lineName)}
                </div>
            );
        }

        return <span className="truncate">{namePart}</span>;
    };

    const strategies: { id: PathStrategy; label: string; sub: string }[] = [
        { id: "time", label: "최소 시간", sub: "가장 빠른 이동" },
        { id: "transfer", label: "최소 환승", sub: "편안한 이동" },
    ];

    const tabs = [
        { id: "subway", label: "지하철", icon: <Train size={14} /> },
        { id: "bus", label: "버스", icon: <Bus size={14} /> },
        { id: "wc", label: "화장실", icon: <Bath size={14} /> },
    ];

    return (
        <div 
            className="fixed inset-x-0 bottom-0 z-[5000] pointer-events-none flex flex-col items-center transition-all duration-300"
            style={{ bottom: `${keyboardOffset}px` }}
        >
            <motion.div 
                layout
                className={`max-w-lg w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] pointer-events-auto rounded-t-[28px] overflow-hidden ${isCollapsed ? 'translate-y-[calc(100%-44px)]' : 'translate-y-0'}`}
                style={{ paddingBottom: keyboardOffset > 0 ? "8px" : "calc(env(safe-area-inset-bottom) + 8px)" }}
                initial={{ y: 200 }}
                animate={{ y: isCollapsed ? "calc(100% - 44px)" : 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
            >
                {/* 1. Drawer Handle Bar */}
                <div 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-full py-2.5 flex items-center justify-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                >
                    <div className="w-12 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600 transition-colors" />
                </div>

                <div className={`flex flex-col p-3 pt-0 gap-2 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 h-0 pointer-events-none' : 'opacity-100'}`}>
                    {/* 2. Strategy Selector (Ultra-Compact Single Row) */}
                    {pathResults && pathResults.time && pathResults.transfer && (
                        <div className="flex items-center justify-between gap-1.5 bg-zinc-100 dark:bg-white/5 rounded-2xl p-0.5 mb-0.5 border border-black/5 dark:border-white/5">
                            <button 
                                onClick={() => {
                                    if (selectedStrategy === "time") {
                                        setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration");
                                    } else {
                                        onStrategyChange("time");
                                        setTimeDisplayMode("duration");
                                    }
                                }}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${selectedStrategy === "time" ? "bg-blue-500 text-white shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}
                            >
                                <span className={`text-[10px] font-black uppercase tracking-tight ${selectedStrategy === "time" ? "text-white/80" : "opacity-60"}`}>최소시간</span>
                                <span className="text-[13px] font-black">
                                    {timeDisplayMode === "duration" 
                                        ? `${Math.round(pathResults.time.totalWeight)}분` 
                                        : new Date(Date.now() + pathResults.time.totalWeight * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                                    }
                                </span>
                            </button>

                            <div className="w-px h-3 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />

                            <button 
                                onClick={() => {
                                    if (selectedStrategy === "transfer") {
                                        setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration");
                                    } else {
                                        onStrategyChange("transfer");
                                        setTimeDisplayMode("duration");
                                    }
                                }}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${selectedStrategy === "transfer" ? "bg-blue-500 text-white shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}
                            >
                                <span className={`text-[10px] font-black uppercase tracking-tight ${selectedStrategy === "transfer" ? "text-white/80" : "opacity-60"}`}>최소환승</span>
                                <span className="text-[13px] font-black">
                                    {timeDisplayMode === "duration" 
                                        ? `${Math.round(pathResults.transfer.totalWeight)}분` 
                                        : new Date(Date.now() + pathResults.transfer.totalWeight * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                                    }
                                </span>
                            </button>
                        </div>
                    )}

                    {/* Integrated Search Results Extension */}
                    <AnimatePresence mode="wait">
                        {searchResults.length > 0 && activeField && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden border-b border-black/5 dark:border-white/5 mb-2"
                            >
                                <div className="max-h-[180px] overflow-y-auto no-scrollbar py-1">
                                    {searchResults.map((s, i) => (
                                        <button
                                            key={i}
                                            onClick={() => selectLocation(`${s.name} ${s.lines?.[0] || ''}`.trim())}
                                            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-all text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                {s.type === 'subway' ? <Train size={14} className="text-zinc-400" /> : <Bus size={14} className="text-zinc-400" />}
                                                <span className="font-bold text-zinc-900 dark:text-white text-[14px]">{s.name}</span>
                                                {s.type === 'subway' && s.lines?.map((l: string) => (
                                                    <span key={l}>{getLineBadge(l)}</span>
                                                ))}
                                            </div>
                                            <span className="text-[9px] text-zinc-400 font-black uppercase">{s.line || s.id}</span>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 3. Compact Inputs */}
                    <div className="grid grid-cols-2 gap-2 mt-0.5">
                        {/* Locating Feedback */}
                        {isLocating && (
                            <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none">
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-blue-500 text-white text-[11px] font-black px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2"
                                >
                                    <Locate size={12} className="animate-pulse" />
                                    현재 위치 조회 중... {locatingTimer}초
                                </motion.div>
                            </div>
                        )}

                        {/* Destination */}
                        <div className={`relative flex items-center px-3 h-9 bg-zinc-100 dark:bg-white/5 rounded-xl border transition-all ${activeField === "dest" ? "border-blue-500 ring-1 ring-blue-500/20" : "border-transparent"}`}>
                            <span className="text-[11px] font-black text-blue-500 shrink-0 mr-1">도착</span>
                            <div className="relative flex-1 h-full flex items-center px-2 overflow-hidden">
                                {(!activeField || activeField !== "dest") && destination && (
                                    <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none font-bold text-[13px] text-zinc-900 dark:text-white">
                                        {formatStationDisplay(destination)}
                                    </div>
                                )}
                                <input 
                                    ref={destInputRef}
                                    type="text"
                                    placeholder={!destination ? "도착역" : ""}
                                    value={activeField === "dest" ? destination : ""}
                                    onFocus={() => setActiveField("dest")}
                                    onBlur={() => setTimeout(() => setActiveField(null), 200)}
                                    onChange={(e) => handleSearch(e.target.value, "dest")}
                                    className={`w-full bg-transparent border-none outline-none font-bold text-[13px] placeholder:text-zinc-400 text-zinc-900 dark:text-white ${(!activeField || activeField !== "dest") && destination ? "opacity-0" : "opacity-100"}`}
                                />
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {destination && (
                                    <button 
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => { setDestination(""); setSearchResults([]); destInputRef.current?.focus(); }} 
                                        className="p-1 text-zinc-400 hover:text-zinc-600 transition-all"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                                <button onClick={() => onLocate?.("dest")} className="p-1 text-zinc-400 hover:text-blue-500 transition-all active:scale-90">
                                    <Locate size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Source */}
                        <div className={`relative flex items-center px-3 h-9 bg-zinc-100 dark:bg-white/5 rounded-xl border transition-all ${activeField === "source" ? "border-blue-500 ring-1 ring-blue-500/20" : "border-transparent"}`}>
                            <span className="text-[11px] font-black text-blue-500 shrink-0 mr-1">출발</span>
                            <div className="relative flex-1 h-full flex items-center px-2 overflow-hidden">
                                {(!activeField || activeField !== "source") && source && (
                                    <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none font-bold text-[13px] text-zinc-900 dark:text-white">
                                        {formatStationDisplay(source)}
                                    </div>
                                )}
                                <input 
                                    ref={sourceInputRef}
                                    type="text"
                                    placeholder={!source ? "출발역" : ""}
                                    value={activeField === "source" ? source : ""}
                                    onFocus={() => setActiveField("source")}
                                    onBlur={() => setTimeout(() => setActiveField(null), 200)}
                                    onChange={(e) => handleSearch(e.target.value, "source")}
                                    className={`w-full bg-transparent border-none outline-none font-bold text-[13px] placeholder:text-zinc-400 text-zinc-900 dark:text-white ${(!activeField || activeField !== "source") && source ? "opacity-0" : "opacity-100"}`}
                                />
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {source && (
                                    <button 
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => { setSource(""); setSearchResults([]); sourceInputRef.current?.focus(); }} 
                                        className="p-1 text-zinc-400 hover:text-zinc-600 transition-all"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                                <button onClick={() => onLocate?.("source")} className="p-1 text-zinc-400 hover:text-blue-500 transition-all active:scale-90">
                                    <Locate size={14} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 4. Bottom Utility Row (Compact) */}
                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-1 p-0.5 bg-black/5 dark:bg-white/5 rounded-xl">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => onTabChange(tab.id)}
                                    className={`
                                        flex-1 flex flex-col items-center justify-center py-1 rounded-lg transition-all
                                        ${activeTab === tab.id 
                                            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm" 
                                            : "text-zinc-400"
                                        }
                                    `}
                                >
                                    {tab.icon}
                                    <span className="text-[9px] font-black mt-0.5">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={() => onSearch(source, destination)}
                            className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 h-9 px-5 rounded-xl font-black text-[13px] active:scale-95 transition-all"
                        >
                            길찾기
                        </button>
                        <button onClick={onReset} className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-400"><RotateCcw size={16} /></button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
