"use client";

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Navigation, X, Locate, Train, Bus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SUBWAY_LINES, Station } from "@/data/subway-lines";

interface BottomSearchPanelProps {
    onSearch: (start: string, end: string) => void;
    startStation: string | null;
    endStation: string | null;
    isDarkMode: boolean;
}

// Chosung matching helper
const getChosung = (str: string) => {
    const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    let result = "";
    for(let i=0; i<str.length; i++) {
        const code = str.charCodeAt(i) - 44032;
        if(code > -1 && code < 11172) result += cho[Math.floor(code / 588)];
        else result += str.charAt(i);
    }
    return result;
};

export default function BottomSearchPanel({ onSearch, startStation, endStation, isDarkMode }: BottomSearchPanelProps) {
    const [destination, setDestination] = useState("");
    const [source, setSource] = useState("");
    const [showSourceField, setShowSourceField] = useState(false);
    const [searchResults, setSearchResults] = useState<Station[]>([]);
    const [activeField, setActiveField] = useState<"source" | "dest" | null>(null);

    const allStations = useRef<Station[]>([]);

    useEffect(() => {
        const unique = new Map<string, Station>();
        SUBWAY_LINES.forEach(line => {
            line.stations.forEach(s => {
                if(!unique.has(s.name)) unique.set(s.name, s);
            });
        });
        allStations.current = Array.from(unique.values());
    }, []);

    // Effect to sync with external props (Popups)
    useEffect(() => {
        if (endStation) {
            setDestination(endStation);
            setShowSourceField(true);
        }
        if (startStation) setSource(startStation);
    }, [startStation, endStation]);

    const handleSearch = (val: string, type: "source" | "dest") => {
        if (type === "dest") setDestination(val);
        else setSource(val);

        if (val.length === 0) {
            setSearchResults([]);
            return;
        }

        const query = val.toLowerCase();
        const queryCho = getChosung(query);

        const filtered = allStations.current.filter(s => {
            const name = s.name.toLowerCase();
            const nameCho = getChosung(name);
            return name.includes(query) || nameCho.includes(queryCho);
        }).slice(0, 10);

        setSearchResults(filtered);
    };

    const selectStation = (name: string) => {
        if (activeField === "dest") {
            setDestination(name);
            setShowSourceField(true);
            setActiveField(null);
            // Auto-locate nearest for source if empty
            if (!source) findNearestStation();
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

    return (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] w-[92%] max-w-lg pointer-events-none">
            {/* ─── Search Results Tooltip (Above) ─────────────────────── */}
            <AnimatePresence>
                {searchResults.length > 0 && activeField && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="glass-premium rounded-[24px] mb-3 p-2 pointer-events-auto overflow-hidden shadow-2xl"
                    >
                        <div className="max-h-[240px] overflow-y-auto no-scrollbar">
                            {searchResults.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => selectStation(s.name)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-2xl transition-all active:scale-[0.98]"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-white/5 flex items-center justify-center">
                                        <Train size={16} className="text-zinc-400" />
                                    </div>
                                    <div className="flex flex-col items-start">
                                        <span className="font-bold text-zinc-900 dark:text-white">{s.name}</span>
                                        <span className="text-[10px] text-zinc-400 uppercase tracking-tighter">{s.lines.join(", ")}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Search Panel Box ──────────────────────────────────── */}
            <div className="glass-premium rounded-[32px] p-4 pointer-events-auto shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
                <div className="flex flex-col gap-3">
                    {/* Destination Field */}
                    <div className={`relative flex items-center gap-3 px-4 h-14 rounded-2xl transition-all ${activeField === "dest" ? "bg-white dark:bg-zinc-800 ring-2 ring-blue-500/30" : "bg-zinc-100 dark:bg-white/5"}`}>
                        <MapPin size={20} className={destination ? "text-blue-500" : "text-zinc-400"} />
                        <input 
                            type="text"
                            placeholder="어디로 가시나요?"
                            value={destination}
                            onFocus={() => setActiveField("dest")}
                            onChange={(e) => handleSearch(e.target.value, "dest")}
                            className="flex-1 bg-transparent border-none outline-none font-bold text-lg placeholder:text-zinc-400"
                        />
                        {destination && (
                            <button onClick={() => setDestination("")} className="p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10">
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Source Field (Reveals when Dest is touched or active) */}
                    <AnimatePresence>
                        {showSourceField && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0, marginTop: -12 }}
                                animate={{ height: "auto", opacity: 1, marginTop: 0 }}
                                className="relative flex items-center gap-3 px-4 h-14 rounded-2xl bg-zinc-100 dark:bg-white/5"
                            >
                                <Locate size={20} className={source ? "text-green-500" : "text-zinc-400"} />
                                <input 
                                    type="text"
                                    placeholder="출발지 (기본: 내 위치)"
                                    value={source}
                                    onFocus={() => setActiveField("source")}
                                    onChange={(e) => handleSearch(e.target.value, "source")}
                                    className="flex-1 bg-transparent border-none outline-none font-bold text-lg placeholder:text-zinc-400"
                                />
                                <button 
                                    onClick={findNearestStation}
                                    className="p-2 rounded-xl bg-white dark:bg-white/5 shadow-sm active:scale-90"
                                >
                                    <Navigation size={18} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Action Button */}
                    <AnimatePresence>
                        {destination && source && (
                            <motion.button 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => onSearch(source, destination)}
                                className="h-14 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-lg shadow-xl active:scale-[0.96] transition-all"
                            >
                                경로 최적화 시작
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
