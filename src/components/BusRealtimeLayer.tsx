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
            const color = bus.routeName.length > 3 ? "#ef4444" : "#2563eb"; // Blue for regular, Red for express

            const iconHtml = `
                <div class="relative bus-marker-container transition-all duration-500" style="transform: rotate(${bus.angle || 0}deg)">
                    <div class="absolute inset-0 animate-pulse rounded-full opacity-20" style="background: ${color}; transform: scale(1.5)"></div>
                    <div class="bus-icon flex flex-col items-center">
                        <div class="bg-white dark:bg-zinc-900 rounded-lg p-1 shadow-2xl border-2" style="border-color: ${color}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" style="transform: rotate(${(bus.angle || 0) * -1}deg)">
                                <rect x="3" y="4" width="18" height="16" rx="2" />
                                <path d="M7 11h2v3H7z" />
                                <path d="M15 11h2v3h-2z" />
                                <path d="M8 20h2l1-2H13l1 2h2" />
                            </svg>
                        </div>
                        <div class="mt-1 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-[10px] font-black px-1.5 py-0.5 rounded-md shadow-lg border border-zinc-200 dark:border-white/10" style="transform: rotate(${(bus.angle || 0) * -1}deg); white-space: nowrap;">
                            ${bus.routeName}
                        </div>
                    </div>
                </div>
            `;

            if (!marker) {
                marker = L.marker([bus.lat, bus.lng], {
                    icon: L.divIcon({
                        className: "bus-realtime-marker",
                        html: iconHtml,
                        iconSize: [40, 50],
                        iconAnchor: [20, 25]
                    }),
                    interactive: false
                }).addTo(group);
                currentMarkers.set(bus.id, marker);
            } else {
                marker.setLatLng([bus.lat, bus.lng]);
                const el = marker.getElement();
                if (el) {
                    const container = el.querySelector('.bus-marker-container') as HTMLElement;
                    if (container) {
                        container.style.transform = `rotate(${bus.angle || 0}deg)`;
                        // Update the internal rotation of the icon and text to stay upright
                        const icons = el.querySelectorAll('svg, .mt-1') as NodeListOf<HTMLElement>;
                        icons.forEach(i => i.style.transform = `rotate(${(bus.angle || 0) * -1}deg)`);
                    }
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
