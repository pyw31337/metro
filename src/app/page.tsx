"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import { Train, Bus, Bath } from "lucide-react";
import { SUBWAY_LINES, Station } from "@/data/subway-lines";
import type { PathResult } from "@/utils/pathfinding";
import type { ActiveTab } from "@/components/MapBackground";
import type { WCItem } from "@/components/WCLayer";
import type { BusStop } from "@/components/BusStopLayer";
import { fetchWCDataClient } from "@/services/wcApi";
import { useDataWorker } from "@/hooks/useDataWorker";
import { useRealtimeTrains } from "@/hooks/useRealtimeTrains";
import busData from "@/data/bus-stops.json";

const MapLibreBackground = dynamic(() => import("@/components/MapLibreBackground"), { ssr: false });
const UnifiedBottomPanel = dynamic(() => import("@/components/UnifiedBottomPanel"), { ssr: false });
const MapControls = dynamic(() => import("@/components/MapControls"), { ssr: false });

export default function Home() {
    const { findPath, findNearestStation, sortWCs } = useDataWorker();
    const rawTrains = useRealtimeTrains();
    
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
    const [isCalculating, setIsCalculating] = useState(false);
    const [wcFilters, setWcFilters] = useState({ accessible: false, diapers: false, emergencyBell: false });
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [selectedStationName, setSelectedStationName] = useState<string | null>(null);
    const busStops = busData as BusStop[];
    
    const stations = useMemo(() => {
        const unique = new Map<string, Station>();
        SUBWAY_LINES.forEach(line => {
            line.stations.forEach(s => {
                if(!unique.has(s.name)) unique.set(s.name, s);
            });
        });
        return Array.from(unique.values());
    }, []);

    const filteredTrains = useMemo(() => {
        if (!pathResult) return rawTrains;
        // Show trains on lines involved in the path + adjacent for context
        const pathLineNames = new Set<string>();
        pathResult.path.forEach(name => {
            const s = stations.find(st => st.name === name);
            s?.lines.forEach(l => pathLineNames.add(l));
        });
        return rawTrains.filter(t => pathLineNames.has(t.lineName));
    }, [rawTrains, pathResult, stations]);

    const mapRef = useRef<any>(null);

    // ─── Data Loading & Off-thread sorting ──────────────────────────────────────
    useEffect(() => {
        setWcLoading(true);
        fetchWCDataClient().then(data => {
            setWcItems(data);
            setWcLoading(false);
        });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const { latitude, longitude } = pos.coords;
                setUserLocation([latitude, longitude]);
                
                // Auto-fill nearest station (Off-thread)
                if (!startStation && stations.length > 0) {
                    const nearest = await findNearestStation(latitude, longitude, stations) as any;
                    if (nearest?.name) {
                        setStartStation(`내 위치 : ${nearest.name} ${nearest.line}`);
                    }
                }
            });
        }
    }, [stations, startStation, findNearestStation]);

    useEffect(() => {
        const updateWCs = async () => {
            if (activeTab === "wc" && userLocation && wcItems.length > 0) {
                const sorted = await sortWCs(wcItems, userLocation[0], userLocation[1]) as WCItem[];
                setNearestWCs(sorted);
            }
        };
        updateWCs();
    }, [activeTab, userLocation, wcItems, sortWCs]);

    // ─── Pathfinding Logic (Off-thread) ──────────────────────────────────────────
    const calculatePath = useCallback(async (start: string | null, waypoints: string[], end: string | null) => {
        if (!start || !end) {
            setPathResult(null);
            return;
        }
        setIsCalculating(true);
        
        // Normalize: Strip "내 위치 : " and platform info from strings
        const normalize = (s: string) => s.split(' : ').pop()?.split(' ').shift() || s;
        
        const nStart = normalize(start);
        const nEnd = normalize(end);
        const nWaypoints = waypoints.map(w => normalize(w)).filter(w => w.trim() !== "");

        const points = [nStart, ...nWaypoints, nEnd];
        const res = await findPath(points) as PathResult;
        setPathResult(res);
        setIsCalculating(true); // Short delay for animation feel
        setTimeout(() => setIsCalculating(false), 500);
    }, [findPath]);

    useEffect(() => {
        calculatePath(startStation, waypoints, endStation);
    }, [startStation, waypoints, endStation, calculatePath]);

    // ─── Event Handlers ────────────────────────────────────────────────────────
    const handleStationClick = (name: string, latlng: [number, number]) => {
        setSelectedStationName(name);
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

    const handleZoomIn = () => mapRef.current?.zoomIn();
    const handleZoomOut = () => mapRef.current?.zoomOut();
    const handleLocate = () => {
        if (navigator.geolocation && mapRef.current) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 15, duration: 1500 });
                setUserLocation([latitude, longitude]);
            });
        }
    };

    const handleLocateStation = async () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            const nearest = await findNearestStation(latitude, longitude, stations) as any;
            if (nearest) {
                setStartStation(nearest.name);
                mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 15, duration: 2000 });
            }
        });
    };

    return (
        <main className="relative w-full h-[100dvh] overflow-hidden bg-white dark:bg-black font-sans">
            <div className="absolute inset-0 z-10">
                <MapLibreBackground
                    pathResult={pathResult}
                    startStation={startStation}
                    endStation={endStation}
                    isDarkMode={isDarkMode}
                    wcItems={wcItems}
                    wcFilters={wcFilters}
                    busStops={busStops}
                    trains={filteredTrains}
                    activeTab={activeTab}
                    selectedBusStopId={selectedBusStop?.id ?? null}
                    onWCClick={setSelectedWC}
                    onBusStopClick={setSelectedBusStop}
                    onStationClick={(name, latlng) => handleStationClick(name, latlng as [number, number])}
                    selectedStationName={selectedStationName}
                    selectedWC={selectedWC}
                    selectedBusStop={selectedBusStop}
                    onSetStart={setStartStation}
                    onSetEnd={setEndStation}
                    onSetWaypoint={(name) => setWaypoints([...waypoints, name])}
                    onMapReady={(r) => { mapRef.current = r; }}
                />
            </div>

            <UnifiedBottomPanel 
                activeTab={activeTab}
                onTabChange={(tab: any) => setActiveTab(tab)}
                onSearch={(start, end) => {
                    setStartStation(start);
                    setEndStation(end);
                }}
                onReset={handleReset}
                startStation={startStation}
                endStation={endStation}
                isDarkMode={isDarkMode}
                onLocate={handleLocateStation}
                stations={stations}
                busStops={busStops}
            >
                {isCalculating ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400">
                        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                        <span className="text-xs font-bold tracking-widest uppercase">매끄러운 경로 탐색 중...</span>
                    </div>
                ) : pathResult ? (
                    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom duration-500 pb-8">
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

                        <div className="flex flex-col gap-3 relative pl-4">
                            <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-zinc-200 dark:bg-zinc-800"></div>
                            {pathResult.path.map((name, idx) => {
                                const isStart = idx === 0;
                                const isEnd = idx === pathResult.path.length - 1;
                                
                                // Mock Arrival Time Calculation
                                const now = new Date();
                                const minutesToAdd = idx * 2 + (idx > 5 ? 5 : 0); // basic estim
                                const arrivalTime = new Date(now.getTime() + minutesToAdd * 60000);
                                const timeStr = `${arrivalTime.getHours().toString().padStart(2, '0')}:${arrivalTime.getMinutes().toString().padStart(2, '0')}`;

                                // Mock Platform Info for Transfers
                                const station = stations.find(s => s.name === name);
                                const isTransfer = station && station.lines.length > 1 && !isStart && !isEnd;
                                const platform = `${Math.floor(Math.random() * 8) + 1}-${Math.floor(Math.random() * 4) + 1}`;

                                return (
                                    <div key={idx} className="flex flex-col gap-1">
                                        <div className="flex items-center gap-5 relative group">
                                            <div className={`w-3 h-3 rounded-full border-2 z-10 transition-all ${
                                                isStart ? 'bg-blue-600 border-blue-200 scale-125' : 
                                                isEnd ? 'bg-rose-500 border-rose-200 scale-125' : 
                                                'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700'
                                            }`}></div>
                                            <div className="flex flex-1 items-center justify-between pr-2">
                                                <div className={`font-extrabold text-[15px] ${isStart || isEnd ? 'text-zinc-900 dark:text-white' : 'text-zinc-500'}`}>
                                                    {name}
                                                </div>
                                                <div className="text-[11px] font-mono font-bold text-zinc-400">
                                                    {isEnd ? "도착 " : ""} {timeStr}
                                                </div>
                                            </div>
                                        </div>
                                        {isTransfer && (
                                            <div className="ml-8 mb-2">
                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-[10px] font-bold text-zinc-500">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                                                    빠른 환승 {platform}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : activeTab === "wc" ? (
                    <div className="flex flex-col gap-6 pb-12">
                        <div className="text-xl font-black">📍 가까운 화장실</div>
                        <div className="flex flex-col gap-3">
                            {nearestWCs.map((wc) => (
                                <button 
                                    key={wc.id}
                                    onClick={() => setSelectedWC(wc)}
                                    className="p-4 rounded-2xl bg-white/50 dark:bg-white/5 border border-zinc-100 dark:border-white/10 text-left hover:border-blue-500 transition-all shadow-sm"
                                >
                                    <div className="font-bold">{wc.name}</div>
                                    <div className="text-xs text-zinc-400 mt-1">{wc.address}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div className="text-zinc-400 text-center py-14">
                            지도의 역이나 정류장을 눌러보세요
                        </div>
                    </div>
                )}
            </UnifiedBottomPanel>

            <div className="fixed top-6 right-6 z-[2001] flex flex-col gap-4 items-center">
                <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="w-12 h-12 rounded-full glass-premium flex items-center justify-center text-zinc-600 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 shadow-xl transition-all hover:scale-105 active:scale-95"
                >
                    {isDarkMode ? "☀️" : "🌙"}
                </button>
                <MapControls 
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onLocate={handleLocate}
                    isDarkMode={isDarkMode}
                />
            </div>
        </main>
    );
}
