"use client";

import { Source, Layer, useMap } from "react-map-gl/maplibre";
import { memo, useEffect } from "react";
import { GeoJsonFeatureCollection } from "@/utils/geoJsonUtils";

interface BusRealtimeLayersProps {
  busData: GeoJsonFeatureCollection;
  activeTab: string;
}

const BusRealtimeLayers = ({ busData, activeTab }: BusRealtimeLayersProps) => {
  const { current: mapRef } = useMap();
  const map = mapRef?.getMap();

  useEffect(() => {
    if (!map) return;

    const registerBusIcon = () => {
      if (map.hasImage('bus-icon-base')) return;

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw a simple bus shape (rectangle with rounded corners)
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        const r = 8;
        const x = 12, y = 12, w = 40, h = 40;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Draw windshield
        ctx.fillStyle = 'white';
        ctx.fillRect(x + 6, y + 6, w - 12, 10);

        const data = ctx.getImageData(0, 0, 64, 64);
        map.addImage('bus-icon-base', data);
      }
    };

    if (map.isStyleLoaded()) registerBusIcon();
    else map.on('style.load', registerBusIcon);

    return () => {
      map.off('style.load', registerBusIcon);
    };
  }, [map]);

  if (activeTab !== "bus" && activeTab !== "subway+bus") return null;

  return (
    <Source id="bus-realtime-source" type="geojson" data={busData}>
      <Layer
        id="bus-realtime-icon"
        type="symbol"
        layout={{
          "icon-image": "bus-icon-base",
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            12, 0.4,
            15, 0.6
          ],
          "icon-rotate": ["get", "angle"],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-rotation-alignment": "map"
        }}
      />
      <Layer
        id="bus-realtime-label"
        type="symbol"
        layout={{
          "text-field": ["get", "routeName"],
          "text-size": 10,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"]
        }}
        paint={{
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.8)",
          "text-halo-width": 1.5
        }}
      />
    </Source>
  );
};

export default memo(BusRealtimeLayers);
