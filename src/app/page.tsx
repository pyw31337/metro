"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";

import { Train, Bus, Bath } from "lucide-react";
import { SUBWAY_LINES, Station as SubwayStation } from "@/data/subway-lines";
import { ActiveTab, BusStop, Station, WCItem, PathResult, WCFilters, StationArrival } from "@/types/metro";
import { fetchStationArrivals } from "@/services/arrivalApi";
import { useDataWorker } from "@/hooks/useDataWorker";
import { findBusPath, BusPathResult } from "@/utils/busRouting";
import { normalizeStationName } from "@/utils/stationUtils";
import { db } from "@/services/db";
import { useArrivalInfo } from "@/hooks/useArrivalInfo";
import { useBusPositions } from "@/hooks/useBusPositions";
import { DataIngestionService } from "@/services/dataIngestion";
import { getCityCodeByCoords } from "@/utils/regionUtils";
import { 
  convertSubwayToGeoJSON, 
  convertWCToGeoJSON, 
  convertBusStopsToGeoJSON,
  convertRouteStationsToGeoJSON 
} from "@/utils/geoJsonUtils";

const MapLibreBackground = dynamic(() => import("@/components/MapLibreBackground"), { ssr: false });
const UnifiedBottomPanel = dynamic(() => import("@/components/UnifiedBottomPanel"), { ssr: false });
const MapControls = dynamic(() => import("@/components/MapControls"), { ssr: false });
const WeatherPopup = dynamic(() => import("@/components/WeatherPopup"), { ssr: false });
const BusDetailPanel = dynamic(() => import("@/components/panels/BusDetailPanel"), { ssr: false });
import { AnimatePresence } from "framer-motion";
import DirectionCompass from "@/components/ui/DirectionCompass";

type PathStrategy = "time" | "transfer";

export default function Home() {
    const { findPath, findNearestStation, sortWCs } = useDataWorker();
    
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
    const [hasInitialLocation, setHasInitialLocation] = useState(false);
    const [locatingTimer, setLocatingTimer] = useState(5);
    const [selectedWC, setSelectedWC] = useState<WCItem | null>(null);
    const [activeBusStop, setActiveBusStop] = useState<BusStop | null>(null);
    const [routePathData, setRoutePathData] = useState<any | null>(null);
    const [toiletData, setToiletData] = useState<any | null>(null);
    const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);
    const [wcItems, setWcItems] = useState<WCItem[]>([]);
    const [nearestWCs, setNearestWCs] = useState<WCItem[]>([]);
    const [wcLoading, setWcLoading] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const [busPathResult, setBusPathResult] = useState<BusPathResult | null>(null);
    const [validationError, setValidationError] = useState<"source" | "dest" | "no_route" | null>(null);
    const [wcFilters, setWcFilters] = useState<WCFilters>({ accessible: false, diapers: false, emergencyBell: false });
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [currentCenter, setCurrentCenter] = useState<[number, number]>([37.5546, 126.9706]);
    const [weatherOpen, setWeatherOpen] = useState(false);
    const [selectedStationName, setSelectedStationName] = useState<string | null>(null);
    const [stationArrivals, setStationArrivals] = useState<StationArrival[]>([]);
    const [timeDisplayMode, setTimeDisplayMode] = useState<"duration" | "arrival">("duration");
    const [showAllRouteBubbles, setShowAllRouteBubbles] = useState(false);
    const [busStops, setBusStops] = useState<BusStop[]>([]);
    const [activeLine, setActiveLine] = useState<string | null>(null);
    const [selectedBusRoute, setSelectedBusRoute] = useState<string | null>(null);
    const [nearestStation, setNearestStation] = useState<Station | null>(null);
    const [nearestBusStop, setNearestBusStop] = useState<BusStop | null>(null);
    const [nearestWC, setNearestWC] = useState<WCItem | null>(null);

    const handleActiveLineChange = useCallback((line: string | null) => {
        setActiveLine(prev => {
            if (line === null) return null;
            return prev === line ? null : line;
        });
    }, []);

    const stations = useMemo(() => {
        const unique = new Map<string, SubwayStation>();
        SUBWAY_LINES.forEach(line => {
            line.stations.forEach(s => {
                if(!unique.has(s.name)) unique.set(s.name, s);
            });
        });
        return Array.from(unique.values());
    }, []);

    const mapRef = useRef<any>(null);

    useEffect(() => {
        const init = async () => {
            await db.initializeData();
            const allBusStops = await db.busStops.toArray() as BusStop[];
            setBusStops(allBusStops);
            const allWCs = await db.wc.toArray() as WCItem[];
            setWcItems(allWCs);
        };
        init();
    }, []);

    const initLocRef = useRef(false);

    useEffect(() => {
        if (!navigator.geolocation) return;
        
        let timerInterval: NodeJS.Timeout;

        const updateLocation = () => {
            if (!initLocRef.current) {
                setIsLocating(true);
                setLocatingTimer(10);
            }
            
            // Start countdown timer for UI if needed
            if (!initLocRef.current) {
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(() => {
                    setLocatingTimer(prev => (prev > 0 ? prev - 1 : 0));
                }, 1000);
            }

            navigator.geolocation.getCurrentPosition(async (pos) => {
                const { latitude, longitude } = pos.coords;
                console.log("📍 Updated Location:", latitude, longitude);
                setUserLocation([latitude, longitude]);
                
                // On first location, also set start station
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

                if (!initLocRef.current) {
                    initLocRef.current = true;
                    setHasInitialLocation(true);
                    setIsLocating(false);
                    if (timerInterval) clearInterval(timerInterval);
                }
            }, (err) => {
                console.error("Geolocation error:", err);
                if (!initLocRef.current) {
                    setIsLocating(false);
                    setLocatingTimer(0);
                    if (timerInterval) clearInterval(timerInterval);
                }
            }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        };

        // Initial update
        updateLocation();

        // Real-time update every 10 seconds
        const mainInterval = setInterval(updateLocation, 10000);
        
        return () => {
            clearInterval(mainInterval);
            if (timerInterval) clearInterval(timerInterval);
        };
    }, [stations, findNearestStation]);

    // Automatically follow user location
    useEffect(() => {
        if (userLocation && mapRef.current && !hasInitialLocation) {
            mapRef.current?.flyTo({ 
                center: [userLocation[1], userLocation[0]], 
                zoom: 15, 
                duration: 2000 
            });
        }
    }, [userLocation, hasInitialLocation]);

    useEffect(() => {
        if (validationError === "no_route") {
            const timer = setTimeout(() => setValidationError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [validationError]);

    useEffect(() => {
        const updateWCs = async () => {
            if (activeTab === "wc" && userLocation && wcItems.length > 0) {
                const sorted = await sortWCs(wcItems, userLocation[0], userLocation[1]) as WCItem[];
                setNearestWCs(sorted);
            }
        };
        updateWCs();
    }, [activeTab, userLocation, wcItems, sortWCs]);

    const { arrivals: hookArrivals, schedules: hookSchedules } = useArrivalInfo(selectedStationName);

    useEffect(() => {
        if (hookArrivals) {
            setStationArrivals(hookArrivals);
        }
    }, [hookArrivals]);

    useEffect(() => {
        const updateNearest = async () => {
            if (!userLocation) {
                setNearestStation(null);
                setNearestBusStop(null);
                setNearestWC(null);
                return;
            }
            const [lat, lng] = userLocation;
            if (stations.length > 0) {
                const nearest = await findNearestStation(lat, lng, stations);
                if (nearest) setNearestStation(nearest as Station);
            }
            if (busStops.length > 0) {
                let min = Infinity;
                let found: BusStop | null = null;
                for (const s of busStops) {
                    const dist = Math.pow(s.lat - lat, 2) + Math.pow(s.lng - lng, 2);
                    if (dist < min) { min = dist; found = s; }
                }
                setNearestBusStop(found);
            }
            if (wcItems.length > 0) {
                let min = Infinity;
                let found: WCItem | null = null;
                for (const s of wcItems) {
                    const dist = Math.pow(s.lat - lat, 2) + Math.pow(s.lng - lng, 2);
                    if (dist < min) { min = dist; found = s; }
                }
                setNearestWC(found);
            }
        };
        updateNearest();
    }, [userLocation, stations, busStops, wcItems, findNearestStation]);

    const handleBusStopClick = useCallback((stop: BusStop, coords?: [number, number]) => {
        setSelectedBusStop(stop);
        setSelectedStationName(null);
        setSelectedWC(null);
        if (coords) {
            setCurrentCenter([coords[1], coords[0]]);
        }
    }, []);

    const handleStationClick = useCallback((name: string, latlng?: [number, number]) => {
        const normalized = normalizeStationName(name);
        setSelectedStationName(normalized);
        if (latlng) {
            setCurrentCenter([latlng[0], latlng[1]]);
        }
    }, []);

    const calculatePath = useCallback(async (start: string | null, waypoints: string[], end: string | null) => {
        if (!start || !end) {
            setPathResults(null);
            return;
        }
        setIsCalculating(true);
        setValidationError(null);

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

        const normalize = normalizeStationName;
        const nStart = normalize(start);
        const nEnd = normalize(end);
        const nWaypoints = waypoints.map(w => normalize(w)).filter(w => w.trim() !== "");
        const points = [nStart, ...nWaypoints, nEnd];
        
        try {
            const res = await findPath(points) as Record<string, PathResult>;
            setIsCalculating(false);
            if (res && res.time && res.transfer) {
                setPathResults({ time: res.time, transfer: res.transfer });
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
    }, [activeTab, busStops, findPath, waypoints, normalizeStationName]);

    useEffect(() => {
        calculatePath(startStation, waypoints, endStation);
    }, [startStation, waypoints, endStation, calculatePath]);

    const handleSelectBusRoute = useCallback(async (routeNo: string, cityCode?: string) => {
        if (!cityCode) return;
        try {
            const res = await fetch("/data/master-bus-routes.json");
            const routes = await res.json();
            const route = routes.find((r: any) => r.no === routeNo && r.cityCode === cityCode);
            if (route) {
                const { MetropolitanBusService } = await import("@/services/busApi");
                const path = await MetropolitanBusService.fetchRoutePath(cityCode, route.id);
                if (path) {
                    setRoutePathData(path);
                    if (path.features[0]?.geometry?.coordinates[0]) {
                        const [lng, lat] = path.features[0].geometry.coordinates[0];
                        mapRef.current?.flyTo({ center: [lng, lat], zoom: 13, duration: 2000 });
                    }
                }
            }
        } catch (err) { console.error("Route selection failed:", err); }
    }, []);

    const handleReset = () => {
        setStartStation(null);
        setEndStation(null);
        setWaypoints([]);
        setPathResults(null);
        setSelectedStationName(null);
        setSelectedWC(null);
        setSelectedBusStop(null);
        setShowAllRouteBubbles(false);
    };

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

    const handleLocateStation = async (type: "source" | "dest") => {
        if (isLocating) return; 
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
        } else { cleanup(); }
    };

    const handleBoundsChange = useCallback(async (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => {
        if (activeTab !== "bus" && activeTab !== "subway+bus") return;
        const existingStops = await db.busStops
            .where('lat').between(bounds.minLat, bounds.maxLat)
            .and(s => s.lng >= bounds.minLng && s.lng <= bounds.maxLng)
            .limit(1)
            .count();
        if (existingStops === 0) {
            const centerLat = (bounds.minLat + bounds.maxLat) / 2;
            const centerLng = (bounds.minLng + bounds.maxLng) / 2;
            const cityCode = getCityCodeByCoords(centerLat, centerLng);
            if (cityCode) {
                console.log(`🌍 New region discovered: ${cityCode}. Fetching stops...`);
                await DataIngestionService.fetchRegionalBusStops(cityCode);
                const allBusStops = await db.busStops.toArray() as BusStop[];
                setBusStops(allBusStops);
            }
        }
    }, [activeTab]);

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
                    activeTab={activeTab}
                    selectedBusStopId={selectedBusStop?.id ?? null}
                    selectedBusRoute={selectedBusRoute}
                    routePathData={routePathData}
                    onWCClick={setSelectedWC}
                    onBusStopClick={handleBusStopClick}
                    onStationClick={handleStationClick}
                    selectedStationName={selectedStationName}
                    stationArrivals={stationArrivals}
                    selectedWC={selectedWC}
                    selectedBusStop={selectedBusStop}
                    onSetStart={setStartStation}
                    onSetEnd={setEndStation}
                    onSetWaypoint={(name) => setWaypoints([...waypoints, name])}
                    onCenterChange={(lat, lng) => setCurrentCenter([lat, lng])}
                    onBoundsChange={handleBoundsChange}
                    stations={stations}
                    activeLine={activeLine}
                    onActiveLineChange={handleActiveLineChange}
                    onMapReady={(m) => { mapRef.current = m; }}
                    userLocation={userLocation}
                    nearestStation={nearestStation}
                    nearestBusStop={nearestBusStop}
                    nearestWC={nearestWC}
                    timeDisplayMode={timeDisplayMode}
                    onToggleTimeDisplay={() => setTimeDisplayMode(prev => prev === "duration" ? "arrival" : "duration")}
                    showAllRouteBubbles={showAllRouteBubbles}
                    onToggleShowAll={() => setShowAllRouteBubbles(prev => !prev)}
                    onSelectBusRoute={handleSelectBusRoute}
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
                showAllRouteBubbles={showAllRouteBubbles}
                onToggleShowAll={() => setShowAllRouteBubbles(prev => !prev)}
                selectedStationName={selectedStationName}
                stationArrivals={hookArrivals}
                schedules={hookSchedules}
                onSelectStation={setSelectedStationName}
                activeLine={activeLine}
                onActiveLineChange={handleActiveLineChange}
                selectedBusStop={selectedBusStop}
                onSelectBusRoute={handleSelectBusRoute}
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

            {/* Direction Compass for WC Navigation */}
            {activeTab === "wc" && selectedWC && userLocation && (
                <DirectionCompass 
                    userLocation={userLocation}
                    targetLocation={[selectedWC.lat, selectedWC.lng]}
                    targetName={selectedWC.name}
                    onClose={() => setSelectedWC(null)}
                />
            )}
        </main>
    );
}
