"use client";

import { useEffect, useRef } from 'react';
import { transitRealtimeService, RealtimeUnit } from '@/services/TransitRealtimeService';

export function useTransitRealtime(map: any | null) {
  const geojsonRef = useRef<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: []
  });

  useEffect(() => {
    if (!map) return;

    const handleUpdate = (units: RealtimeUnit[]) => {
      if (!map.isStyleLoaded()) return;
      
      const source: any = map.getSource('transit-realtime-source');
      if (!source) return;

      geojsonRef.current.features = units.map(unit => ({
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
          bearing: unit.bearing
        }
      }));

      source.setData(geojsonRef.current);
    };

    transitRealtimeService.on('update', handleUpdate);
    transitRealtimeService.start();

    return () => {
      transitRealtimeService.off('update', handleUpdate);
      // We keep the service running globally if needed, or stop it here
    };
  }, [map]);

  return null;
}
