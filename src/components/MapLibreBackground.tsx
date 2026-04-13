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
    onClearRoute?: () => void;
}

const NOOP = () => {};

// Built once at module load — SUBWAY_LINES is static, no need to recompute per-mount
const SUBWAY_GEOJSON = convertSubwayToGeoJSON();

// Module-level constant — prevents new array reference on every render, preserving memo(MapBase)
const INTERACTIVE_LAYER_IDS = [
    'subway-station-hit', 'subway-station-circle', 'subway-station-label',
    'subway-line-layer', 'subway-line-interaction',
    'bus-unclustered', 'bus-unclustered-hitbox', 'bus-clusters', 'bus-station-label',
    'train-layer',
    'wc-dot-0', 'wc-dot-1', 'wc-dot-2', 'wc-icon',
];


// 라운드 정사각형 카드 + 위쪽을 가리키는 쐐기(∧) 아이콘.
// icon-rotate 로 실제 방위각만큼 회전 → 진행 방향이 카드 위쪽과 일치.
function drawTrainCard(color: string): ImageData | null {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const c = ctx;

    function rr(x: number, y: number, w: number, h: number, r: number) {
        c.beginPath();
        if ((c as any).roundRect) {
            (c as any).roundRect(x, y, w, h, r);
        } else {
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y); c.arcTo(x+w, y,   x+w, y+r,   r);
            c.lineTo(x+w, y+h-r);  c.arcTo(x+w, y+h, x+w-r, y+h, r);
            c.lineTo(x+r, y+h);    c.arcTo(x,   y+h, x,   y+h-r, r);
            c.lineTo(x, y+r);      c.arcTo(x,   y,   x+r, y,     r);
            c.closePath();
        }
    }

    c.fillStyle = 'white';
    rr(4, 4, 120, 120, 24); c.fill();

    c.fillStyle = color;
    rr(13, 13, 102, 102, 18); c.fill();

    // 쐐기(∧) — 진행 방향
    c.strokeStyle = 'white';
    c.lineWidth   = 11;
    c.lineCap     = 'round';
    c.lineJoin    = 'round';
    c.beginPath();
    c.moveTo(42, 78);
    c.lineTo(64, 50);
    c.lineTo(86, 78);
    c.stroke();

    return ctx.getImageData(0, 0, 128, 128);
}

// 정차 중 아이콘 — ∥ (일시정지 심볼).  icon-rotate=0 고정으로 사용.
function drawTrainCardDwell(color: string): ImageData | null {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const c = ctx;

    function rr(x: number, y: number, w: number, h: number, r: number) {
        c.beginPath();
        if ((c as any).roundRect) {
            (c as any).roundRect(x, y, w, h, r);
        } else {
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y); c.arcTo(x+w, y,   x+w, y+r,   r);
            c.lineTo(x+w, y+h-r);  c.arcTo(x+w, y+h, x+w-r, y+h, r);
            c.lineTo(x+r, y+h);    c.arcTo(x,   y+h, x,   y+h-r, r);
            c.lineTo(x, y+r);      c.arcTo(x,   y,   x+r, y,     r);
            c.closePath();
        }
    }

    c.fillStyle = 'white';
    rr(4, 4, 120, 120, 24); c.fill();

    c.fillStyle = color;
    rr(13, 13, 102, 102, 18); c.fill();

    // ∥ — 두 수직 막대 (일시정지)
    c.fillStyle = 'white';
    c.beginPath(); (c as any).roundRect?.(40, 38, 14, 52, 4) ?? (() => { c.rect(40, 38, 14, 52); })();
    c.fill();
    c.beginPath(); (c as any).roundRect?.(74, 38, 14, 52, 4) ?? (() => { c.rect(74, 38, 14, 52); })();
    c.fill();

    return ctx.getImageData(0, 0, 128, 128);
}

const MapIconRegister = memo(() => {
    const { current: mapRef } = useMap();
    const map = mapRef?.getMap();

    useEffect(() => {
        if (!map) return;

        // 필요한 아이콘 사전 등록 (style.load 시에도 재등록)
        const registerAllIcons = () => {
            const uniqueColors = new Set<string>();
            SUBWAY_LINES.forEach((line: any) => { if (line.color) uniqueColors.add(line.color.toUpperCase()); });
            uniqueColors.add('FF5722');
            uniqueColors.add('3B82F6');
            uniqueColors.add('AAAAAA'); // 회색 — 베어링 미초기화 열차

            uniqueColors.forEach(c => {
                const color = c.startsWith('#') ? c : `#${c}`;
                const cleanColor = c.replace('#', '').toUpperCase();
                const id = `train-card-${cleanColor}`;
                if (!map.hasImage(id)) {
                    const data = drawTrainCard(color);
                    if (data) map.addImage(id, data);
                }
                const dwellId = `train-card-dwell-${cleanColor}`;
                if (!map.hasImage(dwellId)) {
                    const dwellData = drawTrainCardDwell(color);
                    if (dwellData) map.addImage(dwellId, dwellData);
                }
            });

            if (!map.hasImage('rocket')) {
                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#3b82f6';
                    ctx.beginPath();
                    ctx.moveTo(32, 0); ctx.lineTo(64, 64); ctx.lineTo(32, 48); ctx.lineTo(0, 64);
                    ctx.closePath(); ctx.fill();
                    map.addImage('rocket', ctx.getImageData(0, 0, 64, 64));
                }
            }
        };

        // styleimagemissing: 레이어가 아이콘을 찾지 못할 때 즉시 생성
        // → style 재로드 타이밍 경쟁 없이 항상 확실하게 렌더됨
        const onMissing = (e: any) => {
            if (e.id?.startsWith('train-card-dwell-')) {
                const cleanColor = e.id.replace('train-card-dwell-', '');
                const color = `#${cleanColor}`;
                const data = drawTrainCardDwell(color);
                if (data && !map.hasImage(e.id)) map.addImage(e.id, data);
            } else if (e.id?.startsWith('train-card-')) {
                const cleanColor = e.id.replace('train-card-', '');
                const color = `#${cleanColor}`;
                const data = drawTrainCard(color);
                if (data && !map.hasImage(e.id)) map.addImage(e.id, data);
            } else if (e.id === 'rocket') {
                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#3b82f6';
                    ctx.beginPath();
                    ctx.moveTo(32, 0); ctx.lineTo(64, 64); ctx.lineTo(32, 48); ctx.lineTo(0, 64);
                    ctx.closePath(); ctx.fill();
                    if (!map.hasImage('rocket')) map.addImage('rocket', ctx.getImageData(0, 0, 64, 64));
                }
            }
        };

        if (map.isStyleLoaded()) registerAllIcons();
        map.on('style.load', registerAllIcons);
        map.on('styleimagemissing', onMissing);
        return () => {
            map.off('style.load', registerAllIcons);
            map.off('styleimagemissing', onMissing);
        };
    }, [map]);

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
        onWCClick, onSelectBusRoute, onClearRoute
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

    const [subwayData, setSubwayData] = useState(SUBWAY_GEOJSON);
    useEffect(() => {
        fetch('/data/subway-track-geometry.json')
            .then(r => r.json())
            .then((json: Record<string, [number,number][]>) => {
                const geo = new Map<string, [number,number][]>(Object.entries(json));
                setSubwayData(convertSubwayToGeoJSON(geo));
            })
            .catch(() => { /* geometry 없으면 직선 유지 */ });
    }, []);
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
    const onClearRouteRef = useRef(onClearRoute);
    onClearRouteRef.current = onClearRoute;
    const routePathDataRef = useRef(routePathData);
    routePathDataRef.current = routePathData;

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
            // If a bus route is active, clear it and stop — don't dismiss other UI
            if (routePathDataRef.current) {
                onClearRouteRef.current?.();
                return;
            }
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
        if (feature.layer.id === 'bus-clusters') {
            const source = map.getSource('bus-source');
            source.getClusterExpansionZoom(feature.properties.cluster_id, (err: any, zoom: number) => {
                if (err) return;
                map.flyTo({ center: [coords.lng, coords.lat], zoom: zoom + 1, duration: 500 });
            });
            return;
        }

        if (['subway-station-hit', 'subway-station-circle', 'subway-station-label'].includes(feature.layer.id)) {
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
        } else if (['wc-dot-0','wc-dot-1','wc-dot-2','wc-icon'].includes(feature.layer.id)) {
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
            <MapIconRegister />
            <SubwayLayers subwayData={subwayData} activeTab={activeTab} isDarkMode={isDarkMode} pathResult={pathResult} focusedLine={activeLine} selectedStationName={selectedStationName} />
            <BusLayers busData={busGeoJSON} routePathData={routePathData} activeTab={activeTab} isDarkMode={isDarkMode} />
            <WCLayers wcData={filteredWCs} activeTab={activeTab} selectedWCId={selectedWC?.id ?? null} />
            <RouteLayers
                activeTab={activeTab} pathLineData={pathGeoJSON.lines} routeStationData={pathGeoJSON.stations}
                showAllRouteBubbles={showAllRouteBubbles} focusedBubble={focusedBubble} setFocusedBubble={setFocusedBubble}
                timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} verifiedPlats={verifiedPlats}
                onStationTap={handleStationTap}
            />
            <UserLocationLayer />
            <TransitRealtimeLayers activeTab={activeTab} activeLine={activeLine} activePath={pathResult} />
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
                routeSegments={pathResult?.segments}
            />
            <NearbyPulseMarkers nearestStation={nearestStation} nearestBusStop={nearestBusStop} nearestWC={nearestWC} isDarkMode={isDarkMode} activeTab={activeTab} />
        </MapBase>
    );
}

export default memo(MapLibreBackground);
