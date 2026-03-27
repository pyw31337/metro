"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
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
    const [bounds, setBounds] = useState<L.LatLngBounds>(map.getBounds());

    // Throttled bounds update - Only update on moveend/zoomend to avoid jank
    useMapEvents({
        moveend: () => setBounds(map.getBounds()),
        zoomend: () => setBounds(map.getBounds())
    });

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
        const pathSet = new Set(pathResult.path);
        
        SUBWAY_LINES.forEach(line => {
            const hasPath = line.stations.some(s => pathSet.has(s.name));
            if (hasPath) names.add(line.name);
        });
        return { activeLineNames: names };
    }, [pathResult]);

    // 1. Optimized Rendering: Lines & Interaction Nodes
    useEffect(() => {
        if (!staticLayerRef.current || !interactionLayerRef.current) return;
        
        const layerGroup = staticLayerRef.current;
        const interactionGroup = interactionLayerRef.current;
        
        layerGroup.clearLayers();
        interactionGroup.clearLayers();

        const isRouteActive = !!pathResult;
        const zoomThreshold = 12;
        const currentBounds = bounds.pad(0.15); // Small pad for smoother transitions

        // 1.1 Draw Subway Lines (With Viewport Clipping)
        SUBWAY_LINES.forEach((line) => {
            const isVisible = line.stations.some(s => currentBounds.contains([s.lat, s.lng]));
            if (!isVisible) return;

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
                interactive: false,
                smoothFactor: 1.5
            }));
        });

        // 1.2 Draw Interactive Station Nodes (Virtualization)
        stations.forEach((station) => {
            const isSelected = pathResult?.path.includes(station.name) || 
                             station.name === startStation || 
                             station.name === endStation ||
                             station.name === selectedStationName;
            
            if (!currentBounds.contains([station.lat, station.lng]) && !isSelected) return;

            const isHovered = hoveredStation === station.name;
            const primaryLine = SUBWAY_LINES.find(l => l.name === station.lines[0]);
            const baseColor = primaryLine?.color || "#888";

            // Marker Hitbox
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

            // Visible Dot
            const markerSize = THEME.canvas.stationRadius + (isHovered ? 2 : 0);
            layerGroup.addLayer(L.circleMarker([station.lat, station.lng], {
                radius: markerSize,
                color: isSelected ? baseColor : (isDarkMode ? "#444" : "#ccc"),
                fillColor: "#fff",
                fillOpacity: 1,
                weight: isSelected ? 3 : 1.5,
                interactive: false
            }));

            // Label Rendering
            if (zoomLevel >= zoomThreshold || isSelected) {
                const labelColor = isDarkMode ? "#fff" : THEME.colors.textPrimary;
                const isCapsule = isSelected;

                let labelHtml = `
                    <div style="
                        ${isCapsule ? `
                            background: ${baseColor};
                            color: #FFFFFF;
                            padding: 4px 10px;
                            border-radius: ${THEME.canvas.capsuleRadius}px;
                            font-weight: 800;
                            font-size: 13px;
                            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                            border: 2px solid ${baseColor};
                            transform: translateY(-28px);
                        ` : `
                            color: ${labelColor};
                            font-weight: ${THEME.canvas.fontWeight};
                            font-size: ${isHovered ? 14 : THEME.canvas.labelSize}px;
                            transform: translateY(-22px);
                            -webkit-text-stroke: 0.5px ${isDarkMode ? '#000' : '#fff'};
                            paint-order: stroke fill;
                        `}
                        white-space: nowrap;
                        pointer-events: none;
                        font-family: ${THEME.fonts.primary};
                    ">
                        ${station.name}
                    </div>
                `;

                layerGroup.addLayer(L.marker([station.lat, station.lng], {
                    icon: L.divIcon({
                        className: "bg-transparent",
                        html: `<div class="flex items-center justify-center w-0 h-0">${labelHtml}</div>`,
                        iconSize: [0, 0]
                    }),
                    interactive: false,
                    zIndexOffset: isSelected ? 3000 : 1000
                }));
            }
        });
    }, [bounds, zoomLevel, stations, pathResult, activeLineNames, isDarkMode, hoveredStation, startStation, endStation, selectedStationName, map, onStationClick]);

    // 2. Highlight Layer
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
                    const segmentColor = lineConfig?.color || "#888888";

                    layerGroup.addLayer(L.polyline([[s1.lat, s1.lng], [s2.lat, s2.lng]], {
                        color: segmentColor,
                        weight: THEME.canvas.lineWidth + 1,
                        opacity: 1,
                        smoothFactor: 1.0,
                        interactive: false
                    }));
                }
            }
        }
    }, [pathResult, stations]);
    
    // 3. Dynamic Layer: Trains
    const trainMarkersRef = useRef<Map<string, L.Marker>>(new Map());

    useEffect(() => {
        if (!dynamicLayerRef.current || !map) return;
        const layerGroup = dynamicLayerRef.current;
        const currentMarkers = trainMarkersRef.current;
        const currentBounds = map.getBounds().pad(0.25);

        trains.forEach((train) => {
            const isVisible = currentBounds.contains([train.lat || 0, train.lng || 0]);
            let marker = currentMarkers.get(train.id);

            if (!isVisible) {
                if (marker) {
                    marker.remove();
                    currentMarkers.delete(train.id);
                }
                return;
            }

            const line = SUBWAY_LINES.find(l => l.name.includes(train.lineName));
            const color = line?.color || "#888";
            const isOnPath = !!pathResult && pathResult.path.some(p => p.includes(train.headingTo));
            const size = isOnPath ? 28 : 22;

            const iconHtml = `
                <div class="relative flex items-center justify-center" style="transform: scale(${isOnPath ? 1.05 : 1}); transition: transform 0.3s ease;">
                    ${isOnPath ? `<div class="absolute inset-0 animate-pulse rounded-full opacity-20" style="background: ${color}; transform: scale(1.4)"></div>` : ""}
                    <div class="relative bg-white dark:bg-zinc-900 rounded-full p-1 shadow-md border-2" style="border-color: ${color}">
                        <div class="w-2 h-2 rounded-full" style="background: ${color}"></div>
                    </div>
                </div>
            `;

            if (!marker) {
                marker = L.marker([train.lat || 0, train.lng || 0], {
                    icon: L.divIcon({ className: "train-marker", html: iconHtml, iconSize: [size, size] }),
                    zIndexOffset: isOnPath ? 2000 : 500,
                    interactive: false
                }).addTo(layerGroup);
                currentMarkers.set(train.id, marker);
            } else {
                marker.setLatLng([train.lat || 0, train.lng || 0]);
                marker.setZIndexOffset(isOnPath ? 2000 : 500);
            }
        });

        // Cleanup
        currentMarkers.forEach((marker, id) => {
            if (!trains.find(t => t.id === id)) {
                marker.remove();
                currentMarkers.delete(id);
            }
        });
    }, [trains, pathResult, isDarkMode, map]);

    return null;
}
