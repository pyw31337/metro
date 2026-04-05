"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

interface TransitRealtimeLayersProps {
  activeTab: string;
}

const TransitRealtimeLayers = ({ activeTab }: TransitRealtimeLayersProps) => {
  const isVisible = activeTab === "subway" || activeTab === "bus" || activeTab === "subway+bus";
  if (!isVisible) return null;

  return (
    <Source id="transit-realtime-source" type="geojson" data={{ type: "FeatureCollection", features: [] }}>
      {/* Subway Trains */}
      <Layer
        id="subway-realtime-layer"
        type="symbol"
        filter={["==", ["get", "type"], "subway"]}
        layout={{
          "icon-image": "train-card-3B82F6", // Default blue if line color mapping not immediate
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.12,
            14, 0.25,
            18, 0.5
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Bold"],
          "text-size": 10,
          "text-offset": [0, 1.5],
          "text-anchor": "top"
        }}
        paint={{
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1
        }}
      />

      {/* Buses */}
      <Layer
        id="bus-realtime-layer"
        type="symbol"
        filter={["==", ["get", "type"], "bus"]}
        layout={{
          "icon-image": "rocket", // Using the existing rocket icon or a bus icon
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.1,
            14, 0.2,
            18, 0.4
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "label"],
          "text-size": 9,
          "text-offset": [0, 1.2],
          "text-anchor": "top"
        }}
        paint={{
          "text-color": "#ffffff",
          "text-halo-color": "#3b82f6",
          "text-halo-width": 1
        }}
      />
    </Source>
  );
};

export default memo(TransitRealtimeLayers);
