"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

interface BusRouteLayerProps {
    routeName: string | null;
    isDarkMode: boolean;
}

export default function BusRouteLayer({ routeName, isDarkMode }: BusRouteLayerProps) {
    const map = useMap();
    const layerRef = useRef<L.LayerGroup | null>(null);

    // Mock Route Coordinates (Simplified for demonstration)
    // In a real app, this would be fetched from a Route Shape API
    const routeCoordsMap: Record<string, [number, number][]> = {
        "143": [
            [37.6139, 127.0301], [37.5892, 127.0575], [37.5719, 127.0102], 
            [37.5706, 126.9918], [37.5551, 126.9724], [37.5216, 126.9245]
        ],
        "100": [
            [37.5716, 126.9769], [37.5700, 126.9827], [37.5706, 126.9918], [37.5719, 127.0102]
        ],
        "150": [
            [37.5716, 126.9769], [37.5657, 126.9773], [37.5545, 126.9707], [37.4979, 127.0276]
        ]
    };

    useEffect(() => {
        const layer = L.layerGroup().addTo(map);
        layerRef.current = layer;
        return () => { layer.remove(); };
    }, [map]);

    useEffect(() => {
        if (!layerRef.current) return;
        const group = layerRef.current;
        group.clearLayers();

        if (!routeName || !routeCoordsMap[routeName]) return;

        const coords = routeCoordsMap[routeName];
        const color = "#f97316"; // Bus Orange

        // 1. Shadow/Glow Layer
        const glow = L.polyline(coords, {
            color: isDarkMode ? "rgba(249, 115, 22, 0.4)" : "rgba(249, 115, 22, 0.2)",
            weight: 12,
            opacity: 0.6,
            lineCap: "round"
        }).addTo(group);

        // 2. Main Route Line
        const line = L.polyline(coords, {
            color: color,
            weight: 5,
            opacity: 1,
            lineCap: "round",
            lineJoin: "round"
        }).addTo(group);

        // Fit map to route if it's new
        // map.fitBounds(line.getBounds(), { padding: [50, 50] });

    }, [routeName, isDarkMode]);

    return null;
}
