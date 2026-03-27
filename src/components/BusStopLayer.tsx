"use client";

import { useEffect, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";

export interface BusStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  routes: string[];
}

interface BusStopLayerProps {
  stops: BusStop[];
  selectedId: string | null;
  onStopClick: (stop: BusStop, latlng?: [number, number]) => void;
}

export default function BusStopLayer({ stops, selectedId, onStopClick }: BusStopLayerProps) {
  const map = useMap();
  const clusterGroupRef = useRef<any>(null);
  const [bounds, setBounds] = useState<L.LatLngBounds>(map.getBounds());

  // Listen for move/zoom to update visible markers
  useMapEvents({
    moveend: () => setBounds(map.getBounds()),
    zoomend: () => setBounds(map.getBounds())
  });

  useEffect(() => {
    // @ts-ignore
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 40,
      disableClusteringAtZoom: 15,
      iconCreateFunction: function(cluster: any) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="bus-cluster-inner" style="width: 36px; height: 36px; background: #f59e0b; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; box-shadow: 0 4px 12px rgba(245,158,11,0.5); border: 2px solid white;">${count}</div>`,
          className: 'bus-marker-cluster',
          iconSize: L.point(36, 36)
        });
      }
    }).addTo(map);
    clusterGroupRef.current = clusterGroup;
    return () => { clusterGroup.remove(); };
  }, [map]);

  useEffect(() => {
    if (!clusterGroupRef.current) return;
    const clusterGroup = clusterGroupRef.current;
    
    // Performance: Only update markers within expanded bounds to minimize "pop-in"
    const currentBounds = bounds.pad(0.3); 
    const visibleStops = stops.filter(s => currentBounds.contains([s.lat, s.lng]) || s.id === selectedId);

    clusterGroup.clearLayers();

    visibleStops.forEach((stop) => {
      const isSelected = stop.id === selectedId;
      const size = isSelected ? 34 : 26;
      
      const icon = L.divIcon({
        className: "bus-stop-marker",
        html: `
          <div style="
            width: ${size}px; height: ${size}px;
            background: ${isSelected ? '#f59e0b' : '#fff'};
            border-radius: 50%;
            border: 2.5px solid ${isSelected ? '#d97706' : '#f59e0b'};
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 12px rgba(245,158,11,0.4);
            font-size: ${isSelected ? 16 : 12}px;
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          ">🚌</div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([stop.lat, stop.lng], { icon });
      marker.bindTooltip(stop.name, {
        direction: "top",
        offset: [0, -16],
        className: "bus-stop-tooltip",
      });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onStopClick(stop, [stop.lat, stop.lng]);
      });
      clusterGroup.addLayer(marker);
    });
  }, [bounds, stops, selectedId, onStopClick]);

  return null;
}
