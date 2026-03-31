"use client";

import { Source, Layer, Marker } from "react-map-gl/maplibre";
import { Flag } from "lucide-react";
import { memo } from "react";

interface RouteLayersProps {
  activeTab: string;
  pathLineData: any;
  routeStationData: any;
  showAllRouteBubbles: boolean;
  focusedBubble: string | null;
  setFocusedBubble: (name: string | null) => void;
  timeDisplayMode: "duration" | "arrival";
  onToggleTimeDisplay?: () => void;
  verifiedPlats: Record<string, string>;
}

const RouteLayers = ({
  activeTab,
  pathLineData,
  routeStationData,
  showAllRouteBubbles,
  focusedBubble,
  setFocusedBubble,
  timeDisplayMode,
  onToggleTimeDisplay,
  verifiedPlats
}: RouteLayersProps) => {
  if (activeTab !== "subway" && activeTab !== "subway+bus") return null;

  return (
    <>
      {/* Path Line Layer */}
      {pathLineData.features.length > 0 && (
        <Source id="path-result" type="geojson" data={pathLineData}>
          <Layer
            id="path-line-solid"
            type="line"
            beforeId="subway-station-circle"
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{
              "line-color": ["get", "color"],
              "line-width": 6,
              "line-opacity": 1
            }}
          />
        </Source>
      )}

      {/* Route Station Highlights */}
      {routeStationData.features.length > 0 && (
        <Source id="route-highlight-source" type="geojson" data={routeStationData}>
          <Layer
            id="route-station-circle-highlight"
            type="circle"
            paint={{
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                12, 5,
                14, 8,
                16, 11
              ],
              "circle-color": "white",
              "circle-stroke-width": 4,
              "circle-stroke-color": ["get", "routeColor"],
              "circle-opacity": 1,
              "circle-stroke-opacity": 1
            }}
          />
        </Source>
      )}

      {/* Info Bubbles (Markers) */}
      {routeStationData.features.map((f: any, i: number) => {
        const { name, arrivalTime, arrivalTimeWeight, platformInfo, routeColor } = f.properties;
        const [lng, lat] = f.geometry.coordinates;
        const isFocused = focusedBubble === name;
        const isLast = i === routeStationData.features.length - 1;
        
        const isEndpoint = i === 0 || isLast;
        const isTransfer = !!platformInfo;
        const shouldShow = showAllRouteBubbles || isEndpoint || isTransfer;

        if (!shouldShow) return null;
        
        return (
          <Marker 
            key={`info-${i}`} 
            longitude={lng} 
            latitude={lat} 
            anchor="top" 
            offset={[0, 15]}
            style={{ zIndex: isFocused ? 5000 : 2000 }}
          >
            <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setFocusedBubble(name);
                  onToggleTimeDisplay?.();
                }}
                className={`flex flex-col gap-0.5 p-1 px-2.5 rounded-xl bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md border border-white/20 shadow-lg transition-all active:scale-95 w-fit items-center justify-center ${isFocused ? 'scale-[1.1] shadow-2xl border-blue-500 bg-white/95 dark:bg-zinc-800' : ''}`}
            >
              <div className="flex items-center gap-1">
                {isLast && <Flag size={10} className="text-rose-500 fill-rose-500" />}
                <span 
                    className="text-[10px] font-black leading-tight text-center"
                    style={{ color: routeColor }}
                >
                  {name}
                </span>
              </div>
              
              <span className="text-[11px] font-black text-zinc-900 dark:text-white leading-tight">
                {timeDisplayMode === "duration" 
                    ? `${Math.round(arrivalTimeWeight || 0)}분` 
                    : (arrivalTime || "")
                }
              </span>

              {platformInfo && (
                <div className="flex items-center gap-1 justify-center mt-0.5">
                  <div className={`w-1 h-1 rounded-full ${!verifiedPlats[`${name}-${f.properties.fromLine}-${f.properties.toLine}`] ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`} />
                  <span className="text-[8.5px] font-black text-blue-500 dark:text-blue-400 whitespace-nowrap leading-tight">
                    {(() => {
                        const key = `${name}-${f.properties.fromLine}-${f.properties.toLine}`;
                        const plat = verifiedPlats[key];
                        if (plat && plat !== "정보없음") return `환승 ${plat}`;
                        if (plat === "정보없음") return "정보 없음";
                        return ""; // Hide "Checking..." status per user request
                    })()}
                  </span>
                </div>
              )}
            </button>
          </Marker>
        );
      })}
    </>
  );
};

export default memo(RouteLayers);
