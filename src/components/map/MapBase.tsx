"use client";

import { useEffect, useState, useRef, useCallback, memo } from "react";
import Map, { MapRef, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CARTO_VOYAGER = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

interface MapBaseProps {
  isDarkMode: boolean;
  children: React.ReactNode;
  onCenterChange?: (lat: number, lng: number) => void;
  onBoundsChange?: (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => void;
  onMapReady?: (map: any) => void;
  onClick?: (e: any) => void;
  onHover?: (e: any) => void;
  interactiveLayerIds?: string[];
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
}

const MapBase = ({
  isDarkMode,
  children,
  onCenterChange,
  onBoundsChange,
  onMapReady,
  onClick,
  onHover,
  interactiveLayerIds,
  initialViewState = { longitude: 126.9780, latitude: 37.5665, zoom: 12 }
}: MapBaseProps) => {
  const mapRef = useRef<MapRef | null>(null);
  const [cursor, setCursor] = useState<string>("auto");

  return (
    <div className="absolute inset-0 w-full h-full z-0 bg-black">
      <Map
        initialViewState={initialViewState}
        mapStyle={isDarkMode ? CARTO_DARK : CARTO_VOYAGER}
        style={{ width: "100%", height: "100%" }}
        cursor={cursor}
        interactiveLayerIds={interactiveLayerIds}
        onClick={onClick}
        onMouseEnter={(e) => { setCursor("pointer"); onHover?.(e); }}
        onMouseLeave={() => setCursor("auto")}
        onMove={(e) => {
          const { latitude, longitude } = e.viewState;
          if (onCenterChange) onCenterChange(latitude, longitude);
          
          if (onBoundsChange && mapRef.current) {
            const b = mapRef.current.getBounds();
            onBoundsChange({
                minLat: b.getSouth(),
                minLng: b.getWest(),
                maxLat: b.getNorth(),
                maxLng: b.getEast()
            });
          }
        }}
        ref={(r) => {
          if (r) {
            mapRef.current = r;
            if (onMapReady) onMapReady(r.getMap());
          }
        }}
        attributionControl={false}
      >
        {children}
      </Map>
    </div>
  );
};

export default memo(MapBase);
