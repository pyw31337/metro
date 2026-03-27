"use client";

import { useEffect, useState, memo } from "react";
import dynamic from "next/dynamic";
import { getAllStations, Station } from "@/data/subway-lines";
import { PathResult } from "@/utils/pathfinding";
import { useRealtimeTrains } from "@/hooks/useRealtimeTrains";
import type { WCItem } from "./WCLayer";
import type { BusStop } from "./BusStopLayer";

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

export type ActiveTab = "subway" | "bus" | "wc";

interface MapBackgroundProps {
    pathResult: PathResult | null;
    startStation: string | null;
    endStation: string | null;
    onStationClick?: (name: string) => void;
    activeTab: ActiveTab;
    isDarkMode: boolean;
    wcItems: WCItem[];
    busStops: BusStop[];
    selectedBusStopId: string | null;
    onWCClick: (item: WCItem) => void;
    onBusStopClick: (stop: BusStop) => void;
}

function MapBackground({
    pathResult, startStation, endStation, onStationClick,
    activeTab, isDarkMode, wcItems, busStops, selectedBusStopId,
    onWCClick, onBusStopClick
}: MapBackgroundProps) {
    const [isClient, setIsClient] = useState(false);
    const [stations, setStations] = useState<Station[]>([]);
    const [zoomLevel, setZoomLevel] = useState(12);

    const trains = useRealtimeTrains();

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
                style={{ height: "100%", width: "100%", background: isDarkMode ? "#1a1b1e" : "#f8f9fa" }}
            >
                <ZoomHandler onZoomChange={setZoomLevel} />
                <TileLayer url={tileUrl} />

                {/* 지하철 레이어: subway 탭 또는 경로 탐색 중일 때 항상 */}
                <SubwayCanvasLayer
                    stations={stations}
                    zoomLevel={zoomLevel}
                    startStation={activeTab === "subway" ? startStation : null}
                    endStation={activeTab === "subway" ? endStation : null}
                    pathResult={activeTab === "subway" ? pathResult : null}
                    trains={activeTab === "subway" ? trains : []}
                    onStationClick={handleStationClick}
                    isDarkMode={isDarkMode}
                />

                {/* WC 레이어 */}
                {activeTab === "wc" && (
                    <WCLayer items={wcItems} onWCClick={onWCClick} />
                )}

                {/* 버스 레이어 */}
                {activeTab === "bus" && (
                    <BusStopLayer
                        stops={busStops}
                        selectedId={selectedBusStopId}
                        onStopClick={onBusStopClick}
                    />
                )}
            </MapContainer>
        </div>
    );
}

export default memo(MapBackground);
