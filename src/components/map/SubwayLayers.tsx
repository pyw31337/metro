"use client";

import { Source, Layer } from "react-map-gl/maplibre";
import { memo } from "react";

interface SubwayLayersProps {
  subwayData: { lines: any; stations: any };
  activeTab: string;
  isDarkMode: boolean;
  pathResult: any;
  focusedLine: string | null;
  selectedStationName?: string | null;
}

const SubwayLayers = ({
  subwayData,
  activeTab,
  isDarkMode,
  pathResult,
  focusedLine,
  selectedStationName = null,
}: SubwayLayersProps) => {
  // visibility는 return null 대신 사용 — 제거 시 레이어 스택 순서가 깨짐
  const isActive = activeTab === "subway" || activeTab === "subway+bus";
  const vis: "visible" | "none" = isActive ? "visible" : "none";

  // ── 비경로 gray: 이전보다 훨씬 옅게 ──────────────────────────────────────
  const GRAY_LINE    = isDarkMode ? "#2C3E50" : "#D8D8D8";
  const GRAY_STATION = isDarkMode ? "#2C3E50" : "#DADADA";
  const GRAY_TEXT    = isDarkMode ? "#44556A" : "#C0C0C0";

  // 경로에 사용된 노선 이름 목록 (중복 제거)
  const routeLineNames: string[] = pathResult?.segments
    ? [...new Set<string>(pathResult.segments.map((s: any) => s.line))]
    : [];

  const hasRoute = !!(pathResult?.path?.length);

  // ── 노선 선 색 ────────────────────────────────────────────────────────────
  let lineColorExpr: any;
  if (hasRoute) {
    lineColorExpr = routeLineNames.length > 0
      ? ["case", ["in", ["get", "name"], ["literal", routeLineNames]], ["get", "color"], GRAY_LINE]
      : GRAY_LINE;
  } else if (focusedLine) {
    lineColorExpr = ["case", ["==", ["get", "name"], focusedLine], ["get", "color"], GRAY_LINE];
  } else {
    lineColorExpr = ["get", "color"];
  }

  // 노선 두께: 경로 검색 중엔 1.5px (RouteLayers가 굵은 경로선을 위에 그림), 일반엔 줌 기반
  const lineWidth: any = hasRoute ? 1.5 : ["interpolate", ["linear"], ["zoom"], 9, 1.5, 12, 2.5, 14, 4, 16, 5];

  // ── 역 점 테두리 색 ───────────────────────────────────────────────────────
  let stationStrokeColor: any;
  if (hasRoute) {
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

  // ── 역명 라벨 색 ─────────────────────────────────────────────────────────
  // 경로 검색 중: 경로 노선 역사명 → 해당 노선 첫 번째 색, 나머지 → gray
  let textColor: any;
  if (hasRoute) {
    if (routeLineNames.length > 0) {
      // 역의 lines 배열과 경로 노선 이름 교집합이 있으면 → 해당 노선 native color
      // MapLibre 표현식에서 배열 교집합이 어려우므로, 경로 노선별 조건을 중첩 case로 빌드
      // 최대 경로 노선 수가 적으므로 (보통 2~3개) 중첩 case 사용
      let expr: any = GRAY_TEXT;
      for (const lineName of [...routeLineNames].reverse()) {
        // lineColors는 역 feature에 저장된 순서대로라 라인 이름과 인덱스가 다를 수 있음.
        // 안전하게: 해당 노선이 역의 lines 배열에 있으면 첫번째 lineColors를 쓰는 대신,
        // 경로 노선이면 isDarkMode 기준 흰/검 텍스트 + 나중에 halo로 구분되게 함.
        // (lineColors 인덱스 맞추기는 GeoJSON 빌드 단계에서 라인마다 반복 추가하므로
        //  첫 번째 색이 첫 등록 노선 색 → 경로 노선이 이미 알고 있으므로 그 색을 직접 사용)
        expr = ["case",
          ["in", ["literal", lineName], ["get", "lines"]],
          isDarkMode ? "#ffffff" : "#222222",
          expr
        ];
      }
      textColor = expr;
    } else {
      textColor = GRAY_TEXT;
    }
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
        {/* 넓은 히트 영역 — line-opacity:0 은 GPU compositing 없이 그냥 픽셀 무시 */}
        <Layer
          id="subway-line-interaction"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round", "visibility": vis }}
          paint={{ "line-width": 25, "line-opacity": 0 }}
        />

        {/* 노선 선 */}
        <Layer
          id="subway-line-layer"
          type="line"
          layout={{ "line-join": "round", "line-cap": "round", "visibility": vis }}
          paint={{ "line-color": lineColorExpr, "line-width": lineWidth }}
        />
      </Source>

      <Source id="subway-stations" type="geojson" data={subwayData.stations}>
        {/* 선택된 역 강조 링 (바탕 레이어) */}
        <Layer
          id="subway-station-selected-ring"
          type="circle"
          filter={['==', ['get', 'name'], selectedStationName ?? '']}
          layout={{ "visibility": vis }}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 12, 10, 14, 16, 16, 20],
            "circle-color": "transparent",
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 3.5],
            "circle-stroke-color": ["get", ["at", 0, ["get", "lineColors"]]],
            "circle-opacity": 0,
            "circle-stroke-opacity": 0.5,
          }}
        />

        {/* 역 점 */}
        <Layer
          id="subway-station-circle"
          type="circle"
          layout={{ "visibility": vis }}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 12, 4, 14, 7, 16, 9],
            "circle-color": "white",
            "circle-stroke-width": [
              "case",
              ["==", ["get", "name"], selectedStationName ?? ''],
              ["interpolate", ["linear"], ["zoom"], 12, 3, 14, 4.5, 16, 5.5],
              ["interpolate", ["linear"], ["zoom"], 12, 1.5, 14, 2.5, 16, 3],
            ],
            "circle-stroke-color": stationStrokeColor,
          }}
        />

        {/* 역명 라벨 (zoom 12부터) */}
        <Layer
          id="subway-station-label"
          type="symbol"
          minzoom={12}
          layout={{
            "visibility": vis,
            "text-field": ["get", "name"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 14, 13, 16, 15],
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "symbol-sort-key": 1,
          }}
          paint={{
            "text-color": textColor,
            "text-halo-color": isDarkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)",
            "text-halo-width": 1.5,
          }}
        />
      </Source>
    </>
  );
};

export default memo(SubwayLayers);
