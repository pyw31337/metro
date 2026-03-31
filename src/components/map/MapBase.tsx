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
        onMouseEnter={onHover}
        onMouseLeave={() => setCursor("auto")}
        onMove={(e) => {
          const { latitude, longitude } = e.viewState;
          if (onCenterChange) onCenterChange(latitude, longitude);
        }}
        ref={(r) => {
          if (r) {
            mapRef.current = r;
            if (onMapReady) onMapReady(r.getMap());
          }
        }}
      >
        {children}
        <NavigationControl position="bottom-right" />
      </Map>
    </div>
  );
};

export default memo(MapBase);
