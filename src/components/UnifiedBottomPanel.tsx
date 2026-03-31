"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Train, Bus, Map as MapIcon, Bath, MapPin, Navigation, Locate, X, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as Hangul from "hangul-js";
import { Station, SUBWAY_LINES } from "@/data/subway-lines";
import { THEME } from "@/theme/design-system";
import type { PathResult, PathStrategy } from "@/utils/pathfinding";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import type { BusPathResult } from "@/utils/busRouting";
import { db } from "@/services/db";
import { Facility } from "@/types/metro";
import { getLineShortName } from "@/utils/stationUtils";

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

    const sourceInputRef = useRef<HTMLInputElement>(null);
    const destInputRef = useRef<HTMLInputElement>(null);

    const badges = useMemo(() => {
        if (!selectedStationName) return [];
        const cleanName = selectedStationName.replace(/역+$/, '');
        const b: { num: string; color: string }[] = [];
        const addedLines = new Set<string>();

        for (const line of SUBWAY_LINES) {
            if (line.stations.some(s => s.name === cleanName || s.name === cleanName + '역')) {
                const num = getLineShortName(line.name);
                if (!addedLines.has(num)) {
                    b.push({ num, color: line.color });
                    addedLines.add(num);
                }
            }
        }
        return b;
    }, [selectedStationName, stations]);

    useEffect(() => {
        if (badges.length > 0 && (!activeLine || !badges.find(b => b.num === activeLine))) {
            onActiveLineChange(badges[0].num);
        }
    }, [badges, activeLine, onActiveLineChange]);

    useEffect(() => {
        if (selectedStationName) {
            const cleanName = selectedStationName.replace(/역$/, '');
            db.getStationFacilities(cleanName).then(setStationFacilities);
        } else {
            setStationFacilities([]);
        }
    }, [selectedStationName]);

    useEffect(() => {
        if (validationError) {
            const timer = setTimeout(() => setValidationError(null), 3000);
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
                        <div className="flex items-center justify-between gap-1.5 bg-zinc-100 dark:bg-white/5 rounded-2xl p-0.5 mb-0.5 border border-black/5 dark:border-white/5">
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
                                <span className={`text-[10px] font-black uppercase tracking-tight ${showAllRouteBubbles ? "opacity-80" : "opacity-60"}`}>{showAllRouteBubbles ? "상세 닫기" : "상세 경로"}</span>
                                <Navigation size={12} className={showAllRouteBubbles ? "animate-pulse" : ""} />
                            </button>
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
                                            <div className="flex gap-1">
                                                {stationFacilities.some(f => f.category === 'elevator') && <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded-md font-bold">L</span>}
                                                {stationFacilities.some(f => f.category === 'locker') && <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded-md font-bold">K</span>}
                                            </div>
                                        </div>
                                        <button onClick={() => { onSelectStation?.(null); onActiveLineChange(null); }} className="p-1 text-zinc-400"><X size={14} /></button>
                                    </div>
                                    {badges.length > 0 && (
                                        <div className="flex gap-2 p-1 bg-zinc-200/50 dark:bg-black/20 rounded-xl overflow-x-auto no-scrollbar border border-black/5 dark:border-white/5">
                                            {badges.map((badge, idx) => (
                                                <button 
                                                    key={idx}
                                                    onClick={() => onActiveLineChange(badge.num)}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black transition-all ${activeLine === badge.num ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm ring-1 ring-black/5' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                >
                                                    <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] text-white" style={{ backgroundColor: badge.color }}>{badge.num}</span>
                                                    <span>{badge.num}호선</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    {(stationArrivals || [])
                                        .filter(arr => !activeLine || arr.lineName.includes(activeLine) || arr.subwayId.endsWith(activeLine.padStart(2, '0')))
                                        .slice(0, 4)
                                        .map((arr, idx) => (
                                        <div key={idx} className="bg-white/50 dark:bg-black/20 p-2.5 rounded-xl flex flex-col border border-black/5 dark:border-white/5">
                                            <div className="flex items-center gap-1 mb-1">
                                                {getLineBadge(arr.lineName)}
                                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-tighter">{arr.updnLine.includes('상행') || arr.updnLine.includes('내선') ? '상행' : '하행'}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-bold truncate max-w-[80px]">{arr.trainLineNm.split(' - ')[0]}</span>
                                                <span className="text-[11px] font-black text-rose-500">{arr.arvlMsg2}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {((stationArrivals || []).filter(arr => !activeLine || arr.lineName.includes(activeLine) || arr.subwayId.endsWith(activeLine.padStart(2, '0'))).length === 0) && (
                                        <div className="col-span-2 py-4 text-center text-zinc-400 text-[11px] font-bold">운행 정보가 없습니다.</div>
                                    )}
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
                                        <span className="text-zinc-600 dark:text-zinc-400">내용을 확인해 주세요: </span>
                                        {(externalValidationError || validationError) === "source" ? 
                                            <><span className="text-red-600 font-bold">출발지</span>를 입력해 주세요</> : 
                                            (externalValidationError || validationError) === "dest" ? 
                                            <><span className="text-red-600 font-bold">도착지</span>를 입력해 주세요</> : 
                                            (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-red-600 font-black">경로를 찾을 수 없습니다</span>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onSearch(source, destination); }}
                                                        className="px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-700 text-zinc-500 hover:text-blue-500 hover:bg-blue-500/10 transition-all font-black text-[10px]"
                                                    >
                                                        (재시도)
                                                    </button>
                                                </div>
                                            )
                                        }
                                    </motion.div>
                                </div>
                            )}
                            <div className={`relative flex items-center px-3 h-9 bg-zinc-100 dark:bg-white/5 rounded-xl border transition-all ${activeField === "dest" ? "border-rose-500 ring-1 ring-rose-500/20" : "border-transparent"}`}>
                                <span className="text-[11px] font-black text-rose-500 shrink-0 mr-1">도착</span>
                                <div className="relative flex-1 h-full flex items-center px-2 overflow-hidden">
                                    {(!activeField || activeField !== "dest") && destination && (<div className="absolute inset-y-0 left-2 flex items-center pointer-events-none font-bold text-[13px] text-zinc-900 dark:text-white">{formatStationDisplay(destination, true)}</div>)}
                                    <input ref={destInputRef} type="text" placeholder={!destination ? "도착역" : ""} value={activeField === "dest" ? destination : ""} onFocus={() => { setActiveField("dest"); setActiveIndex(-1); }} onBlur={() => setTimeout(() => { if(activeField === "dest") setActiveField(null); }, 250)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(p => (p + 1) % searchResults.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(p => (p - 1 + searchResults.length) % searchResults.length); } else if (e.key === 'Enter') { if (activeIndex >= 0 && searchResults[activeIndex]) { const s = searchResults[activeIndex]; selectLocation(`${s.name} ${s.lines?.[0] || ''}`.trim()); } else if (destination) { setActiveField(null); } } }} onChange={(e) => handleSearch(e.target.value, "dest")} className={`w-full bg-transparent border-none outline-none font-bold text-[13px] placeholder:text-zinc-400 text-zinc-900 dark:text-white ${(!activeField || activeField !== "dest") && destination ? "opacity-0" : "opacity-100"}`} />
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
                                    <input ref={sourceInputRef} type="text" placeholder={!source ? "출발역" : ""} value={activeField === "source" ? source : ""} onFocus={() => { setActiveField("source"); setActiveIndex(-1); }} onBlur={() => setTimeout(() => { if(activeField === "source") setActiveField(null); }, 250)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(p => (p + 1) % searchResults.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(p => (p - 1 + searchResults.length) % searchResults.length); } else if (e.key === 'Enter') { if (activeIndex >= 0 && searchResults[activeIndex]) { const s = searchResults[activeIndex]; selectLocation(`${s.name} ${s.lines?.[0] || ''}`.trim()); } else if (source) { setActiveField(null); } } }} onChange={(e) => handleSearch(e.target.value, "source")} className={`w-full bg-transparent border-none outline-none font-bold text-[13px] placeholder:text-zinc-400 text-zinc-900 dark:text-white ${(!activeField || activeField !== "source") && source ? "opacity-0" : "opacity-100"}`} />
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
