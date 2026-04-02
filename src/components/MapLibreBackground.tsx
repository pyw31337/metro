"use client";

import { useState, memo, useRef, useMemo, useCallback, useEffect } from "react";
import { Marker, useMap, Source, Layer } from "react-map-gl/maplibre";
import { PathResult, WCItem, BusStop, ActiveTab, WCFilters, StationArrival, Station } from "@/types/metro";
import { fetchTrainCongestion } from "@/services/arrivalApi";
import { Train } from "lucide-react";
import { 
    convertSubwayToGeoJSON, 
    convertBusStopsToGeoJSON, 
    convertWCToGeoJSON, 
    convertTrainsToGeoJSON, 
    convertPathToGeoJSON,
    convertBusPositionsToGeoJSON
} from "@/utils/geoJsonUtils";

import MapBase from "./map/MapBase";
import SubwayLayers from "./map/SubwayLayers";
import BusLayers from "./map/BusLayers";
import BusRealtimeLayers from "./map/BusRealtimeLayers";
import TrainLayers from "./map/TrainLayers";
import WCLayers from "./map/WCLayers";
import RouteLayers from "./map/RouteLayers";
import MapPopups from "./map/MapPopups";
import { useTransferVerification } from "@/hooks/useTransferVerification";

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
    wcFilters: WCFilters;
    busStops: BusStop[];
    selectedBusStopId: string | null;
    onWCClick: (item: WCItem) => void;
    onBusStopClick: (stop: BusStop, latlng?: [number, number]) => void;
    selectedWC: WCItem | null;
    selectedBusStop: BusStop | null;
    selectedStationName: string | null;
    stationArrivals: any[];
    onCenterChange?: (lat: number, lng: number) => void;
    onBoundsChange?: (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => void;
    onMapReady?: (map: any) => void;
    userLocation: [number, number] | null;
    timeDisplayMode: "duration" | "arrival";
    onToggleTimeDisplay?: () => void;
    showAllRouteBubbles: boolean;
    onToggleShowAll?: () => void;
    stations: any[];
    activeLine: string | null;
    onActiveLineChange: (line: string | null) => void;
    nearestStation: Station | null;
    selectedBusRoute?: string | null;
}

// ─── Canvas Polyfill ───────────────────────────────────────────────────────────
const safeRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
};

// ─── Icon Registration Sub-component ──────────────────────────────────────────
const MapIconRegister = memo(({ stations }: { stations: any[] }) => {
    const { current: mapRef } = useMap();
    const map = mapRef?.getMap();

    useEffect(() => {
        if (!map) return;

        const registerIcons = () => {
            const { SUBWAY_LINES } = require('@/data/subway-lines');
            const uniqueColors = new Set<string>();
            
            // Pre-load all known line colors first
            SUBWAY_LINES.forEach((line: any) => {
                if (line.color) uniqueColors.add(line.color.toUpperCase());
            });

            // Add dynamic station colors as well
            stations.forEach(s => {
                if (s.lineColors) {
                    s.lineColors.forEach((color: string) => uniqueColors.add(color.toUpperCase()));
                }
            });

            uniqueColors.forEach(color => {
                const id = `train-card-${color}`;
                if (map.hasImage(id)) return;
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    safeRoundRect(ctx, 14, 14, 100, 100, 20);
                    ctx.fill();
                    ctx.strokeStyle = 'white'; ctx.lineWidth = 12; ctx.stroke();
                    ctx.fillStyle = 'white';
                    ctx.beginPath(); safeRoundRect(ctx, 34, 34, 60, 40, 5); ctx.fill();
                    ctx.beginPath(); ctx.arc(44, 84, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(84, 84, 8, 0, Math.PI * 2); ctx.fill();
                    const data = ctx.getImageData(0, 0, 128, 128);
                    map.addImage(id, data);
                }
            });

            if (!map.hasImage('express-full-badge')) {
                const canvas = document.createElement('canvas');
                canvas.width = 280; canvas.height = 192;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#ef4444';
                    ctx.beginPath();
                    safeRoundRect(ctx, 12, 12, 256, 168, 84);
                    ctx.fill();
                    ctx.strokeStyle = 'white'; ctx.lineWidth = 12; ctx.stroke();
                    ctx.fillStyle = 'white';
                    ctx.font = '1000 104px Pretentard, -apple-system, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('급행', 140, 96 + 4);
                    const data = ctx.getImageData(0, 0, 280, 192);
                    map.addImage('express-full-badge', data, { pixelRatio: 3 });
                }
            }
        };

        if (map.isStyleLoaded()) {
            registerIcons();
        }
        map.on('style.load', registerIcons);
        
        return () => {
            map.off('style.load', registerIcons);
        };
    }, [map, stations]);

    return null;
});

function MapLibreBackground(props: MapLibreProps) {
    const {
        pathResult, startStation, activeTab, isDarkMode, wcItems, wcFilters, busStops,
        onStationClick, onBusStopClick, onMapReady,
        onSetStart, onSetEnd, onSetWaypoint, selectedStationName, stationArrivals,
        onCenterChange, onBoundsChange, userLocation, timeDisplayMode, onToggleTimeDisplay, 
        showAllRouteBubbles, selectedBusStop, stations, activeLine, onActiveLineChange,
        nearestStation, selectedBusRoute
    } = props;

    const [mapInstance, setMapInstance] = useState<any | null>(null);
    const [popupCoords, setPopupCoords] = useState<[number, number] | null>(null);
    const [focusedBubble, setFocusedBubble] = useState<string | null>(null);
    const [selectedTrain, setSelectedTrain] = useState<any | null>(null);
    const [congestionData, setCongestionData] = useState<any | null>(null);
    const [trainArrivalDetail, setTrainArrivalDetail] = useState<StationArrival | null>(null);
    const [isLoadingCongestion, setIsLoadingCongestion] = useState(false);
    const verifiedPlats = useTransferVerification(pathResult, stations);

    // Call high-performance hooks internally
    const { useRealtimeTrains } = require("@/hooks/useRealtimeTrains");
    const { useBusPositions } = require("@/hooks/useBusPositions");
    
    useRealtimeTrains(mapInstance);
    useBusPositions(activeTab === "bus" || activeTab === "subway+bus", selectedBusRoute, mapInstance);

    // ─── Data Conversion ────────────────────────────────────────────────────────
    const subwayData = useMemo(() => convertSubwayToGeoJSON(), []);
    const filteredWCs = useMemo(() => convertWCToGeoJSON(wcItems, wcFilters), [wcItems, wcFilters]);
    const busGeoJSON = useMemo(() => convertBusStopsToGeoJSON(busStops), [busStops]);
    const pathGeoJSON = useMemo(() => convertPathToGeoJSON(pathResult), [pathResult]);
    
    // Static empty sources for real-time layers to be populated via hooks
    const trainData = useMemo(() => ({ type: "FeatureCollection" as const, features: [] }), []);
    const busRealtimeData = useMemo(() => ({ type: "FeatureCollection" as const, features: [] }), []);

    // ─── Train Logic ────────────────────────────────────────────────────────────
    const handleTrainClick = async (train: any) => {
        setSelectedTrain(train);
        setIsLoadingCongestion(true);
        setCongestionData(null);
        setTrainArrivalDetail(null);
        
        try {
            const { fetchStationArrivals } = await import("@/services/arrivalApi");
            const congestionPromise = fetchTrainCongestion(train.lineName, train.trainNo);
            const arrivalPromise = fetchStationArrivals(train.arrivalNm);
            
            const [cData, aList] = await Promise.all([congestionPromise, arrivalPromise]);
            setCongestionData(cData);
            
            const matchingArrival = aList.find(a => a.btrainNo === train.trainNo);
            if (matchingArrival) {
                setTrainArrivalDetail(matchingArrival);
            }
        } catch (err) { 
            console.error(err); 
        } finally { 
            setIsLoadingCongestion(false); 
        }
    };

    // ─── Interaction Handlers ───────────────────────────────────────────────────
    const handleMapClick = useCallback((e: any) => {
        const feature = e.features?.[0];
        if (!feature) {
            setFocusedBubble(null);
            setSelectedTrain(null);
            setTrainArrivalDetail(null);
            setPopupCoords(null);
            onActiveLineChange(null);
            // Also notify that the station selection should be cleared
            onStationClick?.("", undefined);
            return;
        }

        const coords = e.lngLat;

        if (feature.layer.id === 'subway-station-circle' || feature.layer.id === 'subway-station-label') {
            const name = feature.properties.name;
            const lines = typeof feature.properties.lines === 'string' ? JSON.parse(feature.properties.lines) : feature.properties.lines;
            
            onStationClick?.(name, [coords.lat, coords.lng]);
            setPopupCoords([coords.lng, coords.lat]);

            // Auto-activate the line if needed
            if (lines && Array.isArray(lines) && lines.length > 0) {
                if (!activeLine || !lines.includes(activeLine)) {
                    onActiveLineChange(lines[0]);
                }
            }
        } else if (feature.layer.id === 'bus-unclustered' || feature.layer.id === 'bus-station-label') {
            const stop = busStops.find(s => s.id === feature.properties.id);
            if (stop) {
                onBusStopClick(stop, [coords.lat, coords.lng]);
                setPopupCoords([coords.lng, coords.lat]);
                onActiveLineChange(null);
            }
        } else if (feature.layer.id === 'train-layer') {
            setPopupCoords(null);
            onActiveLineChange(null);
            handleTrainClick(feature.properties);
        } else if (feature.layer.id === 'subway-line-layer' || feature.layer.id === 'subway-line-interaction') {
            const lineName = feature.properties.name;
            setPopupCoords(null);
            // Toggle logic is handled in the callback in page.tsx
            onActiveLineChange(lineName);
        }
    }, [busStops, onStationClick, onBusStopClick, activeLine, onActiveLineChange]);

    return (
        <MapBase
            isDarkMode={isDarkMode}
            onMapReady={(map) => {
                setMapInstance(map);
                if (onMapReady) onMapReady(map);
            }}
            onClick={handleMapClick}
            onCenterChange={onCenterChange}
            onBoundsChange={onBoundsChange}
            interactiveLayerIds={[
                'subway-station-circle', 'subway-station-label', 
                'subway-line-layer', 'subway-line-interaction', 'bus-unclustered', 
                'bus-station-label', 'train-layer'
            ]}
        >
            <MapIconRegister stations={stations} />
            <SubwayLayers 
                subwayData={subwayData} 
                activeTab={activeTab} 
                isDarkMode={isDarkMode} 
                pathResult={pathResult}
                focusedLine={activeLine}
            />
            
            <BusLayers busData={busGeoJSON} activeTab={activeTab} isDarkMode={isDarkMode} />
            <BusRealtimeLayers busData={busRealtimeData} activeTab={activeTab} />
            
            <WCLayers wcData={filteredWCs} activeTab={activeTab} />
            
            <RouteLayers 
                activeTab={activeTab}
                pathLineData={pathGeoJSON.lines}
                routeStationData={pathGeoJSON.stations}
                showAllRouteBubbles={showAllRouteBubbles}
                focusedBubble={focusedBubble}
                setFocusedBubble={setFocusedBubble}
                timeDisplayMode={timeDisplayMode}
                onToggleTimeDisplay={onToggleTimeDisplay}
                verifiedPlats={verifiedPlats}
            />
            
            <TrainLayers 
                trainData={trainData} 
                activeTab={activeTab}
                trainFilter={null}
            />

            <MapPopups 
                popupCoords={popupCoords}
                setPopupCoords={setPopupCoords}
                selectedStationName={selectedStationName}
                selectedBusStop={selectedBusStop}
                activeTab={activeTab}
                stationArrivals={stationArrivals}
                timeDisplayMode={timeDisplayMode}
                onToggleTimeDisplay={onToggleTimeDisplay || (() => {})}
                onSetStart={onSetStart}
                onSetEnd={onSetEnd}
                onSetWaypoint={onSetWaypoint}
                startStation={startStation}
                selectedTrain={selectedTrain}
                setSelectedTrain={setSelectedTrain}
                isLoadingCongestion={isLoadingCongestion}
                congestionData={congestionData}
                trainArrivalDetail={trainArrivalDetail}
                activeLine={activeLine}
                onActiveLineChange={onActiveLineChange}
            />

            
            {userLocation && (
                <Marker longitude={userLocation[1]} latitude={userLocation[0]}>
                    <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse" />
                </Marker>
            )}

            {/* Nearest Station Layer (GPU Rendered) */}
            {mapInstance && (
                <Source
                    id="nearest-station-source"
                    type="geojson"
                    data={{
                        type: "FeatureCollection",
                        features: nearestStation ? [{
                            type: "Feature",
                            geometry: { type: "Point", coordinates: [nearestStation.lng, nearestStation.lat] },
                            properties: { name: nearestStation.name }
                        }] : []
                    }}
                >
                    <Layer
                        id="nearest-station-glow"
                        type="circle"
                        paint={{
                            "circle-radius": 15,
                            "circle-color": "#ef4444",
                            "circle-opacity": 0.3,
                            "circle-stroke-width": 0
                        }}
                    />
                    <Layer
                        id="nearest-station-core"
                        type="circle"
                        paint={{
                            "circle-radius": 8,
                            "circle-color": "#000000",
                            "circle-stroke-width": 3,
                            "circle-stroke-color": "#ef4444"
                        }}
                    />
                </Source>
            )}
        </MapBase>
    );
}

export default memo(MapLibreBackground);
