"use client";

import { useState, memo, useMemo, useCallback, useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { PathResult, WCItem, BusStop, ActiveTab, WCFilters, StationArrival, Station } from "@/types/metro";
import { 
    convertSubwayToGeoJSON, 
    convertBusStopsToGeoJSON, 
    convertWCToGeoJSON, 
    convertPathToGeoJSON
} from "@/utils/geoJsonUtils";

import MapBase from "./map/MapBase";
import SubwayLayers from "./map/SubwayLayers";
import BusLayers from "./map/BusLayers";
import WCLayers from "./map/WCLayers";
import RouteLayers from "./map/RouteLayers";
import TransitRealtimeLayers from "./map/TransitRealtimeLayers";
import UserLocationLayer from "./map/UserLocationLayer";
import MapPopups from "./map/MapPopups";
import NearbyPulseMarkers from "./map/NearbyPulseMarkers";
import { SUBWAY_LINES } from '@/data/subway-lines';
import { useTransferVerification } from "@/hooks/useTransferVerification";
import { useUserLocation } from "@/hooks/useUserLocation";
import { transitRealtimeService } from "@/services/TransitRealtimeService";

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
    onWCClick: (item: WCItem | null) => void;
    onBusStopClick: (stop: BusStop, latlng?: [number, number]) => void;
    selectedWC: WCItem | null;
    selectedBusStop: BusStop | null;
    selectedStationName: string | null;
    stationArrivals: any[];
    arrivalLoading?: boolean;
    isLiveArrival?: boolean;
    onRefreshArrival?: () => void;
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
    nearestBusStop: BusStop | null;
    nearestWC: WCItem | null;
    selectedBusRoute?: string | null;
    routePathData?: any;
    onSelectBusRoute?: (routeNo: string, cityCode?: string) => void;
}

const NOOP = () => {};

// Module-level constant — prevents new array reference on every render, preserving memo(MapBase)
const INTERACTIVE_LAYER_IDS = [
    'subway-station-circle', 'subway-station-label',
    'subway-line-layer', 'subway-line-interaction', 'bus-unclustered',
    'bus-unclustered-hitbox', 'bus-clusters',
    'bus-station-label', 'train-layer', 'wc-unclustered', 'wc-unclustered-label', 'wc-clusters'
];

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

const MapIconRegister = memo(({ stations }: { stations: any[] }) => {
    const { current: mapRef } = useMap();
    const map = mapRef?.getMap();

    useEffect(() => {
        if (!map) return;

        const registerIcons = () => {
            const uniqueColors = new Set<string>();
            SUBWAY_LINES.forEach((line: any) => { if (line.color) uniqueColors.add(line.color.toUpperCase()); });
            stations.forEach(s => { if (s.lineColors) s.lineColors.forEach((c: string) => uniqueColors.add(c.toUpperCase())); });
            
            // Add explicitly required dynamic colors
            uniqueColors.add('FF5722'); // Simulation Color
            uniqueColors.add('3B82F6'); // Bus Color

            uniqueColors.forEach(c => {
                const color = c.startsWith('#') ? c : `#${c}`;
                const cleanColor = c.replace('#', '').toUpperCase();
                const id = `train-card-${cleanColor}`;
                if (map.hasImage(id)) return;
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = color;
                    ctx.beginPath(); safeRoundRect(ctx, 14, 14, 100, 100, 20); ctx.fill();
                    ctx.strokeStyle = 'white'; ctx.lineWidth = 12; ctx.stroke();
                    ctx.fillStyle = 'white';
                    ctx.beginPath(); safeRoundRect(ctx, 34, 34, 60, 40, 5); ctx.fill();
                    ctx.beginPath(); ctx.arc(44, 84, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.arc(84, 84, 8, 0, Math.PI * 2); ctx.fill();
                    const data = ctx.getImageData(0, 0, 128, 128);
                    map.addImage(id, data);
                }
            });

            if (!map.hasImage('rocket')) {
                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#3b82f6'; ctx.beginPath();
                    ctx.moveTo(32, 0); ctx.lineTo(64, 64); ctx.lineTo(32, 48); ctx.lineTo(0, 64); ctx.closePath(); ctx.fill();
                    const data = ctx.getImageData(0, 0, 64, 64);
                    map.addImage('rocket', data);
                }
            }
        };

        if (map.isStyleLoaded()) registerIcons();
        map.on('style.load', registerIcons);
        return () => { map.off('style.load', registerIcons); };
    }, [map, stations]);

    return null;
});

function MapLibreBackground(props: MapLibreProps) {
    const {
        pathResult, startStation, activeTab, isDarkMode, wcItems, wcFilters, busStops,
        onStationClick, onBusStopClick, onMapReady,
        onSetStart, onSetEnd, onSetWaypoint, selectedStationName, stationArrivals,
        arrivalLoading, isLiveArrival, onRefreshArrival,
        onCenterChange, onBoundsChange, timeDisplayMode, onToggleTimeDisplay,
        showAllRouteBubbles, selectedBusStop, stations, activeLine, onActiveLineChange,
        nearestStation, nearestBusStop, nearestWC, selectedBusRoute, routePathData,
        onWCClick, onSelectBusRoute
    } = props;

    const [mapInstance, setMapInstance] = useState<any | null>(null);
    const [popupCoords, setPopupCoords] = useState<[number, number] | null>(null);
    const [focusedBubble, setFocusedBubble] = useState<string | null>(null);
    const [selectedTrain, setSelectedTrain] = useState<any | null>(null);
    const [congestionData, setCongestionData] = useState<any | null>(null);
    const [trainArrivalDetail, setTrainArrivalDetail] = useState<StationArrival | null>(null);
    const [isLoadingCongestion, setIsLoadingCongestion] = useState(false);
    const [selectedWC, setSelectedWC] = useState<WCItem | null>(null);
    const verifiedPlats = useTransferVerification(pathResult);

    // Sync external selectedWC (from panel/global store) → local state + map fly
    const { selectedWC: externalWC } = props;
    useEffect(() => {
        if (!externalWC) {
            setSelectedWC(null);
            return;
        }
        setSelectedWC(prev => {
            if (prev?.id === externalWC.id) return prev;
            // Panel selection: fly map to WC location
            if (mapInstance) {
                mapInstance.flyTo({ center: [externalWC.lng, externalWC.lat], zoom: 18, duration: 1000 });
            }
            return externalWC;
        });
    }, [externalWC, mapInstance]);

    // High performance realtime hooks
    useUserLocation(mapInstance);

    useEffect(() => {
        if (!mapInstance) return;
        transitRealtimeService.start();
        return () => transitRealtimeService.stop();
    }, [mapInstance]);

    useEffect(() => {
        if (!selectedBusRoute) return;
        const cityCode = selectedBusStop?.cityCode || "11";
        transitRealtimeService.trackBusRoute(cityCode, selectedBusRoute);
        return () => transitRealtimeService.untrackBusRoute(cityCode, selectedBusRoute);
    }, [selectedBusRoute, selectedBusStop]);

    const subwayData = useMemo(() => convertSubwayToGeoJSON(), []);
    const filteredWCs = useMemo(() => convertWCToGeoJSON(wcItems, wcFilters), [wcItems, wcFilters]);
    const busGeoJSON = useMemo(() => convertBusStopsToGeoJSON(busStops), [busStops]);
    const pathGeoJSON = useMemo(() => convertPathToGeoJSON(pathResult), [pathResult]);
    // O(1) bus stop lookup for click handler (busStops can be 50K+ items)
    const busStopById = useMemo(() => new Map(busStops.map(s => [s.id, s])), [busStops]);

    // Mutable refs — let handleMapClick stay stable while reading latest values
    const busStopByIdRef = useRef(busStopById);
    busStopByIdRef.current = busStopById;
    const activeLineRef = useRef(activeLine);
    activeLineRef.current = activeLine;
    const mapInstanceRef = useRef(mapInstance);
    mapInstanceRef.current = mapInstance;

    const handleTrainClick = async (train: any) => {
        setSelectedTrain(train);
        setIsLoadingCongestion(true);
        setCongestionData(null);
        setTrainArrivalDetail(null);
        try {
            const { fetchStationArrivals, fetchTrainCongestion } = await import("@/services/arrivalApi");
            const [cData, aList] = await Promise.all([
                fetchTrainCongestion(train.lineName, train.trainNo),
                fetchStationArrivals(train.arrivalNm || train.headingTo)
            ]);
            setCongestionData(cData);
            const matchingArrival = aList.find((a: any) => a.btrainNo === train.trainNo);
            if (matchingArrival) setTrainArrivalDetail(matchingArrival);
        } catch (err) { console.error(err); } finally { setIsLoadingCongestion(false); }
    };

    const handleMapReady = useCallback((map: any) => {
        setMapInstance(map);
        if (onMapReady) onMapReady(map);
    }, [onMapReady]);

    const handleStationTap = useCallback((name: string, coords: [number, number]) => {
        onStationClick?.(name, [coords[1], coords[0]]);
        setPopupCoords(coords);
        setSelectedWC(null);
    }, [onStationClick]);

    const handlePopupWCClick = useCallback((item: WCItem | null) => {
        setSelectedWC(item);
        onWCClick(item);
        // Keep coords if showing WC popup; clear if dismissed
        setPopupCoords(prev => item ? prev : null);
    }, [onWCClick]);

    const handleMapClick = useCallback((e: any) => {
        const feature = e.features?.[0];
        if (!feature) {
            setFocusedBubble(null);
            setSelectedTrain(null);
            setTrainArrivalDetail(null);
            setPopupCoords(null);
            setSelectedWC(null);
            onWCClick(null); // also clear global → dismisses DirectionCompass
            onActiveLineChange(null);
            onStationClick?.("", undefined);
            return;
        }

        const coords = e.lngLat;
        const map = mapInstanceRef.current;
        if (feature.layer.id === 'wc-clusters' || feature.layer.id === 'bus-clusters') {
            const sourceId = feature.layer.id === 'wc-clusters' ? 'wc-source' : 'bus-source';
            const source = map.getSource(sourceId);
            source.getClusterExpansionZoom(feature.properties.cluster_id, (err: any, zoom: number) => {
                if (err) return;
                map.flyTo({
                    center: [coords.lng, coords.lat],
                    zoom: zoom + 1,
                    duration: 500
                });
            });
            return;
        }

        if (feature.layer.id === 'subway-station-circle' || feature.layer.id === 'subway-station-label') {
            const name = feature.properties.name;
            const lines = typeof feature.properties.lines === 'string' ? JSON.parse(feature.properties.lines) : feature.properties.lines;
            onStationClick?.(name, [coords.lat, coords.lng]);
            setPopupCoords([coords.lng, coords.lat]);
            if (lines && Array.isArray(lines) && lines.length > 0) {
                const curLine = activeLineRef.current;
                if (!curLine || !lines.includes(curLine)) onActiveLineChange(lines[0]);
            }
            setSelectedWC(null);
            onWCClick(null);
        } else if (feature.layer.id === 'wc-unclustered' || feature.layer.id === 'wc-unclustered-label') {
            const fp = feature.properties;
            const wcItem: WCItem = {
                id: fp.id, name: fp.name, lat: coords.lat, lng: coords.lng,
                accessible: fp.accessible === 'true', diapers: fp.diapers === 'true',
                emergencyBell: fp.emergencyBell === 'true', address: fp.address,
                station: fp.station, isInsideGate: fp.isInsideGate === 'true',
                location: fp.location, femaleStalls: parseInt(fp.femaleStalls || '0'),
                maleStalls: parseInt(fp.maleStalls || '0'), maleUrinals: parseInt(fp.maleUrinals || '0'),
                openTime: fp.openTime
            };
            setSelectedWC(wcItem);
            onWCClick(wcItem); // sync global store → enables DirectionCompass
            setPopupCoords([coords.lng, coords.lat]);
            setSelectedTrain(null);
            setFocusedBubble(null);
        } else if (feature.layer.id === 'bus-unclustered' || feature.layer.id === 'bus-station-label' || feature.layer.id === 'bus-unclustered-hitbox') {
            const stop = busStopByIdRef.current.get(feature.properties.id);
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
            onActiveLineChange(feature.properties.name);
        }
    }, [onStationClick, onBusStopClick, onWCClick, onActiveLineChange]);

    return (
        <MapBase
            isDarkMode={isDarkMode}
            onMapReady={handleMapReady}
            onClick={handleMapClick}
            onCenterChange={onCenterChange}
            onBoundsChange={onBoundsChange}
            interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        >
            <MapIconRegister stations={stations} />
            <SubwayLayers subwayData={subwayData} activeTab={activeTab} isDarkMode={isDarkMode} pathResult={pathResult} focusedLine={activeLine} />
            <BusLayers busData={busGeoJSON} routePathData={routePathData} activeTab={activeTab} isDarkMode={isDarkMode} />
            <WCLayers wcData={filteredWCs} activeTab={activeTab} />
            <RouteLayers
                activeTab={activeTab} pathLineData={pathGeoJSON.lines} routeStationData={pathGeoJSON.stations}
                showAllRouteBubbles={showAllRouteBubbles} focusedBubble={focusedBubble} setFocusedBubble={setFocusedBubble}
                timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} verifiedPlats={verifiedPlats}
                onStationTap={handleStationTap}
            />
            <TransitRealtimeLayers activeTab={activeTab} activeLine={activeLine} activePath={pathResult} />
            <UserLocationLayer />
            <MapPopups
                popupCoords={popupCoords}
                selectedStationName={selectedStationName}
                selectedBusStop={selectedBusStop}
                activeTab={activeTab}
                stationArrivals={stationArrivals}
                arrivalLoading={arrivalLoading}
                isLiveArrival={isLiveArrival}
                onRefreshArrival={onRefreshArrival}
                timeDisplayMode={timeDisplayMode}
                onToggleTimeDisplay={onToggleTimeDisplay ?? NOOP}
                onSetStart={onSetStart}
                onSetEnd={onSetEnd}
                onSetWaypoint={onSetWaypoint}
                startStation={startStation}
                setPopupCoords={setPopupCoords}
                selectedTrain={selectedTrain}
                setSelectedTrain={setSelectedTrain}
                isLoadingCongestion={isLoadingCongestion}
                congestionData={congestionData}
                trainArrivalDetail={trainArrivalDetail}
                activeLine={activeLine}
                onActiveLineChange={onActiveLineChange}
                onSelectBusRoute={onSelectBusRoute}
                selectedWC={selectedWC}
                onWCClick={handlePopupWCClick}
                isDarkMode={isDarkMode}
            />
            <NearbyPulseMarkers nearestStation={nearestStation} nearestBusStop={nearestBusStop} nearestWC={nearestWC} isDarkMode={isDarkMode} activeTab={activeTab} />
        </MapBase>
    );
}

export default memo(MapLibreBackground);
