"use client";

import { useState, useRef, memo } from "react";
import Map, { MapRef, ScaleControl } from "react-map-gl/maplibre";
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

// 서울역 기준 zoom 15 ≈ 1km 뷰 (초기 위치 — GPS 수신 시 flyTo로 덮어씀)
const SEOUL_STATION = { longitude: 126.9706, latitude: 37.5549, zoom: 15 };

const MapBase = ({
  isDarkMode,
  children,
  onCenterChange,
  onBoundsChange,
  onMapReady,
  onClick,
  onHover,
  interactiveLayerIds,
  initialViewState = SEOUL_STATION
}: MapBaseProps) => {
  const mapRef = useRef<MapRef | null>(null);
  const [cursor, setCursor] = useState<string>("auto");
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className="absolute inset-0 w-full h-full z-0 bg-zinc-100 dark:bg-black">
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

          // Debounce center change — only WeatherPopup uses this, no need for 60fps
          if (onCenterChange) {
            if (centerTimerRef.current) clearTimeout(centerTimerRef.current);
            centerTimerRef.current = setTimeout(() => onCenterChange(latitude, longitude), 200);
          }

          // Debounce bounds change — DB query doesn't need to run at 60fps
          if (onBoundsChange && mapRef.current) {
            if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
            boundsTimerRef.current = setTimeout(() => {
              if (!mapRef.current) return;
              const b = mapRef.current.getBounds();
              onBoundsChange({
                  minLat: b.getSouth(),
                  minLng: b.getWest(),
                  maxLat: b.getNorth(),
                  maxLng: b.getEast()
              });
            }, 300);
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
        <ScaleControl maxWidth={80} unit="metric" position="bottom-left" />
        {children}
      </Map>

    </div>
  );
};

export default memo(MapBase);
