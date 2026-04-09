"use client";

import { useState, memo, useRef, useMemo, useCallback, useEffect } from "react";
import { Marker, useMap, Source, Layer } from "react-map-gl/maplibre";
import { PathResult, WCItem, BusStop, ActiveTab, WCFilters, StationArrival, Station } from "@/types/metro";
import { fetchTrainCongestion } from "@/services/arrivalApi";
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
        onCenterChange, onBoundsChange, timeDisplayMode, onToggleTimeDisplay, 
        showAllRouteBubbles, selectedBusStop, stations, activeLine, onActiveLineChange,
        nearestStation, nearestBusStop, nearestWC, selectedBusRoute, routePathData
    } = props;

    const [mapInstance, setMapInstance] = useState<any | null>(null);
    const [popupCoords, setPopupCoords] = useState<[number, number] | null>(null);
    const [focusedBubble, setFocusedBubble] = useState<string | null>(null);
    const [selectedTrain, setSelectedTrain] = useState<any | null>(null);
    const [congestionData, setCongestionData] = useState<any | null>(null);
    const [trainArrivalDetail, setTrainArrivalDetail] = useState<StationArrival | null>(null);
    const [isLoadingCongestion, setIsLoadingCongestion] = useState(false);
    const [selectedWC, setSelectedWC] = useState<WCItem | null>(null);
    const verifiedPlats = useTransferVerification(pathResult, stations);

    // High performance realtime hooks
    useUserLocation(mapInstance);

    useEffect(() => {
        if (!mapInstance) return;
        const { transitRealtimeService } = require("@/services/TransitRealtimeService");
        transitRealtimeService.start();
        return () => transitRealtimeService.stop();
    }, [mapInstance]);

    useEffect(() => {
        if (!selectedBusRoute) return;
        const { transitRealtimeService } = require("@/services/TransitRealtimeService");
        const cityCode = selectedBusStop?.cityCode || "11";
        transitRealtimeService.trackBusRoute(cityCode, selectedBusRoute);
        return () => transitRealtimeService.untrackBusRoute(cityCode, selectedBusRoute);
    }, [selectedBusRoute, selectedBusStop]);

    const subwayData = useMemo(() => convertSubwayToGeoJSON(), []);
    const filteredWCs = useMemo(() => convertWCToGeoJSON(wcItems, wcFilters), [wcItems, wcFilters]);
    const busGeoJSON = useMemo(() => convertBusStopsToGeoJSON(busStops), [busStops]);
    const pathGeoJSON = useMemo(() => convertPathToGeoJSON(pathResult), [pathResult]);

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

    const handleMapClick = useCallback((e: any) => {
        const feature = e.features?.[0];
        if (!feature) {
            setFocusedBubble(null);
            setSelectedTrain(null);
            setTrainArrivalDetail(null);
            setPopupCoords(null);
            setSelectedWC(null);
            onActiveLineChange(null);
            onStationClick?.("", undefined);
            return;
        }

        const coords = e.lngLat;
        if (feature.layer.id === 'wc-clusters' || feature.layer.id === 'bus-clusters') {
            const sourceId = feature.layer.id === 'wc-clusters' ? 'wc-source' : 'bus-source';
            const source = mapInstance.getSource(sourceId);
            source.getClusterExpansionZoom(feature.properties.cluster_id, (err: any, zoom: number) => {
                if (err) return;
                mapInstance.flyTo({
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
                if (!activeLine || !lines.includes(activeLine)) onActiveLineChange(lines[0]);
            }
            setSelectedWC(null);
        } else if (feature.layer.id === 'wc-unclustered') {
            const props = feature.properties;
            setSelectedWC({
                id: props.id, name: props.name, lat: coords.lat, lng: coords.lng,
                accessible: props.accessible === 'true', diapers: props.diapers === 'true',
                emergencyBell: props.emergencyBell === 'true', address: props.address,
                station: props.station, isInsideGate: props.isInsideGate === 'true',
                location: props.location, femaleStalls: parseInt(props.femaleStalls || '0'),
                maleStalls: parseInt(props.maleStalls || '0'), maleUrinals: parseInt(props.maleUrinals || '0'),
                openTime: props.openTime
            });
            setPopupCoords([coords.lng, coords.lat]);
            onStationClick?.("", undefined);
        } else if (feature.layer.id === 'bus-unclustered' || feature.layer.id === 'bus-station-label' || feature.layer.id === 'bus-unclustered-hitbox') {
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
            onActiveLineChange(feature.properties.name);
        }
    }, [busStops, onStationClick, onBusStopClick, activeLine, onActiveLineChange, mapInstance]);

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
                'bus-unclustered-hitbox', 'bus-clusters',
                'bus-station-label', 'train-layer', 'wc-unclustered', 'wc-clusters'
            ]}
        >
            <MapIconRegister stations={stations} />
            <SubwayLayers subwayData={subwayData} activeTab={activeTab} isDarkMode={isDarkMode} pathResult={pathResult} focusedLine={activeLine} />
            <BusLayers busData={busGeoJSON} routePathData={routePathData} activeTab={activeTab} isDarkMode={isDarkMode} />
            <WCLayers wcData={filteredWCs} activeTab={activeTab} />
            <RouteLayers 
                activeTab={activeTab} pathLineData={pathGeoJSON.lines} routeStationData={pathGeoJSON.stations}
                showAllRouteBubbles={showAllRouteBubbles} focusedBubble={focusedBubble} setFocusedBubble={setFocusedBubble}
                timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} verifiedPlats={verifiedPlats}
            />
            <TransitRealtimeLayers activeTab={activeTab} />
            <UserLocationLayer />
            <MapPopups
                popupCoords={popupCoords}
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
                setPopupCoords={setPopupCoords}
                selectedTrain={selectedTrain}
                setSelectedTrain={setSelectedTrain}
                isLoadingCongestion={isLoadingCongestion}
                congestionData={congestionData}
                trainArrivalDetail={trainArrivalDetail}
                activeLine={activeLine}
                onActiveLineChange={onActiveLineChange}
                onSelectBusRoute={props.onSelectBusRoute}
                selectedWC={selectedWC}
                onWCClick={props.onWCClick}
                isDarkMode={isDarkMode}
            />
            <NearbyPulseMarkers nearestStation={nearestStation} nearestBusStop={nearestBusStop} nearestWC={nearestWC} isDarkMode={isDarkMode} activeTab={activeTab} />
        </MapBase>
    );
}

export default memo(MapLibreBackground);
