"use client";

import { useEffect, useState, memo, useRef, useMemo, useCallback } from "react";
import { GeolocateControl, Marker } from "react-map-gl/maplibre";
import { PathResult, WCItem, BusStop, ActiveTab, WCFilters } from "@/types/metro";
import { StationArrival, fetchTrainCongestion, fetchTransferPlatform } from "@/services/arrivalApi";
import { 
    convertSubwayToGeoJSON, 
    convertBusStopsToGeoJSON, 
    convertWCToGeoJSON, 
    convertTrainsToGeoJSON, 
    convertPathToGeoJSON 
} from "@/utils/geoJsonUtils";

import MapBase from "./map/MapBase";
import SubwayLayers from "./map/SubwayLayers";
import BusLayers from "./map/BusLayers";
import TrainLayers from "./map/TrainLayers";
import WCLayers from "./map/WCLayers";
import RouteLayers from "./map/RouteLayers";
import MapPopups from "./map/MapPopups";

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
    onMapReady?: (map: any) => void;
    userLocation: [number, number] | null;
    timeDisplayMode: "duration" | "arrival";
    onToggleTimeDisplay?: () => void;
    showAllRouteBubbles: boolean;
    onToggleShowAll?: () => void;
    stations: any[];
}

function MapLibreBackground(props: MapLibreProps) {
    const {
        pathResult, startStation, activeTab, isDarkMode, wcItems, wcFilters, busStops, trains,
        onStationClick, onBusStopClick, onMapReady,
        onSetStart, onSetEnd, onSetWaypoint, selectedStationName, stationArrivals,
        onCenterChange, userLocation, timeDisplayMode, onToggleTimeDisplay, 
        showAllRouteBubbles, selectedBusStop, stations
    } = props;

    const [popupCoords, setPopupCoords] = useState<[number, number] | null>(null);
    const [focusedLine, setFocusedLine] = useState<string | null>(null);
    const [focusedBubble, setFocusedBubble] = useState<string | null>(null);
    const [selectedTrain, setSelectedTrain] = useState<any | null>(null);
    const [congestionData, setCongestionData] = useState<any | null>(null);
    const [trainArrivalDetail, setTrainArrivalDetail] = useState<StationArrival | null>(null);
    const [isLoadingCongestion, setIsLoadingCongestion] = useState(false);
    const [verifiedPlats, setVerifiedPlats] = useState<Record<string, string>>({});
    const fetchingRef = useRef<Set<string>>(new Set());

    // ─── Data Conversion ────────────────────────────────────────────────────────
    const subwayData = useMemo(() => convertSubwayToGeoJSON(), []);
    const filteredWCs = useMemo(() => convertWCToGeoJSON(wcItems, wcFilters), [wcItems, wcFilters]);
    const busGeoJSON = useMemo(() => convertBusStopsToGeoJSON(busStops), [busStops]);
    const trainData = useMemo(() => convertTrainsToGeoJSON(trains), [trains]);
    const pathGeoJSON = useMemo(() => convertPathToGeoJSON(pathResult), [pathResult]);

    // ─── Train Logic ────────────────────────────────────────────────────────────
    const handleTrainClick = async (train: any) => {
        setSelectedTrain(train);
        setIsLoadingCongestion(true);
        setCongestionData(null);
        setTrainArrivalDetail(null);
        
        try {
            // 1. Fetch Congestion
            const congestionPromise = fetchTrainCongestion(train.lineName, train.trainNo);
            
            // 2. Fetch Detailed Arrival Info for this specific train at its target station
            // stationArrivals handles cleansing '역' suffix
            const { fetchStationArrivals } = await import("@/services/arrivalApi");
            const arrivalPromise = fetchStationArrivals(train.arrivalNm);
            
            const [cData, aList] = await Promise.all([congestionPromise, arrivalPromise]);
            
            setCongestionData(cData);
            
            // Cross-reference trainNo to find precise arrival seconds
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
            setFocusedLine(null);
            setFocusedBubble(null);
            setSelectedTrain(null);
            setTrainArrivalDetail(null);
            return;
        }

        const coords = e.lngLat;

        if (feature.layer.id === 'subway-station-circle' || feature.layer.id === 'subway-station-label') {
            const name = feature.properties.name;
            onStationClick?.(name, [coords.lat, coords.lng]);
            setPopupCoords([coords.lng, coords.lat]);
            setFocusedLine(null);
        } else if (feature.layer.id === 'bus-unclustered' || feature.layer.id === 'bus-station-label') {
            const stop = busStops.find(s => s.id === feature.properties.id);
            if (stop) {
                onBusStopClick(stop, [coords.lat, coords.lng]);
                setPopupCoords([coords.lng, coords.lat]);
            }
        } else if (feature.layer.id === 'train-layer') {
            handleTrainClick(feature.properties);
        } else if (feature.layer.id === 'subway-line-layer') {
            setFocusedLine(feature.properties.name);
        }
    }, [busStops, onStationClick, onBusStopClick]);

    // ─── Transfer Verification Loop ──────────────────────────────────────────────
    useEffect(() => {
        if (!pathResult) return;
        pathResult.path.forEach((curr, idx) => {
            if (idx === 0) return;
            const prev = pathResult.path[idx - 1];
            const getLine = (sName: string) => stations.find(s => s.name.replace(/역$/, '') === sName.replace(/역$/, ''))?.lines || [];
            const prevLines: string[] = getLine(prev);
            const currLines: string[] = getLine(curr);
            const common = prevLines.filter((l: string) => currLines.includes(l));
            
            if (common.length > 0) {
                const next = pathResult.path[idx + 1];
                if (next) {
                    const nextLines: string[] = getLine(next);
                    const outLines = currLines.filter((l: string) => nextLines.includes(l));
                    if (outLines.length > 0 && common[0] !== outLines[0]) {
                        const key = `${curr}-${common[0]}-${outLines[0]}`;
                        if (!verifiedPlats[key] && !fetchingRef.current.has(key)) {
                            fetchingRef.current.add(key);
                            fetchTransferPlatform(curr, common[0], outLines[0]).then(plat => {
                                setVerifiedPlats(prevPlat => ({ ...prevPlat, [key]: plat }));
                            });
                        }
                    }
                }
            }
        });
    }, [pathResult, stations, verifiedPlats]);

    // ─── Icon Initialization ─────────────────────────────────────────────────────
    const onMapReadyInternal = (map: any) => {
        if (onMapReady) onMapReady(map);
        
        const colors = [
            "#0052A4", // 1호선
            "#00A84D", // 2호선
            "#EF7C1C", // 3호선
            "#00A5DE", // 4호선
            "#996CAC", // 5호선
            "#CD7C2F", // 6호선
            "#747F00", // 7호선
            "#E6186C", // 8호선
            "#BDB092", // 9호선
            "#77C4A3", // 경의중앙선
            "#0C8E72", // 경춘선
            "#F5A200", // 수인분당선
            "#D4003B", // 신분당선
            "#0090D2", // 공항철도
            "#81A914", // 서해선
            "#50AD08", // 용인경전철
            "#FDA600", // 의정부경전철
            "#B0AD00", // 우이신설선
            "#6789CA", // 신림선
            "#003DA5", // 공항철도 (Alternative)
            "#EF7C1C", "#996CAC", "#00A2D1", "#0160A2", "#E2B215"
        ];
        colors.forEach(color => {
            const id = `train-card-${color}`;
            if (!map.hasImage(id)) {
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.roundRect(14, 14, 100, 100, 20);
                    ctx.fill();
                    ctx.strokeStyle = 'white'; ctx.lineWidth = 12; ctx.stroke();
                    // Icon
                    ctx.fillStyle = 'white';
                    ctx.beginPath(); ctx.roundRect(34, 34, 60, 40, 5); ctx.fill();
                    ctx.beginPath(); ctx.arc(44, 84, 8, 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.arc(84, 84, 8, 0, Math.PI*2); ctx.fill();
                    const data = ctx.getImageData(0,0,128,128);
                    map.addImage(id, data);
                }
            }
        });

        // Register Express Capsule Background (Original)
        if (!map.hasImage('express-capsule')) {
            const canvas = document.createElement('canvas');
            canvas.width = 120; canvas.height = 48;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.roundRect(4, 4, 112, 40, 20); // Capsule shape
                ctx.fill();
                ctx.strokeStyle = 'white'; ctx.lineWidth = 4; ctx.stroke();
                const data = ctx.getImageData(0,0,120,48);
                map.addImage('express-capsule', data, { pixelRatio: 2 });
            }
        }

        // Register Unified Atomic Express Badge (With Text)
        if (!map.hasImage('express-full-badge')) {
            const canvas = document.createElement('canvas');
            canvas.width = 180; canvas.height = 64; 
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Red Capsule
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.roundRect(4, 4, 172, 56, 28);
                ctx.fill();
                ctx.strokeStyle = 'white'; ctx.lineWidth = 6; ctx.stroke();
                // "급행" Text
                ctx.fillStyle = 'white';
                ctx.font = 'bold 32px sans-serif'; // Use default bold first for safety
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('급행', 90, 32);
                
                const data = ctx.getImageData(0,0,180,64);
                map.addImage('express-full-badge', data, { pixelRatio: 2 });
            }
        }
    };

    return (
        <MapBase
            isDarkMode={isDarkMode}
            onMapReady={onMapReadyInternal}
            onClick={handleMapClick}
            onCenterChange={onCenterChange}
            interactiveLayerIds={[
                'subway-station-circle', 'subway-station-label', 
                'subway-line-layer', 'bus-unclustered', 
                'bus-station-label', 'train-layer'
            ]}
        >
            <SubwayLayers 
                subwayData={subwayData} 
                activeTab={activeTab} 
                isDarkMode={isDarkMode} 
                pathResult={pathResult}
                focusedLine={focusedLine}
            />
            
            <BusLayers busData={busGeoJSON} activeTab={activeTab} isDarkMode={isDarkMode} />
            
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
                trainFilter={pathResult ? ["match", ["get", "lineName"], Array.from(new Set(pathResult.path.flatMap(s => stations.find(st => st.name.replace(/역$/, '') === s.replace(/역$/, ''))?.lines || []))), true, false] : null}
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
            />

            <GeolocateControl position="top-right" />
            
            {userLocation && (
                <Marker longitude={userLocation[1]} latitude={userLocation[0]}>
                    <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse" />
                </Marker>
            )}
        </MapBase>
    );
}

export default memo(MapLibreBackground);
