"use client";

import { useEffect, useState } from "react";
import L from "leaflet";
import { createRoot } from "react-dom/client";
import { useArrivalInfo, ArrivalInfo } from "@/hooks/useArrivalInfo";
import { Train, MapPin, Navigation, Clock, Search } from "lucide-react";
import { getLineShortName } from "@/utils/stationUtils";

interface StationPopupProps {
    name: string;
    type: "subway" | "bus";
    onSetStart: (name: string) => void;
    onSetEnd: (name: string) => void;
    onSetWaypoint?: (name: string) => void;
    onSelectRoute?: (routeName: string) => void;
    isDarkMode: boolean;
    routes?: string[];
}

export default function StationPopup({ name, type, onSetStart, onSetEnd, onSetWaypoint, onSelectRoute, isDarkMode, routes = [] }: StationPopupProps) {
    const { arrivals, schedules, loading } = useArrivalInfo(type === "subway" ? name : null);

    return (
        <div className="flex flex-col min-w-[280px] max-w-[320px] p-0 overflow-hidden rounded-[24px] bg-white dark:bg-[#1c1c1e] transition-all">
            {/* Header: Station Name & Type Badge */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex flex-col">
                    <span className={`text-[11px] font-black uppercase tracking-widest mb-0.5 ${
                        type === "subway" ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
                    }`}>
                        {type === "subway" ? "METRO STATION" : "BUS STATION"}
                    </span>
                    <h2 className="text-[24px] font-black tracking-tight text-zinc-900 dark:text-white leading-tight">
                        {name}
                    </h2>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${
                    type === "subway" ? "bg-blue-50 dark:bg-blue-500/10" : "bg-orange-50 dark:bg-orange-500/10"
                }`}>
                    {type === "subway" ? (
                        <Train size={24} className="text-blue-600 dark:text-blue-400" />
                    ) : (
                        <Navigation size={24} className="text-orange-600 dark:text-orange-400" />
                    )}
                </div>
            </div>

            {/* Arrivals Section (Subway focus) */}
            {type === "subway" && arrivals.length > 0 && (
                <div className="px-5 py-3 border-y border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-black/20">
                    <div className="flex flex-col gap-2.5">
                        {arrivals.slice(0, 3).map((a, i) => (
                            <div key={i} className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-blue-600/10 dark:bg-blue-500/20 flex items-center justify-center text-[11px] font-black text-blue-600 dark:text-blue-400">
                                        {getLineShortName(a.lineName)}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                                            {a.trainLineNm}
                                        </span>
                                        <span className="text-[11px] text-zinc-500 font-medium">실시간 도착 정보</span>
                                    </div>
                                </div>
                                <span className={`text-[13px] font-black ${a.arvlMsg2.includes('전') ? 'text-rose-500 animate-pulse' : 'text-zinc-800 dark:text-white'}`}>
                                    {a.arvlMsg2}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {/* Bus Routes Section */}
            {type === "bus" && routes.length > 0 && (
                <div className="px-5 py-3 border-y border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-black/20">
                    <div className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-2">Passing Routes</div>
                    <div className="flex flex-wrap gap-2">
                        {routes.map((r, i) => (
                            <button
                                key={i}
                                onClick={() => onSelectRoute?.(r)}
                                className="px-3 py-1.5 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/20 text-orange-600 dark:text-orange-400 text-[12px] font-black hover:bg-orange-500 hover:text-white transition-all active:scale-95"
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* First/Last Train Info */}
            {type === "subway" && (
                <div className="px-5 py-3 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between bg-zinc-50/30 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-1.5 opacity-60">
                        <Clock size={12} className="text-zinc-900 dark:text-white" />
                        <span className="text-[12px] font-bold">첫차 05:30</span>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-60">
                        <Clock size={12} className="text-zinc-900 dark:text-white" />
                        <span className="text-[12px] font-bold">막차 24:15</span>
                    </div>
                </div>
            )}

            {/* Action Buttons: The "BMW Live" Triad */}
            <div className="grid grid-cols-3 gap-2 p-4">
                <button 
                    onClick={() => onSetStart(name)}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-[20px] bg-blue-600 hover:bg-blue-700 text-white transition-all active:scale-[0.92] shadow-lg shadow-blue-500/20"
                >
                    <Search size={18} strokeWidth={3} />
                    <span className="text-[12px] font-black">출발</span>
                </button>
                <button 
                    onClick={() => onSetWaypoint?.(name)}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-[20px] bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-800 dark:text-white transition-all active:scale-[0.92]"
                >
                    <Navigation size={18} strokeWidth={3} className="text-zinc-400" />
                    <span className="text-[12px] font-black">경유</span>
                </button>
                <button 
                    onClick={() => onSetEnd(name)}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-[20px] bg-rose-500 hover:bg-rose-600 text-white transition-all active:scale-[0.92] shadow-lg shadow-rose-500/20"
                >
                    <MapPin size={18} strokeWidth={3} />
                    <span className="text-[12px] font-black">도착</span>
                </button>
            </div>
        </div>
    );
}

// Helper to create a Leaflet-compatible popup content using createRoot
export function createStationPopup(props: StationPopupProps) {
    const container = document.createElement("div");
    // Remove default Leaflet popup styles to match our premium look
    container.style.padding = "0";
    container.style.margin = "0";
    
    const root = createRoot(container);
    root.render(<StationPopup {...props} />);
    return container;
}
