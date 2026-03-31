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

  // Logic: prominent if (on focused line) OR (is a transfer station)
  const isProminentStation: any = focusedLine 
    ? ["any", 
        ["in", ["literal", focusedLine], ["get", "lines"]], 
        [">", ["length", ["get", "lines"]], 1]
      ]
    : true;

  return (
    <>
      <Source id="subway-lines" type="geojson" data={subwayData.lines}>
        <Layer
          id="subway-line-layer"
          type="line"
          beforeId="subway-station-circle"
          layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{
            "line-color": pathResult
              ? (isDarkMode ? "#333333" : "#cccccc")
              : focusedLine
              ? ["case", ["==", ["get", "name"], focusedLine], ["get", "color"], FADED_COLOR]
              : ["get", "color"],
            "line-width": 4,
            "line-opacity": pathResult
              ? 0.4
              : focusedLine
              ? ["case", ["==", ["get", "name"], focusedLine], 1.0, 0.3]
              : 0.8
          }}
        />
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
            "circle-opacity": pathResult 
                ? 0.3 
                : focusedLine 
                ? ["case", isProminentStation, 1.0, 0.2]
                : 1,
            "circle-stroke-opacity": pathResult 
                ? 0.3 
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
            "text-opacity": pathResult 
                ? 0.3 
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
