"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Train, Bus, Map as MapIcon, Bath, MapPin, Navigation, Locate, X, RotateCcw, Baby, Accessibility, Car, Clock, Phone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as Hangul from "hangul-js";
import { Station, SUBWAY_LINES } from "@/data/subway-lines";
import { formatStationDisplay, getLineShortName, normalizeStationName, getLineLongName } from "@/utils/stationUtils";
import { ArrivalHeader, ArrivalItemListItem } from "./map/ArrivalInfo";
import type { PathResult, PathStrategy } from "@/utils/pathfinding";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import type { BusPathResult } from "@/utils/busRouting";
import { db } from "@/services/db";
import { Facility } from "@/types/metro";
import { useIngestion } from "@/hooks/useIngestion";
import IngestionProgress from "./IngestionProgress";

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
    onActiveLineChange
}: UnifiedBottomPanelProps) {
    const { keyboardOffset } = useViewportHeight();
    const [destination, setDestination] = useState("");
    const [source, setSource] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const [activeField, setActiveField] = useState<"source" | "dest" | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [stationFacilities, setStationFacilities] = useState<Facility[]>([]);
    const [hasDiapers, setHasDiapers] = useState(false);
    const { tasks, isIngesting } = useIngestion();

    const sourceInputRef = useRef<HTMLInputElement>(null);
    const destInputRef = useRef<HTMLInputElement>(null);

    const badges = useMemo(() => {
        if (!selectedStationName) return [];
        const cleanName = selectedStationName.replace(/역+$/, '');
        const b: { num: string; color: string; lineName: string }[] = [];
        const addedLines = new Set<string>();

        for (const line of SUBWAY_LINES) {
            if (line.stations.some(s => s.name === cleanName || s.name === cleanName + '역')) {
                if (!addedLines.has(line.name)) {
                    b.push({ 
                        num: getLineShortName(line.name), 
                        color: line.color,
                        lineName: line.name
                    });
                    addedLines.add(line.name);
                }
            }
        }
        return b;
    }, [selectedStationName, stations]);

    useEffect(() => {
        if (badges.length > 0 && (!activeLine || !badges.find(b => b.lineName === activeLine))) {
            onActiveLineChange(badges[0].lineName);
        }
    }, [badges, activeLine, onActiveLineChange]);

    useEffect(() => {
        if (selectedStationName) {
            const cleanName = selectedStationName.replace(/역$/, '');
            db.getStationFacilities(cleanName).then(setStationFacilities);
            
            // Try matching station name in WC table with flexibility
            db.wc.where('station').startsWith(cleanName).first().then(wc => {
                if (wc) setHasDiapers(!!wc.diapers);
                else {
                    // Try another variant if direct query fails
                    db.wc.filter(x => x.name.includes(cleanName)).first().then(w => setHasDiapers(!!w?.diapers));
                }
            });
        } else {
            setStationFacilities([]);
            setHasDiapers(false);
        }
    }, [selectedStationName]);

    useEffect(() => {
        if (validationError) {
            const timer = setTimeout(() => setValidationError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [validationError]);

    useEffect(() => {
        if (endStation !== null) setDestination(endStation);
        if (startStation !== null) setSource(startStation);
        if (pathResults) setSearchResults([]);
    }, [startStation, endStation, pathResults]);

    const handleSearch = (val: string, type: "source" | "dest") => {
        if (type === "dest") {
            setDestination(val);
            onSetDestination?.(val);
        } else {
            setSource(val);
            onSetSource?.(val);
        }

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

        const filteredBus = (busStops || [])
            .filter(s => s.name.toLowerCase().includes(q))
            .map(s => ({ ...s, type: 'bus' }))
            .slice(0, 3);

        setSearchResults([...filteredSubway, ...filteredBus].slice(0, 8));
        setActiveIndex(-1);
    };

    const selectLocation = (s: any) => {
        const line = s.lines?.[0] || '';
        let fullName = s.name;
        // If the station name doesn't already contain the line info, append it cleanly
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
    };

    const getLineBadge = (lineStr: string) => {
        const lineColors: Record<string, string> = {
            "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE",
            "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C",
            "9호선": "#BDB092", "수인분당선": "#F5A200", "신분당선": "#D4003B", "경의중앙선": "#77C4A3",
            "공항철도": "#0090D2", "경춘선": "#0C8E72", "인천1호선": "#7CA8D5", "인천2호선": "#ED8B00"
        };
        const cleanLine = lineStr.replace(/[()]/g, "").trim();
        const color = lineColors[cleanLine] || lineColors[cleanLine + "호선"] || "#999999";
        const short = getLineShortName(cleanLine);
        return (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black text-white shrink-0 shadow-sm" style={{ backgroundColor: color }}>
                {short}
            </span>
        );
    };

    const formatStationDisplay = (value: string, isDest: boolean = false) => {
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
            const found = stations.find(s => s.name === stationName || s.name === stationName + "역");
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

    const tabs = [
        { id: "subway", label: "지하철", icon: <Train size={14} /> },
        { id: "bus", label: "버스", icon: <Bus size={14} /> },
        { id: "wc", label: "화장실", icon: <Bath size={14} /> },
    ];

    return (
        <div className="fixed inset-x-0 bottom-0 z-[5000] pointer-events-none flex flex-col items-center transition-all duration-300" style={{ bottom: `${keyboardOffset}px` }}>
            <motion.div 
                layout
                className={`max-w-lg w-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border-t border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] pointer-events-auto rounded-t-[28px] overflow-visible ${isCollapsed ? 'translate-y-[calc(100%-44px)]' : 'translate-y-0'}`}
                style={{ paddingBottom: keyboardOffset > 0 ? "8px" : "calc(env(safe-area-inset-bottom) + 8px)" }}
                initial={{ y: 200 }}
                animate={{ y: isCollapsed ? "calc(100% - 44px)" : 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
            >
                <div onClick={() => setIsCollapsed(!isCollapsed)} className="w-full py-2.5 flex items-center justify-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                    <div className="w-12 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600 transition-colors" />
                </div>

                <div className={`flex flex-col p-3 pt-0 gap-2 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 h-0 pointer-events-none' : 'opacity-100'}`}>
                    {activeTab === "subway" && pathResults && pathResults.time && pathResults.transfer && (
                        <div className="flex flex-col gap-2 mb-2">
                            <div className="flex items-center justify-between gap-1.5 bg-zinc-100 dark:bg-white/5 rounded-2xl p-0.5 border border-black/5 dark:border-white/5 relative">
                                <button onClick={() => { if (selectedStrategy === "time") setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration"); else { onStrategyChange("time"); setTimeDisplayMode("duration"); } }} className={`flex-[1.5] flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${selectedStrategy === "time" ? "bg-blue-500 text-white shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${selectedStrategy === "time" ? "text-white/80" : "opacity-60"}`}>최소시간</span>
                                    <span className="text-[13px] font-black">{timeDisplayMode === "duration" ? `${Math.round(pathResults.time.totalWeight || 0)}분` : new Date(Date.now() + (pathResults.time.totalWeight || 0) * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                </button>
                                <button onClick={() => { if (selectedStrategy === "transfer") setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration"); else { onStrategyChange("transfer"); setTimeDisplayMode("duration"); } }} className={`flex-[1.5] flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${selectedStrategy === "transfer" ? "bg-blue-500 text-white shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}>
                                    <span className={`text-[10px] font-black uppercase tracking-tight ${selectedStrategy === "transfer" ? "text-white/80" : "opacity-60"}`}>최소환승</span>
                                    <span className="text-[13px] font-black">{timeDisplayMode === "duration" ? `${Math.round(pathResults.transfer.totalWeight || 0)}분` : new Date(Date.now() + (pathResults.transfer.totalWeight || 0) * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                </button>
                                <div className="w-px h-3 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />
                                <button onClick={onToggleShowAll} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl transition-all ${showAllRouteBubbles ? "bg-zinc-800 dark:bg-white text-white dark:text-black shadow-lg" : "text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5"}`}>
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
                                            const weight = activePath.weights[idx];
                                            const arrivalTime = new Date(Date.now() + weight * 60000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                            const transfer = activePath.transfers.find(t => t.stationName === stationName);
                                            
                                            return (
                                                <div key={idx} className="flex gap-4">
                                                    {/* Timeline Bar */}
                                                    <div className="flex flex-col items-center w-4 relative">
                                                        {!isEnd && (
                                                            <div className={`absolute top-2 bottom-0 w-[3px] rounded-full ${transfer ? 'bg-zinc-300 dark:bg-zinc-700' : 'bg-blue-500/30'}`} />
                                                        )}
                                                        <div className={`z-10 w-[10px] h-[10px] rounded-full border-2 bg-white dark:bg-zinc-900 mt-1.5 ${isStart || isEnd ? 'border-blue-500 h-[12px] w-[12px] ring-2 ring-blue-500/20' : 'border-zinc-400'}`} />
                                                    </div>

                                                    {/* Station Info */}
                                                    <div className={`flex-1 flex items-center justify-between pb-4 ${!isEnd ? 'border-b border-black/[0.03] dark:border-white/[0.03]' : ''}`}>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[13px] font-bold ${isStart || isEnd ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                                                    {stationName}
                                                                </span>
                                                                {transfer && (
                                                                    <div className="flex items-center gap-1.5 bg-blue-500/10 px-2 py-1 rounded-full border border-blue-500/20 shadow-sm">
                                                                        <span className="text-[9px] font-black text-blue-500">환승</span>
                                                                        <span className="text-[9px] font-black text-blue-600 truncate max-w-[40px] uppercase tracking-tighter">{getLineShortName(transfer.toLine)}</span>
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
                                                            {isStart ? '출발' : arrivalTime}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {/* Fare Information */}
                                        <div className="mt-2 pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-zinc-500 dark:text-zinc-400 font-bold">
                                            <span className="text-[11px]">성인 교통카드 기준</span>
                                            <span className="text-[13px] text-zinc-900 dark:text-white font-black">{activePath.fare?.toLocaleString()}원</span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        {searchResults.length > 0 && activeField && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-black/5 dark:border-white/5 mb-2">
                                <div className="max-h-[180px] overflow-y-auto no-scrollbar py-1">
                                    {searchResults.map((s, i) => (
                                        <button key={i} onClick={() => selectLocation(s)} onMouseEnter={() => setActiveIndex(i)} className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${activeIndex === i ? "bg-zinc-100 dark:bg-white/10" : "hover:bg-zinc-100/50 dark:hover:bg-white/5"}`}>
                                            <div className="flex items-center gap-2">
                                                {s.type === 'subway' ? <Train size={14} className={activeIndex === i ? "text-blue-500" : "text-zinc-400"} /> : <Bus size={14} className={activeIndex === i ? "text-emerald-500" : "text-zinc-400"} />}
                                                <span className={`font-bold text-[14px] ${activeIndex === i ? "text-blue-600 dark:text-blue-400" : "text-zinc-900 dark:text-white"}`}>{s.name}</span>
                                                {s.type === 'subway' && s.lines?.map((l: string) => (<span key={l}>{getLineBadge(l)}</span>))}
                                            </div>
                                            <span className="text-[9px] text-zinc-400 font-black uppercase tracking-tighter">{s.line || s.id}</span>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {selectedStationName && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-1 mb-2 bg-zinc-100 dark:bg-white/5 rounded-2xl overflow-hidden border border-black/5 dark:border-white/10">
                            <div className="p-3">
                                <div className="flex flex-col gap-1.5 w-full mb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-zinc-900 dark:text-white">{selectedStationName}</span>
                                            <div className="flex gap-1.5 items-center">
                                                {stationFacilities.some(f => f.category === 'elevator') && <div className="p-1 rounded-lg bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20" title="엘리베이터"><Accessibility size={14} strokeWidth={3} /></div>}
                                                {stationFacilities.some(f => f.category === 'lift') && <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20" title="휠체어 리프트"><Accessibility size={14} strokeWidth={3} /></div>}
                                                <div className={`p-1 rounded-lg bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20 ${!hasDiapers ? 'opacity-20 grayscale' : 'animate-pulse'}`} title="기저귀 교환대/수유실"><Baby size={14} /></div>
                                            </div>
                                        </div>
                                        <button onClick={() => { onSelectStation?.(null); onActiveLineChange(null); }} className="p-1 text-zinc-400"><X size={14} /></button>
                                    </div>
                                    {badges.length > 0 && (
                                        <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar py-0.5">
                                            {badges.map((badge, idx) => {
                                                const label = getLineLongName(badge.lineName);
                                                
                                                return (
                                                    <button 
                                                        key={idx}
                                                        onClick={() => onActiveLineChange(badge.lineName)}
                                                        className={`inline-flex items-center justify-center h-[28px] px-3.5 rounded-full text-[11px] font-black shadow-sm shrink-0 transition-all active:scale-90 ${activeLine === badge.lineName ? 'text-white' : 'opacity-40 grayscale-[0.3]'}`}
                                                        style={{ backgroundColor: badge.color }}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    
                                    {schedules && schedules["기본"] && (
                                        <div className="flex items-center gap-3 px-3 py-2 bg-zinc-200/40 dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5 mb-3">
                                            <div className="flex flex-col text-left">
                                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest pl-0.5 mb-0.5">첫차</span>
                                                <span className="text-[12px] font-black text-blue-500 font-mono tracking-tight">{schedules["기본"].firstTrain}</span>
                                            </div>
                                            <div className="w-px h-5 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />
                                            <div className="flex flex-col text-left">
                                                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest pl-0.5 mb-0.5">막차</span>
                                                <span className="text-[12px] font-black text-rose-500 font-mono tracking-tight">{schedules["기본"].lastTrain}</span>
                                            </div>
                                            <div className="ml-auto flex items-center gap-1.5 opacity-60">
                                                <span className="text-[10px] font-bold text-zinc-500">평일 기준</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    {/* Up / Inner Column */}
                                    <div className="flex flex-col gap-2">
                                        <ArrivalHeader 
                                            defaultTitle="상행 · 내선" 
                                            trains={(stationArrivals || [])
                                                .filter(arr => {
                                                    if (!activeLine) return true;
                                                    const shortActive = activeLine.replace(/[^0-9]/g, '');
                                                    const isMatch = arr.lineName.includes(activeLine) || 
                                                           arr.lineName.includes(shortActive) ||
                                                           (shortActive && arr.subwayId.endsWith(shortActive.padStart(2, '0')));
                                                    if (!isMatch) return false;
                                                    return arr.updnLine.includes('상행') || arr.updnLine.includes('내선') || arr.updnLine.includes('상선');
                                                })}
                                            textColor="text-blue-500 dark:text-blue-400"
                                            borderColor="border-blue-500/20"
                                        />
                                        <div className="flex flex-col gap-2">
                                            {(stationArrivals || [])
                                                .filter(arr => {
                                                    if (!activeLine) return true;
                                                    const shortActive = activeLine.replace(/[^0-9]/g, '');
                                                    const isMatch = arr.lineName.includes(activeLine) || 
                                                           arr.lineName.includes(shortActive) ||
                                                           (shortActive && arr.subwayId.endsWith(shortActive.padStart(2, '0')));
                                                    if (!isMatch) return false;
                                                    return arr.updnLine.includes('상행') || arr.updnLine.includes('내선') || arr.updnLine.includes('상선');
                                                })
                                                .slice(0, 3)
                                                .map((arr, idx) => (
                                                    <ArrivalItemListItem 
                                                        key={idx} 
                                                        arr={arr} 
                                                        timeDisplayMode={timeDisplayMode} 
                                                        onToggleTimeDisplay={() => setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration")} 
                                                    />
                                                ))}
                                        </div>
                                    </div>

                                    {/* Down / Outer Column */}
                                    <div className="flex flex-col gap-2">
                                        <ArrivalHeader 
                                            defaultTitle="하행 · 외선" 
                                            trains={(stationArrivals || [])
                                                .filter(arr => {
                                                    if (!activeLine) return true;
                                                    const shortActive = activeLine.replace(/[^0-9]/g, '');
                                                    const isMatch = arr.lineName.includes(activeLine) || 
                                                           arr.lineName.includes(shortActive) ||
                                                           (shortActive && arr.subwayId.endsWith(shortActive.padStart(2, '0')));
                                                    if (!isMatch) return false;
                                                    return arr.updnLine.includes('하행') || arr.updnLine.includes('외선') || arr.updnLine.includes('하선');
                                                })}
                                            textColor="text-orange-500 dark:text-orange-400"
                                            borderColor="border-orange-500/20"
                                        />
                                        <div className="flex flex-col gap-2">
                                            {(stationArrivals || [])
                                                .filter(arr => {
                                                    if (!activeLine) return true;
                                                    const shortActive = activeLine.replace(/[^0-9]/g, '');
                                                    const isMatch = arr.lineName.includes(activeLine) || 
                                                           arr.lineName.includes(shortActive) ||
                                                           (shortActive && arr.subwayId.endsWith(shortActive.padStart(2, '0')));
                                                    if (!isMatch) return false;
                                                    return arr.updnLine.includes('하행') || arr.updnLine.includes('외선') || arr.updnLine.includes('하선');
                                                })
                                                .slice(0, 3)
                                                .map((arr, idx) => (
                                                    <ArrivalItemListItem 
                                                        key={idx} 
                                                        arr={arr} 
                                                        timeDisplayMode={timeDisplayMode} 
                                                        onToggleTimeDisplay={() => setTimeDisplayMode(timeDisplayMode === "duration" ? "arrival" : "duration")} 
                                                    />
                                                ))}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex gap-2">
                                    <button onClick={() => onTabChange("wc")} className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-200/50 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 hover:bg-zinc-200 transition-colors">
                                        <Bath size={14} className="text-zinc-500" />
                                        <span className="text-[11px] font-black">화장실 정보</span>
                                    </button>
                                    <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-200/50 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 hover:bg-zinc-200 transition-colors">
                                        <MapIcon size={14} className="text-zinc-500" />
                                        <span className="text-[11px] font-black">역내도</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab !== "wc" && (
                        <div className="grid grid-cols-2 gap-2 mt-0.5 relative">
                            {isLocating && (
                                <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none">
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-500 text-white text-[11px] font-black px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2">
                                        <Locate size={12} className="animate-pulse" />
                                        현재 위치 조회 중... {locatingTimer}초
                                    </motion.div>
                                </div>
                            )}
                            {(externalValidationError || validationError) && (
                                <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none">
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
                            <div className={`relative flex items-center px-3 h-9 bg-zinc-100 dark:bg-white/5 rounded-xl border transition-all ${activeField === "dest" ? "border-rose-500 ring-1 ring-rose-500/20" : "border-transparent"}`}>
                                <span className="text-[11px] font-black text-rose-500 shrink-0 mr-1">도착</span>
                                <div className="relative flex-1 h-full flex items-center px-2 overflow-hidden">
                                    {(!activeField || activeField !== "dest") && destination && (<div className="absolute inset-y-0 left-2 flex items-center pointer-events-none font-bold text-[13px] text-zinc-900 dark:text-white">{formatStationDisplay(destination, true)}</div>)}
                                    <input ref={destInputRef} type="text" placeholder={!destination ? "도착역" : ""} value={activeField === "dest" ? destination : ""} onFocus={() => { setActiveField("dest"); setActiveIndex(-1); }} onBlur={() => setTimeout(() => { if(activeField === "dest") setActiveField(null); }, 250)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(p => (p + 1) % searchResults.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(p => (p - 1 + searchResults.length) % searchResults.length); } else if (e.key === 'Enter') { if (activeIndex >= 0 && searchResults[activeIndex]) { const s = searchResults[activeIndex]; selectLocation(s); } else if (destination) { setActiveField(null); } } }} onChange={(e) => handleSearch(e.target.value, "dest")} className={`w-full bg-transparent border-none outline-none font-bold text-[13px] placeholder:text-zinc-400 text-zinc-900 dark:text-white ${(!activeField || activeField !== "dest") && destination ? "opacity-0" : "opacity-100"}`} />
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {destination && (<button onMouseDown={(e) => e.preventDefault()} onClick={() => { setDestination(""); setSearchResults([]); destInputRef.current?.focus(); }} className="p-1 text-zinc-400 hover:text-zinc-600 transition-all"><X size={14} /></button>)}
                                    <button disabled={isLocating} onClick={() => onLocate?.("dest")} className={`p-1 transition-all active:scale-90 ${isLocating ? 'text-zinc-200 cursor-not-allowed' : 'text-zinc-400 hover:text-blue-500'}`}><Locate size={14} /></button>
                                </div>
                            </div>
                            <div className={`relative flex items-center px-3 h-9 bg-zinc-100 dark:bg-white/5 rounded-xl border transition-all ${activeField === "source" ? "border-blue-500 ring-1 ring-blue-500/20" : "border-transparent"}`}>
                                <span className="text-[11px] font-black text-blue-500 shrink-0 mr-1">출발</span>
                                <div className="relative flex-1 h-full flex items-center px-2 overflow-hidden">
                                    {(!activeField || activeField !== "source") && source && (<div className="absolute inset-y-0 left-2 flex items-center pointer-events-none font-bold text-[13px] text-zinc-900 dark:text-white">{formatStationDisplay(source)}</div>)}
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
                        <div className="flex-1 flex items-center gap-1 p-0.5 bg-black/5 dark:bg-white/5 rounded-xl">
                            {tabs.map((tab) => (
                                <button key={tab.id} onClick={() => onTabChange(tab.id)} className={`flex-1 flex flex-col items-center justify-center py-1 rounded-lg transition-all ${activeTab === tab.id ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm" : "text-zinc-400"}`}>
                                    {tab.icon}
                                    <span className="text-[9px] font-black mt-0.5">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        {activeTab !== "wc" && (
                            <>
                                <button disabled={isLocating || isCalculating} onClick={() => { if (!source) { setValidationError("source"); return; } if (!destination) { setValidationError("dest"); return; } onSearch(source, destination); }} className={`h-9 px-5 rounded-xl font-black text-[13px] transition-all ${isLocating || isCalculating ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed' : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 active:scale-95'}`}>{isCalculating ? '조회중...' : '길찾기'}</button>
                                <button onClick={onReset} className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-400"><RotateCcw size={16} /></button>
                            </>
                        )}
                    </div>

                    {activeTab === 'bus' && busPathResult && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 rounded-2xl bg-white/50 dark:bg-zinc-900/50 border border-white/20 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-3"><span className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">직행 버스 추천</span><span className="text-[12px] font-bold text-zinc-900 dark:text-white">약 {Math.round(busPathResult.distanceWeight)}분</span></div>
                            <div className="flex flex-wrap gap-1.5">{busPathResult.commonRoutes.map((r, i) => (<span key={i} className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[13px] font-black shadow-sm">{r}</span>))}</div>
                            <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-bold">{busPathResult.startStop.name} 정류장에서 승차하여 {busPathResult.endStop.name} 하차하십시오.</p>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
