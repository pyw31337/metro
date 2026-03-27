"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import { Train, Bus, Bath } from "lucide-react";
import { createRoot } from "react-dom/client";
import { PathResult, findShortestPath } from "@/utils/pathfinding";
import type { ActiveTab } from "@/components/MapBackground";
import type { WCItem } from "@/components/WCLayer";
import type { BusStop } from "@/components/BusStopLayer";
import { fetchWCDataClient } from "@/services/wcApi";
import busData from "@/data/bus-stops.json";

const MapBackground = dynamic(() => import("@/components/MapBackground"), { ssr: false });
const BottomSearchPanel = dynamic(() => import("@/components/BottomSearchPanel"), { ssr: false });
const BottomNavigationBar = dynamic(() => import("@/components/BottomNavigationBar"), { ssr: false });
const DraggableBottomSheet = dynamic(() => import("@/components/DraggableBottomSheet"), { ssr: false });
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
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const busStops = busData as BusStop[];
    
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
                setUserLocation([pos.coords.latitude, pos.coords.longitude]);
            });
        }
    }, []);

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
        // This function is called when a station is clicked on the map.
        // For now, we'll just log it. Further implementation might involve
        // setting a selected station state to display info in the bottom sheet.
        console.log(`Station clicked: ${name} (${type}) at ${latlng}`);
        // If you want to show a popup, you'd typically use mapRef.current.openPopup() here
        // or pass this info to a component that manages popups.
    };

    const setStart = (name: string) => {
        setStartStation(name);
        // MapBackground should automatically close popups when map is clicked elsewhere
    };

    const setEnd = (name: string) => {
        setEndStation(name);
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
                    busStops={busStops}
                    activeTab={activeTab}
                    selectedBusStopId={selectedBusStop?.id ?? null}
                    onWCClick={setSelectedWC}
                    onBusStopClick={setSelectedBusStop}
                    onStationClick={(name, latlng) => handleStationClick(name, latlng as [number, number], "subway")}
                    onSetStart={setStartStation}
                    onSetEnd={setEndStation}
                    onSetWaypoint={(name) => setWaypoints([...waypoints, name])}
                />
            </div>

            {/* Layer 2: Bottom Navigation & Search Panel */}
            <BottomSearchPanel 
                onSearch={(start, end) => {
                    setStartStation(start);
                    setEndStation(end);
                }}
                startStation={startStation}
                endStation={endStation}
                isDarkMode={isDarkMode}
            />

            <BottomNavigationBar 
                activeTab={activeTab} 
                onTabChange={(tab) => setActiveTab(tab as ActiveTab)} 
            />

            {/* Layer 3: Draggable Bottom Sheet (Info & Navigation) */}
            <DraggableBottomSheet 
                isOpen={true} 
                onClose={() => {}}
                snapPoints={[100, 450, 800]}
            >
                {/* ─── Bottom Sheet Contents ───────────────────────────── */}
                {pathResult ? (
                    <div className="flex flex-col gap-6">
                        <div className="text-[20px] font-black tracking-tight flex items-center gap-2">
                             최적 경로 <span className="text-zinc-400 text-sm font-normal">| {pathResult.path.length}개 역</span>
                        </div>
                    </div>
                ) : activeTab === "wc" ? (
                    <div className="flex flex-col gap-6">
                        <div className="text-xl font-black">📍 가까운 화장실</div>
                        {selectedWC ? (
                            <div className="p-5 rounded-3xl bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <div className="text-lg font-black">{selectedWC.name}</div>
                                        <div className="text-sm text-zinc-500">{selectedWC.address}</div>
                                    </div>
                                    <div className="px-3 py-1 bg-blue-500 text-white text-[10px] font-bold rounded-full uppercase">Selected</div>
                                </div>
                                <div className="flex gap-2 mb-4">
                                    {selectedWC.accessible && <span className="px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg text-[10px] border border-zinc-100 dark:border-zinc-700 font-bold">♿ 장애인</span>}
                                    {selectedWC.diapers && <span className="px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg text-[10px] border border-zinc-100 dark:border-zinc-700 font-bold">🍼 기저귀</span>}
                                    {selectedWC.emergencyBell && <span className="px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg text-[10px] border border-zinc-100 dark:border-zinc-700 font-bold">🔔 비상벨</span>}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <a href={`https://map.naver.com/v5/search/${encodeURIComponent(selectedWC.address)}`} target="_blank" className="flex items-center justify-center h-12 bg-[#03C75A] text-white rounded-xl font-bold text-sm">네이버 길찾기</a>
                                    <a href={`https://map.kakao.com/link/search/${encodeURIComponent(selectedWC.address)}`} target="_blank" className="flex items-center justify-center h-12 bg-[#FEE500] text-[#3c1e1e] rounded-xl font-bold text-sm">카카오 길찾기</a>
                                </div>
                            </div>
                        ) : (
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
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {selectedBusStop && (
                            <div className="p-5 rounded-3xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                                <div className="text-lg font-black mb-1">{selectedBusStop.name}</div>
                                <div className="text-sm text-zinc-500 uppercase tracking-widest">{selectedBusStop.id}</div>
                            </div>
                        )}
                        <div className="text-zinc-400 text-center py-10">
                            지도의 역이나 정류장을 눌러보세요
                        </div>
                    </div>
                )}
            </DraggableBottomSheet>

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
