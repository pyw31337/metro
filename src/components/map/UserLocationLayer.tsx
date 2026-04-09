"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

const UserLocationLayer = () => {
  return (
    <Source id="user-location-source" type="geojson" data={{ type: "FeatureCollection", features: [] }}>
      {/* Outer Glow */}
      <Layer
        id="user-glow"
        type="circle"
        paint={{
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, 10,
            15, 16,
            20, 28
          ],
          "circle-color": "#3b82f6",
          "circle-opacity": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.35,
            20, 0.15
          ],
          "circle-blur": 1
        }}
      />
      {/* Main Dot */}
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
      {/* Heading Arrow — only shown when heading is available */}
      <Layer
        id="user-heading"
        type="symbol"
        layout={{
            "icon-image": "rocket",
            "icon-size": 0.5,
            "icon-rotate": ["get", "heading"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-rotation-alignment": "map",
        }}
        filter={[">", ["get", "heading"], 0]}
      />
    </Source>
  );
};

export default memo(UserLocationLayer);
