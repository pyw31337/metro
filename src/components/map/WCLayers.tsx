"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

interface WCLayersProps {
  wcData: any;
  activeTab: string;
}

const WCLayers = ({ wcData, activeTab }: WCLayersProps) => {
  if (activeTab !== "wc" && activeTab !== "subway+bus") return null;

  return (
    <Source 
      id="wc-source" 
      type="geojson" 
      data={wcData} 
      cluster={true} 
      clusterMaxZoom={14} 
      clusterRadius={50}
    >
      <Layer 
        id="wc-clusters" 
        type="circle" 
        filter={["has", "point_count"]} 
        paint={{ 
          "circle-color": "#3b82f6", 
          "circle-radius": ["step", ["get", "point_count"], 15, 20, 20, 50, 25] 
        }} 
      />
      <Layer 
        id="wc-cluster-count" 
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
        id="wc-unclustered" 
        type="circle" 
        filter={["!", ["has", "point_count"]]} 
        paint={{ 
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            12, 4,
            14, 8,
            16, 11
          ], 
          "circle-color": "white", 
          "circle-stroke-width": 3, 
          "circle-stroke-color": "#3b82f6" 
        }} 
      />
    </Source>
  );
};

export default memo(WCLayers);
