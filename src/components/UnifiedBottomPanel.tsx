"use client";

import { useState, useEffect, useCallback } from "react";
import { Train, Bus, Map as MapIcon, Bath, MapPin, Navigation, Locate, X, RotateCcw } from "lucide-react";
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
    routeSummary?: { time: number; transfers: number } | null;
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
    routeSummary
}: UnifiedBottomPanelProps) {
    const [destination, setDestination] = useState("");
    const [source, setSource] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [activeField, setActiveField] = useState<"source" | "dest" | null>(null);

    useEffect(() => {
        setDestination(endStation || "");
        setSource(startStation || "");
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

    const tabs = [
        { id: "subway", label: "지하철", icon: <Train size={14} /> },
        { id: "bus", label: "버스", icon: <Bus size={14} /> },
        { id: "subway+bus", label: "통합", icon: <MapIcon size={14} /> },
        { id: "wc", label: "화장실", icon: <Bath size={14} /> },
    ];

    return (
        <div className="fixed inset-x-0 bottom-0 z-[5000] pointer-events-none flex flex-col items-center">
            <motion.div 
                layout
                className="max-w-lg w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] pointer-events-auto rounded-t-[28px] overflow-hidden"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
                initial={{ y: 200 }}
                animate={{ y: 0 }}
                transition={THEME.transitions.spring}
            >
                <div className="flex flex-col p-4 gap-3">
                    {/* Route Summary (Slim Integration) */}
                    {routeSummary && (
                        <div className="flex items-center justify-between px-2 pb-1 border-b border-black/5 dark:border-white/5 mb-1">
                            <span className="text-[11px] font-black text-blue-500 uppercase tracking-widest">Recommended</span>
                            <span className="text-[12px] font-black">{routeSummary.time}분 | 환승 {routeSummary.transfers}회</span>
                        </div>
                    )}

                    {/* Integrated Search Results Extension */}
                    <AnimatePresence>
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
                                            onClick={() => selectLocation(s.name)}
                                            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-all text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                {s.type === 'subway' ? <Train size={14} className="text-zinc-400" /> : <Bus size={14} className="text-zinc-400" />}
                                                <span className="font-bold text-zinc-900 dark:text-white text-[14px]">{s.name}</span>
                                            </div>
                                            <span className="text-[9px] text-zinc-400 font-black uppercase">{s.lines?.join(", ") || s.id}</span>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Slim Functional Inputs */}
                    <div className="grid grid-cols-2 gap-2">
                        {/* Destination */}
                        <div className="relative flex items-center px-3 h-10 bg-zinc-100 dark:bg-white/5 rounded-xl border border-transparent focus-within:border-blue-500/50 transition-all">
                            <MapPin size={14} className="text-blue-500 shrink-0" />
                            <input 
                                type="text"
                                placeholder="도착역"
                                value={destination}
                                onFocus={() => setActiveField("dest")}
                                onChange={(e) => handleSearch(e.target.value, "dest")}
                                className="flex-1 bg-transparent border-none outline-none font-bold text-[13px] px-2 placeholder:text-zinc-400 text-zinc-900 dark:text-white"
                            />
                        </div>

                        {/* Source */}
                        <div className="relative flex items-center px-3 h-10 bg-zinc-100 dark:bg-white/5 rounded-xl border border-transparent focus-within:border-blue-500/50 transition-all">
                            <Navigation size={14} className="text-zinc-400 shrink-0" />
                            <input 
                                type="text"
                                placeholder="출발역"
                                value={source}
                                onFocus={() => setActiveField("source")}
                                onChange={(e) => handleSearch(e.target.value, "source")}
                                className="flex-1 bg-transparent border-none outline-none font-bold text-[13px] px-2 placeholder:text-zinc-400 text-zinc-900 dark:text-white"
                            />
                            <button onClick={onLocate} className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"><Locate size={14} /></button>
                        </div>
                    </div>

                    {/* Bottom Utility Row */}
                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-1 p-0.5 bg-black/5 dark:bg-white/5 rounded-xl">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => onTabChange(tab.id)}
                                    className={`
                                        flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg transition-all
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
                            className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 h-10 px-6 rounded-xl font-black text-[13px] active:scale-95 transition-all"
                        >
                            길찾기
                        </button>
                        <button onClick={onReset} className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-400"><RotateCcw size={16} /></button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
