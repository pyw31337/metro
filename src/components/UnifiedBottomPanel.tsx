"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Train, Bus, Map as MapIcon, Bath, MapPin, Navigation, Locate, X, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as Hangul from "hangul-js";
import { Station } from "@/data/subway-lines";
import { THEME } from "@/theme/design-system";

interface UnifiedBottomPanelProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    onSearch: (start: string, end: string) => void;
    onReset?: () => void;
    onLocate?: () => void;
    startStation: string | null;
    endStation: string | null;
    isDarkMode: boolean;
    stations: Station[];
    busStops: any[];
    children?: React.ReactNode;
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
    children
}: UnifiedBottomPanelProps) {
    const [destination, setDestination] = useState("");
    const [source, setSource] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [activeField, setActiveField] = useState<"source" | "dest" | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isListExpanded, setIsListExpanded] = useState(true);

    useEffect(() => {
        setDestination(endStation || "");
        setSource(startStation || "");
    }, [startStation, endStation]);

    const handleSearch = (val: string, type: "source" | "dest") => {
        if (type === "dest") setDestination(val);
        else setSource(val);

        if (val.length === 0) {
            setSearchResults([]);
            return;
        }

        const q = val.toLowerCase();
        const filteredSubway = stations
            .filter(s => matchChosung(val, s.name))
            .map(s => ({ ...s, type: 'subway' }))
            .sort((a, b) => {
                const aExact = a.name.toLowerCase() === q;
                const bExact = b.name.toLowerCase() === q;
                if (aExact !== bExact) return aExact ? -1 : 1;
                
                const aStarts = a.name.toLowerCase().startsWith(q);
                const bStarts = b.name.toLowerCase().startsWith(q);
                if (aStarts !== bStarts) return aStarts ? -1 : 1;

                const aLines = (a as any).lines?.length || 0;
                const bLines = (b as any).lines?.length || 0;
                return bLines - aLines;
            });

        const filteredBus = busStops
            .filter(s => matchChosung(val, s.name))
            .map(s => ({ ...s, type: 'bus' }))
            .sort((a, b) => {
                const aExact = a.name.toLowerCase() === q;
                const bExact = b.name.toLowerCase() === q;
                if (aExact !== bExact) return aExact ? -1 : 1;
                return 0;
            });

        setSearchResults([...filteredSubway, ...filteredBus].slice(0, 10));
    };

    const selectLocation = (name: string) => {
        if (activeField === "dest") {
            setDestination(name);
            setActiveField(null);
        } else {
            setSource(name);
            setActiveField(null);
        }
        setSearchResults([]);
    };

    const tabs = [
        { id: "subway", label: "지하철", icon: <Train size={16} /> },
        { id: "bus", label: "버스", icon: <Bus size={16} /> },
        { id: "subway+bus", label: "통합", icon: <MapIcon size={16} /> },
        { id: "wc", label: "화장실", icon: <Bath size={16} /> },
    ];

    const handleResetAction = () => {
        setDestination("");
        setSource("");
        if (onReset) onReset();
    };

    return (
        <div className="fixed inset-x-0 bottom-0 z-[5000] pointer-events-none flex flex-col items-center pb-6 px-4">
            <motion.div 
                layout
                className="max-w-lg w-full glass-premium rounded-[32px] p-4 pointer-events-auto border border-white/20 shadow-2xl overflow-hidden relative bg-white/70 dark:bg-zinc-900/80"
                style={{ 
                    backdropFilter: "blur(20px) saturate(180%)", 
                    WebkitBackdropFilter: "blur(20px) saturate(180%)" 
                }}
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={THEME.transitions.spring}
            >
                <div className="flex flex-col gap-4">
                    {/* ─── 1. Thin Iconic Tabs with Sliding Indicator ────────────────────────── */}
                    <div className="flex items-center justify-between gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-white/5 relative">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className={`
                                    flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all relative z-10
                                    ${activeTab === tab.id 
                                        ? "text-zinc-900 dark:text-white" 
                                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                                    }
                                `}
                            >
                                {activeTab === tab.id && (
                                    <motion.div 
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-xl shadow-sm ring-1 ring-black/5 z-0"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                <span className="relative z-10">{tab.icon}</span>
                                <span className="text-[12px] font-bold relative z-10">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* ─── 2. Expanded Content (Optional Detail View) ───── */}
                    <AnimatePresence mode="wait">
                        {isExpanded && children && (
                            <motion.div
                                key="expanded-content"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden border-b border-black/5 dark:border-white/5 pb-2"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[14px] font-bold text-zinc-400 uppercase tracking-widest pl-2">Recommendation</span>
                                    <button 
                                        onClick={() => setIsListExpanded(!isListExpanded)}
                                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-zinc-400 transition-all active:scale-90"
                                    >
                                        {isListExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                                    </button>
                                </div>
                                <motion.div
                                    animate={{ height: isListExpanded ? "auto" : 0, opacity: isListExpanded ? 1 : 0 }}
                                    className="max-h-[300px] overflow-y-auto no-scrollbar"
                                >
                                    {children}
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ─── 3. Functional Inputs ─────────────────────────── */}
                    <div className="flex flex-col gap-2">
                        {/* Destination Input */}
                        <div className="relative flex items-center px-4 h-12 bg-white/50 dark:bg-black/20 rounded-2xl border border-black/5 dark:border-white/5 focus-within:ring-2 focus-within:ring-teal-500/50 transition-all">
                            <MapPin size={18} className="text-teal-500 shrink-0" />
                            <input 
                                type="text"
                                placeholder="(도착역) 어디로 가시나요?"
                                value={destination}
                                onFocus={() => { setActiveField("dest"); setIsExpanded(true); }}
                                onChange={(e) => handleSearch(e.target.value, "dest")}
                                className="flex-1 bg-transparent border-none outline-none font-bold text-[15px] px-3 placeholder:text-zinc-400 text-zinc-900 dark:text-white"
                            />
                            {destination && (
                                <button onClick={() => setDestination("")} className="p-1 hover:bg-black/5 rounded-full transition-colors">
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Source Input */}
                        <div className="relative flex items-center px-4 h-12 bg-white/50 dark:bg-black/20 rounded-2xl border border-black/5 dark:border-white/5 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                            <Navigation size={18} className="text-blue-500 shrink-0" />
                            <input 
                                type="text"
                                placeholder="(출발지) 어디서 출발하시나요?"
                                value={source}
                                onFocus={() => { setActiveField("source"); setIsExpanded(true); }}
                                onChange={(e) => handleSearch(e.target.value, "source")}
                                className="flex-1 bg-transparent border-none outline-none font-bold text-[15px] px-3 placeholder:text-zinc-400 text-zinc-900 dark:text-white"
                            />
                            <button 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if(onLocate) onLocate(); 
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl transition-all border border-blue-500/20"
                            >
                                <Locate size={14} />
                                <span className="text-[12px] font-bold">내 위치</span>
                            </button>
                        </div>
                    </div>

                    {/* ─── 4. Action Buttons ────────────────────────────── */}
                    <div className="grid grid-cols-5 gap-2">
                        <button 
                            className="col-span-4 h-12 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold text-[16px] shadow-lg active:scale-[0.98] transition-all disabled:opacity-40"
                            onClick={() => {
                                onSearch(source, destination);
                                setIsExpanded(false);
                            }}
                            disabled={!destination}
                        >
                            경로 확인하기
                        </button>
                        <button 
                            onClick={handleResetAction}
                            className="h-12 flex items-center justify-center rounded-2xl bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 dark:text-zinc-500 transition-all"
                            title="초기화"
                        >
                            <RotateCcw size={20} />
                        </button>
                    </div>
                </div>

                {/* ─── Search Results Contextual Layer ───────────────── */}
                <AnimatePresence>
                    {searchResults.length > 0 && activeField && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute bottom-full left-0 right-0 mb-4 mx-2 glass-premium rounded-[24px] p-2 border border-white/20 shadow-xl bg-white/95 dark:bg-zinc-900/95 overflow-hidden z-[5001] pointer-events-auto"
                        >
                            <div className="max-h-[220px] overflow-y-auto no-scrollbar">
                                {searchResults.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => selectLocation(s.name)}
                                        className="w-full flex items-center gap-3 px-3 py-3 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-all text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-white/5 flex items-center justify-center shrink-0">
                                            {s.type === 'subway' ? <Train size={18} className="text-zinc-400" /> : <Bus size={18} className="text-zinc-400" />}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-zinc-900 dark:text-white text-[15px]">{s.name}</span>
                                            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-tight">
                                                {s.type === 'subway' ? s.lines?.join(" • ") : s.id}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
