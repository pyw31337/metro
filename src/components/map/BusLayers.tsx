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

    {/* Bus Route Path Layer */}
    {routePathData && (
        <Source id="bus-route-path-source" type="geojson" data={routePathData}>
            {/* Casing for better visibility (선명함) */}
            <Layer
                id="bus-route-path-casing"
                type="line"
                layout={{ "line-join": "round", "line-cap": "round" }}
                paint={{
                    "line-color": isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.8)",
                    "line-width": 8,
                    "line-opacity": 0.9
                }}
            />
            <Layer
                id="bus-route-path"
                type="line"
                layout={{ "line-join": "round", "line-cap": "round" }}
                paint={{
                    "line-color": "#10b981", // Emerald-500 for a fresh, vivid look
                    "line-width": 5,
                    "line-opacity": 1.0
                }}
            />
        </Source>
    )}
    </>
  );
};

export default memo(BusLayers);
