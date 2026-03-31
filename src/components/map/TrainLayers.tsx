"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

interface TrainLayersProps {
  trainData: any;
  trainFilter: any;
  activeTab: string;
}

const TrainLayers = ({ trainData, trainFilter, activeTab }: TrainLayersProps) => {
  if (activeTab !== "subway" && activeTab !== "subway+bus") return null;

  return (
    <Source id="train-source" type="geojson" data={trainData}>
      <Layer
        id="train-layer"
        type="symbol"
        filter={trainFilter || true}
        layout={{
          "icon-image": ["concat", "train-card-", ["get", "lineColor"]],
          "icon-size": 0.15,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-anchor": "center"
        }}
        paint={{
          "icon-opacity": 1
        }}
      />
      <Layer
        id="train-express-badge"
        type="symbol"
        filter={trainFilter ? ["all", trainFilter, ["==", ["get", "directAt"], "1"]] : ["==", ["get", "directAt"], "1"]}
        layout={{
          "text-field": "급행",
          "text-size": 9,
          "text-font": ["literal", ["Standard-Regular", "Noto Sans KR Regular", "Arial Unicode MS Regular"]],
          "text-offset": [0.9, -0.9],
          "text-anchor": "center",
          "icon-allow-overlap": true,
          "text-ignore-placement": true
        }}
        paint={{
          "text-color": "white",
          "text-halo-color": "#ef4444",
          "text-halo-width": 3,
          "text-halo-blur": 0
        }}
      />
    </Source>
  );
};

export default memo(TrainLayers);
