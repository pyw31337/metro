"use client";

import { useEffect, useState, memo, useRef, useMemo, useCallback } from "react";
import Map, { Source, Layer, NavigationControl, GeolocateControl, MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Station, getAllStations } from "@/data/subway-lines";
import { PathResult } from "@/utils/pathfinding";
import { WCItem } from "./WCLayer";
import { BusStop } from "./BusStopLayer";
import { convertSubwayToGeoJSON, convertBusStopsToGeoJSON, convertWCToGeoJSON } from "@/utils/geoJsonUtils";

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
    selectedBusStopId: string | null;
    onWCClick: (item: WCItem) => void;
    onBusStopClick: (stop: BusStop, latlng?: [number, number]) => void;
    selectedWC: WCItem | null;
    selectedBusStop: BusStop | null;
    selectedStationName: string | null;
    onMapReady?: (map: any) => void;
}

const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CARTO_VOYAGER = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

function MapLibreBackground({
    pathResult, activeTab, isDarkMode, wcItems, wcFilters, busStops,
    onStationClick, onWCClick, onBusStopClick, onMapReady
}: MapLibreProps) {
    const mapRef = useRef<MapRef | null>(null);
    
    // Memoized GeoJSON Data
    const subwayData = useMemo(() => convertSubwayToGeoJSON(), []);
    const busData = useMemo(() => convertBusStopsToGeoJSON(busStops), [busStops]);
    const wcData = useMemo(() => convertWCToGeoJSON(wcItems), [wcItems]);

    // Filters for WCs
    const filteredWCs = useMemo(() => {
        let features = wcData.features;
        if (wcFilters.accessible) features = features.filter(f => f.properties.accessible);
        if (wcFilters.diapers) features = features.filter(f => f.properties.diapers);
        if (wcFilters.emergencyBell) features = features.filter(f => f.properties.emergencyBell);
        return { type: "FeatureCollection" as const, features };
    }, [wcData, wcFilters]);

    // Memoized Path Data
    const pathData = useMemo(() => {
        if (!pathResult) return null;
        const coords: [number, number][] = [];
        pathResult.path.forEach(name => {
            const station = getAllStations().find(s => s.name === name);
            if (station) coords.push([station.lng, station.lat]);
        });
        return {
            type: "Feature" as const,
            geometry: { type: "LineString" as const, coordinates: coords },
            properties: {}
        };
    }, [pathResult]);

    // Animation Effect for Path Line
    useEffect(() => {
        if (!pathResult || !mapRef.current) return;
        let step = 0;
        const map = mapRef.current.getMap();
        const animate = () => {
            step = (step + 1) % 200;
            if (map.getLayer("path-line-dash")) {
                map.setPaintProperty("path-line-dash", "line-dasharray", [1, 2]);
                map.setPaintProperty("path-line-dash", "line-dasharray-offset", step / 20);
            }
            requestAnimationFrame(animate);
        };
        const animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, [pathResult]);

    const [cursor, setCursor] = useState<string>("auto");

    const onHover = useCallback((e: any) => {
        setCursor(e.features.length ? "pointer" : "auto");
    }, []);

    const onClick = useCallback((e: any) => {
        const feature = e.features && e.features[0];
        if (!feature) return;

        const { layer, properties, geometry } = feature;
        const coords = (geometry as any).coordinates as [number, number];

        if (layer.id === "subway-station-circle") {
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
                interactiveLayerIds={["subway-station-circle", "wc-unclustered", "wc-clusters", "bus-unclustered", "bus-clusters"]}
                ref={(r) => {
                    if (r) {
                        mapRef.current = r;
                        if (onMapReady) onMapReady(r.getMap());
                    }
                }}
            >
                {/* 0. Path Result Layer (Animated) */}
                {pathData && (
                    <Source id="path-result" type="geojson" data={pathData}>
                        <Layer
                            id="path-line-bg"
                            type="line"
                            layout={{ "line-join": "round", "line-cap": "round" }}
                            paint={{
                                "line-color": "#3b82f6",
                                "line-width": 8,
                                "line-opacity": 0.4,
                                "line-blur": 2
                            }}
                        />
                        <Layer
                            id="path-line-dash"
                            type="line"
                            layout={{ "line-join": "round", "line-cap": "round" }}
                            paint={{
                                "line-color": "#60a5fa",
                                "line-width": 4,
                                "line-dasharray": [2, 4]
                            }}
                        />
                    </Source>
                )}

                {/* 1. Subway Lines Layer */}
                <Source id="subway-lines" type="geojson" data={subwayData.lines}>
                    <Layer
                        id="subway-line-layer"
                        type="line"
                        layout={{ "line-join": "round", "line-cap": "round" }}
                        paint={{
                            "line-color": ["get", "color"],
                            "line-width": 4,
                            "line-opacity": 0.8
                        }}
                    />
                </Source>

                {/* 2. Subway Stations Layer */}
                <Source id="subway-stations" type="geojson" data={subwayData.stations}>
                    <Layer
                        id="subway-station-circle"
                        type="circle"
                        paint={{
                            "circle-radius": 6,
                            "circle-color": "white",
                            "circle-stroke-width": 2,
                            "circle-stroke-color": ["get", ["at", 0, ["get", "lineColors"]]]
                        }}
                    />
                </Source>

                {/* 3. Bus Stop Markers (with Clustering) */}
                {(activeTab === "bus" || activeTab === "subway+bus") && (
                    <Source id="bus-source" type="geojson" data={busData as any} cluster={true} clusterMaxZoom={14} clusterRadius={50}>
                        <Layer
                            id="bus-clusters"
                            type="circle"
                            filter={["has", "point_count"]}
                            paint={{
                                "circle-color": "#10b981",
                                "circle-radius": ["step", ["get", "point_count"], 15, 20, 20, 50, 25]
                            }}
                        />
                        <Layer
                            id="bus-cluster-count"
                            type="symbol"
                            filter={["has", "point_count"]}
                            layout={{
                                "text-field": "{point_count}",
                                "text-size": 12
                            }}
                            paint={{ "text-color": "white" }}
                        />
                        <Layer
                            id="bus-unclustered"
                            type="circle"
                            filter={["!", ["has", "point_count"]]}
                            paint={{
                                "circle-radius": 6,
                                "circle-color": "white",
                                "circle-stroke-width": 2,
                                "circle-stroke-color": "#10b981"
                            }}
                        />
                    </Source>
                )}

                {/* 4. WC Markers (with Clustering) */}
                {activeTab === "wc" && (
                    <Source id="wc-source" type="geojson" data={filteredWCs as any} cluster={true} clusterMaxZoom={14} clusterRadius={50}>
                        <Layer
                            id="wc-clusters"
                            type="circle"
                            filter={["has", "point_count"]}
                            paint={{
                                "circle-color": "#6366f1",
                                "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 30, 25]
                            }}
                        />
                        <Layer
                            id="wc-cluster-count"
                            type="symbol"
                            filter={["has", "point_count"]}
                            layout={{
                                "text-field": "{point_count}",
                                "text-size": 12
                            }}
                            paint={{ "text-color": "white" }}
                        />
                        <Layer
                            id="wc-unclustered"
                            type="circle"
                            filter={["!", ["has", "point_count"]]}
                            paint={{
                                "circle-radius": 8,
                                "circle-color": "white",
                                "circle-stroke-width": 2,
                                "circle-stroke-color": "#6366f1"
                            }}
                        />
                    </Source>
                )}

                <GeolocateControl position="top-left" />
                <NavigationControl position="bottom-right" />
            </Map>
        </div>
    );
}

export default memo(MapLibreBackground);
