"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { useMap } from "react-leaflet";
import L from 'leaflet';
import { SUBWAY_LINES, Station } from "@/data/subway-lines";
import { Train } from "@/hooks/useRealtimeTrains";
import { THEME } from "@/theme/design-system";

interface SubwayCanvasLayerProps {
    stations: Station[];
    zoomLevel: number;
    startStation: string | null;
    endStation: string | null;
    pathResult: { path: string[]; totalWeight: number; transferCount: number } | null;
    trains: Train[];
    onStationClick: (name: string, latlng: [number, number]) => void;
    selectedStationName: string | null;
    isDarkMode?: boolean;
}

export default function SubwayCanvasLayer({
    stations,
    zoomLevel,
    startStation,
    endStation,
    pathResult,
    trains,
    onStationClick,
    selectedStationName,
    isDarkMode = false
}: SubwayCanvasLayerProps) {
    const map = useMap();
    const [hoveredStation, setHoveredStation] = useState<string | null>(null);

    // Separate LayerGroups for better performance
    const staticLayerRef = useRef<L.LayerGroup | null>(null); 
    const dynamicLayerRef = useRef<L.LayerGroup | null>(null); 
    const highlightLayerRef = useRef<L.LayerGroup | null>(null); 
    const interactionLayerRef = useRef<L.LayerGroup | null>(null);

    // Initialize Layers
    useEffect(() => {
        const staticLayer = L.layerGroup().addTo(map);
        const dynamicLayer = L.layerGroup().addTo(map);
        const highlightLayer = L.layerGroup().addTo(map);
        const interactionLayer = L.layerGroup().addTo(map);

        staticLayerRef.current = staticLayer;
        dynamicLayerRef.current = dynamicLayer;
        highlightLayerRef.current = highlightLayer;
        interactionLayerRef.current = interactionLayer;

        return () => {
            staticLayer.remove();
            dynamicLayer.remove();
            highlightLayer.remove();
            interactionLayer.remove();
        };
    }, [map]);

    // Active Path Analysis
    const { activeLineNames } = useMemo(() => {
        const names = new Set<string>();
        if (!pathResult || !pathResult.path) return { activeLineNames: names };
        for (let i = 0; i < pathResult.path.length - 1; i++) {
            const s1 = stations.find(s => s.name === pathResult.path[i]);
            const s2 = stations.find(s => s.name === pathResult.path[i+1]);
            if (s1 && s2) {
                s1.lines.filter(l => s2.lines.includes(l)).forEach(n => names.add(n));
            }
        }
        return { activeLineNames: names };
    }, [pathResult, stations]);

    // 1. Static Layout: Lines & Background Stations
    useEffect(() => {
        if (!staticLayerRef.current || !interactionLayerRef.current) return;
        staticLayerRef.current.clearLayers();
        interactionLayerRef.current.clearLayers();

        const layerGroup = staticLayerRef.current;
        const interactionGroup = interactionLayerRef.current;
        const isRouteActive = !!pathResult;

        // Apply Impeccable SVG Filter for depth
        const svgElement = document.querySelector(".leaflet-zoom-animated") as HTMLElement;
        if (svgElement) {
            svgElement.style.filter = isRouteActive
                ? `drop-shadow(0 0 12px rgba(0,0,0,${isDarkMode ? 0.35 : 0.08}))`
                : `drop-shadow(0 0 8px rgba(0,0,0,${isDarkMode ? 0.2 : 0.05}))`;
        }

        // Draw Subway Lines
        SUBWAY_LINES.forEach((line) => {
            const latlngs = line.stations.map(s => [s.lat, s.lng] as [number, number]);
            let drawColor = line.color;
            let opacity = 0.8;
            let weight = THEME.canvas.lineWidth;

            if (isRouteActive) {
                if (activeLineNames.has(line.name)) {
                    drawColor = isDarkMode ? "#3f3f46" : "#cbd5e1";
                    opacity = 0.3;
                    weight = THEME.canvas.lineWidth / 2;
                } else {
                    drawColor = isDarkMode ? "#18181b" : "#f1f5f9";
                    opacity = 0.2;
                    weight = THEME.canvas.lineWidth / 3;
                }
            }

            layerGroup.addLayer(L.polyline(latlngs, {
                color: drawColor,
                weight: weight,
                opacity: opacity,
                lineCap: THEME.canvas.lineCap,
                lineJoin: THEME.canvas.lineJoin,
                interactive: false
            }));
        });

        // Draw Interactive Station Nodes
        const zoomThreshold = 12;

        stations.forEach((station) => {
            const isPathStation = pathResult?.path.includes(station.name);
            const isSelected = isPathStation || 
                             station.name === startStation || 
                             station.name === endStation ||
                             station.name === selectedStationName;
            
            const isHovered = hoveredStation === station.name;
            const primaryLine = SUBWAY_LINES.find(l => l.name === station.lines[0]);
            const baseColor = primaryLine?.color || "#888";

            // 1. Invisible Hitbox (Improves usability/hit-testing)
            const hitbox = L.circleMarker([station.lat, station.lng], {
                radius: THEME.canvas.hitAreaRadius,
                fillOpacity: 0,
                stroke: false,
                bubblingMouseEvents: false
            });
            hitbox.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                onStationClick(station.name, [station.lat, station.lng]);
            });
            hitbox.on('mouseover', () => setHoveredStation(station.name));
            hitbox.on('mouseout', () => setHoveredStation(null));
            interactionGroup.addLayer(hitbox);

            // 2. Visible Marker Node
            const markerSize = THEME.canvas.stationRadius + (isHovered ? 2 : 0);
            layerGroup.addLayer(L.circleMarker([station.lat, station.lng], {
                radius: markerSize,
                color: isSelected ? baseColor : (isDarkMode ? "#444" : "#ccc"),
                fillColor: "#fff",
                fillOpacity: 1,
                weight: isSelected ? 4 : 2,
                interactive: false
            }));

            // 3. Typography Labels (Refined)
            if (zoomLevel >= zoomThreshold || isSelected) {
                const labelColor = isDarkMode ? "#fff" : THEME.colors.textPrimary;
                const isCapsule = isSelected;

                let labelHtml = "";
                if (isCapsule) {
                    labelHtml = `
                        <div style="
                            background: ${baseColor};
                            color: #FFFFFF;
                            padding: 4px 12px;
                            border-radius: ${THEME.canvas.capsuleRadius}px;
                            font-weight: ${THEME.canvas.selectedFontWeight};
                            font-size: 14px;
                            white-space: nowrap;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                            border: 2px solid ${baseColor};
                            transform: translateY(-28px);
                            pointer-events: none;
                        ">
                            ${station.name}
                        </div>
                    `;
                } else {
                    labelHtml = `
                        <div style="
                            color: ${labelColor};
                            font-weight: ${THEME.canvas.fontWeight};
                            font-size: ${isHovered ? 15 : THEME.canvas.labelSize}px;
                            white-space: nowrap;
                            transform: translateY(-22px);
                            transition: ${THEME.transitions.default};
                            font-family: ${THEME.fonts.primary};
                            -webkit-text-stroke: 0.5px #fff;
                            paint-order: stroke fill;
                            pointer-events: none;
                        ">
                            ${station.name}
                        </div>
                    `;
                }

                layerGroup.addLayer(L.marker([station.lat, station.lng], {
                    icon: L.divIcon({
                        className: "bg-transparent",
                        html: `<div class="flex items-center justify-center w-max h-px">${labelHtml}</div>`,
                        iconSize: [0, 0]
                    }),
                    interactive: false,
                    zIndexOffset: isSelected ? 3000 : 1000
                }));
            }
        });
    }, [zoomLevel, stations, pathResult, activeLineNames, isDarkMode, hoveredStation, startStation, endStation, selectedStationName, map, onStationClick]);

    // 2. Highlight Layer: Active Route Segments
    useEffect(() => {
        if (!highlightLayerRef.current) return;
        const layerGroup = highlightLayerRef.current;
        layerGroup.clearLayers();

        if (pathResult && pathResult.path.length > 1) {
            for (let i = 0; i < pathResult.path.length - 1; i++) {
                const s1 = stations.find(s => s.name === pathResult.path[i]);
                const s2 = stations.find(s => s.name === pathResult.path[i+1]);

                if (s1 && s2) {
                    const commonLines = s1.lines.filter(l => s2.lines.includes(l));
                    const lineConfig = SUBWAY_LINES.find(l => l.name === commonLines[0]);
                    const segmentColor = lineConfig?.color || "#6b7280";

                    layerGroup.addLayer(L.polyline([[s1.lat, s1.lng], [s2.lat, s2.lng]], {
                        color: segmentColor,
                        weight: THEME.canvas.lineWidth + 0.5,
                        opacity: 1,
                        lineCap: THEME.canvas.lineCap,
                        lineJoin: THEME.canvas.lineJoin,
                        interactive: false
                    }));
                }
            }
        }
    }, [pathResult, stations]);
    
    // 3. Dynamic Layer: Real-time Trains
    const trainMarkersRef = useRef<Map<string, L.Marker>>(new Map());

    useEffect(() => {
        if (!dynamicLayerRef.current) return;
        const layerGroup = dynamicLayerRef.current;
        const currentMarkers = trainMarkersRef.current;
        const isRouteActive = !!pathResult;

        trains.forEach((train) => {
            let marker = currentMarkers.get(train.id);
            const line = SUBWAY_LINES.find(l => l.name.includes(train.lineName));
            const color = line?.color || "#888";

            // Impeccable Logic: Highlight trains on the active path
            // Using headingTo as the station reference from API data
            const isOnPath = isRouteActive && pathResult.path.some(p => p.includes(train.headingTo));
            const baseSize = 22;
            const size = isOnPath ? baseSize * 1.3 : baseSize;
            const opacity = isRouteActive ? (isOnPath ? 1 : 0.4) : 1;

            const iconHtml = `
                <div class="relative flex items-center justify-center" style="opacity: ${opacity}; transform: scale(${isOnPath ? 1.1 : 1}); transition: all 0.5s ease;">
                    ${isOnPath ? `<div class="absolute inset-0 animate-ping rounded-full opacity-20" style="background: ${color}"></div>` : ""}
                    <div class="absolute inset-0 animate-pulse rounded-full opacity-40" style="background: ${color}; transform: scale(1.4)"></div>
                    <div class="relative bg-white dark:bg-zinc-900 rounded-full p-1 shadow-xl border-2" style="border-color: ${color}">
                        <svg width="${size - 8}" height="${size - 8}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 18c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v12zm8-12c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6z"/>
                        </svg>
                    </div>
                </div>
            `;

            if (!marker) {
                marker = L.marker([train.lat || 0, train.lng || 0], {
                    icon: L.divIcon({
                        className: "train-marker",
                        html: iconHtml,
                        iconSize: [size, size],
                        iconAnchor: [size / 2, size / 2]
                    }),
                    zIndexOffset: isOnPath ? 2000 : 500,
                    interactive: false
                }).addTo(layerGroup);
                currentMarkers.set(train.id, marker);
            } else {
                marker.setLatLng([train.lat || 0, train.lng || 0]);
                marker.setIcon(L.divIcon({
                    className: "train-marker",
                    html: iconHtml,
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2]
                }));
                marker.setZIndexOffset(isOnPath ? 2000 : 500);
            }
        });

        // Cleanup stale trains
        currentMarkers.forEach((marker, id) => {
            if (!trains.find(t => t.id === id)) {
                marker.remove();
                currentMarkers.delete(id);
            }
        });
    }, [trains, pathResult, isDarkMode]);

    return null;
}
