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
        try {
            const data = await fetchTrainCongestion(train.lineName, train.trainNo);
            setCongestionData(data);
        } catch (err) { console.error(err); } 
        finally { setIsLoadingCongestion(false); }
    };

    // ─── Interaction Handlers ───────────────────────────────────────────────────
    const handleMapClick = useCallback((e: any) => {
        const feature = e.features?.[0];
        if (!feature) {
            setPopupCoords(null);
            setFocusedLine(null);
            setFocusedBubble(null);
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
        
        const colors = ["#0052A4","#00A84D","#EF7C1C","#00A5DE","#996CAC","#CD7C2F","#747F00","#E6186C","#BB8336","#B0E0E6","#003DA5","#77C4A3","#0090D2","#003499","#FFA500","#70AD11","#0092D2","#B7E032","#2ABFD0","#0052A4","#D4003B","#0031BA","#00A5DE","#ED1C24"];
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
                    ctx.strokeStyle = 'white'; ctx.lineWidth = 6; ctx.stroke();
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
            
            <TrainLayers 
                trainData={trainData} 
                activeTab={activeTab}
                trainFilter={pathResult ? ["match", ["get", "lineName"], Array.from(new Set(pathResult.path.flatMap(s => stations.find(st => st.name.replace(/역$/, '') === s.replace(/역$/, ''))?.lines || []))), true, false] : null}
            />

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
