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
                        <div class="relative bus-marker-container transition-transform duration-100" style="transform: rotate(${bus.angle || 0}deg)">
                            <div class="absolute inset-0 animate-pulse rounded-full opacity-40" style="background: ${color}"></div>
                            <div class="bus-icon flex flex-col items-center">
                                <div class="bg-white rounded-full p-1.5 shadow-xl border-2" style="border-color: ${color}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" style="transform: rotate(${(bus.angle || 0) * -1}deg)">
                                        <path d="M4 6h16v11H4V6zm0 11v2h16v-2M6 10h3v3H6v-3zm9 0h3v3h-3v-3zm-9 9l-1 2h2l1-2h8l1 2h2l-1-2" />
                                    </svg>
                                </div>
                                <div class="mt-1 bg-zinc-900 text-white text-[11px] font-black px-1.5 py-0.5 rounded-md shadow-2xl border border-white/20" style="transform: rotate(${(bus.angle || 0) * -1}deg)">${bus.routeName}</div>
                            </div>
                        </div>
                    `,
                    iconSize: [40, 50],
                    iconAnchor: [20, 25]
                });

                marker = L.marker([bus.lat, bus.lng], { icon, interactive: false });
                marker.addTo(group);
                currentMarkers.set(bus.id, marker);
            } else {
                marker.setLatLng([bus.lat, bus.lng]);
                // Smoother update: Update the inner HTML or use CSS rotation via a custom element
                const el = marker.getElement();
                if (el) {
                    const container = el.querySelector('.bus-marker-container') as HTMLElement;
                    if (container) container.style.transform = `rotate(${bus.angle || 0}deg)`;
                }
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
