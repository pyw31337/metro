"use client";

import { useState, useRef, memo } from "react";
import Map, { MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

// zoom 레벨 → 대략적인 1px당 실제 거리(m) 계산 (위도 37.5 서울 기준)
// 공식: 156543.03 * cos(lat_rad) / 2^zoom
function zoomToMetersPerPx(zoom: number): number {
  return (156543.03 * Math.cos(37.5 * Math.PI / 180)) / Math.pow(2, zoom);
}

// 스케일바 우측 숫자를 "보기 좋은 값"으로 반올림
function niceDistance(meters: number): { value: number; label: string } {
  const candidates = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const target = meters * 80; // 80px 너비 기준 실제 거리
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c - target) < Math.abs(best - target)) best = c;
  }
  return best >= 1000
    ? { value: best, label: `${best / 1000}km` }
    : { value: best, label: `${best}m` };
}

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
  const [zoom, setZoom] = useState<number>(12);
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
          const { latitude, longitude, zoom: z } = e.viewState;
          setZoom(z);

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
        {children}
      </Map>

      {/* DEV: 스케일 배지 — 개발 확인 후 제거 */}
      {(() => {
        const mpp = zoomToMetersPerPx(zoom);
        const { value, label } = niceDistance(mpp);
        const barPx = Math.round(value / mpp);
        return (
          <div className="absolute bottom-6 left-3 z-[9000] flex flex-col items-start gap-0.5 pointer-events-none select-none">
            <span className="text-[9px] font-mono font-bold text-black/50 dark:text-white/40 leading-none">
              z{zoom.toFixed(1)}
            </span>
            <div className="flex flex-col items-start">
              <div
                className="h-[3px] bg-black/50 dark:bg-white/50 rounded-full"
                style={{ width: barPx }}
              />
              <span className="text-[10px] font-bold font-mono text-black/60 dark:text-white/50 leading-tight mt-0.5">
                {label}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default memo(MapBase);
