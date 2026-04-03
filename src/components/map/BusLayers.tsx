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
  if (activeTab !== "bus" && activeTab !== "subway+bus") return null;

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
        filter={["has", "point_count"]} 
        paint={{ 
          "circle-color": "#10b981", 
          "circle-radius": ["step", ["get", "point_count"], 15, 20, 20, 50, 25] 
        }} 
      />
      <Layer 
        id="bus-cluster-count" 
        type="symbol" 
        filter={["has", "point_count"]} 
        layout={{ 
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
        filter={["!", ["has", "point_count"]]} 
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
        id="bus-station-label"
        type="symbol"
        filter={["!", ["has", "point_count"]]}
        layout={{
          "text-field": ["get", "name"],
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            14, 9,
            16, 12
          ],
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "visibility": "visible"
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
            <Layer 
                id="bus-route-path" 
                type="line" 
                layout={{ "line-join": "round", "line-cap": "round" }}
                paint={{ 
                    "line-color": "#ef4444", 
                    "line-width": 4,
                    "line-opacity": 0.8
                }} 
            />
        </Source>
    )}
    </>
  );
};

export default memo(BusLayers);
