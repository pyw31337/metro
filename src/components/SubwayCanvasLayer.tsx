"use client";

import { useEffect, useRef, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from 'leaflet';
import { SUBWAY_LINES, Station } from "@/data/subway-lines";
import { Train } from "@/hooks/useRealtimeTrains";

interface SubwayCanvasLayerProps {
    stations: Station[];
    zoomLevel: number;
    startStation: string | null;
    endStation: string | null;
    pathResult: { path: string[]; totalWeight: number; transferCount: number } | null;
    trains: Train[];
    onStationClick: (name: string, latlng: [number, number]) => void;
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
    isDarkMode = false
}: SubwayCanvasLayerProps) {
    const map = useMap();

    // Separate LayerGroups for better performance
    const staticLayerRef = useRef<L.LayerGroup | null>(null); // Lines & Stations
    const dynamicLayerRef = useRef<L.LayerGroup | null>(null); // Trains
    const highlightLayerRef = useRef<L.LayerGroup | null>(null); // Path Highlights

    // Initialize Layers
    useEffect(() => {
        const staticLayer = L.layerGroup().addTo(map);
        const dynamicLayer = L.layerGroup().addTo(map);
        const highlightLayer = L.layerGroup().addTo(map);

        staticLayerRef.current = staticLayer;
        dynamicLayerRef.current = dynamicLayer;
        highlightLayerRef.current = highlightLayer;

        return () => {
            staticLayer.remove();
            dynamicLayer.remove();
            highlightLayer.remove();
        };
    }, [map]);

    // 4. Helper: Determine active lines AND detailed segment info (Synchronous derivation)
    // Returns: Map of LineID -> { direction: 1|-1, stationRange: [min, max], isBoardingLine: boolean }
    interface LineSegment {
        direction: 1 | -1;          // 1 (Ascending indices) or -1 (Descending)
        startIdx: number;           // Index of start station on this line
        endIdx: number;             // Index of end station on this line
        boardingStations: number[]; // Indices of stations where we board/transfer onto this line
    }

    const { activeLineDetails, activeLineIds, activeLineNames } = useMemo(() => {
        const details = new Map<string, LineSegment>();
        const ids = new Set<string>();
        const names = new Set<string>();

        if (!pathResult || !pathResult.path || pathResult.path.length < 2) {
            return { activeLineDetails: details, activeLineIds: ids, activeLineNames: names };
        }

        // Helper to find line config and indices
        const getLineInfo = (stationName: string, lineName: string) => {
            return SUBWAY_LINES.filter(l => l.name === lineName);
        };

        // Iterate segments
        for (let i = 0; i < pathResult.path.length - 1; i++) {
            const s1Name = pathResult.path[i];
            const s2Name = pathResult.path[i + 1];

            if (s1Name === s2Name) continue; // Skip transfers (self-loops)

            const s1 = stations.find(s => s.name === s1Name);
            const s2 = stations.find(s => s.name === s2Name);

            if (s1 && s2) {
                const commonLineNames = s1.lines.filter(l => s2.lines.includes(l));

                commonLineNames.forEach(lName => {
                    // Add Name to Set for broad context styling
                    names.add(lName);

                    // Find the specific Line Object that contains both stations (to get indices)
                    const candidates = SUBWAY_LINES.filter(l => l.name === lName);

                    candidates.forEach(line => {
                        const idx1 = line.stations.findIndex(s => s.name === s1Name);
                        const idx2 = line.stations.findIndex(s => s.name === s2Name);

                        if (idx1 !== -1 && idx2 !== -1) {
                            // Valid connection on this specific Line ID
                            ids.add(line.id);

                            // Determine direction
                            const direction = idx2 > idx1 ? 1 : -1;

                            // Update or Create Segment Info
                            const existing = details.get(line.id);

                            const min = Math.min(idx1, idx2);
                            const max = Math.max(idx1, idx2);

                            if (!existing) {
                                details.set(line.id, {
                                    direction,
                                    startIdx: min,
                                    endIdx: max,
                                    boardingStations: [idx1] // We board at s1
                                });
                            } else {
                                // Extend range
                                existing.startIdx = Math.min(existing.startIdx, min);
                                existing.endIdx = Math.max(existing.endIdx, max);

                                if (!existing.boardingStations.includes(idx1)) {
                                    existing.boardingStations.push(idx1);
                                }
                            }
                        }
                    });
                });
            }
        }
        return { activeLineDetails: details, activeLineIds: ids, activeLineNames: names };
    }, [pathResult, stations]);

    // 1. Static Layer: Draw Lines & Stations
    useEffect(() => {
        if (!staticLayerRef.current) return;
        const layerGroup = staticLayerRef.current;
        layerGroup.clearLayers();

        // Add Glow Filter for Lines (SVG Filter)
        const svgElement = document.querySelector(".leaflet-zoom-animated") as HTMLElement;
        if (svgElement) {
            // Uber-style Glow Effect for the active route
            svgElement.style.filter = isDarkMode 
                ? "drop-shadow(0 0 12px rgba(255,255,255,0.2))"
                : "drop-shadow(0 0 8px rgba(0,0,0,0.15))";
        }

        const isRouteActive = !!pathResult;

        // Draw Lines
        SUBWAY_LINES.forEach((line) => {
            const latlngs = line.stations.map(s => [s.lat, s.lng] as [number, number]);

            // Default Style
            let drawColor = line.color;
            let drawOpacity = 0.8;
            let drawWeight = 4;

            if (isRouteActive) {
                if (activeLineNames.has(line.name)) {
                    // Part of an active line (Broad Context) -> Dimmed but visible
                    drawColor = isDarkMode ? "#3f3f46" : "#d1d5db";
                    drawOpacity = 0.3;
                    drawWeight = 2.5;
                } else {
                    // Irrelevant line -> Extreme Dim (0.2 per request)
                    drawColor = isDarkMode ? "#18181b" : "#f1f5f9";
                    drawOpacity = 0.2;
                    drawWeight = 1.5;
                }
            }

            const polyline = L.polyline(latlngs, {
                color: drawColor,
                weight: drawWeight,
                opacity: drawOpacity,
                lineCap: "round",
                lineJoin: "round",
                bubblingMouseEvents: true
            });

            layerGroup.addLayer(polyline);
        });

        // Draw Stations
        const isZoomOut = zoomLevel < 12;
        const zoomThreshold = 12;

        stations.forEach((station) => {
            const isPathStation = pathResult?.path.includes(station.name);
            const primaryLine = SUBWAY_LINES.find(l => l.name === station.lines[0]);

            let baseColor = primaryLine?.color || "#888";
            let opacity = 1;

            if (isRouteActive) {
                if (isPathStation) {
                    baseColor = primaryLine?.color || "#888";
                    opacity = 1;
                } else {
                    baseColor = isDarkMode ? "#333" : "#e5e7eb";
                    opacity = 0.2;
                }
            }

            const markerSize = station.lines.length > 1 ? (isZoomOut ? 4 : 6) : (isZoomOut ? 2.5 : 4);
            
            const marker = L.circleMarker([station.lat, station.lng], {
                radius: markerSize,
                color: isPathStation ? baseColor : (isDarkMode ? "#444" : "#ccc"),
                fillColor: "#fff",
                fillOpacity: opacity,
                weight: isPathStation ? 3 : 1.5,
                bubblingMouseEvents: false
            });

            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                onStationClick(station.name, [station.lat, station.lng]);
            });

            if (zoomLevel >= zoomThreshold && (!isRouteActive || isPathStation)) {
                const labelIcon = L.divIcon({
                    className: "bg-transparent",
                    html: `<div class="station-name-label" style="color: white; -webkit-text-stroke: 1.2px ${baseColor}; font-weight: 800; font-size: 14px; text-shadow: 0 0 4px rgba(0,0,0,0.3); white-space: nowrap; transform: translateY(-20px); text-align: center; width: 100px; margin-left: -50px;">${station.name}</div>`,
                    iconSize: [0, 0]
                });
                const labelMarker = L.marker([station.lat, station.lng], {
                    icon: labelIcon,
                    interactive: false,
                    zIndexOffset: 100
                });
                layerGroup.addLayer(labelMarker);
            }

            layerGroup.addLayer(marker);
        });

    }, [zoomLevel, stations, pathResult, activeLineNames]);

    // 2. Highlight Layer: Selection & Path
    useEffect(() => {
        if (!highlightLayerRef.current) return;
        const layerGroup = highlightLayerRef.current;
        layerGroup.clearLayers();

        if (!startStation && !endStation && !pathResult) return;

        // Draw Path Segments with Original Colors
        if (pathResult && pathResult.path.length > 1) {
            for (let i = 0; i < pathResult.path.length - 1; i++) {
                const s1Name = pathResult.path[i];
                const s2Name = pathResult.path[i + 1];

                const s1 = stations.find(s => s.name === s1Name);
                const s2 = stations.find(s => s.name === s2Name);

                if (s1 && s2) {
                    // Identify the Line Color for this segment
                    const commonLineNames = s1.lines.filter(l => s2.lines.includes(l));
                    let segmentColor = "#00E0C6"; // Fallback

                    if (commonLineNames.length > 0) {
                        // Prefer the first common line
                        const lineConfig = SUBWAY_LINES.find(l => l.name === commonLineNames[0]);
                        if (lineConfig) segmentColor = lineConfig.color;
                    } else {
                        // Transfer Walk or Transfer Edge
                        segmentColor = "#6b7280"; // Neutral gray for transfers
                    }

                    layerGroup.addLayer(L.polyline([[s1.lat, s1.lng], [s2.lat, s2.lng]], {
                        color: segmentColor,
                        weight: 8,
                        opacity: 1,
                        // renderer: myRenderer,
                        lineCap: "round",
                        lineJoin: "round"
                    }));
                }
            }
        }

        // Draw Selected Stations (Overlays)
        // ... (unchanged logic)
        // Draw Selected Stations & INFO LABELS
        const drawPathStationInfo = (name: string, index: number) => {
            const s = stations.find(st => st.name === name);
            if (!s) return;

            const isStart = index === 0;
            const isEnd = index === (pathResult?.path.length || 0) - 1;
            const isTransfer = s.lines.length > 1;

            // Determining Marker Style
            let color = "#000"; // stroke
            let fillColor = "#fff";

            if (isStart) {
                color = "#16a34a"; // Green-600
                fillColor = "#22c55e"; // Green-500
            } else if (isEnd) {
                color = "#dc2626"; // Red-600
                fillColor = "#ef4444"; // Red-500
            } else {
                // Intermediate: Use Line Color for stroke, White for fill (Existing style)
                const primaryLine = SUBWAY_LINES.find(l => l.name === s.lines[0]);
                color = primaryLine?.color || "#888";
                fillColor = "#fff";
            }

            const radius = (isStart || isEnd) ? 7 : 5;
            const weight = (isStart || isEnd) ? 2 : 3;

            // 1. The Marker
            layerGroup.addLayer(L.circleMarker([s.lat, s.lng], {
                radius: radius,
                color: (isStart || isEnd) ? "#14532d" : color, // Dark stroke for start/end
                fillColor: fillColor,
                fillOpacity: 1,
                weight: weight,
                // renderer: myRenderer
            }));

            // 2. The Detailed Label
            const now = new Date();
            const arrivalTime = new Date(now.getTime() + index * 2 * 60000);
            const timeStr = arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Info Content - White Rounded, No Shadow
            const timeInfo = `<div class="bg-white rounded-xl px-2 py-0.5 mt-1 border border-gray-300 text-xs font-extrabold text-black whitespace-nowrap leading-none">${timeStr}</div>`;

            const transferInfo = isTransfer && !isStart && !isEnd
                ? `<div class="bg-white rounded-xl px-2 py-0.5 mt-0.5 border border-gray-300 text-xs font-extrabold text-black whitespace-nowrap leading-none">환승 5-1</div>`
                : "";

            // Name Style: Enhanced (User Request: +2pt, Bolder)
            // text-sm (14px) -> text-lg (18px)
            // font-boldEx -> font-extrabold (800)
            const nameHtml = `<span class="text-black font-extrabold text-lg leading-none" style="-webkit-text-stroke: 1px white; paint-order: stroke fill;">${name}</span>`;

            // HTML Content
            const labelHtml = `
                <div class="flex flex-col items-center leading-tight">
                    ${nameHtml}
                    ${timeInfo}
                    ${transferInfo}
                </div>
            `;

            const labelIcon = L.divIcon({
                className: 'bg-transparent',
                html: labelHtml,
                iconSize: [100, 60],
                iconAnchor: [50, -8] // Position nicely above
            });

            layerGroup.addLayer(L.marker([s.lat, s.lng], {
                icon: labelIcon,
                interactive: false,
                zIndexOffset: 1000
            }));
        };

        if (pathResult) {
            pathResult.path.forEach((name, idx) => drawPathStationInfo(name, idx));
        }
    }, [startStation, endStation, pathResult, stations]);


    // 3. Dynamic Layer: Trains (DOM Markers with Caching)
    // We use a ref to cache markers: Map<trainId, L.Marker>
    const trainMarkersRef = useRef<Map<string, L.Marker>>(new Map());

    useEffect(() => {
        if (!dynamicLayerRef.current) return;
        const layerGroup = dynamicLayerRef.current;

        const currentMarkers = trainMarkersRef.current;
        const isRouteActive = !!pathResult;

        // 1. Update or Create Markers
        if (zoomLevel >= 11) {
            trains.forEach(train => {
                let isVisible = true;

                if (isRouteActive) {
                    // Strict Filtering Rule:
                    // 1. Must be on activeLineIds
                    // 2. Must match direction of travel
                    // 3. Must be RELEVANT (On Path OR Arriving at Boarding Station)

                    const segment = activeLineDetails.get(train.lineId);

                    if (!segment) {
                        isVisible = false;
                    } else {
                        // Direction Check
                        if (train.direction !== segment.direction) {
                            isVisible = false;
                        } else {
                            // Proximity/Range Check
                            // 1. On Path: Index is between Start/End (inclusive)
                            const min = Math.min(segment.startIdx, segment.endIdx);
                            const max = Math.max(segment.startIdx, segment.endIdx);
                            const onPath = train.stationIndex >= min && train.stationIndex <= max;

                            // 2. Arriving at Boarding: Index is "before" a boarding station (approaching)
                            // "Before" depends on direction.
                            // If Dir=1 (Asc): Train < Boarding (e.g. at 5, boarding at 10. Dist=5)
                            // If Dir=-1 (Desc): Train > Boarding (e.g. at 15, boarding at 10. Dist=5)
                            let arriving = false;

                            for (const boardIdx of segment.boardingStations) {
                                const dist = (boardIdx - train.stationIndex) * segment.direction;
                                // dist > 0 means approaching.
                                // Let's show top 3... hard to sort inside a loop over single items.
                                // Heuristic: Show if within 5 stations approaching?
                                if (dist > 0 && dist <= 5) {
                                    arriving = true;
                                    break;
                                }
                            }

                            if (!onPath && !arriving) {
                                isVisible = false;
                            }
                        }
                    }
                }

                if (!isVisible) {
                    // If marker exists, we'll remove it in cleanup loop logic (or just skip update here)
                    // We need to ensure we don't 'update' a train that should be hidden
                    return;
                }

                let marker = currentMarkers.get(train.id);
                // ... (Marker creation logic same as before)
                if (!marker) {
                    const line = SUBWAY_LINES.find(l => l.id === train.lineId);
                    const color = line?.color || "#000";
                    const svgIcon = `
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 6V17H20V6C20 6 20 4 12 4C4 4 4 6 4 6ZM4 17V19H20V17M6 10H9V13H6V10ZM15 10H18V13H15V10ZM6 19L5 21H7L8 19H16L17 21H19L18 19" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
                        </svg>
                    `;
                    const icon = L.divIcon({
                        className: `train-marker-container ${train.isRealtime ? "live-indicator" : ""}`,
                        html: `<div class="train-marker">${svgIcon}</div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });
                    marker = L.marker([train.lat, train.lng], {
                        icon: icon,
                        interactive: false
                    });
                    marker.bindTooltip(`${train.lineName} (${train.headingTo})`, {
                        direction: 'top', offset: [0, -10], className: 'train-label', permanent: false
                    });
                    marker.addTo(layerGroup);
                    currentMarkers.set(train.id, marker);
                } else {
                    marker.setLatLng([train.lat, train.lng]);
                    if (!layerGroup.hasLayer(marker)) marker.addTo(layerGroup);
                    marker.getTooltip()?.setContent(`${train.lineName} (${train.headingTo})`);
                }
            });
        }

        // 2. Remove Stale
        currentMarkers.forEach((marker, id) => {
            const train = trains.find(t => t.id === id);
            let shouldRemove = false;
            if (!train) shouldRemove = true;
            else if (zoomLevel < 11) shouldRemove = true;
            else if (isRouteActive && train) {
                // Re-apply visibility check to remove existing ones that got filtered
                const segment = activeLineDetails.get(train.lineId);
                if (!segment) shouldRemove = true;
                else {
                    if (train.direction !== segment.direction) shouldRemove = true;
                    else {
                        const min = Math.min(segment.startIdx, segment.endIdx);
                        const max = Math.max(segment.startIdx, segment.endIdx);
                        const onPath = train.stationIndex >= min && train.stationIndex <= max;
                        let arriving = false;
                        for (const boardIdx of segment.boardingStations) {
                            const dist = (boardIdx - train.stationIndex) * segment.direction;
                            if (dist > 0 && dist <= 5) { arriving = true; break; }
                        }
                        if (!onPath && !arriving) shouldRemove = true;
                    }
                }
            }

            if (shouldRemove) {
                marker.remove();
                currentMarkers.delete(id);
            }
        });

    }, [trains, zoomLevel, pathResult, activeLineDetails, activeLineIds]);

    return null;
}
