"use client";

import { useEffect, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";

export interface WCItem {
  id: string;
  name: string;
  station: string;
  line: string;
  lat: number;
  lng: number;
  address: string;
  floor: string;
  gender: string;
  accessible: boolean;
  hours?: string;
  diapers?: boolean;
  emergencyBell?: boolean;
}

interface WCLayerProps {
  items: WCItem[];
  onWCClick: (item: WCItem) => void;
  isDimmed: boolean;
  filters: {
    accessible: boolean;
    diapers: boolean;
    emergencyBell: boolean;
  };
}

export default function WCLayer({ items, onWCClick, isDimmed, filters }: WCLayerProps) {
  const map = useMap();
  const clusterGroupRef = useRef<any>(null);
  const [bounds, setBounds] = useState<L.LatLngBounds>(map.getBounds());

  // Throttled update
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
      maxClusterRadius: 50,
      disableClusteringAtZoom: 16,
      iconCreateFunction: function(cluster: any) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="wc-cluster-inner" style="width: 36px; height: 36px; background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; box-shadow: 0 4px 15px rgba(99,102,241,0.5); border: 2.5px solid white; font-size: 13px;">${count}</div>`,
          className: 'wc-marker-cluster',
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
    clusterGroup.clearLayers();

    const currentBounds = bounds.pad(0.3);

    const filteredItems = items.filter(item => {
      // 1. Feature Filters
      if (filters.accessible && !item.accessible) return false;
      if (filters.diapers && !item.diapers) return false;
      if (filters.emergencyBell && !item.emergencyBell) return false;
      
      // 2. Viewport Virtualization
      return currentBounds.contains([item.lat, item.lng]);
    });

    filteredItems.forEach((item) => {
      const opacity = isDimmed ? 0.3 : 1;
      const filter = isDimmed ? "grayscale(100%)" : "none";
      
      const icon = L.divIcon({
        className: "wc-marker-container",
        html: `
          <div style="
            width: 30px; height: 30px;
            background: white;
            border-radius: 50%;
            border: 2.5px solid #6366f1;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 12px rgba(99,102,241,0.4);
            font-size: 16px;
            opacity: ${opacity};
            filter: ${filter};
            transition: opacity 0.3s ease;
          ">🚻</div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([item.lat, item.lng], { icon });
      marker.bindTooltip(item.name, {
        direction: "top",
        offset: [0, -18],
        className: "wc-tooltip premium-tooltip",
      });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onWCClick(item);
      });
      clusterGroup.addLayer(marker);
    });
  }, [bounds, items, onWCClick, isDimmed, filters]);

  return null;
}
