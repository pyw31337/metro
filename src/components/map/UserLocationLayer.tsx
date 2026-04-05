"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

const UserLocationLayer = () => {
  return (
    <Source id="user-location-source" type="geojson" data={{ type: "FeatureCollection", features: [] }}>
      {/* Accuracy Circle */}
      <Layer
        id="user-accuracy"
        type="circle"
        paint={{
          "circle-radius": ["get", "accuracy"],
          "circle-color": "#3b82f6",
          "circle-opacity": 0.15,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#3b82f6"
        }}
      />
      {/* Outer Glow */}
      <Layer
        id="user-glow"
        type="circle"
        paint={{
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 8,
            15, 14,
            20, 24
          ],
          "circle-color": "#3b82f6",
          "circle-opacity": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.4,
            20, 0.2
          ],
          "circle-blur": 1
        }}
      />
      {/* Main Pulse Circle */}
      <Layer
        id="user-dot"
        type="circle"
        paint={{
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 4,
            15, 7,
            20, 10
          ],
          "circle-color": "white",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#3b82f6"
        }}
      />
      {/* Heading Arrow */}
      <Layer
        id="user-heading"
        type="symbol"
        layout={{
            "icon-image": "rocket", // Fallback or custom icon
            "icon-size": 0.5,
            "icon-rotate": ["get", "heading"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-rotation-alignment": "map",
            "visibility": ["case", [">", ["get", "heading"], 0], "visible", "none"]
        }}
      />
    </Source>
  );
};

export default memo(UserLocationLayer);
