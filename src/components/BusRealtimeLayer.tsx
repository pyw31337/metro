"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { BusPosition } from "@/hooks/useBusPositions";

interface BusRealtimeLayerProps {
    buses: BusPosition[];
}

export default function BusRealtimeLayer({ buses }: BusRealtimeLayerProps) {
    const map = useMap();
    const layerRef = useRef<L.LayerGroup | null>(null);
    const markersRef = useRef<Map<string, L.Marker>>(new Map());

    useEffect(() => {
        const layer = L.layerGroup().addTo(map);
        layerRef.current = layer;
        return () => { layer.remove(); };
    }, [map]);

    useEffect(() => {
        if (!layerRef.current) return;
        const group = layerRef.current;
        const currentMarkers = markersRef.current;

        buses.forEach(bus => {
            let marker = currentMarkers.get(bus.id);
            const color = bus.routeName.length > 3 ? "#ef4444" : "#2563eb"; // Simple logic: Blue for regular, Red for express/wide-area

            if (!marker) {
                const icon = L.divIcon({
                    className: "bus-realtime-marker",
                    html: `
                        <div class="relative">
                            <div class="absolute inset-0 animate-ping rounded-full opacity-40" style="background: ${color}"></div>
                            <div class="bus-icon flex flex-col items-center">
                                <div class="bg-white rounded-full p-1 shadow-lg border-2" style="border-color: ${color}">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3">
                                        <path d="M4 6h16v11H4V6zm0 11v2h16v-2M6 10h3v3H6v-3zm9 0h3v3h-3v-3zm-9 9l-1 2h2l1-2h8l1 2h2l-1-2" />
                                    </svg>
                                </div>
                                <div class="mt-0.5 bg-zinc-800 text-white text-[10px] font-bold px-1 rounded-md shadow-md">${bus.routeName}</div>
                            </div>
                        </div>
                    `,
                    iconSize: [30, 40],
                    iconAnchor: [15, 20]
                });

                marker = L.marker([bus.lat, bus.lng], { icon, interactive: false });
                marker.addTo(group);
                currentMarkers.set(bus.id, marker);
            } else {
                marker.setLatLng([bus.lat, bus.lng]);
            }
        });

        // Cleanup stale markers
        currentMarkers.forEach((marker, id) => {
            if (!buses.find(b => b.id === id)) {
                marker.remove();
                currentMarkers.delete(id);
            }
        });
    }, [buses]);

    return null;
}
