"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Train, Bus, Map as MapIcon, Bath, Menu, X, MapPin, Navigation, Locate } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as Hangul from "hangul-js";
import { SUBWAY_LINES, Station } from "@/data/subway-lines";

interface FloatingSearchBarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    onSearch: (start: string, end: string) => void;
    startStation: string | null;
    endStation: string | null;
    isDarkMode: boolean;
}

// Chosung matching helper using hangul-js
const matchChosung = (query: string, target: string) => {
    const disassembledQuery = Hangul.disassemble(query).join("");
    const disassembledTarget = Hangul.disassemble(target).join("");
    
    // Check if query is all chosung
    const isAllChosung = query.split("").every(char => {
        const code = char.charCodeAt(0);
        return code >= 0x3131 && code <= 0x314E; //ㄱ ~ ㅎ
    });

    if (isAllChosung) {
        // Match only chosung
        const targetChosung = Hangul.disassemble(target, true)
            .map(j => j[0])
            .join("");
        return targetChosung.includes(query);
    }

    return disassembledTarget.includes(disassembledQuery);
};

interface SearchResult {
    type: 'subway' | 'bus_route';
    name?: string;
    no?: string;
    id?: string;
    region?: string;
    type_name?: string;
    lines?: string[];
}

export default function FloatingSearchBar({ 
    activeTab, 
    onTabChange, 
    onSearch,
    startStation,
    endStation,
    isDarkMode 
}: FloatingSearchBarProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [destination, setDestination] = useState("");
    const [source, setSource] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [activeField, setActiveField] = useState<"source" | "dest" | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const allStations = useRef<Station[]>([]);
    const allBusRoutes = useRef<any[]>([]);

    useEffect(() => {
        const unique = new Map<string, Station>();
        SUBWAY_LINES.forEach(line => {
            line.stations.forEach(s => {
                if(!unique.has(s.name)) unique.set(s.name, s);
            });
        });
        allStations.current = Array.from(unique.values());

        // Load bus routes for search
        fetch('/metro/data/master-bus-routes.json')
            .then(res => res.json())
            .then(data => { allBusRoutes.current = data; })
            .catch(() => { console.debug("Bus routes not loaded yet"); });
    }, []);

    // Sync from external props (e.g. Map click)
    useEffect(() => {
        if (endStation) setDestination(endStation);
        if (startStation) setSource(startStation);
        if (endStation || startStation) setIsExpanded(true);
    }, [startStation, endStation]);

    const handleSearch = (val: string, type: "source" | "dest") => {
        if (type === "dest") setDestination(val);
        else setSource(val);

        if (val.length === 0) {
            setSearchResults([]);
            setSelectedIndex(-1);
            return;
        }

        const filteredStations = allStations.current.filter(s => {
            return matchChosung(val, s.name);
        }).slice(0, 5);

        // Include bus routes in search results
        const filteredRoutes = allBusRoutes.current.filter(r => {
            return r.no.includes(val);
        }).slice(0, 5);

        const combinedResults: any[] = [
            ...filteredStations.map(s => ({ ...s, type: 'subway' })),
            ...filteredRoutes.map(r => ({ ...r, type: 'bus_route' }))
        ];

        setSearchResults(combinedResults);
        setSelectedIndex(combinedResults.length > 0 ? 0 : -1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (searchResults.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === "Enter") {
            if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
                selectStation(searchResults[selectedIndex].name);
            }
        } else if (e.key === "Escape") {
            setSearchResults([]);
            setSelectedIndex(-1);
        }
    };

    const selectStation = (item: any) => {
        const name = item.type === 'bus_route' ? `${item.no}번 버스` : item.name;
        
        if (activeField === "dest") {
            setDestination(name);
            setActiveField(null);
            if (!item.type || item.type === 'subway') {
                if (!source) findNearestStation();
            }
        } else {
            setSource(name);
            setActiveField(null);
        }
        setSearchResults([]);
    };

    const findNearestStation = () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            let nearest = allStations.current[0];
            let minDist = Infinity;

            allStations.current.forEach(s => {
                const d = Math.sqrt(Math.pow(s.lat - latitude, 2) + Math.pow(s.lng - longitude, 2));
                if (d < minDist) {
                    minDist = d;
                    nearest = s;
                }
            });
            setSource(nearest.name);
        });
    };

    const tabs = [
        { id: "subway", label: "지하철", icon: <Train size={18} /> },
        { id: "bus", label: "버스", icon: <Bus size={18} /> },
        { id: "subway+bus", label: "통합", icon: <MapIcon size={18} /> },
        { id: "wc", label: "화장실", icon: <Bath size={18} /> },
    ];

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[3000] w-[92%] max-w-md pointer-events-none">
            <motion.div 
                layout
                className="flex flex-col gap-3"
            >
                {/* ─── Search Bar Core ───────────────────────────────────── */}
                <div className="glass-premium rounded-[32px] p-2 pointer-events-auto border border-white/20 shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden">
                    <div className="flex flex-col gap-2">
                        {/* Upper: Dest & Menu */}
                        <div className="flex items-center gap-2 px-1">
                            <button 
                                onClick={() => setIsExpanded(!isExpanded)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isExpanded ? "bg-zinc-100 dark:bg-white/10" : "bg-zinc-900 text-white"}`}
                            >
                                <Menu size={18} />
                            </button>
                            
                            <div className="flex-1 relative flex items-center px-3 h-11 bg-zinc-100/50 dark:bg-white/5 rounded-2xl">
                                <Search size={18} className="text-zinc-400 shrink-0" />
                                <input 
                                    type="text"
                                    placeholder="어디로 가시나요?"
                                    value={destination}
                                    onFocus={() => { setActiveField("dest"); setIsExpanded(true); }}
                                    onChange={(e) => handleSearch(e.target.value, "dest")}
                                    onKeyDown={handleKeyDown}
                                    className="flex-1 bg-transparent border-none outline-none font-bold text-sm px-2 placeholder:text-zinc-400"
                                />
                                {destination && (
                                    <button onClick={() => setDestination("")} className="p-1 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-full">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Mid: Source (Only if expanded) */}
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="flex flex-col gap-2 px-1 pb-1"
                                >
                                    <div className="h-[1px] bg-zinc-100 dark:bg-white/5 mx-2" />
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 flex items-center justify-center text-zinc-400">
                                            <Locate size={18} />
                                        </div>
                                        <div className="flex-1 flex items-center px-3 h-11 bg-zinc-100/50 dark:bg-white/5 rounded-2xl">
                                            <input 
                                                type="text"
                                                placeholder="출발지 (기본: 내 위치)"
                                                value={source}
                                                onFocus={() => setActiveField("source")}
                                                onChange={(e) => handleSearch(e.target.value, "source")}
                                                onKeyDown={handleKeyDown}
                                                className="flex-1 bg-transparent border-none outline-none font-bold text-sm px-2 placeholder:text-zinc-400"
                                            />
                                            <button onClick={findNearestStation} className="p-2 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-xl">
                                                <Navigation size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {destination && source && (
                                        <button 
                                            onClick={() => onSearch(source, destination)}
                                            className="w-full h-11 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-sm mt-1 shadow-lg active:scale-95 transition-all"
                                        >
                                            경로 최적화 시작
                                        </button>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* ─── Search Results Tooltip ─────────────────────────── */}
                <AnimatePresence>
                    {searchResults.length > 0 && activeField && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="glass-premium rounded-[24px] p-2 pointer-events-auto shadow-2xl overflow-hidden border border-white/20"
                        >
                            <div className="max-h-[200px] overflow-y-auto no-scrollbar">
                                {searchResults.map((s, i) => {
                                    const isSelected = i === selectedIndex;
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => selectStation(s)}
                                            onMouseEnter={() => setSelectedIndex(i)}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${isSelected ? "bg-zinc-100 dark:bg-white/10" : "hover:bg-zinc-50 dark:hover:bg-white/5"}`}
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/5 flex items-center justify-center shrink-0">
                                                {s.type === 'bus_route' ? (
                                                    <Bus size={14} className={isSelected ? "text-rose-500" : "text-rose-400"} />
                                                ) : (
                                                    <Train size={14} className={isSelected ? "text-zinc-900 dark:text-white" : "text-zinc-400"} />
                                                )}
                                            </div>
                                            <div className="flex flex-col flex-1">
                                                <span className="font-bold text-zinc-900 dark:text-white text-sm">
                                                    {s.type === 'bus_route' ? `${s.no}번 버스` : s.name}
                                                </span>
                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                    {s.type === 'bus_route' ? (
                                                        <span className="text-[10px] text-zinc-500">{s.region} · {s.type_name || '일반'}</span>
                                                    ) : (
                                                        s.lines?.map(lineName => {
                                                            const line = SUBWAY_LINES.find(l => l.name === lineName || (lineName.includes('호선') && l.name.includes(lineName.replace('호선', ''))));
                                                            const color = line?.color || "#94a3b8";
                                                            const shortName = lineName.replace('호선', '').replace('서울배차', '').trim();
                                                            return (
                                                                <div 
                                                                    key={lineName}
                                                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-black/5 dark:border-white/5 bg-white/50 dark:bg-black/20"
                                                                >
                                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                                                    <span className="text-[9px] font-black text-zinc-500 dark:text-zinc-400 leading-none">{shortName}</span>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ─── Category Pills ────────────────────────────────────── */}
                <div className="flex justify-center gap-2 pointer-events-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`
                                flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-bold transition-all border border-transparent
                                ${activeTab === tab.id 
                                    ? "bg-zinc-900 text-white shadow-xl scale-105 border-white/10" 
                                    : "glass-premium text-zinc-500 hover:bg-white/50 border-white/20"
                                }
                            `}
                        >
                            {tab.icon}
                            <span className="hidden xs:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
