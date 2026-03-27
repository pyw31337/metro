"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

export interface BusStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  routes: string[];
}

interface BusStopLayerProps {
  stops: BusStop[];
  selectedId: string | null;
  onStopClick: (stop: BusStop, latlng?: [number, number]) => void;
}

export default function BusStopLayer({ stops, selectedId, onStopClick }: BusStopLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    layerRef.current = layer;
    return () => { layer.remove(); };
  }, [map]);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.clearLayers();

    stops.forEach((stop) => {
      const isSelected = stop.id === selectedId;
      const svgHtml = `
        <div class="bus-marker-inner" style="
          width: ${isSelected ? 34 : 26}px;
          height: ${isSelected ? 34 : 26}px;
          background: ${isSelected ? '#f97316' : '#fff'};
          border-radius: 50%;
          border: 2.5px solid ${isSelected ? '#ea580c' : '#f97316'};
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 12px rgba(249,115,22,0.4);
          font-size: ${isSelected ? 16 : 12}px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        ">🚌</div>
      `;
      const size = isSelected ? 34 : 26;
      const icon = L.divIcon({
        className: "bus-stop-marker",
        html: svgHtml,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([stop.lat, stop.lng], { icon });
      marker.bindTooltip(stop.name, {
        direction: "top",
        offset: [0, -16],
        className: "bus-stop-tooltip",
      });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onStopClick(stop, [stop.lat, stop.lng]);
      });
      layerRef.current!.addLayer(marker);
    });
  }, [stops, selectedId, onStopClick]);

  return null;
}
