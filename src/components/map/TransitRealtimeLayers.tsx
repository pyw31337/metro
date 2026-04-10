"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Source, Layer, useMap } from "react-map-gl/maplibre";
import { transitRealtimeService, RealtimeUnit, SimStatus } from '@/services/TransitRealtimeService';
import { PathResult } from "@/types/metro";
import { SUBWAY_LINES } from "@/data/subway-lines";

interface Props {
  activeTab: string;
  activeLine?: string | null;
  activePath?: PathResult | null;
}

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Module-level O(1) line lookup for filterByPath (called on every realtime tick)
const LINE_BY_NAME = new Map(SUBWAY_LINES.map(l => [l.name, l]));

// Pre-built station index maps for O(1) lookup in filterByPath
// Map<lineName, Map<stationName, index>>
const STATION_IDX: Map<string, Map<string, number>> = new Map(
  SUBWAY_LINES.map(l => [
    l.name,
    new Map(l.stations.map((s, i) => [s.name, i]))
  ])
);

const TransitRealtimeLayers = ({ activeTab, activeLine, activePath }: Props) => {
  const { current: mapRef } = useMap();
  const map = mapRef?.getMap();

  const [geoData, setGeoData]         = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
  const [simStatus, setSimStatus]     = useState<SimStatus>('starting');
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<{ label: string; lineName: string; lineColor: string } | null>(null);

  // ─── 레이어 z-order 보장: 열차·버블 레이어가 항상 노선/역사 레이어 위에 표시 ───
  // moveLayer(id) = 맨 위로 이동 (beforeId 없으면 스택 최상단)
  // 트리거: 스타일 로드 + React가 레이어를 추가한 직후(sourcedata) + 일정 주기
  useEffect(() => {
    if (!map) return;
    const TRAIN_LAYERS = ['transit-trains', 'transit-train-label', 'transit-buses'];
    const ensureOnTop = () => {
      try {
        TRAIN_LAYERS.forEach(id => {
          if (map.getLayer(id)) map.moveLayer(id);
        });
      } catch {}
    };
    if (map.isStyleLoaded()) ensureOnTop();
    map.on('style.load', ensureOnTop);
    // React가 새 레이어를 추가할 때 source 로드 완료 이벤트가 발생
    map.on('sourcedata', ensureOnTop);
    // 안전망: 2초마다 한 번씩 체크 (style 재로드 등 엣지케이스 대비)
    const interval = setInterval(ensureOnTop, 2000);
    return () => {
      map.off('style.load', ensureOnTop);
      map.off('sourcedata', ensureOnTop);
      clearInterval(interval);
    };
  }, [map]);

  // activePath를 ref로 유지해서 매 tick마다 클로저 최신값 참조
  const activePathRef = useRef(activePath);
  useEffect(() => { activePathRef.current = activePath; }, [activePath]);

  const activeLineRef = useRef(activeLine);
  useEffect(() => { activeLineRef.current = activeLine; }, [activeLine]);

  // ─── 실시간 업데이트 구독 ───
  useEffect(() => {
    if (!map) return;

    const handleUpdate = (units: RealtimeUnit[]) => {
      const ap = activePathRef.current;

      // 1. 경로 탐색 필터 (기존)
      let filtered: RealtimeUnit[] = ap?.segments?.length
        ? units.filter(u => filterByPath(u, ap))
        : units;

      // 2. 활성 노선 필터: activeLine 설정 시 해당 노선만 표시
      const al = activeLineRef.current;
      if (al) {
        filtered = filtered.filter(u => u.lineName === al);
      }

      // 3. 뷰포트 컬링: 화면 밖 열차 제거 (25% 버퍼 포함)
      try {
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const bufLng = (ne.lng - sw.lng) * 0.25;
        const bufLat = (ne.lat - sw.lat) * 0.25;
        filtered = filtered.filter(u =>
          u.pos[0] >= sw.lng - bufLng && u.pos[0] <= ne.lng + bufLng &&
          u.pos[1] >= sw.lat - bufLat && u.pos[1] <= ne.lat + bufLat
        );
      } catch {}

      // 4. 노선별 최대 열차수 캡 (노선당 25개)
      const MAX_PER_LINE = 25;
      const lineCount = new Map<string, number>();
      filtered = filtered.filter(u => {
        const cnt = lineCount.get(u.lineName) ?? 0;
        if (cnt >= MAX_PER_LINE) return false;
        lineCount.set(u.lineName, cnt + 1);
        return true;
      });

      const features: GeoJSON.Feature[] = filtered.map(u => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: u.pos },
        properties: {
          id:          u.id,
          type:        u.type,
          label:       u.label,
          lineName:    u.lineName,
          lineColor:   u.lineColor,
          bearing:     u.bearing,
          isSimulated: u.isSimulated,
          opacity:     u.opacity,
          updnLine:    u.updnLine ?? '',
          currentStation: u.currentStationName ?? '',
        },
      }));

      // source 직접 업데이트 (React 렌더 우회 → 60fps)
      const src = map.getSource('transit-realtime-source') as any;
      if (src?.setData) {
        src.setData({ type: "FeatureCollection", features });
      } else {
        setGeoData({ type: "FeatureCollection", features });
      }
    };

    const handleSimStatus = (s: SimStatus) => setSimStatus(s);

    transitRealtimeService.on('update', handleUpdate);
    transitRealtimeService.on('simStatus', handleSimStatus);
    transitRealtimeService.start();

    return () => {
      transitRealtimeService.off('update', handleUpdate);
      transitRealtimeService.off('simStatus', handleSimStatus);
    };
  }, [map]);

  // ─── 열차 클릭 ───
  useEffect(() => {
    if (!map) return;

    const onTrainClick = (e: any) => {
      const feat  = e.features?.[0];
      if (!feat) return;
      const props = feat.properties;
      const id    = props.id as string;

      if (selectedId === id) {
        setSelectedId(null); setSelectedInfo(null);
      } else {
        setSelectedId(id);
        setSelectedInfo({ label: props.label, lineName: props.lineName, lineColor: props.lineColor });
      }
    };

    const onMapClick = (e: any) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['transit-trains'] });
      if (!hits.length) { setSelectedId(null); setSelectedInfo(null); }
    };

    map.on('click', 'transit-trains', onTrainClick);
    map.on('click', onMapClick);
    map.on('mouseenter', 'transit-trains', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'transit-trains', () => { map.getCanvas().style.cursor = ''; });

    return () => {
      map.off('click', 'transit-trains', onTrainClick);
      map.off('click', onMapClick);
    };
  }, [map, selectedId]);

  // ─── 선택 레이블 필터 동기화 ───
  useEffect(() => {
    if (!map) return;
    try {
      map.setFilter('transit-train-label',
        selectedId
          ? ['==', ['get', 'id'], selectedId]
          : ['==', ['get', 'id'], '']
      );
    } catch {}
  }, [map, selectedId]);

  // ─── activeLine 변경 시 열차 opacity 레이어 표현식 갱신 ───
  useEffect(() => {
    if (!map) return;
    try {
      map.setPaintProperty(
        'transit-trains',
        'icon-opacity',
        buildOpacityExpr(activeLineRef.current)
      );
    } catch {}
  }, [map, activeLine]);

  // 탭 격리: subway탭=지하철 열차만, bus탭=버스만
  const isTrainVisible = activeTab === 'subway' || activeTab === 'subway+bus';
  const isBusVisible   = activeTab === 'bus'    || activeTab === 'subway+bus';
  const isVisible = isTrainVisible || isBusVisible;
  // ⚠️ return null 대신 visibility를 사용한다.
  // return null이면 탭 전환 시 레이어가 언마운트되었다 재추가될 때
  // SubwayLayers 노선 레이어보다 아래에 쌓혀 열차가 가려진다.
  const trainVis: "visible" | "none" = isTrainVisible ? "visible" : "none";
  const busVis:   "visible" | "none" = isBusVisible   ? "visible" : "none";

  return (
    <>
      <Source id="transit-realtime-source" type="geojson" data={geoData}>

        {/* 열차 아이콘 */}
        <Layer
          id="transit-trains"
          type="symbol"
          filter={['==', ['get', 'type'], 'subway']}
          layout={{
            'visibility':              trainVis,
            'icon-image':              ['concat', 'train-card-', ['get', 'lineColor']],
            'icon-size':               ['interpolate', ['linear'], ['zoom'], 10, 0.12, 14, 0.25, 18, 0.5],
            'icon-allow-overlap':      true,
            'icon-ignore-placement':   true,
            'symbol-sort-key':         1000,
          }}
          paint={{
            'icon-opacity': buildOpacityExpr(activeLine),
          }}
        />

        {/* 선택된 열차 레이블 */}
        <Layer
          id="transit-train-label"
          type="symbol"
          filter={['==', ['get', 'id'], '']}
          layout={{
            'visibility':            trainVis,
            'text-field':            ['get', 'label'],
            'text-font':             ['Open Sans Bold'],
            'text-size':             11,
            'text-offset':           [0, 1.8],
            'text-anchor':           'top',
            'text-allow-overlap':    true,
            'text-ignore-placement': true,
          }}
          paint={{
            'text-color':       '#ffffff',
            'text-halo-color':  '#000000',
            'text-halo-width':  2,
          }}
        />

        {/* 버스 */}
        <Layer
          id="transit-buses"
          type="symbol"
          filter={['==', ['get', 'type'], 'bus']}
          layout={{
            'visibility':            busVis,
            'icon-image':            'rocket',
            'icon-rotate':           ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-size':             ['interpolate', ['linear'], ['zoom'], 10, 0.1, 14, 0.2, 18, 0.4],
            'icon-allow-overlap':    true,
            'icon-ignore-placement': true,
          }}
          paint={{}}
        />
      </Source>

      {/* 선택된 열차 정보 토스트 */}
      {isVisible && selectedInfo && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto">
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-xl text-white text-sm font-semibold"
            style={{
              background: 'rgba(15,15,20,0.93)',
              border: `2px solid #${selectedInfo.lineColor}`,
              backdropFilter: 'blur(10px)',
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: `#${selectedInfo.lineColor}` }} />
            <span className="text-zinc-300">{selectedInfo.lineName}</span>
            <span className="opacity-30">|</span>
            <span>{selectedInfo.label}</span>
            <button
              onClick={() => { setSelectedId(null); setSelectedInfo(null); }}
              className="ml-1.5 text-zinc-400 hover:text-white transition-colors text-base leading-none"
            >×</button>
          </div>
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 경로별 열차 필터링
// ─────────────────────────────────────────────────────────────────────────────
function filterByPath(unit: RealtimeUnit, activePath: PathResult): boolean {
  const segs = activePath.segments;
  if (!segs?.length) return true;

  const seg = segs.find(s => s.line === unit.lineName);
  if (!seg) return false;

  // 방향 검사 (숫자형/문자형 모두 처리)
  const unitDir = unit.updnLine === '1' || (unit.updnLine ?? '').includes('하행') ? '1' : '0';
  if (unitDir !== seg.direction) return false;

  // 현재 역 정보 없으면 일단 표시
  if (!unit.currentStationName) return true;
  const idxMap = STATION_IDX.get(unit.lineName);
  if (!idxMap) return true;

  const normName = (n: string) => n.replace(/\(.*?\)/g, '').replace(/역$/, '').trim();
  const lookupIdx = (m: Map<string, number>, name: string): number =>
    m.get(name) ?? m.get(normName(name)) ?? -1;

  const currIdx  = lookupIdx(idxMap, unit.currentStationName);
  const entryIdx = lookupIdx(idxMap, seg.stations[0]);
  const exitIdx  = lookupIdx(idxMap, seg.stations[seg.stations.length - 1]);

  // entryIdx/exitIdx가 -1이면 경로 데이터 자체가 잘못된 것 → 숨김
  if (entryIdx < 0 || exitIdx < 0) return false;
  // currIdx만 -1이면 위치 미확인 → 일단 표시
  if (currIdx < 0) return true;

  // 하행(entryIdx < exitIdx) / 상행(entryIdx > exitIdx) 구분
  const isDownward = entryIdx < exitIdx;

  if (isDownward) {
    // 하행: 진입역 앞 2역부터 ~ 진출역 직전까지
    // currIdx < exitIdx 조건: 이미 진출역에 도달하거나 통과한 열차는 제거
    return currIdx >= entryIdx - 2 && currIdx < exitIdx;
  } else {
    // 상행: 진입역(인덱스 큰 쪽) 앞 2역부터 ~ 진출역(인덱스 작은 쪽) 직전까지
    // currIdx > exitIdx 조건: 이미 진출역에 도달하거나 통과한 열차는 제거
    return currIdx <= entryIdx + 2 && currIdx > exitIdx;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// opacity MapLibre 표현식 빌더
// ─────────────────────────────────────────────────────────────────────────────
function buildOpacityExpr(activeLine: string | null | undefined): any {
  // 항상 GeoJSON의 opacity 속성 반영 (페이드 인/아웃)
  // activeLine이 있으면 해당 노선만 100%, 나머지 20%
  if (activeLine) {
    return [
      'case',
      ['==', ['get', 'lineName'], activeLine],
      ['get', 'opacity'],                          // 선택 노선: 자체 opacity
      ['*', ['get', 'opacity'], 0.2],              // 나머지: 20%로 감쇠
    ];
  }
  return ['get', 'opacity'];
}

export default memo(TransitRealtimeLayers);
