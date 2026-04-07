"use client";

import { Source, Layer, useMap } from "react-map-gl/maplibre";
import { memo, useState, useEffect, useRef } from "react";
import { transitRealtimeService, RealtimeUnit } from '@/services/TransitRealtimeService';

interface TransitRealtimeLayersProps {
  activeTab: string;
}

const TransitRealtimeLayers = ({ activeTab }: TransitRealtimeLayersProps) => {
  const { current: mapRef } = useMap();
  const map = mapRef?.getMap();
  
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: []
  });

  useEffect(() => {
    if (!map) return;

    const handleUpdate = (units: RealtimeUnit[]) => {
      const features: any[] = units.map(unit => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: unit.pos
        },
        properties: {
          id: unit.id,
          type: unit.type,
          label: unit.label,
          lineName: unit.lineName,
          lineColor: unit.lineColor,
          bearing: unit.bearing
        }
      }));

      // Directly update the source if it exists to maintain 60fps
      const source: any = map.getSource('transit-realtime-source');
      if (source) {
        source.setData({ type: "FeatureCollection", features });
      } else {
        setGeoData({ type: "FeatureCollection", features });
      }
    };

    transitRealtimeService.on('update', handleUpdate);
    transitRealtimeService.start();

    return () => {
      transitRealtimeService.off('update', handleUpdate);
    };
  }, [map]);

  const isVisible = activeTab === "subway" || activeTab === "bus" || activeTab === "subway+bus";
  if (!isVisible) return null;

  return (
    <Source id="transit-realtime-source" type="geojson" data={geoData}>
      {/* Subway Trains */}
      <Layer
        id="subway-realtime-layer"
        type="symbol"
        filter={["==", ["get", "type"], "subway"]}
        layout={{
          "icon-image": ["concat", "train-card-", ["get", "lineColor"]],
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.12,
            14, 0.25,
            18, 0.5
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Bold"],
          "text-size": 10,
          "text-offset": [0, 1.5],
          "text-anchor": "top"
        }}
        paint={{
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1
        }}
      />

      {/* Buses */}
      <Layer
        id="bus-realtime-layer"
        type="symbol"
        filter={["==", ["get", "type"], "bus"]}
        layout={{
          "icon-image": "rocket", // Using the existing rocket icon or a bus icon
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-size": [
            "interpolate", ["linear"], ["zoom"],
            10, 0.1,
            14, 0.2,
            18, 0.4
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "label"],
          "text-size": 9,
          "text-offset": [0, 1.2],
          "text-anchor": "top"
        }}
        paint={{
          "text-color": "#ffffff",
          "text-halo-color": "#3b82f6",
          "text-halo-width": 1
        }}
      />
    </Source>
  );
};

export default memo(TransitRealtimeLayers);
