"use client";

import { useState, memo, useRef, useMemo, useCallback, useEffect } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
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
    trains: any[];
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
    buses: any[];
    nearestStation: Station | null;
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
const MapIconRegister = ({ stations }: { stations: any[] }) => {
    const { current: mapRef } = useMap();
    const map = mapRef?.getMap();

    useEffect(() => {
        if (!map) return;

        const registerIcons = () => {
            // Find all unique subway line colors from the current data
            const uniqueColors = new Set<string>();
            stations.forEach(s => {
                if (s.lineColors) {
                    s.lineColors.forEach((color: string) => uniqueColors.add(color.toUpperCase()));
                }
            });

            // Ensure common fallback/data colors are present just in case
            uniqueColors.add("#0052A4"); uniqueColors.add("#00A84D"); uniqueColors.add("#EF7C1C");

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
};

function MapLibreBackground(props: MapLibreProps) {
    const {
        pathResult, startStation, activeTab, isDarkMode, wcItems, wcFilters, busStops, trains,
        onStationClick, onBusStopClick, onMapReady,
        onSetStart, onSetEnd, onSetWaypoint, selectedStationName, stationArrivals,
        onCenterChange, onBoundsChange, userLocation, timeDisplayMode, onToggleTimeDisplay, 
        showAllRouteBubbles, selectedBusStop, stations, activeLine, onActiveLineChange,
        buses, nearestStation
    } = props;

    const [popupCoords, setPopupCoords] = useState<[number, number] | null>(null);
    const [focusedBubble, setFocusedBubble] = useState<string | null>(null);
    const [selectedTrain, setSelectedTrain] = useState<any | null>(null);
    const [congestionData, setCongestionData] = useState<any | null>(null);
    const [trainArrivalDetail, setTrainArrivalDetail] = useState<StationArrival | null>(null);
    const [isLoadingCongestion, setIsLoadingCongestion] = useState(false);
    const verifiedPlats = useTransferVerification(pathResult, stations);

    // ─── Data Conversion ────────────────────────────────────────────────────────
    const subwayData = useMemo(() => convertSubwayToGeoJSON(), []);
    const filteredWCs = useMemo(() => convertWCToGeoJSON(wcItems, wcFilters), [wcItems, wcFilters]);
    const busGeoJSON = useMemo(() => convertBusStopsToGeoJSON(busStops), [busStops]);
    const trainData = useMemo(() => convertTrainsToGeoJSON(trains), [trains]);
    const pathGeoJSON = useMemo(() => convertPathToGeoJSON(pathResult), [pathResult]);
    const busRealtimeData = useMemo(() => convertBusPositionsToGeoJSON(buses), [buses]);

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
            onActiveLineChange(null);
            return;
        }

        const coords = e.lngLat;

        if (feature.layer.id === 'subway-station-circle' || feature.layer.id === 'subway-station-label') {
            const name = feature.properties.name;
            onStationClick?.(name, [coords.lat, coords.lng]);
            setPopupCoords([coords.lng, coords.lat]);
        } else if (feature.layer.id === 'bus-unclustered' || feature.layer.id === 'bus-station-label') {
            const stop = busStops.find(s => s.id === feature.properties.id);
            if (stop) {
                onBusStopClick(stop, [coords.lat, coords.lng]);
                setPopupCoords([coords.lng, coords.lat]);
            }
        } else if (feature.layer.id === 'train-layer') {
            handleTrainClick(feature.properties);
        } else if (feature.layer.id === 'subway-line-layer' || feature.layer.id === 'subway-line-interaction') {
            const lineName = feature.properties.name;
            onActiveLineChange(lineName);
        }
    }, [busStops, onStationClick, onBusStopClick]);

    return (
        <MapBase
            isDarkMode={isDarkMode}
            onMapReady={onMapReady}
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

            {nearestStation && nearestStation.lat !== undefined && nearestStation.lng !== undefined && (
                <Marker longitude={nearestStation.lng} latitude={nearestStation.lat}>
                    <div className="relative group cursor-pointer" onClick={() => onStationClick?.(nearestStation.name, [nearestStation.lat, nearestStation.lng])}>
                        {/* Outer Glow/Halo */}
                        <div className="absolute inset-[-6px] rounded-full bg-red-500/30 animate-ping" />
                        {/* Black Core with Red Border */}
                        <div className="relative w-8 h-8 bg-black rounded-full border-[3px] border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] flex items-center justify-center transition-transform hover:scale-110 active:scale-95">
                            <Train className="w-4 h-4 text-white" />
                        </div>
                        {/* Label */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-black/80 backdrop-blur-sm text-white text-[10px] font-bold rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                            가장 가까운 역: {nearestStation.name}
                        </div>
                    </div>
                </Marker>
            )}
        </MapBase>
    );
}

export default memo(MapLibreBackground);
