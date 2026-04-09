"use client";

import { Source, Layer, useMap } from "react-map-gl/maplibre";
import { memo, useState, useEffect, useRef, useCallback } from "react";
import { transitRealtimeService, RealtimeUnit } from '@/services/TransitRealtimeService';

interface TransitRealtimeLayersProps {
  activeTab: string;
  activeLine?: string | null;
}

const TransitRealtimeLayers = ({ activeTab, activeLine }: TransitRealtimeLayersProps) => {
  const { current: mapRef } = useMap();
  const map = mapRef?.getMap();

  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: []
  });
  const [isSimulated, setIsSimulated] = useState(false);

  // 클릭으로 선택된 열차 ID (toggle)
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);

  // 선택된 열차의 팝업 정보
  const [selectedTrainInfo, setSelectedTrainInfo] = useState<{
    label: string;
    lineName: string;
    pos: [number, number];
  } | null>(null);

  useEffect(() => {
    if (!map) return;

    const handleUpdate = (units: RealtimeUnit[]) => {
      const hasSim = units.some(u => u.id.includes('sim'));
      setIsSimulated(hasSim);

      const features: any[] = units.map(unit => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: unit.pos
        },
        properties: {
          id: unit.id,
          type: unit.type,
          label: unit.label,
          lineName: unit.lineName,
          lineColor: unit.lineColor,
          bearing: unit.bearing
        }
      }));

      // 직접 source 업데이트 (60fps 유지)
      const source: any = map.getSource('transit-realtime-source');
      if (source) {
        source.setData({ type: "FeatureCollection", features });
      } else {
        setGeoData({ type: "FeatureCollection", features });
      }
    };

    transitRealtimeService.on('update', handleUpdate);
    transitRealtimeService.start();

    return () => {
      transitRealtimeService.off('update', handleUpdate);
    };
  }, [map]);

  // 열차 클릭 핸들러
  useEffect(() => {
    if (!map) return;

    const handleTrainClick = (e: any) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const props = feature.properties;
      const clickedId = props.id;
      const pos = feature.geometry.coordinates as [number, number];

      if (selectedTrainId === clickedId) {
        // 같은 열차 다시 클릭 → 해제
        setSelectedTrainId(null);
        setSelectedTrainInfo(null);
      } else {
        setSelectedTrainId(clickedId);
        setSelectedTrainInfo({
          label: props.label,
          lineName: props.lineName,
          pos,
        });
      }
      e.preventDefault?.();
    };

    // 지도 다른 곳 클릭 → 선택 해제
    const handleMapClick = (e: any) => {
      // subway-realtime-layer 위에서 클릭하지 않은 경우
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['subway-realtime-layer']
      });
      if (features.length === 0) {
        setSelectedTrainId(null);
        setSelectedTrainInfo(null);
      }
    };

    map.on('click', 'subway-realtime-layer', handleTrainClick);
    map.on('click', handleMapClick);

    // 커서 변경
    map.on('mouseenter', 'subway-realtime-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'subway-realtime-layer', () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      map.off('click', 'subway-realtime-layer', handleTrainClick);
      map.off('click', handleMapClick);
    };
  }, [map, selectedTrainId]);

  // 선택된 열차의 label 레이어 필터 업데이트
  useEffect(() => {
    if (!map) return;
    try {
      if (selectedTrainId) {
        map.setFilter('subway-selected-label-layer', ['==', ['get', 'id'], selectedTrainId]);
      } else {
        // 아무것도 선택 안됨 → 아무것도 안 보임
        map.setFilter('subway-selected-label-layer', ['==', ['get', 'id'], '']);
      }
    } catch (e) {}
  }, [map, selectedTrainId]);

  const isVisible = activeTab === "subway" || activeTab === "bus" || activeTab === "subway+bus";
  if (!isVisible) return null;

  const lineColor = selectedTrainInfo 
    ? `#${geoData.features.find(f => (f as any).properties.id === selectedTrainId)?.properties?.lineColor || '3b82f6'}`
    : '#3b82f6';

  return (
    <>
      <Source id="transit-realtime-source" type="geojson" data={geoData}>
        {/* 열차 아이콘 (텍스트 없음) */}
        <Layer
          id="subway-realtime-layer"
          type="symbol"
          filter={["==", ["get", "type"], "subway"]}
          layout={{
            "icon-image": ["concat", "train-card-", ["get", "lineColor"]],
            "icon-size": [
              "interpolate", ["linear"], ["zoom"],
              10, 0.12,
              14, 0.25,
              18, 0.5
            ],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            // 텍스트 제거 — 아이콘만 표시
          }}
          paint={{
            "icon-opacity": activeLine
              ? ["case", ["==", ["get", "lineName"], activeLine], 1.0, 0.2]
              : 1.0,
          }}
        />

        {/* 선택된 열차의 레이블 (클릭 시만 표시) */}
        <Layer
          id="subway-selected-label-layer"
          type="symbol"
          filter={["==", ["get", "id"], ""]}  // 초기: 아무것도 선택 안됨
          layout={{
            "text-field": ["get", "label"],
            "text-font": ["Open Sans Bold"],
            "text-size": 11,
            "text-offset": [0, 1.8],
            "text-anchor": "top",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          }}
          paint={{
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 2,
          }}
        />

        {/* 버스 */}
        <Layer
          id="bus-realtime-layer"
          type="symbol"
          filter={["==", ["get", "type"], "bus"]}
          layout={{
            "icon-image": "rocket",
            "icon-rotate": ["get", "bearing"],
            "icon-rotation-alignment": "map",
            "icon-size": [
              "interpolate", ["linear"], ["zoom"],
              10, 0.1,
              14, 0.2,
              18, 0.4
            ],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          }}
          paint={{}}
        />
      </Source>

      {/* 시뮬레이션 배너 */}
      {isSimulated && (
        <div className="absolute top-20 right-4 bg-yellow-500/90 text-black px-3 py-1 rounded-full text-xs font-bold shadow-lg animate-pulse z-[9999]">
          ⚠️ 시뮬레이션 모드 (API 점검 중)
        </div>
      )}

      {/* 선택된 열차 상세 토스트 팝업 */}
      {selectedTrainInfo && (
        <div
          className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto"
          style={{ minWidth: 180 }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-2xl shadow-xl text-white text-sm font-semibold"
            style={{
              background: 'rgba(20,20,30,0.92)',
              border: `2px solid #${geoData.features.find(f => (f as any).properties.id === selectedTrainId)?.properties?.lineColor || '3b82f6'}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{
                background: `#${geoData.features.find(f => (f as any).properties.id === selectedTrainId)?.properties?.lineColor || '3b82f6'}`
              }}
            />
            <span>{selectedTrainInfo.lineName}</span>
            <span className="opacity-50">|</span>
            <span>{selectedTrainInfo.label}</span>
            <button
              onClick={() => { setSelectedTrainId(null); setSelectedTrainInfo(null); }}
              className="ml-2 opacity-60 hover:opacity-100 text-base leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default memo(TransitRealtimeLayers);
