"use client";

import { useEffect, useState, memo, useRef } from "react";
import dynamic from "next/dynamic";
import { getAllStations, Station } from "@/data/subway-lines";
import { PathResult } from "@/utils/pathfinding";
import { useRealtimeTrains } from "@/hooks/useRealtimeTrains";
import { createStationPopup } from "./StationPopup";
import { useBusPositions } from "@/hooks/useBusPositions";
import L from "leaflet";
import type { WCItem } from "./WCLayer";
import type { BusStop } from "./BusStopLayer";
import BusRealtimeLayer from "./BusRealtimeLayer";

const MapContainer = dynamic(
    () => import("react-leaflet").then((mod) => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import("react-leaflet").then((mod) => mod.TileLayer),
    { ssr: false }
);
const ZoomHandler = dynamic(() => import("./ZoomHandler"), { ssr: false });
const SubwayCanvasLayer = dynamic(() => import("./SubwayCanvasLayer"), { ssr: false });
const WCLayer = dynamic(() => import("./WCLayer"), { ssr: false });
const BusStopLayer = dynamic(() => import("./BusStopLayer"), { ssr: false });
const BusRouteLayer = dynamic(() => import("./BusRouteLayer"), { ssr: false });

export type ActiveTab = "subway" | "bus" | "subway+bus" | "wc";

interface MapBackgroundProps {
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
    onMapReady?: (map: L.Map) => void;
}

function MapBackground({
    pathResult, startStation, endStation, onStationClick,
    onSetStart, onSetEnd, onSetWaypoint,
    activeTab, isDarkMode, wcItems, wcFilters, busStops, selectedBusStopId,
    onWCClick, onBusStopClick, selectedWC, selectedBusStop, selectedStationName,
    onMapReady
}: MapBackgroundProps) {
    const [isClient, setIsClient] = useState(false);
    const [stations, setStations] = useState<Station[]>([]);
    const [zoomLevel, setZoomLevel] = useState(12);
    const mapRef = useRef<L.Map | null>(null);

    const [selectedBusRoute, setSelectedBusRoute] = useState<string | null>(null);
    const trains = useRealtimeTrains();
    const buses = useBusPositions(activeTab === "bus" || activeTab === "subway+bus", selectedBusRoute);

    useEffect(() => {
        setIsClient(true);
        setStations(getAllStations());
    }, []);

    // Auto-open popups for selected items
    useEffect(() => {
        if (!mapRef.current) return;

        if (selectedWC) {
            const popupContent = createStationPopup({
                name: selectedWC.name,
                type: "bus",
                onSetStart: (n) => { onSetStart(n); mapRef.current?.closePopup(); },
                onSetEnd: (n) => { onSetEnd(n); mapRef.current?.closePopup(); },
                onSetWaypoint: (n) => { onSetWaypoint(n); mapRef.current?.closePopup(); },
                isDarkMode
            });
            L.popup({ className: "premium-popup", offset: [0, -10], closeButton: false })
                .setLatLng([selectedWC.lat, selectedWC.lng])
                .setContent(popupContent)
                .openOn(mapRef.current);
            mapRef.current.flyTo([selectedWC.lat, selectedWC.lng], 16, { duration: 0.7 });
        } else if (selectedBusStop) {
            const popupContent = createStationPopup({
                name: selectedBusStop.name,
                type: "bus",
                onSetStart: (n) => { onSetStart(n); mapRef.current?.closePopup(); },
                onSetEnd: (n) => { onSetEnd(n); mapRef.current?.closePopup(); },
                onSetWaypoint: (n) => { onSetWaypoint(n); mapRef.current?.closePopup(); },
                routes: selectedBusStop.routes,
                isDarkMode
            });
            L.popup({ className: "premium-popup", offset: [0, -10], closeButton: false })
                .setLatLng([selectedBusStop.lat, selectedBusStop.lng])
                .setContent(popupContent)
                .openOn(mapRef.current);
            mapRef.current.flyTo([selectedBusStop.lat, selectedBusStop.lng], 16, { duration: 0.7 });
        }
    }, [selectedWC, selectedBusStop, isDarkMode, onSetStart, onSetEnd, onSetWaypoint]);

    if (!isClient) {
        return (
            <div className="absolute inset-0 w-full h-full z-0 bg-gray-100 flex items-center justify-center">
                <div className="text-gray-400 text-sm animate-pulse">지도 로딩 중…</div>
            </div>
        );
    }

    const tileUrl = isDarkMode
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

    return (
        <div className="absolute inset-0 w-full h-full z-0">
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
            <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
            <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
            <MapContainer
                center={[37.5665, 126.9780]}
                zoom={12}
                scrollWheelZoom={true}
                zoomControl={false}
                attributionControl={false}
                preferCanvas={true}
                minZoom={9}
                maxBounds={[[36.5, 125.5], [38.5, 128.5]]}
                maxBoundsViscosity={1.0}
                style={{ height: "100%", width: "100%", background: isDarkMode ? "#000000" : "#f8f9fa", position: "fixed" }}
                ref={(map) => {
                    if (map) {
                        mapRef.current = map;
                        if (onMapReady) onMapReady(map);
                    }
                }}
            >
                <ZoomHandler onZoomChange={setZoomLevel} />
                <TileLayer url={tileUrl} />

                {(activeTab === "subway" || activeTab === "subway+bus") && (
                    <SubwayCanvasLayer
                        stations={stations}
                        zoomLevel={zoomLevel}
                        startStation={startStation}
                        endStation={endStation}
                        pathResult={pathResult}
                        trains={trains}
                        onStationClick={(name, latlng) => {
                            if (mapRef.current && latlng) {
                                mapRef.current.flyTo(latlng, 15, { duration: 0.7 });
                                if (onStationClick) onStationClick(name, latlng);
                                
                                const popupContent = createStationPopup({
                                    name,
                                    type: "subway",
                                    onSetStart: (n) => { onSetStart(n); mapRef.current?.closePopup(); },
                                    onSetEnd: (n) => { onSetEnd(n); mapRef.current?.closePopup(); }, 
                                    onSetWaypoint: (n) => { onSetWaypoint(n); mapRef.current?.closePopup(); },
                                    isDarkMode
                                });
                                L.popup({
                                    className: "premium-popup",
                                    offset: [0, -10],
                                    closeButton: false
                                })
                                .setLatLng(latlng)
                                .setContent(popupContent)
                                .openOn(mapRef.current);
                            }
                        }}
                        selectedStationName={selectedStationName}
                        isDarkMode={isDarkMode}
                    />
                )}

                {activeTab === "wc" && (
                    <WCLayer 
                        items={wcItems} 
                        filters={wcFilters}
                        onWCClick={onWCClick} 
                        isDimmed={!!pathResult} 
                    />
                )}

                {(activeTab === "bus" || activeTab === "subway+bus") && (
                    <>
                        <BusStopLayer
                            stops={busStops}
                            selectedId={selectedBusStopId}
                            onStopClick={(stop, latlng) => {
                                if (mapRef.current && latlng) {
                                    const popupContent = createStationPopup({
                                        name: stop.name,
                                        type: "bus",
                                        onSetStart: (n) => { onSetStart(n); mapRef.current?.closePopup(); },
                                        onSetEnd: (n) => { onSetEnd(n); mapRef.current?.closePopup(); },
                                        onSetWaypoint: (n) => { onSetWaypoint(n); mapRef.current?.closePopup(); },
                                        onSelectRoute: (r) => { setSelectedBusRoute(r); },
                                        routes: stop.routes,
                                        isDarkMode
                                    });
                                    L.popup({
                                        className: "premium-popup",
                                        offset: [0, -10],
                                        closeButton: false
                                    }).setLatLng(latlng).setContent(popupContent).openOn(mapRef.current);
                                    onBusStopClick(stop);
                                }
                            }}
                        />
                        <BusRouteLayer routeName={selectedBusRoute} isDarkMode={isDarkMode} />
                        <BusRealtimeLayer buses={buses} />
                    </>
                )}
            </MapContainer>
        </div>
    );
}

export default memo(MapBackground);
