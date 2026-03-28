"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import { Train, Bus, Bath } from "lucide-react";
import { SUBWAY_LINES, Station } from "@/data/subway-lines";
import type { PathResult, PathStrategy } from "@/utils/pathfinding";
import type { ActiveTab } from "@/components/MapLibreBackground";
import type { WCItem } from "@/components/WCLayer";
import type { BusStop } from "@/components/BusStopLayer";
import { fetchWCDataClient } from "@/services/wcApi";
import { fetchStationArrivals, StationArrival } from "@/services/arrivalApi";
import { useDataWorker } from "@/hooks/useDataWorker";
import { useRealtimeTrains } from "@/hooks/useRealtimeTrains";
import busData from "@/data/bus-stops.json";

const MapLibreBackground = dynamic(() => import("@/components/MapLibreBackground"), { ssr: false });
const UnifiedBottomPanel = dynamic(() => import("@/components/UnifiedBottomPanel"), { ssr: false });
const MapControls = dynamic(() => import("@/components/MapControls"), { ssr: false });
const WeatherPopup = dynamic(() => import("@/components/WeatherPopup"), { ssr: false });
import { AnimatePresence } from "framer-motion";

export default function Home() {
    const { findPath, findNearestStation, sortWCs } = useDataWorker();
    const rawTrains = useRealtimeTrains();
    
    const [pathResults, setPathResults] = useState<Record<string, PathResult> | null>(null);
    const [selectedStrategy, setSelectedStrategy] = useState<PathStrategy>("time");

    const activePath = useMemo(() => {
        if (!pathResults) return null;
        return pathResults[selectedStrategy] || Object.values(pathResults)[0];
    }, [pathResults, selectedStrategy]);

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
    const [currentCenter, setCurrentCenter] = useState<[number, number]>([37.5665, 126.9780]);
    const [weatherOpen, setWeatherOpen] = useState(false);
    const [selectedStationName, setSelectedStationName] = useState<string | null>(null);
    const [stationArrivals, setStationArrivals] = useState<StationArrival[]>([]);
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
        if (!activePath) return rawTrains;
        const pathLineNames = new Set<string>();
        activePath.path.forEach(name => {
            const s = stations.find(st => st.name === name);
            s?.lines.forEach(l => pathLineNames.add(l));
        });
        return rawTrains.filter(t => pathLineNames.has(t.lineName));
    }, [rawTrains, activePath, stations]);

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

    // Fetch station arrivals when selected
    useEffect(() => {
        if (selectedStationName) {
            fetchStationArrivals(selectedStationName).then(setStationArrivals);
        } else {
            setStationArrivals([]);
        }
    }, [selectedStationName]);

    // ─── Pathfinding Logic (Off-thread) ──────────────────────────────────────────
    const calculatePath = useCallback(async (start: string | null, waypoints: string[], end: string | null) => {
        if (!start || !end) {
            setPathResults(null);
            return;
        }
        setIsCalculating(true);
        
        // Normalize: Strip "내 위치 : " and platform info from strings
        const normalize = (s: string) => s.split(' : ').pop()?.split(' ').shift() || s;
        
        const nStart = normalize(start);
        const nEnd = normalize(end);
        const nWaypoints = waypoints.map(w => normalize(w)).filter(w => w.trim() !== "");

        const points = [nStart, ...nWaypoints, nEnd];
        const res = await findPath(points) as Record<string, PathResult>;
        
        if (res) {
            // Keep only time and transfer strategies
            const filtered: Record<string, PathResult> = {
                time: res.time,
                transfer: res.transfer
            };
            setPathResults(filtered);

            // AUTO-FIT MAP to the route
            const active = filtered[selectedStrategy] || filtered.time;
            if (active && active.path.length > 0 && mapRef.current) {
                const lats = active.path.map(name => stations.find(s => s.name === name)?.lat).filter(Boolean) as number[];
                const lngs = active.path.map(name => stations.find(s => s.name === name)?.lng).filter(Boolean) as number[];
                
                if (lats.length > 0) {
                    const minLat = Math.min(...lats);
                    const maxLat = Math.max(...lats);
                    const minLng = Math.min(...lngs);
                    const maxLng = Math.max(...lngs);

                    mapRef.current?.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
                        padding: { top: 100, bottom: 240, left: 100, right: 100 },
                        duration: 1500
                    });
                }
            }
        }
        
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
        setPathResults(null);
        setSelectedStationName(null);
        setSelectedWC(null);
        setSelectedBusStop(null);
    };

    const [hasCenteredOnLoad, setHasCenteredOnLoad] = useState(false);

    const handleZoomIn = () => mapRef.current?.zoomIn();
    const handleZoomOut = () => mapRef.current?.zoomOut();
    const handleLocate = useCallback(() => {
        if (navigator.geolocation && mapRef.current) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 15, duration: 1500 });
                setUserLocation([latitude, longitude]);
            });
        }
    }, []);

    // Initial centering logic
    useEffect(() => {
        if (!hasCenteredOnLoad && userLocation && mapRef.current) {
            const [lat, lng] = userLocation;
            mapRef.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 2000 });
            setHasCenteredOnLoad(true);
        }
    }, [userLocation, hasCenteredOnLoad]);

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
                    pathResult={activePath}
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
                    stationArrivals={stationArrivals}
                    selectedWC={selectedWC}
                    selectedBusStop={selectedBusStop}
                    onSetStart={setStartStation}
                    onSetEnd={setEndStation}
                    onSetWaypoint={(name) => setWaypoints([...waypoints, name])}
                    onCenterChange={(lat, lng) => setCurrentCenter([lat, lng])}
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
                selectedStrategy={selectedStrategy}
                onStrategyChange={setSelectedStrategy}
                pathResults={pathResults}
                activePath={activePath}
            />

            <div className="fixed top-6 right-6 z-[2001] flex flex-col gap-4 items-center">
                <MapControls 
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onLocate={handleLocate}
                    onWeatherToggle={() => setWeatherOpen(!weatherOpen)}
                    isDarkMode={isDarkMode}
                    onDarkModeToggle={() => setIsDarkMode(!isDarkMode)}
                />
            </div>

            <AnimatePresence>
                {weatherOpen && (
                    <WeatherPopup 
                        lat={currentCenter[0]}
                        lng={currentCenter[1]}
                        isDarkMode={isDarkMode}
                        onClose={() => setWeatherOpen(false)}
                    />
                )}
            </AnimatePresence>
        </main>
    );
}
