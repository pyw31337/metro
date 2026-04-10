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
        minzoom={12}
        filter={["has", "point_count"]}
        paint={{
          "circle-color": "#3b82f6",
          "circle-radius": ["step", ["get", "point_count"], 15, 20, 20, 50, 25]
        }}
      />
      <Layer
        id="wc-cluster-count"
        type="symbol"
        minzoom={12}
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
        minzoom={14}
        filter={["!", ["has", "point_count"]]}
        paint={{
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            12, 4,
            14, 8,
            16, 11
          ],
          "circle-color": "#3b82f6",
          "circle-stroke-width": 2,
          "circle-stroke-color": "white",
          "circle-opacity": 0.9
        }}
      />
      <Layer
        id="wc-unclustered-label"
        type="symbol"
        minzoom={14}
        filter={["!", ["has", "point_count"]]}
        layout={{
          "text-field": "🚻",
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            14, 10,
            16, 14
          ],
          "text-allow-overlap": false,
          "text-anchor": "center",
        }}
        paint={{
          "text-opacity": [
            "interpolate", ["linear"], ["zoom"],
            13, 0,
            14, 1
          ]
        }}
      />
    </Source>
  );
};

export default memo(WCLayers);
