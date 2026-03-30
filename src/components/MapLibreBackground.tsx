"use client";

import { useEffect, useState, memo, useRef, useMemo, useCallback } from "react";
import Map, { Source, Layer, NavigationControl, GeolocateControl, MapRef, Popup, Marker } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Flag } from "lucide-react";
import { PathResult } from "@/utils/pathfinding";
import { WCItem } from "./WCLayer";
import { BusStop } from "./BusStopLayer";
import { StationArrival } from "@/services/arrivalApi";
import { convertSubwayToGeoJSON, convertBusStopsToGeoJSON, convertWCToGeoJSON, convertTrainsToGeoJSON, convertPathToGeoJSON } from "@/utils/geoJsonUtils";
import { SUBWAY_LINES } from "@/data/subway-lines";

const getStationBadge = (name: string) => {
    if (!name) return null;
    const cleanName = name.replace(/역+$/, '');
    for (const line of SUBWAY_LINES) {
        if (line.stations.some(s => s.name === cleanName || s.name === cleanName + '역')) {
            const num = line.name.replace('호선', '').replace('서울배차', '').trim();
            return { num, color: line.color };
        }
    }
    return null;
};

export type ActiveTab = "subway" | "bus" | "subway+bus" | "wc";

interface MapLibreProps {
    pathResult: PathResult | null;
    startStation: string | null;
    endStation: string | null;
    onStationClick?: (name: string, latlng?: [number, number]) => void;
    onSetStart: (name: string) => void;
    onSetEnd: (name: string) => void;
    onSetWaypoint: (name: string) => void;
    activeTab: ActiveTab;
    isDarkMode: boolean;
    wcItems: WCItem[];
    wcFilters: { accessible: boolean; diapers: boolean; emergencyBell: boolean };
    busStops: BusStop[];
    trains: any[];
    selectedBusStopId: string | null;
    onWCClick: (item: WCItem) => void;
    onBusStopClick: (stop: BusStop, latlng?: [number, number]) => void;
    selectedWC: WCItem | null;
    selectedBusStop: BusStop | null;
    selectedStationName: string | null;
    stationArrivals: StationArrival[];
    onCenterChange?: (lat: number, lng: number) => void;
    onMapReady?: (map: any) => void;
    userLocation: [number, number] | null;
    timeDisplayMode: "duration" | "arrival";
    onToggleTimeDisplay?: () => void;
}

const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CARTO_VOYAGER = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

const ArrivalHeader = ({ defaultTitle, trains, textColor, borderColor }: { defaultTitle: string, trains: StationArrival[], textColor: string, borderColor: string }) => {
    const [showSchedule, setShowSchedule] = useState(false);
    
    let title = defaultTitle;
    if (trains.length > 0) {
        const dest = trains[0].trainLineNm.split('-')[0].replace('행', '').trim();
        const base = defaultTitle.split('·')[0].trim();
        title = `${base} (${dest}행)`; 
    }

    return (
        <button 
            onClick={(e) => { e.stopPropagation(); setShowSchedule(!showSchedule); }}
            className={`w-full text-left focus:outline-none transition-transform active:scale-95`}
        >
            <div className={`text-[10px] font-black ${textColor} text-center pb-1 border-b ${borderColor}`}>
                {showSchedule ? '첫차 05:00 / 막차 12:00' : title}
            </div>
        </button>
    );
};

const ArrivalItemListItem = ({ arr, timeDisplayMode, onToggleTimeDisplay }: { arr: StationArrival, timeDisplayMode: "duration" | "arrival", onToggleTimeDisplay?: () => void }) => {
    
    let stopsLeft = "";
    if (arr.arvlMsg2.includes("정거장") || arr.arvlMsg2.includes("역 전") || arr.arvlMsg2.includes("번째 전역")) {
        const match = arr.arvlMsg2.match(/\d+/);
        if (match) stopsLeft = `${match[0]} 정거장전`;
    } else if (arr.arvlMsg2.includes("도착") || arr.arvlMsg2.includes("출발") || arr.arvlMsg2.includes("진입")) {
        stopsLeft = arr.arvlMsg2.split("(")[0].trim();
    }
    
    const timeSec = parseInt(arr.barvlDt) || 0;
    
    let relativeStr = "";
    let clockStr = "";
    
    if (timeSec > 0) {
        const d = new Date(Date.now() + timeSec * 1000);
        clockStr = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        const m = Math.floor(timeSec / 60);
        relativeStr = m > 0 ? `${m}분후` : `1분 이내`;
    } else {
        clockStr = "";
        relativeStr = "";
    }
    
    let displayTime = timeDisplayMode === "duration" ? relativeStr : clockStr;

    return (
        <button 
            onClick={(e) => { e.stopPropagation(); if(onToggleTimeDisplay) onToggleTimeDisplay(); }}
            className="w-full focus:outline-none flex items-center justify-between px-2.5 py-2 rounded-lg bg-black/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/5 active:scale-95 transition-transform"
        >
            <span className={`text-[11px] leading-tight ${displayTime ? 'font-black text-zinc-900 dark:text-white' : 'font-black text-rose-500 dark:text-rose-400'}`}>
                {displayTime || stopsLeft || "도착 안내 대기"}
            </span>
            {displayTime && stopsLeft && (
                <span className="text-[10px] font-normal text-zinc-500 dark:text-zinc-400 leading-tight">
                    {stopsLeft}
                </span>
            )}
        </button>
    );
};

function MapLibreBackground({
    pathResult, activeTab, isDarkMode, wcItems, wcFilters, busStops, trains,
    onStationClick, onWCClick, onBusStopClick, onMapReady,
    onSetStart, onSetEnd, onSetWaypoint, selectedStationName, stationArrivals,
    onCenterChange, userLocation, timeDisplayMode, onToggleTimeDisplay, selectedBusStop
}: MapLibreProps) {
    const mapRef = useRef<MapRef | null>(null);
    const [popupCoords, setPopupCoords] = useState<[number, number] | null>(null);
    const [focusedLine, setFocusedLine] = useState<string | null>(null);
    const [focusedBubble, setFocusedBubble] = useState<string | null>(null);
    const [currentZoom, setCurrentZoom] = useState<number>(12);
    
    // Memoized GeoJSON Data
    const subwayData = useMemo(() => convertSubwayToGeoJSON(), []);
    const busData = useMemo(() => convertBusStopsToGeoJSON(busStops), [busStops]);
    const wcData = useMemo(() => convertWCToGeoJSON(wcItems), [wcItems]);
    const trainData = useMemo(() => convertTrainsToGeoJSON(trains), [trains]);

    // Memoized Path Data with exact line colors
    const pathData = useMemo(() => {
        return convertPathToGeoJSON(pathResult);
    }, [pathResult]);

    const pathLineData = useMemo((): GeoJSON.FeatureCollection => 
        (pathData?.pathLines as GeoJSON.FeatureCollection) || { type: "FeatureCollection", features: [] }, 
    [pathData]);
    
    const routeStationData = useMemo((): GeoJSON.FeatureCollection => 
        (pathData?.routeStations as GeoJSON.FeatureCollection) || { type: "FeatureCollection", features: [] }, 
    [pathData]);

    // Filters for WCs
    const filteredWCs = useMemo(() => {
        let features = wcData.features;
        if (wcFilters.accessible) features = features.filter(f => f.properties.accessible);
        if (wcFilters.diapers) features = features.filter(f => f.properties.diapers);
        if (wcFilters.emergencyBell) features = features.filter(f => f.properties.emergencyBell);
        return { type: "FeatureCollection" as const, features };
    }, [wcData, wcFilters]);

    // Animation Effect for Path Line
    useEffect(() => {
        if (!pathResult || !mapRef.current) return;
    }, [pathResult]);

    const [cursor, setCursor] = useState<string>("auto");

    useEffect(() => {
        setPopupCoords(null);
        setFocusedLine(null);
        setFocusedBubble(null);
    }, [activeTab]);

    const onHover = useCallback((e: any) => {
        setCursor(e.features.length ? "pointer" : "auto");
    }, []);

    const onClick = useCallback((e: any) => {
        const feature = e.features && e.features[0];
        if (!feature) {
            setPopupCoords(null);
            setFocusedLine(null); // Reset focus on background click
            return;
        }

        const { layer, properties, geometry } = feature;
        
        if (layer.id === "subway-line-layer") {
            // Focus on a specific line, reset if already focused
            setFocusedLine(prev => prev === properties.name ? null : properties.name);
            setPopupCoords(null);
            return;
        }

        const coords = (geometry as any).coordinates as [number, number];

        if (layer.id === "subway-station-circle" || layer.id === "subway-station-label") {
            setPopupCoords([coords[0], coords[1]]);
            setFocusedLine(null); // Clear line focus when selecting a station
            if (onStationClick) onStationClick(properties.name, [coords[1], coords[0]]);
        } else if (layer.id === "wc-unclustered") {
            onWCClick(properties as any);
        } else if (layer.id === "bus-unclustered") {
            setPopupCoords([coords[0], coords[1]]);
            onBusStopClick(properties as any, [coords[1], coords[0]]);
        } else if ((layer.id === "wc-clusters" || layer.id === "bus-clusters") && mapRef.current) {
            const clusterId = properties.cluster_id;
            const sourceId = layer.id === "wc-clusters" ? "wc-source" : "bus-source";
            const source: any = mapRef.current.getMap().getSource(sourceId);
            source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                if (err) return;
                mapRef.current?.getMap().easeTo({
                    center: coords as [number, number],
                    zoom: zoom,
                    duration: 500
                });
            });
        }
    }, [onStationClick, onWCClick, onBusStopClick]);

    return (
        <div className="absolute inset-0 w-full h-full z-0 bg-black">
            <Map
                initialViewState={{
                    longitude: 126.9780,
                    latitude: 37.5665,
                    zoom: 12
                }}
                mapStyle={isDarkMode ? CARTO_DARK : CARTO_VOYAGER}
                style={{ width: "100%", height: "100%" }}
                cursor={cursor}
                onMouseEnter={onHover}
                onMouseLeave={() => setCursor("auto")}
                onClick={onClick}
                onMove={(e) => {
                    const { latitude, longitude, zoom } = e.viewState;
                    setCurrentZoom(zoom);
                    if (onCenterChange) onCenterChange(latitude, longitude);
                }}
                interactiveLayerIds={["subway-line-layer", "subway-station-circle", "subway-station-label", "wc-unclustered", "wc-clusters", "bus-unclustered", "bus-clusters"]}
                ref={(r) => {
                    if (r) {
                        mapRef.current = r;
                        if (onMapReady) onMapReady(r.getMap());
                    }
                }}
            >
                {/* 1.1 Dark Mode Base Dimming Overlay */}
                {isDarkMode && (
                    <Layer
                        id="dark-mode-overlay"
                        type="background"
                        paint={{
                            "background-color": "black",
                            "background-opacity": 0.15
                        }}
                        beforeId="subway-line-layer"
                    />
                )}

                {/* 1. Subway Lines Layer */}
                {activeTab === "subway" && (
                    <Source id="subway-lines" type="geojson" data={subwayData.lines}>
                        <Layer
                            id="subway-line-layer"
                            type="line"
                            layout={{ "line-join": "round", "line-cap": "round" }}
                            paint={{
                                "line-color": pathResult 
                                    ? (isDarkMode ? "#333333" : "#cccccc") 
                                    : focusedLine 
                                        ? ["case", ["==", ["get", "name"], focusedLine], ["get", "color"], (isDarkMode ? "#2D3436" : "#E2E8F0")]
                                        : ["get", "color"],
                                "line-width": 4,
                                "line-opacity": pathResult 
                                    ? 0.4 
                                    : focusedLine
                                        ? ["case", ["==", ["get", "name"], focusedLine], 1.0, 0.2]
                                        : 0.8
                            }}
                        />
                    </Source>
                )}

                {/* 0. Path Result Layer (Solid/Colored segments) */}
                {activeTab === "subway" && pathLineData.features.length > 0 && (
                    <Source id="path-result" type="geojson" data={pathLineData}>
                        <Layer
                            id="path-line-bg"
                            type="line"
                            layout={{ "line-join": "round", "line-cap": "round" }}
                            paint={{
                                "line-color": ["get", "color"],
                                "line-width": 12,
                                "line-opacity": 0.5,
                                "line-blur": 3
                            }}
                        />
                        <Layer
                            id="path-line-solid"
                            type="line"
                            layout={{ "line-join": "round", "line-cap": "round" }}
                            paint={{
                                "line-color": ["get", "color"],
                                "line-width": 6,
                                "line-opacity": 1
                            }}
                        />
                    </Source>
                )}

                {/* 2. Subway Stations Layer (MOVED AFTER LINES) */}
                {activeTab === "subway" && (
                    <Source id="subway-stations" type="geojson" data={subwayData.stations}>
                        <Layer
                            id="subway-station-circle"
                            type="circle"
                            paint={{
                                "circle-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    10, 2,
                                    12, 4,
                                    14, 7,
                                    16, 9
                                ],
                                "circle-color": "white",
                                "circle-stroke-width": [
                                    "interpolate", ["linear"], ["zoom"],
                                    12, 1.5,
                                    14, 2.5,
                                    16, 3
                                ],
                                "circle-stroke-color": ["get", ["at", 0, ["get", "lineColors"]]],
                                "circle-opacity": pathResult ? 0.3 : 1,
                                "circle-stroke-opacity": pathResult ? 0.3 : 1
                            }}
                        />
                        <Layer
                            id="subway-station-label"
                            type="symbol"
                            layout={{
                                "text-field": ["get", "name"],
                                "text-size": [
                                    "interpolate", ["linear"], ["zoom"],
                                    12, 10,
                                    14, 13,
                                    16, 15
                                ],
                                "text-offset": [0, 1.4],
                                "text-anchor": "top",
                                "text-font": ["literal", ["Standard-Regular", "Noto Sans KR Regular", "Arial Unicode MS Regular"]]
                            }}
                            paint={{
                                "text-color": isDarkMode ? "#ffffff" : "#000000",
                                "text-halo-color": isDarkMode ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)",
                                "text-halo-width": 1.5,
                                "text-opacity": pathResult ? 0.3 : 1
                            }}
                        />
                    </Source>
                )}

                {/* 2.5 Route Station Circle Highlight (ON TOP) */}
                {activeTab === "subway" && routeStationData.features.length > 0 && (
                    <Source id="route-highlight-source" type="geojson" data={routeStationData}>
                        <Layer
                            id="route-station-circle-highlight"
                            type="circle"
                            paint={{
                                "circle-radius": [
                                    "interpolate", ["linear"], ["zoom"],
                                    12, 5,
                                    14, 8,
                                    16, 11
                                ],
                                "circle-color": "white",
                                "circle-stroke-width": 4,
                                "circle-stroke-color": ["get", "routeColor"],
                                "circle-opacity": 1,
                                "circle-stroke-opacity": 1
                            }}
                        />
                    </Source>
                )}

                {/* 2.6 Consolidated Route Info Bubbles (Cohesive Card) */}
                {activeTab === "subway" && routeStationData.features.map((f: any, i: number) => {
                    const { name, arrivalTime, arrivalTimeWeight, platformInfo, routeColor } = f.properties;
                    const [lng, lat] = f.geometry.coordinates;
                    const isFocused = focusedBubble === name;
                    const isLast = i === routeStationData.features.length - 1;
                    
                    // Filter: Only show endpoints and transfers when zoomed out (< 15)
                    const isEndpoint = i === 0 || isLast;
                    const isTransfer = !!platformInfo; // Any station with platform info is a transfer/point of interest
                    const shouldShow = currentZoom >= 15 || isEndpoint || isTransfer;

                    if (!shouldShow) return null;
                    
                    return (
                        <Marker 
                            key={`info-${i}`} 
                            longitude={lng} 
                            latitude={lat} 
                            anchor="top" 
                            offset={[0, 15]}
                            style={{ zIndex: isFocused ? 5000 : 2000 }}
                        >
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setFocusedBubble(name);
                                }}
                                className={`flex flex-col gap-0.5 p-1 px-2.5 rounded-xl bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md border border-white/20 shadow-lg transition-all active:scale-95 w-fit items-center justify-center ${isFocused ? 'scale-[1.1] shadow-2xl border-blue-500 bg-white/95 dark:bg-zinc-800' : ''}`}
                            >
                                {/* Line 1: Station Name + Flag Icon */}
                                <div className="flex items-center gap-1">
                                    {isLast && <Flag size={10} className="text-rose-500 fill-rose-500" />}
                                    <span 
                                        className="text-[10px] font-black leading-tight text-center"
                                        style={{ color: routeColor }}
                                    >
                                        {name}
                                    </span>
                                </div>
                                
                                {/* Line 2: Arrival Info */}
                                <span className="text-[11px] font-black text-zinc-900 dark:text-white leading-tight">
                                    {timeDisplayMode === "duration" 
                                        ? `${Math.round(arrivalTimeWeight || 0)}분` 
                                        : (arrivalTime || "")
                                    }
                                </span>

                                {/* Line 3: Platform / Transfer Info */}
                                {platformInfo ? (
                                    <div className="flex items-center gap-1 justify-center mt-0.5">
                                        <div className="w-1 h-1 rounded-full bg-blue-500" />
                                        <span className="text-[8.5px] font-black text-blue-500 dark:text-blue-400 whitespace-nowrap leading-tight">
                                            환승 {platformInfo}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="h-[2px]" /> // Maintain consistent spacing if no transfer info
                                )}
                            </button>
                        </Marker>
                    );
                })}

                {/* 5.1 User Location Marker (RED) */}
                {userLocation && (
                    <Marker longitude={userLocation[1]} latitude={userLocation[0]} anchor="bottom">
                        <div className="flex flex-col items-center group">
                            <div className="px-2 py-1 rounded-full bg-rose-500 text-white text-[10px] font-black shadow-lg mb-1 animate-bounce">
                                내 위치
                            </div>
                            <div className="w-3 h-3 rounded-full bg-rose-500 border-2 border-white shadow-md" />
                        </div>
                    </Marker>
                )}

                {/* 5. Real-time Train Layer (Rendering on top of everything else) */}
                {activeTab === "subway" && (
                    <Source id="train-source" type="geojson" data={trainData}>
                        <Layer
                            id="train-halo"
                            type="circle"
                            paint={{
                                "circle-radius": 12,
                                "circle-color": ["get", "lineColor"],
                                "circle-blur": 1,
                                "circle-opacity": 0.7
                            }}
                        />
                        <Layer
                            id="train-layer"
                            type="symbol"
                            layout={{
                                "text-field": "🚃",
                                "text-size": 18,
                                "text-allow-overlap": true,
                                "text-ignore-placement": true,
                                "text-anchor": "center"
                            }}
                        />
                    </Source>
                )}

                {/* 3. Bus Stop Markers ( Clustering) */}
                {activeTab === "bus" && (
                    <Source id="bus-source" type="geojson" data={busData as any} cluster={true} clusterMaxZoom={14} clusterRadius={50}>
                        <Layer id="bus-clusters" type="circle" filter={["has", "point_count"]} paint={{ "circle-color": "#10b981", "circle-radius": ["step", ["get", "point_count"], 15, 20, 20, 50, 25] }} />
                        <Layer id="bus-cluster-count" type="symbol" filter={["has", "point_count"]} layout={{ "text-field": "{point_count}", "text-size": 12 }} paint={{ "text-color": "white" }} />
                        <Layer id="bus-unclustered" type="circle" filter={["!", ["has", "point_count"]]} paint={{ "circle-radius": [
                            "interpolate", ["linear"], ["zoom"],
                            12, 3,
                            14, 6,
                            16, 8
                        ], "circle-color": "white", "circle-stroke-width": 2, "circle-stroke-color": "#10b981" }} />
                        <Layer 
                            id="bus-station-label"
                            type="symbol"
                            filter={["!", ["has", "point_count"]]}
                            layout={{
                                "text-field": ["get", "name"],
                                "text-size": [
                                    "interpolate", ["linear"], ["zoom"],
                                    14, 9,
                                    16, 12
                                ],
                                "text-offset": [0, 1.2],
                                "text-anchor": "top",
                                "visibility": "visible"
                            }}
                            paint={{
                                "text-color": isDarkMode ? "#ffffff" : "#059669",
                                "text-halo-color": isDarkMode ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)",
                                "text-halo-width": 1.5,
                                "text-opacity": [
                                    "interpolate", ["linear"], ["zoom"],
                                    14, 0,
                                    14.5, 1
                                ]
                            }}
                        />
                    </Source>
                )}

                {/* 4. WC Markers ( Clustering) */}
                {activeTab === "wc" && (
                    <Source id="wc-source" type="geojson" data={filteredWCs as any} cluster={true} clusterMaxZoom={14} clusterRadius={50}>
                        <Layer id="wc-clusters" type="circle" filter={["has", "point_count"]} paint={{ "circle-color": "#6366f1", "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 30, 25] }} />
                        <Layer id="wc-cluster-count" type="symbol" filter={["has", "point_count"]} layout={{ "text-field": "{point_count}", "text-size": 12 }} paint={{ "text-color": "white" }} />
                        <Layer id="wc-unclustered" type="circle" filter={["!", ["has", "point_count"]]} paint={{ "circle-radius": 8, "circle-color": "white", "circle-stroke-width": 2, "circle-stroke-color": "#6366f1" }} />
                    </Source>
                )}

                {/* 6. Station Detail Popup */}
                {popupCoords && ((activeTab === 'subway' && selectedStationName) || (activeTab === 'bus' && selectedBusStop)) && (
                    <Popup
                        longitude={popupCoords[0]}
                        latitude={popupCoords[1]}
                        closeButton={false}
                        closeOnClick={false}
                        onClose={() => setPopupCoords(null)}
                        anchor="bottom"
                        offset={15}
                        className="custom-station-popup"
                    >
                        <div className="p-3 min-w-[220px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-white/10 shadow-2xl">
                            <h3 className="text-[17px] font-black mb-3 text-zinc-900 dark:text-white border-b border-zinc-100 dark:border-white/5 pb-2 flex items-center gap-1.5">
                                {activeTab === 'subway' && selectedStationName ? (
                                    <>
                                        {selectedStationName}
                                        {getStationBadge(selectedStationName) && (
                                            <span 
                                                className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full text-[11px] font-black text-white shadow-sm"
                                                style={{ backgroundColor: getStationBadge(selectedStationName)!.color }}
                                            >
                                                {getStationBadge(selectedStationName)!.num}
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    selectedBusStop?.name
                                )}
                            </h3>
                            
                            {/* Navigation Actions */}
                            <div className="grid grid-cols-3 gap-1.5 mb-4">
                                <button onClick={() => { onSetStart(activeTab === 'subway' ? selectedStationName! : selectedBusStop!.name); setPopupCoords(null); }} className="py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-bold shadow-sm transition-all active:scale-95">출발</button>
                                <button onClick={() => { onSetWaypoint(activeTab === 'subway' ? selectedStationName! : selectedBusStop!.name); setPopupCoords(null); }} className="py-2 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 text-zinc-800 dark:text-white text-[11px] font-bold transition-all active:scale-95">경유</button>
                                <button onClick={() => { onSetEnd(activeTab === 'subway' ? selectedStationName! : selectedBusStop!.name); setPopupCoords(null); }} className="py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold shadow-sm transition-all active:scale-95">도착</button>
                            </div>

                            {/* Arrivals or Routes */}
                            <div className="space-y-2 max-h-[160px] overflow-y-auto no-scrollbar">
                                {activeTab === 'bus' && (
                                    <p className="text-[9px] font-black text-zinc-400 dark:text-white/40 uppercase tracking-widest mb-1">
                                        경유 노선 정보
                                    </p>
                                )}
                                {activeTab === 'bus' && selectedBusStop ? (
                                    <div className="flex flex-wrap gap-1">
                                        {(typeof selectedBusStop.routes === 'string' ? JSON.parse(selectedBusStop.routes as unknown as string) : (selectedBusStop.routes || [])).map((r: string, i: number) => (
                                            <span key={i} className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black border border-emerald-500/20">
                                                {r}
                                            </span>
                                        ))}
                                    </div>
                                ) : stationArrivals.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        {/* Up/Inner Line */}
                                        <div className="flex flex-col gap-1.5">
                                            <ArrivalHeader 
                                                defaultTitle="상행 · 내선" 
                                                trains={stationArrivals.filter(arr => arr.updnLine.includes('상행') || arr.updnLine.includes('내선'))}
                                                textColor="text-blue-500 dark:text-blue-400"
                                                borderColor="border-blue-500/20"
                                            />
                                            {stationArrivals.filter(arr => arr.updnLine.includes('상행') || arr.updnLine.includes('내선')).length > 0 ? (
                                                stationArrivals.filter(arr => arr.updnLine.includes('상행') || arr.updnLine.includes('내선')).slice(0, 3).map((arr, i) => (
                                                    <ArrivalItemListItem key={i} arr={arr} timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} />
                                                ))
                                            ) : (
                                                <div className="text-[10px] text-zinc-400 text-center py-2">운행 종료</div>
                                            )}
                                        </div>
                                        
                                        {/* Down/Outer Line */}
                                        <div className="flex flex-col gap-1.5">
                                            <ArrivalHeader 
                                                defaultTitle="하행 · 외선" 
                                                trains={stationArrivals.filter(arr => arr.updnLine.includes('하행') || arr.updnLine.includes('외선'))}
                                                textColor="text-orange-500 dark:text-orange-400"
                                                borderColor="border-orange-500/20"
                                            />
                                            {stationArrivals.filter(arr => arr.updnLine.includes('하행') || arr.updnLine.includes('외선')).length > 0 ? (
                                                stationArrivals.filter(arr => arr.updnLine.includes('하행') || arr.updnLine.includes('외선')).slice(0, 3).map((arr, i) => (
                                                    <ArrivalItemListItem key={i} arr={arr} timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} />
                                                ))
                                            ) : (
                                                <div className="text-[10px] text-zinc-400 text-center py-2">운행 종료</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-4 text-center text-zinc-400 dark:text-white/30 text-[11px] font-bold">도착 정보가 없습니다.</div>
                                )}
                            </div>
                        </div>
                    </Popup>
                )}

            </Map>
        </div>
    );
}

export default memo(MapLibreBackground);
