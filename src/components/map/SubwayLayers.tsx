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

  // ── 비경로 gray ───────────────────────────────────────────────────────────
  const GRAY_LINE    = isDarkMode ? "#2C3E50" : "#D0D0D0";
  const GRAY_STATION = isDarkMode ? "#3A4A5C" : "#CACACA";
  const GRAY_TEXT    = isDarkMode ? "#44556A" : "#C0C0C0";

  // 경로에 사용된 노선 이름 목록 (중복 제거)
  const routeLineNames: string[] = pathResult?.segments
    ? [...new Set<string>(pathResult.segments.map((s: any) => s.line))]
    : [];

  const hasRoute = !!(pathResult?.path?.length);

  // ── 노선 선 색 ────────────────────────────────────────────────────────────
  let lineColorExpr: any;
  if (hasRoute) {
    // 경로 노선: 원래 색상 유지, 나머지: 회색
    lineColorExpr = routeLineNames.length > 0
      ? ["case", ["in", ["get", "name"], ["literal", routeLineNames]], ["get", "color"], GRAY_LINE]
      : GRAY_LINE;
  } else if (focusedLine) {
    lineColorExpr = ["case", ["==", ["get", "name"], focusedLine], ["get", "color"], GRAY_LINE];
  } else {
    lineColorExpr = ["get", "color"];
  }

  // 노선 두께:
  //  - 경로 검색 중: 경로 노선 2px, 비경로 1px (RouteLayers가 굵은 경로선을 추가로 위에 그림)
  //  - 일반: 줌 기반 2-5px
  const lineWidth: any = hasRoute
    ? (routeLineNames.length > 0
        ? ["case", ["in", ["get", "name"], ["literal", routeLineNames]], 2, 1]
        : 1)
    : ["interpolate", ["linear"], ["zoom"], 9, 1.5, 11, 2, 13, 3, 15, 5];

  // 환승역 여부: lines 배열 길이로 판단 (MapLibre 표현식)
  const isTransfer: any = [">=", ["length", ["get", "lines"]], 2];

  // ── 역 점 스타일 ──────────────────────────────────────────────────────────
  // "color" 프로퍼티를 직접 참조 (lineColors 배열 접근보다 안정적)
  const stationLineColor: any = ["get", "color"];

  // 역 점 반지름: 선택 링의 60% (선택 링은 원본의 50% → 역 점은 원본 선택 링의 30%)
  // 환승역은 0.5px 크게
  const baseRadius: any = [
    "interpolate", ["linear"], ["zoom"],
    7,  ["case", isTransfer, 2.5, 2.0],
    9,  ["case", isTransfer, 3.0, 2.5],
    11, ["case", isTransfer, 4.0, 3.3],
    13, ["case", isTransfer, 5.0, 4.5],
    15, ["case", isTransfer, 6.5, 5.7],
  ];

  // 역 점: 노선색 채움 + 흰 stroke → 밝은/어두운 배경 모두에서 명확히 보임
  // 회색 처리: 경로/포커스 모드에서 비활성 역은 회색
  let stationFillColor: any = stationLineColor;  // 기본: 노선색 채움
  let stationStrokeColor: any = "#ffffff";       // 기본: 흰 테두리
  if (hasRoute) {
    if (routeLineNames.length > 0) {
      const onRoute: any = routeLineNames.reduce((acc: any, ln: string) =>
        ["case", ["in", ["literal", ln], ["get", "lines"]], true, acc], false);
      stationFillColor  = ["case", onRoute, stationLineColor, GRAY_STATION];
      stationStrokeColor = ["case", onRoute, "#ffffff",        GRAY_STATION];
    } else {
      stationFillColor  = GRAY_STATION;
      stationStrokeColor = GRAY_STATION;
    }
  } else if (focusedLine) {
    const onFocus: any = ["in", ["literal", focusedLine], ["get", "lines"]];
    stationFillColor  = ["case", onFocus, stationLineColor, GRAY_STATION];
    stationStrokeColor = ["case", onFocus, "#ffffff",        GRAY_STATION];
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
        {/* 투명 히트 영역 */}
        <Layer
          id="subway-station-hit"
          type="circle"
          layout={{ "visibility": vis }}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 12, 12, 16, 15, 20],
            "circle-color": "transparent",
            "circle-opacity": 0,
          }}
        />

        {/* 선택된 역 강조 링 (원본의 50%) */}
        <Layer
          id="subway-station-selected-ring"
          type="circle"
          filter={['==', ['get', 'name'], selectedStationName ?? '']}
          layout={{ "visibility": vis }}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4.5, 11, 5.5, 13, 7.5, 15, 9.5],
            "circle-color": isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.9)",
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 13, 1.5],
            "circle-stroke-color": stationLineColor,
            "circle-opacity": 1,
            "circle-stroke-opacity": 1,
          }}
        />

        {/* 역 점 — 노선색 채움 + 흰 테두리 (환승역은 조금 크게) */}
        <Layer
          id="subway-station-circle"
          type="circle"
          layout={{ "visibility": vis }}
          paint={{
            "circle-radius": baseRadius,
            "circle-color": ["coalesce", stationFillColor, "#888888"],
            "circle-opacity": 1,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": stationStrokeColor,
            "circle-stroke-opacity": 1,
          }}
        />

        {/* 역명 라벨 — zoom 9부터, 충돌 시 환승역 우선 */}
        <Layer
          id="subway-station-label"
          type="symbol"
          minzoom={9}
          layout={{
            "visibility": vis,
            "text-field": ["get", "name"],
            "text-size": ["interpolate", ["linear"], ["zoom"],
              9,  ["case", isTransfer, 9, 0],
              10, ["case", isTransfer, 10, 8],
              12, 10,
              14, 12,
              16, 14,
            ],
            "text-offset": [0, 1.2],
            "text-anchor": "top",
            "text-padding": 2,
            // 환승역(lines≥2)이 낮은 sort-key → 충돌 시 우선 표시
            "symbol-sort-key": ["*", -1, ["length", ["get", "lines"]]],
          }}
          paint={{
            "text-color": textColor,
            "text-halo-color": isDarkMode ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.95)",
            "text-halo-width": 2,
          }}
        />
      </Source>
    </>
  );
};

export default memo(SubwayLayers);
