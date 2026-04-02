"use client";

import { useEffect, useState } from "react";
import L from "leaflet";
import { createRoot } from "react-dom/client";
import { useArrivalInfo } from "@/hooks/useArrivalInfo";
import { StationArrival } from "@/types/metro";
import { Train, MapPin, Navigation, Clock, Search, Phone, Map as StationMap, Baby, Accessibility, Info } from "lucide-react";
import { getLineShortName } from "@/utils/stationUtils";
import { db } from "@/services/db";
import { Station, Facility } from "@/types/metro";

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
    const [stationMeta, setStationMeta] = useState<Station | null>(null);
    const [facilities, setFacilities] = useState<Facility[]>([]);

    useEffect(() => {
        if (type === "subway") {
            db.getStationByName(name).then(s => setStationMeta(s || null));
            db.getStationFacilities(name).then(setFacilities);
        }
    }, [name, type]);

    const hasFacility = (cat: string) => facilities.some(f => f.category === cat);

    return (
        <div className="flex flex-col min-w-[300px] max-w-[340px] p-0 overflow-hidden rounded-[24px] bg-white dark:bg-[#1c1c1e] transition-all shadow-2xl">
            {/* Header: Station Name & Type Badge */}
            <div className="flex items-center justify-between px-5 pt-6 pb-4">
                <div className="flex flex-col">
                    <span className={`text-[11px] font-black uppercase tracking-widest mb-1 ${
                        type === "subway" ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
                    }`}>
                        {type === "subway" ? "METRO STATION" : "BUS STATION"}
                    </span>
                    <h2 className="text-[26px] font-black tracking-tight text-zinc-900 dark:text-white leading-tight">
                        {name}
                    </h2>
                    {stationMeta?.address && (
                        <div className="flex items-center gap-1 mt-1.5 opacity-50">
                            <StationMap size={10} className="text-zinc-900 dark:text-white" />
                            <span className="text-[10px] font-bold truncate max-w-[180px]">{stationMeta.address}</span>
                        </div>
                    )}
                </div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${
                    type === "subway" ? "bg-blue-50 dark:bg-blue-500/10" : "bg-orange-50 dark:bg-orange-500/10"
                }`}>
                    {type === "subway" ? (
                        <Train size={28} className="text-blue-600 dark:text-blue-400" />
                    ) : (
                        <Navigation size={28} className="text-orange-600 dark:text-orange-400" />
                    )}
                </div>
            </div>

            {/* Quick Info Bar (Tel & Facilities) */}
            {type === "subway" && (
                <div className="px-5 pb-5 flex items-center justify-between border-b border-zinc-100 dark:border-white/5">
                    <div className="flex gap-2">
                        {stationMeta?.tel && (
                            <a href={`tel:${stationMeta.tel}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/5 text-[11px] font-black text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all active:scale-95">
                                <Phone size={12} className="text-blue-500" />
                                <span>문의처</span>
                            </a>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {hasFacility('elevator') && (
                            <div className="flex flex-col items-center gap-0.5">
                                <Accessibility size={16} className="text-blue-500" />
                                <span className="text-[7px] font-black opacity-40">E/V</span>
                            </div>
                        )}
                        {(hasFacility('nursing') || stationMeta?.hasNursingRoom) && (
                            <div className="flex flex-col items-center gap-0.5">
                                <Baby size={16} className="text-rose-500" />
                                <span className="text-[7px] font-black opacity-40">수유실</span>
                            </div>
                        )}
                        {(hasFacility('parking') || (stationMeta?.parkingCount || 0) > 0) && (
                            <div className="flex flex-col items-center gap-0.5">
                                <div className="w-4 h-4 rounded-sm bg-emerald-500 flex items-center justify-center text-[9px] font-black text-white">P</div>
                                <span className="text-[7px] font-black opacity-40">주차장</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Arrivals Section */}
            {type === "subway" && (
                <div className="px-5 py-4 bg-zinc-50/50 dark:bg-black/20">
                    {arrivals.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {/* Prioritize diversity: at least one per line if possible */}
                            {(() => {
                                const grouped = new Map<string, StationArrival[]>();
                                arrivals.forEach(a => {
                                    if (!grouped.has(a.lineName)) grouped.set(a.lineName, []);
                                    grouped.get(a.lineName)!.push(a);
                                });
                                
                                const diverseList: StationArrival[] = [];
                                const lines = Array.from(grouped.keys());
                                let idx = 0;
                                while (diverseList.length < 6 && lines.some(l => (grouped.get(l)?.length || 0) > idx)) {
                                    lines.forEach(l => {
                                        const list = grouped.get(l);
                                        if (list && list[idx]) diverseList.push(list[idx]);
                                    });
                                    idx++;
                                }
                                return diverseList.slice(0, 6);
                            })().map((a, i) => (
                                <div key={i} className="flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-black shadow-sm ${
                                            a.lineName.includes('1') ? 'bg-blue-900/20 text-blue-700' :
                                            a.lineName.includes('4') ? 'bg-sky-500/20 text-sky-600' :
                                            a.lineName.includes('공항') ? 'bg-blue-400/20 text-blue-500' :
                                            a.lineName.includes('A') ? 'bg-purple-600/20 text-purple-600' :
                                            'bg-zinc-500/20 text-zinc-500'
                                        }`}>
                                            {getLineShortName(a.lineName)}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 leading-tight">
                                                {a.trainLineNm}
                                            </span>
                                            <span className="text-[10px] text-zinc-500 font-medium tracking-tight">
                                                {a.isScheduled ? "예정 스케줄" : "실시간 도착"}
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`text-[13px] font-black ${a.arvlMsg2.includes('전') || a.arvlMsg2.includes('곧') ? 'text-rose-500 animate-pulse' : 'text-zinc-800 dark:text-white'}`}>
                                        {a.arvlMsg2}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 py-1 opacity-50">
                            <Info size={14} />
                            <span className="text-[12px] font-bold">도착 정보가 없습니다.</span>
                        </div>
                    )}
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

            {/* Action Buttons: The "BMW Live" Triad */}
            <div className="grid grid-cols-3 gap-3 p-5">
                <button 
                    onClick={() => onSetStart(name)}
                    className="flex flex-col items-center justify-center gap-2.5 p-3.5 rounded-[22px] bg-blue-600 hover:bg-blue-700 text-white transition-all active:scale-[0.92] shadow-xl shadow-blue-500/25"
                >
                    <Search size={20} strokeWidth={3} />
                    <span className="text-[13px] font-black">출발</span>
                </button>
                <button 
                    onClick={() => onSetWaypoint?.(name)}
                    className="flex flex-col items-center justify-center gap-2.5 p-3.5 rounded-[22px] bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-800 dark:text-white transition-all active:scale-[0.92]"
                >
                    <Navigation size={20} strokeWidth={3} className="text-zinc-400" />
                    <span className="text-[13px] font-black">경유</span>
                </button>
                <button 
                    onClick={() => onSetEnd(name)}
                    className="flex flex-col items-center justify-center gap-2.5 p-3.5 rounded-[22px] bg-rose-500 hover:bg-rose-600 text-white transition-all active:scale-[0.92] shadow-xl shadow-rose-500/25"
                >
                    <MapPin size={20} strokeWidth={3} />
                    <span className="text-[13px] font-black">도착</span>
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
