"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

// 미터 → 픽셀 환산 계수 (서울 위도 37.5° 기준)
// pixels_per_meter = 2^zoom × 256 / (2π × 6378137 × cos(37.5° in rad))
//   z10 → 0.00654,  z12 → 0.02617,  z14 → 0.10471,  z16 → 0.41884,  z18 → 1.67537
//
// MapLibre interpolate: exponential base=2 이면 zoom 1 증가 = 계수 ×2 (지구 크기 2배)
const ACCURACY_RADIUS_EXPR: any = [
  "max",
  6,   // 최소 6px (GPS 정확도가 매우 좋거나 줌이 낮을 때도 원이 보이도록)
  [
    "interpolate", ["exponential", 2], ["zoom"],
    10, ["*", ["get", "accuracy"], 0.00654],
    14, ["*", ["get", "accuracy"], 0.10471],
    18, ["*", ["get", "accuracy"], 1.67537],
  ]
];

const UserLocationLayer = () => {
  return (
    <Source id="user-location-source" type="geojson" data={{ type: "FeatureCollection", features: [] }}>

      {/* GPS 정확도 원 (반투명 파란 링) */}
      <Layer
        id="user-accuracy-circle"
        type="circle"
        paint={{
          "circle-radius": ACCURACY_RADIUS_EXPR,
          "circle-color": "#3b82f6",
          "circle-opacity": 0.12,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#3b82f6",
          "circle-stroke-opacity": 0.35,
          "circle-pitch-alignment": "map",
        }}
      />

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

      {/* Heading Arrow — heading > 0 일 때만 표시 */}
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
