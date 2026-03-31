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
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.08,
            14, 0.18,
            18, 0.5
          ],
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
          "icon-image": "express-capsule",
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.2,
            14, 0.45,
            18, 0.95
          ],
          "text-field": "급행",
          "text-size": [
            "interpolate", ["linear"], ["zoom"],
            12, 8,
            16, 11
          ],
          "text-font": ["literal", ["Standard-Bold", "Noto Sans KR Bold", "Standard-Regular", "Noto Sans KR Regular", "Arial Unicode MS Regular"]],
          "text-offset": [1.4, -1.4],
          "text-anchor": "center",
          "icon-allow-overlap": true,
          "text-ignore-placement": true
        }}
        paint={{
          "text-color": "white",
          "text-halo-color": "#ef4444",
          "text-halo-width": 1.5,
          "text-halo-blur": 0
        }}
      />
    </Source>
  );
};

export default memo(TrainLayers);
