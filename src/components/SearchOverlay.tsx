"use client";

import { useState } from "react";
import { Search, Plus, X, Navigation, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { chosungIncludes } from "@/utils/chosung";
import { SUBWAY_LINES } from "@/data/subway-lines";

interface SearchOverlayProps {
    onSearch: (start: string, waypoints: string[], end: string) => void;
    isDarkMode: boolean;
}

const ALL_STATIONS = Array.from(new Set(SUBWAY_LINES.flatMap(line => line.stations.map(s => s.name))));

export default function SearchOverlay({ onSearch, isDarkMode }: SearchOverlayProps) {
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [waypoints, setWaypoints] = useState<string[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeInput, setActiveInput] = useState<"start" | "end" | number | null>(null);

    const addWaypoint = () => {
        if (waypoints.length < 2) {
            setWaypoints([...waypoints, ""]);
        }
    };

    const removeWaypoint = (index: number) => {
        setWaypoints(waypoints.filter((_, i) => i !== index));
    };

    const updateWaypoint = (index: number, value: string) => {
        const newWaypoints = [...waypoints];
        newWaypoints[index] = value;
        setWaypoints(newWaypoints);
    };

    const filteredStations = (query: string) => {
        if (!query) return [];
        return ALL_STATIONS.filter(name => chosungIncludes(name, query)).slice(0, 5);
    };

    const handleSelectStation = (name: string) => {
        if (activeInput === "start") setStart(name);
        else if (activeInput === "end") setEnd(name);
        else if (typeof activeInput === "number") updateWaypoint(activeInput, name);
        setActiveInput(null);
    };

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[5000] w-full max-w-md px-4">
            <motion.div 
                layout
                className="glass rounded-[28px] p-2 overflow-hidden shadow-2xl"
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 20, stiffness: 100 }}
            >
                <div className="flex flex-col">
                    {/* Start Input */}
                    <div className="flex items-center gap-3 px-4 h-14">
                        <div className="w-2.5 h-2.5 rounded-full border-2 border-blue-500 bg-white" />
                        <input
                            type="text"
                            placeholder="출발지 검색"
                            value={start}
                            onChange={(e) => setStart(e.target.value)}
                            onFocus={() => {
                                setIsExpanded(true);
                                setActiveInput("start");
                            }}
                            className="flex-1 bg-transparent border-none outline-none text-[15px] font-medium placeholder:text-gray-400"
                        />
                        {isExpanded ? (
                             <button onClick={() => {
                                setIsExpanded(false);
                                setActiveInput(null);
                             }} className="p-2 text-gray-400 hover:text-gray-600">
                                <X size={18} />
                             </button>
                        ) : (
                            <Search size={18} className="text-gray-400" />
                        )}
                    </div>

                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-gray-100/50"
                            >
                                {/* Vertical Connectivity Line (Uber Style) */}
                                <div className="absolute left-[33px] top-[48px] bottom-[48px] w-[1px] bg-zinc-200/60 dark:bg-zinc-700/60 z-0" />

                                {/* Waypoints */}
                                {waypoints.map((wp, i) => (
                                    <div key={i} className="flex items-center gap-3 px-4 h-14 relative z-10">
                                        <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                                        <input
                                            type="text"
                                            placeholder={`경유지 ${i + 1}`}
                                            value={wp}
                                            onChange={(e) => updateWaypoint(i, e.target.value)}
                                            onFocus={() => setActiveInput(i)}
                                            className="flex-1 bg-transparent border-none outline-none text-[15px] font-medium placeholder:text-gray-400"
                                        />
                                        <button onClick={() => removeWaypoint(i)} className="p-2 text-gray-300 hover:text-rose-500">
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}

                                {/* Add Waypoint Button */}
                                {waypoints.length < 2 && (
                                    <button 
                                        onClick={addWaypoint}
                                        className="flex items-center gap-3 px-4 h-10 text-[13px] text-blue-500 font-bold hover:text-blue-600 mb-2"
                                    >
                                        <Plus size={16} className="ml-0.5" />
                                        <span>경유지 추가</span>
                                    </button>
                                )}

                                {/* End Input */}
                                <div className="flex items-center gap-3 px-4 h-14 relative z-10">
                                    <MapPin size={14} className="text-rose-500 ml-[-2px]" />
                                    <input
                                        type="text"
                                        placeholder="도착지 검색"
                                        value={end}
                                        onChange={(e) => setEnd(e.target.value)}
                                        onFocus={() => setActiveInput("end")}
                                        className="flex-1 bg-transparent border-none outline-none text-[15px] font-medium placeholder:text-gray-400"
                                    />
                                    <button 
                                        onClick={() => {
                                            onSearch(start, waypoints, end);
                                            setIsExpanded(false);
                                            setActiveInput(null);
                                        }}
                                        className="bg-black text-white h-9 px-4 rounded-full text-[13px] font-bold shadow-lg flex items-center gap-2 hover:bg-zinc-800 transition-all"
                                    >
                                        <Navigation size={14} />
                                        <span>길찾기</span>
                                    </button>
                                </div>

                                {/* Search Suggestions */}
                                <AnimatePresence>
                                    {activeInput !== null && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="px-4 pb-4 flex flex-wrap gap-2"
                                        >
                                            {filteredStations(
                                                activeInput === "start" ? start : 
                                                activeInput === "end" ? end : 
                                                waypoints[activeInput as number] || ""
                                            ).map(name => (
                                                <button
                                                    key={name}
                                                    onClick={() => handleSelectStation(name)}
                                                    className="px-3 py-1.5 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700 hover:bg-black hover:text-white transition-all"
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
