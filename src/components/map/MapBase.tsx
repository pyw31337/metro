"use client";

import { useState, useRef, memo, useEffect } from "react";
import Map, { MapRef, ScaleControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CARTO_VOYAGER = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

export interface LongPressEvent {
  lngLat: [number, number];
  point: { x: number; y: number };
}

interface MapBaseProps {
  isDarkMode: boolean;
  children: React.ReactNode;
  onCenterChange?: (lat: number, lng: number) => void;
  onBoundsChange?: (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => void;
  onMapReady?: (map: any) => void;
  onClick?: (e: any) => void;
  onHover?: (e: any) => void;
  onLongPress?: (e: LongPressEvent) => void;
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
  onLongPress,
  interactiveLayerIds,
  initialViewState = SEOUL_STATION
}: MapBaseProps) => {
  const mapRef = useRef<MapRef | null>(null);
  const [cursor, setCursor] = useState<string>("auto");
  const [mapLoaded, setMapLoaded] = useState(false);
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const onLongPressRef = useRef(onLongPress);
  useEffect(() => { onLongPressRef.current = onLongPress; }, [onLongPress]);

  // Wire touch events for long-press detection on the map canvas
  useEffect(() => {
    if (!mapLoaded) return;
    if (!onLongPressRef.current) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const canvas = map.getCanvas();

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      longPressRef.current = setTimeout(() => {
        if (!touchStartPos.current) return;
        const rect = canvas.getBoundingClientRect();
        const px = touchStartPos.current.x - rect.left;
        const py = touchStartPos.current.y - rect.top;
        const lngLat = map.unproject([px, py]);
        onLongPressRef.current?.({
          lngLat: [lngLat.lng, lngLat.lat],
          point: { x: touchStartPos.current.x, y: touchStartPos.current.y },
        });
      }, 600);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!longPressRef.current || !touchStartPos.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartPos.current.x;
      const dy = touch.clientY - touchStartPos.current.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
        touchStartPos.current = null;
      }
    };

    const handleTouchEnd = () => {
      if (longPressRef.current) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
      touchStartPos.current = null;
    };

    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd);
    canvas.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
    };
  // Re-run when map becomes ready; onLongPressRef tracks latest callback without re-subscribing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded]);

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
            setMapLoaded(true);
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
