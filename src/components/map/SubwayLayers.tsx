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
  // visibility는 return null 대신 사용 — 제거 시 레이어 스택 순서가 깨짐
  const isActive = activeTab === "subway" || activeTab === "subway+bus";
  const vis: "visible" | "none" = isActive ? "visible" : "none";

  // Flat gray — opacity 없는 단색. 다크/라이트 분리
  const GRAY_LINE    = isDarkMode ? "#34495E" : "#BDBDBD";
  const GRAY_STATION = isDarkMode ? "#3D4D5E" : "#BBBBBB";
  const GRAY_TEXT    = isDarkMode ? "#555555" : "#AAAAAA";

  // 경로에 사용된 노선 이름 목록 (중복 제거)
  const routeLineNames: string[] = pathResult?.segments
    ? [...new Set<string>(pathResult.segments.map((s: any) => s.line))]
    : [];

  const hasRoute = !!(pathResult?.path?.length);

  // ── 노선 색 표현식 ──────────────────────────────────────────────────────────
  // 경로 검색 중: 경로 노선 → native color, 나머지 → flat gray
  // 특정 노선 포커스: 해당 노선 → native color, 나머지 → flat gray
  // 기본: 모든 노선 native color
  let lineColorExpr: any;
  if (hasRoute) {
    lineColorExpr = routeLineNames.length > 0
      ? ["case",
          ["in", ["get", "name"], ["literal", routeLineNames]],
          ["get", "color"],
          GRAY_LINE
        ]
      : GRAY_LINE;
  } else if (focusedLine) {
    lineColorExpr = ["case",
      ["==", ["get", "name"], focusedLine],
      ["get", "color"],
      GRAY_LINE
    ];
  } else {
    lineColorExpr = ["get", "color"];
  }

  // 노선 두께: 경로 검색 중엔 1.5px 얇게 (RouteLayers가 굵은 경로 선을 위에 그림)
  const lineWidth: number = hasRoute ? 1.5 : 4;

  // ── 역 점 색 표현식 ─────────────────────────────────────────────────────────
  let stationStrokeColor: any;
  if (hasRoute) {
    // 경로 검색 중: 모든 역 점을 flat gray로. RouteLayers가 경로 역만 별도 표시
    stationStrokeColor = GRAY_STATION;
  } else if (focusedLine) {
    stationStrokeColor = ["case",
      ["in", ["literal", focusedLine], ["get", "lines"]],
      ["get", ["at", 0, ["get", "lineColors"]]],
      GRAY_STATION
    ];
  } else {
    stationStrokeColor = ["get", ["at", 0, ["get", "lineColors"]]];
  }

  // ── 역명 라벨 색 표현식 ────────────────────────────────────────────────────
  let textColor: any;
  if (hasRoute) {
    textColor = GRAY_TEXT;
  } else if (focusedLine) {
    textColor = ["case",
      ["in", ["literal", focusedLine], ["get", "lines"]],
      isDarkMode ? "#ffffff" : "#222222",
      GRAY_TEXT
    ];
  } else {
    textColor = isDarkMode ? "#ffffff" : "#222222";
  }

  return (
    <>
      <Source id="subway-lines" type="geojson" data={subwayData.lines}>
        {/* 넓은 히트 영역 (불투명도 0 = GPU compositing 없음, 단순 픽셀 무시) */}
        <Layer
          id="subway-line-interaction"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round", "visibility": vis }}
          paint={{
            "line-width": 25,
            "line-opacity": 0
          }}
        />

        {/* 노선 선 — opacity 표현식 완전 제거, flat color만 사용 */}
        <Layer
          id="subway-line-layer"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round", "visibility": vis }}
          paint={{
            "line-color": lineColorExpr,
            "line-width": lineWidth,
          }}
        />
      </Source>

      <Source id="subway-stations" type="geojson" data={subwayData.stations}>
        {/* 역 점 — circle-opacity/stroke-opacity 표현식 완전 제거 */}
        <Layer
          id="subway-station-circle"
          type="circle"
          layout={{ "visibility": vis }}
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
            "circle-stroke-color": stationStrokeColor,
          }}
        />

        {/* 역명 라벨 — text-opacity 표현식 제거 */}
        <Layer
          id="subway-station-label"
          type="symbol"
          layout={{
            "visibility": vis,
            "text-field": ["get", "name"],
            "text-size": [
              "interpolate", ["linear"], ["zoom"],
              12, 10,
              14, 13,
              16, 15
            ],
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "symbol-sort-key": 1,
          }}
          paint={{
            "text-color": textColor,
            "text-halo-color": isDarkMode ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)",
            "text-halo-width": 1.5,
          }}
        />
      </Source>
    </>
  );
};

export default memo(SubwayLayers);
