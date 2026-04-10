"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

interface WCLayersProps {
  wcData: any;
  activeTab: string;
  selectedWCId?: string | null;
}

// 우선순위별 레이어 (클러스터 없음 — 줌 기반 밀도)
// priority 0 = 역사 내 (zoom 12부터)
// priority 1 = 역 근처 (zoom 13.5부터)
// priority 2 = 독립 (zoom 14.5부터)
const WCLayers = ({ wcData, activeTab, selectedWCId }: WCLayersProps) => {
  const vis: "visible" | "none" =
    activeTab === "wc" || activeTab === "subway+bus" ? "visible" : "none";

  const circleBase = {
    "circle-stroke-width": 1.5,
    "circle-stroke-color": "white",
    "circle-opacity": 0.92,
  } as const;

  return (
    <Source id="wc-source" type="geojson" data={wcData}>

      {/* ── priority 0: 역사 내 (zoom 12+) ── */}
      <Layer
        id="wc-dot-0"
        type="circle"
        minzoom={12}
        filter={["==", ["get", "priority"], 0]}
        layout={{ visibility: vis }}
        paint={{
          ...circleBase,
          "circle-color": "#3b82f6",
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            12, 4, 14, 7, 16, 10
          ],
        }}
      />

      {/* ── priority 1: 역 근처 (zoom 13.5+) ── */}
      <Layer
        id="wc-dot-1"
        type="circle"
        minzoom={13.5}
        filter={["==", ["get", "priority"], 1]}
        layout={{ visibility: vis }}
        paint={{
          ...circleBase,
          "circle-color": "#3b82f6",
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            13.5, 4, 14, 6, 16, 9
          ],
        }}
      />

      {/* ── priority 2: 독립 (zoom 14.5+) ── */}
      <Layer
        id="wc-dot-2"
        type="circle"
        minzoom={14.5}
        filter={["==", ["get", "priority"], 2]}
        layout={{ visibility: vis }}
        paint={{
          ...circleBase,
          "circle-color": "#60a5fa",
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            14.5, 4, 16, 8
          ],
        }}
      />

      {/* ── 이모지 레이블 (zoom 14.5+) ── */}
      <Layer
        id="wc-icon"
        type="symbol"
        minzoom={14.5}
        layout={{
          visibility: vis,
          "text-field": "🚻",
          "text-size": ["interpolate", ["linear"], ["zoom"], 14.5, 10, 16, 14],
          "text-allow-overlap": false,
          "text-anchor": "center",
        }}
        paint={{
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 15, 1],
        }}
      />

      {/* ── 이름 레이블 (zoom 16+) ── */}
      <Layer
        id="wc-label"
        type="symbol"
        minzoom={16}
        layout={{
          visibility: vis,
          "text-field": ["get", "name"],
          "text-size": 10,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
          "text-max-width": 8,
        }}
        paint={{
          "text-color": "#1d4ed8",
          "text-halo-color": "white",
          "text-halo-width": 1.5,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 16, 0, 16.5, 1],
        }}
      />

      {/* ── 선택된 WC 하이라이트 링 ── */}
      {selectedWCId && (
        <Layer
          id="wc-selected-ring"
          type="circle"
          filter={["==", ["get", "id"], selectedWCId]}
          layout={{ visibility: vis }}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 18],
            "circle-color": "transparent",
            "circle-stroke-width": 3,
            "circle-stroke-color": "#2563eb",
            "circle-opacity": 1,
          }}
        />
      )}
    </Source>
  );
};

export default memo(WCLayers);
