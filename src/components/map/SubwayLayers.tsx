"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

interface SubwayLayersProps {
  subwayData: { lines: any; stations: any };
  activeTab: string;
  isDarkMode: boolean;
  pathResult: any;
  focusedLine: string | null;
}

const SubwayLayers = ({
  subwayData,
  activeTab,
  isDarkMode,
  pathResult,
  focusedLine
}: SubwayLayersProps) => {
  if (activeTab !== "subway" && activeTab !== "subway+bus") return null;

  // Optimized light gray colors for fading
  const FADED_COLOR = isDarkMode ? "#34495E" : "#BDBDBD";
  const FADED_TEXT = isDarkMode ? "#555555" : "#AAAAAA";

  const isStationInPath = pathResult?.path
    ? ["in", ["get", "name"], ["literal", pathResult.path]]
    : true;

  // Logic: prominent if on the focused line or in the active path.
  const isProminentStation: any = focusedLine
    ? ["in", ["literal", focusedLine], ["get", "lines"]]
    : pathResult?.path
    ? isStationInPath
    : true;

  return (
    <>
      <Source id="subway-lines" type="geojson" data={subwayData.lines}>
        {/* Hidden interaction layer with wider selection range */}
        <Layer
          id="subway-line-interaction"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{
            "line-width": 25,
            "line-opacity": 0
          }}
        />
        <Layer
          id="subway-line-layer"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{
            "line-color": focusedLine
              ? ["case", ["==", ["get", "name"], focusedLine], ["get", "color"], FADED_COLOR]
              : pathResult?.path
              ? FADED_COLOR
              : ["get", "color"],
            "line-width": 4,
            "line-opacity": focusedLine
              ? ["case", ["==", ["get", "name"], focusedLine], 1.0, 0.1]
              : pathResult?.path
              ? 0.15
              : 0.8
          }}
        />
        {/* Active Route Highlight Layer */}
        {pathResult?.path && (
          <Layer
            id="subway-active-route-layer"
            type="line"
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{
              "line-color": isDarkMode ? "#3498DB" : "#2980B9",
              "line-width": 6,
              "line-opacity": 1.0,
              "line-blur": 1
            }}
            filter={["all", 
                ["in", ["get", "name"], ["literal", pathResult.path]],
                ["in", ["get", "id"], ["literal", pathResult.linePath || []]]
            ]}
          />
        )}
      </Source>

      <Source id="subway-stations" type="geojson" data={subwayData.stations}>
        <Layer
          id="subway-station-circle"
          type="circle"
          paint={{
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              10, 2,
              12, 4,
              14, 7,
              16, 9
            ],
            "circle-color": "white",
            "circle-stroke-width": [
              "interpolate", ["linear"], ["zoom"],
              12, 1.5,
              14, 2.5,
              16, 3
            ],
            "circle-stroke-color": ["case",
                isProminentStation, ["get", ["at", 0, ["get", "lineColors"]]],
                FADED_COLOR
            ],
            "circle-opacity": pathResult?.path 
                ? ["case", isStationInPath, 1.0, 0.15]
                : focusedLine 
                ? ["case", isProminentStation, 1.0, 0.2]
                : 1,
            "circle-stroke-opacity": pathResult?.path 
                ? ["case", isStationInPath, 1.0, 0.15]
                : focusedLine 
                ? ["case", isProminentStation, 1.0, 0.2]
                : 1
          }}
        />
        <Layer
          id="subway-station-label"
          type="symbol"
          layout={{
            "text-field": ["get", "name"],
            "text-size": [
              "interpolate", ["linear"], ["zoom"],
              12, 10,
              14, 13,
              16, 15
            ],
            "text-offset": [0, 1.4],
            "text-anchor": "top"
          }}
          paint={{
            "text-color": ["case",
                isProminentStation, (isDarkMode ? "#ffffff" : "#000000"),
                FADED_TEXT
            ],
            "text-halo-color": isDarkMode ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)",
            "text-halo-width": 1.5,
            "text-opacity": pathResult?.path 
                ? ["case", isStationInPath, 1.0, 0.1]
                : focusedLine 
                ? ["case", isProminentStation, 1.0, 0.2]
                : 1
          }}
        />
      </Source>
    </>
  );
};

export default memo(SubwayLayers);
