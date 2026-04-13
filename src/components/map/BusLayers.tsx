"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

interface BusLayersProps {
  busData: any;
  routePathData?: any;
  activeTab: string;
  isDarkMode: boolean;
}

const BusLayers = ({ busData, routePathData, activeTab, isDarkMode }: BusLayersProps) => {
  // Hide all stop/cluster layers while a route is being displayed
  const vis: "visible" | "none" = routePathData ? "none" : (activeTab === "bus" || activeTab === "subway+bus") ? "visible" : "none";

  return (
    <>
    <Source
      id="bus-source"
      type="geojson"
      data={busData}
      cluster={true}
      clusterMaxZoom={14}
      clusterRadius={50}
    >
      <Layer
        id="bus-clusters"
        type="circle"
        minzoom={10}
        filter={["has", "point_count"]}
        layout={{ "visibility": vis }}
        paint={{
          "circle-color": "#10b981",
          "circle-radius": ["step", ["get", "point_count"], 15, 20, 20, 50, 25]
        }}
      />
      <Layer
        id="bus-cluster-count"
        type="symbol"
        minzoom={10}
        filter={["has", "point_count"]}
        layout={{
          "visibility": vis,
          "text-field": "{point_count}",
          "text-size": 12
        }}
        paint={{
          "text-color": "white"
        }}
      />
      <Layer
        id="bus-unclustered"
        type="circle"
        minzoom={12}
        filter={["all",
          ["!", ["has", "point_count"]],
          ["any",
            [">=", ["zoom"], 14],
            ["all", [">=", ["zoom"], 13], ["<=", ["get", "rank"], 1]],
            ["all", [">=", ["zoom"], 12], ["==", ["get", "rank"], 0]]
          ]
        ]}
        layout={{ "visibility": vis }}
        paint={{
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            12, 3,
            14, 6,
            16, 8
          ],
          "circle-color": "white",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#10b981"
        }}
      />
      <Layer
        id="bus-unclustered-hitbox"
        type="circle"
        minzoom={12}
        filter={["all",
          ["!", ["has", "point_count"]],
          ["any",
            [">=", ["zoom"], 14],
            ["all", [">=", ["zoom"], 13], ["<=", ["get", "rank"], 1]],
            ["all", [">=", ["zoom"], 12], ["==", ["get", "rank"], 0]]
          ]
        ]}
        layout={{ "visibility": vis }}
        paint={{
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            12, 15,
            14, 20,
            16, 25
          ],
          "circle-color": "transparent"
        }}
      />
      <Layer
        id="bus-station-label"
        type="symbol"
        minzoom={12}
        filter={["all",
          ["!", ["has", "point_count"]],
          ["any",
            [">=", ["zoom"], 14],
            ["all", [">=", ["zoom"], 13], ["<=", ["get", "rank"], 1]],
            ["all", [">=", ["zoom"], 12], ["==", ["get", "rank"], 0]]
          ]
        ]}
        layout={{
          "visibility": vis,
          "text-field": ["get", "name"],
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            14, 9,
            16, 12
          ],
          "text-offset": [0, 1.2],
          "text-anchor": "top"
        }}
        paint={{
          "text-color": isDarkMode ? "#ffffff" : "#059669",
          "text-halo-color": isDarkMode ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)",
          "text-halo-width": 1.5,
          "text-opacity": [
            "interpolate", ["linear"], ["zoom"],
            14, 0,
            15, 1
          ]
        }}
      />
    </Source>

    {/* Bus Route Path + Stop Markers */}
    {routePathData && (
        <Source id="bus-route-path-source" type="geojson" data={routePathData}>
            {/* Route line — white casing */}
            <Layer
                id="bus-route-path-casing"
                type="line"
                layout={{ "line-join": "round", "line-cap": "round" }}
                paint={{
                    "line-color": isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.9)",
                    "line-width": 8,
                    "line-opacity": 0.9,
                }}
            />
            {/* Route line — emerald */}
            <Layer
                id="bus-route-path"
                type="line"
                layout={{ "line-join": "round", "line-cap": "round" }}
                paint={{
                    "line-color": "#10b981",
                    "line-width": 5,
                    "line-opacity": 1.0,
                }}
            />
            {/* Intermediate stop dots */}
            <Layer
                id="bus-route-stops"
                type="circle"
                filter={["all",
                    ["==", ["get", "featureType"], "stop"],
                    ["!=", ["get", "isFirst"], true],
                    ["!=", ["get", "isLast"],  true],
                ]}
                paint={{
                    "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 13, 4, 16, 6],
                    "circle-color": "white",
                    "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 2],
                    "circle-stroke-color": "#10b981",
                    "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0, 11, 1],
                }}
            />
            {/* 출발 marker — blue */}
            <Layer
                id="bus-route-first-stop"
                type="circle"
                filter={["==", ["get", "isFirst"], true]}
                paint={{
                    "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 9],
                    "circle-color": "#3b82f6",
                    "circle-stroke-width": 3,
                    "circle-stroke-color": "white",
                }}
            />
            {/* 도착 marker — red */}
            <Layer
                id="bus-route-last-stop"
                type="circle"
                filter={["==", ["get", "isLast"], true]}
                paint={{
                    "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 9],
                    "circle-color": "#ef4444",
                    "circle-stroke-width": 3,
                    "circle-stroke-color": "white",
                }}
            />
            {/* 출발·도착 labels — zoom 11부터 표시 */}
            <Layer
                id="bus-route-first-label"
                type="symbol"
                minzoom={11}
                filter={["==", ["get", "isFirst"], true]}
                layout={{
                    "text-field": ["concat", "출발\n", ["get", "name"]],
                    "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9, 14, 11],
                    "text-anchor": "top",
                    "text-offset": [0, 1.2],
                    "text-max-width": 8,
                }}
                paint={{
                    "text-color": "#3b82f6",
                    "text-halo-color": isDarkMode ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.9)",
                    "text-halo-width": 1.5,
                    "text-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 12, 1],
                }}
            />
            <Layer
                id="bus-route-last-label"
                type="symbol"
                minzoom={11}
                filter={["==", ["get", "isLast"], true]}
                layout={{
                    "text-field": ["concat", "종점\n", ["get", "name"]],
                    "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9, 14, 11],
                    "text-anchor": "top",
                    "text-offset": [0, 1.2],
                    "text-max-width": 8,
                }}
                paint={{
                    "text-color": "#ef4444",
                    "text-halo-color": isDarkMode ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.9)",
                    "text-halo-width": 1.5,
                    "text-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 12, 1],
                }}
            />
            {/* 중간 정류장 역명 — zoom 12부터, 홀짝 교대 배치로 겹침 최소화 */}
            <Layer
                id="bus-route-stop-labels-even"
                type="symbol"
                minzoom={12}
                filter={["all",
                    ["==", ["get", "featureType"], "stop"],
                    ["!=", ["get", "isFirst"], true],
                    ["!=", ["get", "isLast"],  true],
                    ["==", ["%", ["get", "order"], 2], 0],
                ]}
                layout={{
                    "text-field": ["get", "name"],
                    "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 15, 11],
                    "text-anchor": "bottom",
                    "text-offset": [0, -1.1],
                    "text-max-width": 6,
                    "text-allow-overlap": false,
                    "symbol-avoid-edges": true,
                }}
                paint={{
                    "text-color": isDarkMode ? "#d1fae5" : "#065f46",
                    "text-halo-color": isDarkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)",
                    "text-halo-width": 1.5,
                    "text-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 1],
                }}
            />
            <Layer
                id="bus-route-stop-labels-odd"
                type="symbol"
                minzoom={12}
                filter={["all",
                    ["==", ["get", "featureType"], "stop"],
                    ["!=", ["get", "isFirst"], true],
                    ["!=", ["get", "isLast"],  true],
                    ["==", ["%", ["get", "order"], 2], 1],
                ]}
                layout={{
                    "text-field": ["get", "name"],
                    "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 15, 11],
                    "text-anchor": "top",
                    "text-offset": [0, 1.1],
                    "text-max-width": 6,
                    "text-allow-overlap": false,
                    "symbol-avoid-edges": true,
                }}
                paint={{
                    "text-color": isDarkMode ? "#d1fae5" : "#065f46",
                    "text-halo-color": isDarkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)",
                    "text-halo-width": 1.5,
                    "text-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 1],
                }}
            />
        </Source>
    )}
    </>
  );
};

export default memo(BusLayers);
