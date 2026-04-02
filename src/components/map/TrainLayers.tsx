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
        filter={(Array.isArray(trainFilter) ? trainFilter : ["all"]) as any}
        layout={{
          "icon-image": ["concat", "train-card-", ["get", "lineColor"]],
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.1,
            12, 0.18,
            14, 0.32,
            16, 0.48,
            18, 0.65
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
        filter={(Array.isArray(trainFilter) ? ["all", trainFilter, ["==", ["get", "directAt"], "1"]] : ["==", ["get", "directAt"], "1"]) as any}
        layout={{
          "icon-image": "express-full-badge",
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.15,
            12, 0.25,
            14, 0.38,
            16, 0.55,
            18, 0.85
          ],
          "icon-anchor": "bottom",
          "icon-offset": [0, -40],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true
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
