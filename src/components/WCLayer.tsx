"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

export interface WCItem {
  id: string;
  name: string;
  station: string;
  line: string;
  lat: number;
  lng: number;
  address: string;
  floor: string;
  gender: string;
  accessible: boolean;
}

interface WCLayerProps {
  items: WCItem[];
  onWCClick: (item: WCItem) => void;
}

export default function WCLayer({ items, onWCClick }: WCLayerProps) {
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

    items.forEach((item) => {
      const svgHtml = `
        <div style="
          width: 28px; height: 28px;
          background: #fff;
          border-radius: 50%;
          border: 2.5px solid #3b82f6;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(59,130,246,0.25);
          font-size: 14px;
          cursor: pointer;
        ">🚻</div>
      `;
      const icon = L.divIcon({
        className: "wc-marker-container",
        html: svgHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([item.lat, item.lng], { icon });
      marker.bindTooltip(item.name, {
        direction: "top",
        offset: [0, -16],
        className: "wc-tooltip",
      });
      marker.on("click", () => onWCClick(item));
      layerRef.current!.addLayer(marker);
    });
  }, [items, onWCClick]);

  return null;
}
