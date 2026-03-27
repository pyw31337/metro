"use client";

import { useEffect, useState, memo, useRef } from "react";
import dynamic from "next/dynamic";
import { createRoot } from "react-dom/client";
import { getAllStations, Station } from "@/data/subway-lines";
import { PathResult } from "@/utils/pathfinding";
import { useRealtimeTrains } from "@/hooks/useRealtimeTrains";
import StationPopup, { createStationPopup } from "./StationPopup";
import { useBusPositions, BusPosition } from "@/hooks/useBusPositions";
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

export type ActiveTab = "subway" | "bus" | "subway+bus" | "wc";

interface SubwayCanvasLayerProps {
    stations: Station[];
    zoomLevel: number;
    startStation: string | null;
    endStation: string | null;
    pathResult: PathResult | null;
    trains: any[];
    onStationClick: (name: string, latlng: [number, number]) => void;
    isDarkMode: boolean;
}

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
    busStops: BusStop[];
    selectedBusStopId: string | null;
    onWCClick: (item: WCItem) => void;
    onBusStopClick: (stop: BusStop, latlng?: [number, number]) => void;
}

function MapBackground({
    pathResult, startStation, endStation, onStationClick,
    onSetStart, onSetEnd, onSetWaypoint,
    activeTab, isDarkMode, wcItems, busStops, selectedBusStopId,
    onWCClick, onBusStopClick
}: MapBackgroundProps) {
    const [isClient, setIsClient] = useState(false);
    const [stations, setStations] = useState<Station[]>([]);
    const [zoomLevel, setZoomLevel] = useState(12);
    const mapRef = useRef<L.Map | null>(null);

    const trains = useRealtimeTrains();
    const buses = useBusPositions(activeTab === "bus" || activeTab === "subway+bus");

    useEffect(() => {
        setIsClient(true);
        setStations(getAllStations());
    }, []);

    const handleStationClick = (name: string) => {
        if (onStationClick) onStationClick(name);
    };

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
                ref={mapRef}
            >
                <ZoomHandler onZoomChange={setZoomLevel} />
                <TileLayer url={tileUrl} />

                {/* 지하철 레이어 */}
                {(activeTab === "subway" || activeTab === "subway+bus") && (
                    <SubwayCanvasLayer
                        stations={stations}
                        zoomLevel={zoomLevel}
                        startStation={startStation}
                        endStation={endStation}
                        pathResult={pathResult}
                        // Add Glow Filter for Lines
                        // This code block is syntactically incorrect as a prop.
                        // It appears to be intended for the SubwayCanvasLayer component's internal logic.
                        // For now, it's commented out to maintain syntactical correctness.
                        /*
                        const svgElement = document.querySelector(".leaflet-zoom-animated") as HTMLElement;
                        if (svgElement) {
                            // Apply a subtle drop-shadow to the entire SVG layer for line glowing
                            svgElement.style.filter = isDarkMode
                                ? "drop-shadow(0 0 8px rgba(255,255,255,0.1))"
                                : "drop-shadow(0 0 4px rgba(0,0,0,0.05))";
                        }
                        // Draw Lines
                        */
                        trains={trains}
                        onStationClick={(name, latlng) => {
                            if (mapRef.current && latlng) {
                                // Uber-style: Smooth FlyTo on click
                                mapRef.current.flyTo(latlng, 15, { duration: 1.5 });

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
                        isDarkMode={isDarkMode}
                    />
                )}

                {/* WC 레이어 */}
                {activeTab === "wc" && (
                    <WCLayer 
                        items={wcItems} 
                        onWCClick={onWCClick} 
                        isDimmed={!!pathResult} 
                    />
                )}

                {/* 버스 레이어 */}
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
                                        isDarkMode
                                    });
                                    L.popup().setLatLng(latlng).setContent(popupContent).openOn(mapRef.current);
                                    onBusStopClick(stop);
                                }
                            }}
                        />
                        <BusRealtimeLayer buses={buses} />
                    </>
                )}
            </MapContainer>
        </div>
    );
}

export default memo(MapBackground);
