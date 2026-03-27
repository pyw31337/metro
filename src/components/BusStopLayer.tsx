"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
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
  const layerRef = useRef<any>(null);

  useEffect(() => {
    // @ts-ignore
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 40,
      disableClusteringAtZoom: 15,
      // Premium look for clusters
      iconCreateFunction: function(cluster: any) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="bus-cluster-inner" style="width: 36px; height: 36px; background: #f97316; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; box-shadow: 0 4px 12px rgba(249,115,22,0.5); border: 2px solid white;">${count}</div>`,
          className: 'bus-marker-cluster',
          iconSize: L.point(36, 36)
        });
      }
    }).addTo(map);
    layerRef.current = clusterGroup;
    return () => { clusterGroup.remove(); };
  }, [map]);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.clearLayers();

    stops.forEach((stop) => {
      const isSelected = stop.id === selectedId;
      const svgHtml = `
        <div class="bus-marker-inner" style="
          width: ${isSelected ? 34 : 26}px;
          height: ${isSelected ? 34 : 26}px;
          background: ${isSelected ? '#f97316' : '#fff'};
          border-radius: 50%;
          border: 2.5px solid ${isSelected ? '#ea580c' : '#f97316'};
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 12px rgba(249,115,22,0.4);
          font-size: ${isSelected ? 16 : 12}px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        ">🚌</div>
      `;
      const size = isSelected ? 34 : 26;
      const icon = L.divIcon({
        className: "bus-stop-marker",
        html: svgHtml,
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
      layerRef.current!.addLayer(marker);
    });
  }, [stops, selectedId, onStopClick]);

  return null;
}
