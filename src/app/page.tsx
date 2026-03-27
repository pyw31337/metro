"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import { Train, Bus, Bath } from "lucide-react";
import { createRoot } from "react-dom/client";
import { SUBWAY_LINES, Station } from "@/data/subway-lines";
import { PathResult, findShortestPath } from "@/utils/pathfinding";
import type { ActiveTab } from "@/components/MapBackground";
import type { WCItem } from "@/components/WCLayer";
import type { BusStop } from "@/components/BusStopLayer";
import { fetchWCDataClient } from "@/services/wcApi";
import busData from "@/data/bus-stops.json";

const MapBackground = dynamic(() => import("@/components/MapBackground"), { ssr: false });
const UnifiedBottomPanel = dynamic(() => import("@/components/UnifiedBottomPanel"), { ssr: false });
const StationPopup = dynamic(() => import("@/components/StationPopup"), { ssr: false });

export default function Home() {
    const [pathResult, setPathResult] = useState<PathResult | null>(null);
    const [startStation, setStartStation] = useState<string | null>(null);
    const [endStation, setEndStation] = useState<string | null>(null);
    const [waypoints, setWaypoints] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<ActiveTab>("subway");
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [selectedWC, setSelectedWC] = useState<WCItem | null>(null);
    const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);
    const [wcItems, setWcItems] = useState<WCItem[]>([]);
    const [nearestWCs, setNearestWCs] = useState<WCItem[]>([]);
    const [wcLoading, setWcLoading] = useState(false);
    const [wcFilters, setWcFilters] = useState({ accessible: false, diapers: false, emergencyBell: false });
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [selectedStationName, setSelectedStationName] = useState<string | null>(null);
    const busStops = busData as BusStop[];
    
    // Memoized stations list for search
    const stations = useMemo(() => {
        const unique = new Map<string, Station>();
        SUBWAY_LINES.forEach(line => {
            line.stations.forEach(s => {
                if(!unique.has(s.name)) unique.set(s.name, s);
            });
        });
        return Array.from(unique.values());
    }, []);

    // Map instance ref for popups
    const mapRef = useRef<L.Map | null>(null);

    // ─── Data Loading ──────────────────────────────────────────────────────────
    useEffect(() => {
        setWcLoading(true);
        fetchWCDataClient().then(data => {
            setWcItems(data);
            setWcLoading(false);
        });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                setUserLocation([latitude, longitude]);
                
                // Auto-fill nearest station on first load
                if (!startStation && stations.length > 0) {
                    let nearestName = "";
                    let minDist = Infinity;
                    let nearestLine = "";
                    stations.forEach(s => {
                        const d = Math.sqrt(Math.pow(s.lat - latitude, 2) + Math.pow(s.lng - longitude, 2));
                        if (d < minDist) { 
                            minDist = d; 
                            nearestName = s.name;
                            nearestLine = s.lines ? s.lines[0] : "";
                        }
                    });
                    if (nearestName) {
                        setStartStation(`내 위치 : ${nearestName} ${nearestLine}`);
                    }
                }
            });
        }
    }, [stations, startStation]);

    useEffect(() => {
        if (activeTab === "wc" && userLocation && wcItems.length > 0) {
            const sorted = [...wcItems].sort((a, b) => {
                const distA = Math.sqrt(Math.pow(a.lat - userLocation[0], 2) + Math.pow(a.lng - userLocation[1], 2));
                const distB = Math.sqrt(Math.pow(b.lat - userLocation[0], 2) + Math.pow(b.lng - userLocation[1], 2));
                return distA - distB;
            }).slice(0, 3);
            setNearestWCs(sorted);
        }
    }, [activeTab, userLocation, wcItems]);

    // ─── Pathfinding Logic ─────────────────────────────────────────────────────
    const calculatePath = useCallback((start: string | null, waypoints: string[], end: string | null) => {
        if (!start || !end) {
            setPathResult(null);
            return;
        }
        const points = [start, ...waypoints.filter(w => w.trim() !== ""), end];
        const res = findShortestPath(points);
        setPathResult(res);
    }, []);

    useEffect(() => {
        calculatePath(startStation, waypoints, endStation);
    }, [startStation, waypoints, endStation, calculatePath]);

    // ─── Map Interactions (Popups) ─────────────────────────────────────────────
    const handleMapClick = (name: string, latlng: [number, number], type: "subway" | "bus") => {
        // We need the Leaflet map object to open a popup
        // Instead of a ref, we can find the map from the DOM if needed, 
        // but it's better to pass a 'triggerPopup' to MapBackground.
        // Actually, easiest is to use a global event or a simpler state-based approach.
        // For now, let's assume MapBackground handles the popup creation.
    };

    const handleStationClick = (name: string, latlng: [number, number], type: "subway" | "bus") => {
        // Update selection state for high-contrast labeling
        setSelectedStationName(name);
        console.log(`Station clicked: ${name} (${type}) at ${latlng}`);
    };

    const setStart = (name: string) => {
        setStartStation(name);
        // MapBackground should automatically close popups when map is clicked elsewhere
    };

    const setEnd = (name: string) => {
        setEndStation(name);
    };

    const handleReset = () => {
        setStartStation(null);
        setEndStation(null);
        setWaypoints([]);
        setPathResult(null);
        setSelectedStationName(null);
        setSelectedWC(null);
        setSelectedBusStop(null);
    };

    return (
        <main className="relative w-full h-[100dvh] overflow-hidden bg-white dark:bg-black font-sans">
            {/* Layer 1: Full-screen Map Background */}
            <div className="absolute inset-0 z-10">
                <MapBackground
                    pathResult={pathResult}
                    startStation={startStation}
                    endStation={endStation}
                    isDarkMode={isDarkMode}
                    wcItems={wcItems}
                    wcFilters={wcFilters}
                    busStops={busStops}
                    activeTab={activeTab}
                    selectedBusStopId={selectedBusStop?.id ?? null}
                    onWCClick={setSelectedWC}
                    onBusStopClick={setSelectedBusStop}
                    onStationClick={(name, latlng) => handleStationClick(name, latlng as [number, number], "subway")}
                    selectedStationName={selectedStationName}
                    selectedWC={selectedWC}
                    selectedBusStop={selectedBusStop}
                    onSetStart={setStartStation}
                    onSetEnd={setEndStation}
                    onSetWaypoint={(name) => setWaypoints([...waypoints, name])}
                />
            </div>

            {/* Unified Bottom UI */}
            <UnifiedBottomPanel 
                activeTab={activeTab}
                onTabChange={(tab) => setActiveTab(tab as ActiveTab)}
                onSearch={(start, end) => {
                    setStartStation(start);
                    setEndStation(end);
                }}
                onReset={handleReset}
                startStation={startStation}
                endStation={endStation}
                isDarkMode={isDarkMode}
                stations={stations}
                busStops={busStops}
            >
                {/* ─── Bottom Sheet Contents (Simplified: No legacy details) ───────────── */}
                {pathResult ? (
                    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom duration-500">
                        <div className="flex items-center justify-between">
                            <div className="text-[20px] font-black tracking-tight flex flex-col">
                                <span className="text-blue-600 dark:text-blue-400 text-sm font-black uppercase tracking-widest leading-none mb-1">RECOMMENDED ROUTE</span>
                                <div className="flex items-center gap-2">
                                    약 {Math.round(pathResult.totalWeight * 1.5)}분
                                    <span className="text-zinc-300 dark:text-zinc-600 text-sm font-normal">| {pathResult.path.length}개 역</span>
                                </div>
                            </div>
                            <div className="px-4 py-2 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-[13px] font-black">
                                환승 {pathResult.transferCount}회
                            </div>
                        </div>

                        {/* Display filtered path nodes to avoid duplication */}
                        <div className="flex flex-col gap-2 relative pl-4">
                            {/* Vertical Line Connector */}
                            <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-zinc-200 dark:bg-zinc-800"></div>
                            
                            {pathResult.path.map((name, idx) => {
                                const isStart = idx === 0;
                                const isEnd = idx === pathResult.path.length - 1;
                                
                                return (
                                    <div key={idx} className="flex items-center gap-5 relative group">
                                        <div className={`w-3 h-3 rounded-full border-2 z-10 ${
                                            isStart ? 'bg-blue-600 border-blue-200' : 
                                            isEnd ? 'bg-rose-500 border-rose-200' : 
                                            'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700'
                                        }`}></div>
                                        <div className={`font-extrabold text-[15px] ${isStart || isEnd ? 'text-zinc-900 dark:text-white' : 'text-zinc-500'}`}>
                                            {name}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : activeTab === "wc" ? (
                    <div className="flex flex-col gap-6 pb-10">
                        <div className="text-xl font-black">📍 가까운 화장실</div>
                        <div className="flex flex-col gap-3">
                            {nearestWCs.map((wc) => (
                                <button 
                                    key={wc.id}
                                    onClick={() => setSelectedWC(wc)}
                                    className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-left hover:border-blue-500 transition-all"
                                >
                                    <div className="font-bold">{wc.name}</div>
                                    <div className="text-xs text-zinc-400 mt-1">{wc.address}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div className="text-zinc-400 text-center py-10">
                            지도의 역이나 정류장을 눌러보세요
                        </div>
                    </div>
                )}
            </UnifiedBottomPanel>

            {/* Hidden Utils */}
            <div className="fixed top-6 right-6 z-[2001]">
                <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="w-12 h-12 rounded-full glass-premium flex items-center justify-center text-zinc-600 dark:text-zinc-200"
                >
                    {isDarkMode ? "☀️" : "🌙"}
                </button>
            </div>
        </main>
    );
}
