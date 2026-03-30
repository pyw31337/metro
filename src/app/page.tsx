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
import { findBusPath, BusPathResult } from "@/utils/busRouting";

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
    const [isLocating, setIsLocating] = useState(false);
    const [locatingTimer, setLocatingTimer] = useState(5);
    const [selectedWC, setSelectedWC] = useState<WCItem | null>(null);
    const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);
    const [wcItems, setWcItems] = useState<WCItem[]>([]);
    const [nearestWCs, setNearestWCs] = useState<WCItem[]>([]);
    const [wcLoading, setWcLoading] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const [busPathResult, setBusPathResult] = useState<BusPathResult | null>(null);
    const [validationError, setValidationError] = useState<"source" | "dest" | "no_route" | null>(null);
    const [wcFilters, setWcFilters] = useState({ accessible: false, diapers: false, emergencyBell: false });
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [currentCenter, setCurrentCenter] = useState<[number, number]>([37.5665, 126.9780]);
    const [weatherOpen, setWeatherOpen] = useState(false);
    const [selectedStationName, setSelectedStationName] = useState<string | null>(null);
    const [stationArrivals, setStationArrivals] = useState<StationArrival[]>([]);
    const [timeDisplayMode, setTimeDisplayMode] = useState<"duration" | "arrival">("duration");
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
        const normalize = (n: string) => n.replace(/역$/, '').trim();
        
        activePath.path.forEach(name => {
            const cleanName = normalize(name);
            const s = stations.find(st => normalize(st.name) === cleanName);
            s?.lines.forEach(l => pathLineNames.add(l));
        });
        return rawTrains.filter(t => pathLineNames.has(t.lineName));
    }, [rawTrains, activePath, stations]);

    const mapRef = useRef<any>(null);

    // ─── Data Loading & Off-thread sorting ──────────────────────────────────────
    // ─── Data Loading & Off-thread sorting ──────────────────────────────────────
    useEffect(() => {
        setWcLoading(true);
        fetchWCDataClient().then(data => {
            setWcItems(data);
            setWcLoading(false);
        });
    }, []);

    // ─── Auto Locate On First Load ──────────────────────────────────────────────
    useEffect(() => {
        if (!navigator.geolocation) return;
        
        // Prevent concurrent location overlaps if manual locate triggered quickly
        setIsLocating(true);
        setLocatingTimer(5);
        
        const interval = setInterval(() => {
            setLocatingTimer(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        const cleanup = () => {
            clearInterval(interval);
            setIsLocating(false);
            setLocatingTimer(0);
        };

        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            setUserLocation([latitude, longitude]);
            
            // Auto-fill nearest station ONLY if field is empty (Off-thread)
            setStartStation(prev => {
                if (!prev && stations.length > 0) {
                    findNearestStation(latitude, longitude, stations).then((nearest: any) => {
                        if (nearest?.name) {
                            setStartStation(current => current ? current : `내 위치 : ${nearest.name} (내 위치)`);
                        }
                    });
                }
                return prev;
            });
            cleanup();
        }, () => cleanup(), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        
        // Disable es-lint for the exact single-mount run behavior without changing refs
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        // Normalize: Strip "내 위치 : ", parentheses, and line suffixes from strings
        const normalize = (s: string) => {
            if (!s) return "";
            // 1. Split by ' : ' to handle "내 위치 : 강남 (내 위치)"
            let name = s.split(' : ').pop() || s;
            // 2. Remove specified parentheses blocks, but keep line identifiers
            name = name.replace(/\(내 위치\)|\(출발\)|\(도착\)|\(경유\)/g, '').trim();
            // 3. Remove "역" at the end if it exists (e.g., "시청역" -> "시청")
            // However, some stations like "서울역" are often kept as is. 
            // We'll strip it for matching if it's longer than 2 chars or common pattern.
            if (name.endsWith("역") && name.length > 2) {
                name = name.slice(0, -1);
            }
            // 4. Take only the first word
            name = name.split(' ')[0].trim();
            return name;
        };
        
        const nStart = normalize(start);
        const nEnd = normalize(end);
        
        if (!nStart || !nEnd) {
            setIsCalculating(false);
            return;
        }

        setIsCalculating(true);
        setValidationError(null);

        // 🟢 BUS ROUTING BRANCH
        if (activeTab === "bus") {
            const res = findBusPath(start, end, busStops);
            if (res) {
                setBusPathResult(res);
                setPathResults(null); 
            } else {
                setBusPathResult(null);
                setValidationError("no_route");
            }
            setIsCalculating(false);
            return;
        }

        if (activeTab === "wc") {
            setPathResults(null);
            setBusPathResult(null);
            setIsCalculating(false);
            return;
        }

        // 🟠 SUBWAY ROUTING BRANCH
        const nWaypoints = waypoints.map(w => normalize(w)).filter(w => w.trim() !== "");
        const points = [nStart, ...nWaypoints, nEnd];
        
        try {
            const res = await findPath(points) as Record<string, PathResult>;
            setIsCalculating(false);

            if (res && res.time && res.transfer) {
                const filtered: Record<string, PathResult> = {
                    time: res.time,
                    transfer: res.transfer
                };
                setPathResults(filtered);
                setBusPathResult(null);
            } else {
                setPathResults(null);
                setValidationError("no_route");
            }
        } catch (error) {
            console.error("Pathfinding error:", error);
            setPathResults(null);
            setValidationError("no_route");
            setIsCalculating(false);
        }
    }, [activeTab, busStops, findPath, stations, selectedStrategy]);

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
        if (userLocation && mapRef.current) {
            mapRef.current?.flyTo({ center: [userLocation[1], userLocation[0]], zoom: 15, duration: 1500 });
        } else if (navigator.geolocation && mapRef.current) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const { latitude, longitude } = pos.coords;
                mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 15, duration: 1500 });
                setUserLocation([latitude, longitude]);
            });
        }
    }, [userLocation]);

    // Manual station locator for inputs
    const handleLocateStation = async (type: "source" | "dest") => {
        if (isLocating) return; // Concurrency Lock
        
        setIsLocating(true);
        setLocatingTimer(5);
        const interval = setInterval(() => {
            setLocatingTimer(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        const cleanup = () => {
            clearInterval(interval);
            setIsLocating(false);
            setLocatingTimer(0);
        };

        if (!userLocation && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                const { latitude, longitude } = pos.coords;
                setUserLocation([latitude, longitude]);
                const nearest = await findNearestStation(latitude, longitude, stations) as any;
                if (nearest) {
                    const val = `내 위치 : ${nearest.name} (내 위치)`;
                    if (type === "source") setStartStation(val);
                    else setEndStation(val);
                }
                cleanup();
            }, () => cleanup(), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
            return;
        }

        if (userLocation) {
            const nearest = await findNearestStation(userLocation[0], userLocation[1], stations) as any;
            if (nearest) {
                const val = `내 위치 : ${nearest.name} (내 위치)`;
                if (type === "source") setStartStation(val);
                else setEndStation(val);
            }
            cleanup();
        } else {
            cleanup();
        }
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
                    userLocation={userLocation}
                    timeDisplayMode={timeDisplayMode}
                    onToggleTimeDisplay={() => setTimeDisplayMode(prev => prev === "duration" ? "arrival" : "duration")}
                />
            </div>

            <UnifiedBottomPanel 
                activeTab={activeTab}
                onTabChange={(tab: any) => setActiveTab(tab)}
                onSearch={(start, end) => calculatePath(start, waypoints, end)}
                onReset={handleReset}
                startStation={startStation}
                endStation={endStation}
                onSetSource={setStartStation}
                onSetDestination={setEndStation}
                isDarkMode={isDarkMode}
                onLocate={handleLocateStation}
                stations={stations}
                busStops={busStops}
                selectedStrategy={selectedStrategy}
                onStrategyChange={setSelectedStrategy}
                pathResults={pathResults}
                activePath={activePath}
                timeDisplayMode={timeDisplayMode}
                setTimeDisplayMode={setTimeDisplayMode}
                isLocating={isLocating}
                locatingTimer={locatingTimer}
                isCalculating={isCalculating}
                validationError={validationError}
                busPathResult={busPathResult}
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
