"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Train, Bus, Map as MapIcon, Bath, MapPin, Navigation, Locate, X, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as Hangul from "hangul-js";
import { SUBWAY_LINES, Station } from "@/data/subway-lines";

interface UnifiedBottomPanelProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    onSearch: (start: string, end: string) => void;
    startStation: string | null;
    endStation: string | null;
    isDarkMode: boolean;
    stations: Station[];
    busStops: any[];
    children?: React.ReactNode;
}

const matchChosung = (query: string, target: string) => {
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

    useEffect(() => {
        if (endStation) setDestination(endStation);
        if (startStation) setSource(startStation);
    }, [startStation, endStation]);

    const handleSearch = (val: string, type: "source" | "dest") => {
        if (type === "dest") setDestination(val);
        else setSource(val);

        if (val.length === 0) {
            setSearchResults([]);
            return;
        }

        const filteredSubway = stations.filter(s => matchChosung(val, s.name)).map(s => ({ ...s, type: 'subway' }));
        const filteredBus = busStops.filter(s => matchChosung(val, s.name)).map(s => ({ ...s, type: 'bus' }));
        setSearchResults([...filteredSubway, ...filteredBus].slice(0, 10));
    };

    const selectLocation = (name: string) => {
        if (activeField === "dest") {
            setDestination(name);
            setActiveField(null);
            if (!source) findNearest();
        } else {
            setSource(name);
            setActiveField(null);
        }
        setSearchResults([]);
    };

    const findNearest = useCallback(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            let nearestName = "";
            let minDist = Infinity;
            stations.forEach(s => {
                const d = Math.sqrt(Math.pow(s.lat - latitude, 2) + Math.pow(s.lng - longitude, 2));
                if (d < minDist) { minDist = d; nearestName = s.name; }
            });
            busStops.forEach(s => {
                const d = Math.sqrt(Math.pow(s.lat - latitude, 2) + Math.pow(s.lng - longitude, 2));
                if (d < minDist) { minDist = d; nearestName = s.name; }
            });
            setSource(nearestName);
        });
    }, [stations, busStops]);

    const tabs = [
        { id: "subway", label: "지하철", icon: <Train size={18} /> },
        { id: "bus", label: "버스", icon: <Bus size={18} /> },
        { id: "subway+bus", label: "통합", icon: <MapIcon size={18} /> },
        { id: "wc", label: "화장실", icon: <Bath size={18} /> },
    ];

    const fastTransition: any = { type: "spring", stiffness: 450, damping: 35, duration: 0.15 };

    return (
        <div className="fixed inset-x-0 bottom-0 z-[5000] pointer-events-none flex flex-col items-center">
            <motion.div 
                layout
                className="max-w-xl w-full mx-auto glass-premium rounded-t-[40px] p-4 pointer-events-auto border-t border-x border-white/20 shadow-[0_-20px_80px_rgba(0,0,0,0.2)] overflow-hidden bg-white/80 dark:bg-zinc-900/90 backdrop-blur-3xl"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                transition={fastTransition}
            >
                {/* ─── Drag Handle / Expand Toggle ────────────────────────── */}
                <div className="flex justify-center -mt-1 mb-3 cursor-pointer group" onClick={() => setIsExpanded(!isExpanded)}>
                    <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700/50 group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600 transition-colors" />
                </div>

                <div className="flex flex-col gap-4">
                    {/* ─── 4. Details (Scrollable Content at the top when expanded) ───────────── */}
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={fastTransition}
                                className="max-h-[350px] overflow-y-auto no-scrollbar pt-2 border-b border-white/5 order-1"
                            >
                                {children}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ─── 1. Tabs (Positioned ABOVE the search bar) ───────────────────── */}
                    <div className="flex justify-between gap-1 p-1 bg-zinc-100/50 dark:bg-white/5 rounded-2xl border border-white/5 order-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => onTabChange(tab.id)}
                                className={`
                                    flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all
                                    ${activeTab === tab.id 
                                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xl scale-[1.02] border border-white/10" 
                                        : "text-zinc-500 hover:bg-white/30 dark:hover:bg-white/10"
                                    }
                                `}
                            >
                                {tab.icon}
                                <span className="text-[11px] font-black uppercase tracking-widest">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* ─── 2. Search Section (Bottom-most inputs) ───────────────────────── */}
                    <div className="flex flex-col gap-2 order-3">
                        <div className="relative flex items-center px-4 h-14 bg-zinc-100/80 dark:bg-white/10 rounded-2xl border border-transparent focus-within:border-teal-500/50 transition-all shadow-inner group">
                            <MapPin size={20} className="text-rose-500 shrink-0 group-focus-within:animate-bounce" />
                            <input 
                                type="text"
                                placeholder="어디로 가시나요?"
                                value={destination}
                                onFocus={() => { setActiveField("dest"); setIsExpanded(true); }}
                                onChange={(e) => handleSearch(e.target.value, "dest")}
                                className="flex-1 bg-transparent border-none outline-none font-black text-[16px] px-3 placeholder:text-zinc-400 text-zinc-900 dark:text-white"
                            />
                            {destination && (
                                <button onClick={() => setDestination("")} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/20 rounded-full transition-colors">
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        <AnimatePresence>
                            {(activeField === "source" || source || destination) && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                    animate={{ height: "auto", opacity: 1, marginTop: 8 }}
                                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                    transition={fastTransition}
                                    className="overflow-hidden"
                                >
                                    <div className="relative flex items-center px-4 h-14 bg-zinc-100/80 dark:bg-white/10 rounded-2xl border border-transparent focus-within:border-blue-500/50 transition-all shadow-inner">
                                        <Locate size={20} className="text-blue-500 shrink-0" />
                                        <input 
                                            type="text"
                                            placeholder="출발지: 입력 또는 내 주변"
                                            value={source}
                                            onFocus={() => { setActiveField("source"); setIsExpanded(true); }}
                                            onChange={(e) => handleSearch(e.target.value, "source")}
                                            className="flex-1 bg-transparent border-none outline-none font-black text-[16px] px-3 placeholder:text-zinc-400 text-zinc-900 dark:text-white"
                                        />
                                        <button 
                                            onClick={findNearest}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-xl text-[12px] font-black shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-95 transition-all"
                                        >
                                            <Navigation size={14} fill="currentColor" />
                                            <span>주변</span>
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="grid grid-cols-4 gap-2 order-4">
                        <button 
                            className="col-span-3 h-16 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-[24px] font-black text-xl shadow-2xl active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 overflow-hidden group"
                            onClick={() => onSearch(source || "내 주변", destination)}
                            disabled={!destination}
                        >
                            <span className="relative z-10 font-black">경로 확인하기</span>
                            <div className="w-10 h-10 bg-white/20 dark:bg-zinc-900/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Search size={20} strokeWidth={3} />
                            </div>
                        </button>
                        <button 
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="h-16 flex items-center justify-center rounded-[24px] bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 transition-all"
                        >
                            {isExpanded ? <ChevronDown size={28} /> : <ChevronUp size={28} />}
                        </button>
                    </div>
                </div>

                {/* ─── Search Results Tooltip ─────────────────────────── */}
                <AnimatePresence>
                    {searchResults.length > 0 && activeField && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={fastTransition}
                            className="absolute bottom-full left-0 right-0 mb-4 mx-4 glass-premium rounded-[32px] p-2 pointer-events-auto border border-white/20 shadow-[0_-20px_80px_rgba(0,0,0,0.3)] bg-white/90 dark:bg-zinc-900/95 backdrop-blur-3xl overflow-hidden"
                        >
                            <div className="max-h-[300px] overflow-y-auto no-scrollbar">
                                {searchResults.map((s, i) => (
                                    <button
                                        key={i}
                                        onClick={() => selectLocation(s.name)}
                                        className="w-full flex items-center gap-4 px-4 py-4 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-[20px] transition-all text-left group"
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-zinc-50 dark:bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-teal-500/10 transition-colors">
                                            {s.type === 'subway' ? <Train size={20} className="text-zinc-400 group-hover:text-teal-500" /> : <Bus size={20} className="text-zinc-400 group-hover:text-orange-500" />}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-extrabold text-zinc-900 dark:text-white text-[16px] leading-tight">{s.name}</span>
                                            <span className="text-[11px] text-zinc-400 uppercase font-black tracking-widest leading-none mt-1 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
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
