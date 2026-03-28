"use client";

import { useEffect, useState, memo, useRef, useMemo, useCallback } from "react";
import Map, { Source, Layer, NavigationControl, GeolocateControl, MapRef, Popup, Marker } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { PathResult } from "@/utils/pathfinding";
import { WCItem } from "./WCLayer";
import { BusStop } from "./BusStopLayer";
import { StationArrival } from "@/services/arrivalApi";
import { convertSubwayToGeoJSON, convertBusStopsToGeoJSON, convertWCToGeoJSON, convertTrainsToGeoJSON, convertPathToGeoJSON } from "@/utils/geoJsonUtils";

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
}

const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CARTO_VOYAGER = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

function MapLibreBackground({
    pathResult, activeTab, isDarkMode, wcItems, wcFilters, busStops, trains,
    onStationClick, onWCClick, onBusStopClick, onMapReady,
    onSetStart, onSetEnd, onSetWaypoint, selectedStationName, stationArrivals,
    onCenterChange
}: MapLibreProps) {
    const mapRef = useRef<MapRef | null>(null);
    const [popupCoords, setPopupCoords] = useState<[number, number] | null>(null);
    
    // Memoized GeoJSON Data
    const subwayData = useMemo(() => convertSubwayToGeoJSON(), []);
    const busData = useMemo(() => convertBusStopsToGeoJSON(busStops), [busStops]);
    const wcData = useMemo(() => convertWCToGeoJSON(wcItems), [wcItems]);
    const trainData = useMemo(() => convertTrainsToGeoJSON(trains), [trains]);

    // Memoized Path Data with exact line colors
    const pathData = useMemo(() => {
        if (!pathResult) return null;
        return convertPathToGeoJSON(pathResult.path);
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

    const onHover = useCallback((e: any) => {
        setCursor(e.features.length ? "pointer" : "auto");
    }, []);

    const onClick = useCallback((e: any) => {
        const feature = e.features && e.features[0];
        if (!feature) {
            setPopupCoords(null);
            return;
        }

        const { layer, properties, geometry } = feature;
        const coords = (geometry as any).coordinates as [number, number];

        if (layer.id === "subway-station-circle" || layer.id === "subway-station-label") {
            setPopupCoords([coords[0], coords[1]]);
            if (onStationClick) onStationClick(properties.name, [coords[1], coords[0]]);
        } else if (layer.id === "wc-unclustered") {
            onWCClick(properties as any);
        } else if (layer.id === "bus-unclustered") {
            onBusStopClick(properties as any);
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
                    const { latitude, longitude } = e.viewState;
                    if (onCenterChange) onCenterChange(latitude, longitude);
                }}
                interactiveLayerIds={["subway-station-circle", "subway-station-label", "wc-unclustered", "wc-clusters", "bus-unclustered", "bus-clusters"]}
                ref={(r) => {
                    if (r) {
                        mapRef.current = r;
                        if (onMapReady) onMapReady(r.getMap());
                    }
                }}
            >
                {/* 2. Subway Lines Layer */}
                <Source id="subway-lines" type="geojson" data={subwayData.lines}>
                    <Layer
                        id="subway-line-layer"
                        type="line"
                        layout={{ "line-join": "round", "line-cap": "round" }}
                        paint={{
                            "line-color": pathResult ? (isDarkMode ? "#333333" : "#cccccc") : ["get", "color"],
                            "line-width": 4,
                            "line-opacity": pathResult ? 0.4 : 0.8
                        }}
                    />
                </Source>

                {/* 0. Path Result Layer (Solid/Colored segments) */}
                {pathLineData.features.length > 0 && (
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

                {/* 2.5 Route Station Details & Highlight (ON TOP) */}
                {routeStationData.features.length > 0 && (
                    <Source id="route-highlight-source" type="geojson" data={routeStationData}>
                        {/* 2.5.1 Circle Highlight (Solid white center with line border) */}
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
                        {/* 2.5.2 Name Label */}
                        <Layer
                            id="route-station-name-highlight"
                            type="symbol"
                            layout={{
                                "text-field": ["get", "name"],
                                "text-size": 15,
                                "text-offset": [0, -1.8], // Above the point
                                "text-anchor": "bottom",
                                "text-font": ["literal", ["Standard-Bold", "Noto Sans KR Bold", "Arial Unicode MS Bold", "sans-serif"]],
                                "text-allow-overlap": true,
                                "text-ignore-placement": true
                            }}
                            paint={{
                                "text-color": ["get", "routeColor"],
                                "text-halo-color": isDarkMode ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.9)",
                                "text-halo-width": 3,
                                "text-opacity": 1
                            }}
                        />
                    </Source>
                )}

                {/* 2.6 Route Info Bubbles (Tiny, High Contrast) */}
                {routeStationData.features.map((f: any, i: number) => {
                    const { name, arrivalTime, platformInfo } = f.properties;
                    const [lng, lat] = f.geometry.coordinates;
                    
                    return (
                        <Marker key={`info-${i}`} longitude={lng} latitude={lat} anchor="top" offset={[0, 18]}>
                            <div className="flex flex-col gap-0.5 pointer-events-none items-center">
                                {/* Small Bubble 1: Arrival Time */}
                                <div className="px-1.5 py-0.5 rounded-full bg-white dark:bg-zinc-800 shadow-sm border border-black/5 dark:border-white/10">
                                    <span className="text-[9px] font-black text-zinc-900 dark:text-white leading-none">
                                        도착시간 {arrivalTime}
                                    </span>
                                </div>
                                
                                {/* Small Bubble 2: Fast Transfer (if exists) */}
                                {platformInfo && (
                                    <div className="px-1.5 py-0.5 rounded-full bg-white dark:bg-zinc-800 shadow-sm border border-black/5 dark:border-white/10">
                                        <span className="text-[8px] font-black text-blue-500 dark:text-blue-400 leading-none">
                                            빠른환승 {platformInfo}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </Marker>
                    );
                })}

                {/* 5. Real-time Train Layer */}
                <Source id="train-source" type="geojson" data={trainData}>
                    <Layer
                        id="train-halo"
                        type="circle"
                        paint={{
                            "circle-radius": 10,
                            "circle-color": ["get", "lineColor"],
                            "circle-blur": 1,
                            "circle-opacity": 0.6
                        }}
                    />
                    <Layer
                        id="train-layer"
                        type="symbol"
                        layout={{
                            "text-field": "🚃",
                            "text-size": 16,
                            "text-allow-overlap": true,
                            "text-ignore-placement": true
                        }}
                    />
                </Source>

                {/* 3. Bus Stop Markers ( Clustering) */}
                {(activeTab === "bus" || activeTab === "subway+bus") && (
                    <Source id="bus-source" type="geojson" data={busData as any} cluster={true} clusterMaxZoom={14} clusterRadius={50}>
                        <Layer id="bus-clusters" type="circle" filter={["has", "point_count"]} paint={{ "circle-color": "#10b981", "circle-radius": ["step", ["get", "point_count"], 15, 20, 20, 50, 25] }} />
                        <Layer id="bus-cluster-count" type="symbol" filter={["has", "point_count"]} layout={{ "text-field": "{point_count}", "text-size": 12 }} paint={{ "text-color": "white" }} />
                        <Layer id="bus-unclustered" type="circle" filter={["!", ["has", "point_count"]]} paint={{ "circle-radius": 6, "circle-color": "white", "circle-stroke-width": 2, "circle-stroke-color": "#10b981" }} />
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
                {popupCoords && selectedStationName && (
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
                        <div className="p-3 min-w-[220px] glass-premium rounded-2xl bg-white/95 dark:bg-zinc-900/95 border border-white/20 shadow-2xl">
                            <h3 className="text-[17px] font-black mb-3 text-zinc-900 dark:text-white border-b border-zinc-100 dark:border-white/5 pb-2">
                                {selectedStationName}
                            </h3>
                            
                            {/* Navigation Actions */}
                            <div className="grid grid-cols-3 gap-1.5 mb-4">
                                <button onClick={() => { onSetStart(selectedStationName); setPopupCoords(null); }} className="py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-bold shadow-sm transition-all active:scale-95">출발</button>
                                <button onClick={() => { onSetWaypoint(selectedStationName); setPopupCoords(null); }} className="py-2 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 text-zinc-800 dark:text-white text-[11px] font-bold transition-all active:scale-95">경유</button>
                                <button onClick={() => { onSetEnd(selectedStationName); setPopupCoords(null); }} className="py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold shadow-sm transition-all active:scale-95">도착</button>
                            </div>

                            {/* Arrivals */}
                            <div className="space-y-2 max-h-[160px] overflow-y-auto no-scrollbar">
                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">실시간 도착 정보</p>
                                {stationArrivals.length > 0 ? (
                                    stationArrivals.slice(0, 6).map((arr, i) => (
                                        <div key={i} className="flex flex-col gap-0.5 p-2 rounded-lg bg-black/5 dark:bg-white/5 border border-white/5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-zinc-600 dark:text-zinc-300">{arr.trainLineNm}</span>
                                                <span className={`text-[10px] font-black ${arr.updnLine === '0' ? 'text-blue-500' : 'text-orange-500'}`}>
                                                    {arr.updnLine === '0' ? '상행' : '하행'}
                                                </span>
                                            </div>
                                            <span className="text-[11px] font-bold text-zinc-900 dark:text-white">{arr.arrivalMsg2}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-4 text-center text-zinc-400 text-[11px] font-bold">도착 정보가 없습니다.</div>
                                )}
                            </div>
                        </div>
                    </Popup>
                )}

                <NavigationControl position="bottom-right" />
            </Map>
        </div>
    );
}

export default memo(MapLibreBackground);
