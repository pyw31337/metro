"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { transitRealtimeService, RealtimeUnit, SimStatus } from '@/services/TransitRealtimeService';
import { PathResult } from "@/types/metro";
import { normStation, stationIdx } from "@/data/stationRegistry";

interface Props {
  activeTab: string;
  activeLine?: string | null;
  activePath?: PathResult | null;
}

interface TrainInfo {
  label: string;
  lineName: string;
  lineColor: string;
}

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const TransitRealtimeLayers = ({ activeTab, activeLine, activePath }: Props) => {
  const { current: mapRef } = useMap();
  const map = mapRef?.getMap();

  const [geoData, setGeoData]   = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
  const [simStatus, setSimStatus] = useState<SimStatus>('starting');

  // ── 선택 상태 ──
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<TrainInfo | null>(null);
  const [selectedPos,  setSelectedPos]  = useState<[number, number] | null>(null);

  // ── 탑승 상태 ──
  const [boardedId,   setBoardedId]   = useState<string | null>(null);
  const [boardedInfo, setBoardedInfo] = useState<TrainInfo | null>(null);
  const [boardedPos,  setBoardedPos]  = useState<[number, number] | null>(null);
  const [alertMsg,    setAlertMsg]    = useState<string | null>(null);

  const boardedIdRef        = useRef<string | null>(null);
  const alertedStationRef   = useRef<string | null>(null);
  const pulseRafRef         = useRef<number | null>(null);

  useEffect(() => { boardedIdRef.current = boardedId; }, [boardedId]);

  // ─── 탑승 해제 ───
  const deBoard = useCallback(() => {
    setBoardedId(null);
    setBoardedInfo(null);
    setBoardedPos(null);
    boardedIdRef.current = null;
    alertedStationRef.current = null;
  }, []);

  // ─── 레이어 z-order 보장 ───
  // sourcedata는 매 프레임 발생할 수 있으므로 debounce로 처리
  useEffect(() => {
    if (!map) return;
    const TRAIN_LAYERS = ['transit-trains', 'transit-train-label', 'transit-buses'];
    const ensureOnTop = () => {
      try { TRAIN_LAYERS.forEach(id => { if (map.getLayer(id)) map.moveLayer(id); }); } catch {}
    };
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedEnsure = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(ensureOnTop, 200);
    };
    if (map.isStyleLoaded()) ensureOnTop();
    map.on('style.load', ensureOnTop);
    map.on('sourcedata', debouncedEnsure);
    return () => {
      map.off('style.load', ensureOnTop);
      map.off('sourcedata', debouncedEnsure);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [map]);

  const activePathRef = useRef(activePath);
  useEffect(() => { activePathRef.current = activePath; }, [activePath]);
  const activeLineRef = useRef(activeLine);
  useEffect(() => { activeLineRef.current = activeLine; }, [activeLine]);

  // ─── 탑승 열차 펄스 애니메이션 (requestAnimationFrame + setPaintProperty) ───
  useEffect(() => {
    if (!map || !boardedId) {
      if (pulseRafRef.current) { cancelAnimationFrame(pulseRafRef.current); pulseRafRef.current = null; }
      return;
    }
    let phase = 0;
    const animate = () => {
      phase = (phase + 0.022) % 1;
      try {
        map.setPaintProperty('transit-boarded-pulse', 'circle-radius', 14 + phase * 32);
        map.setPaintProperty('transit-boarded-pulse', 'circle-opacity', (1 - phase) * 0.55);
      } catch {}
      pulseRafRef.current = requestAnimationFrame(animate);
    };
    pulseRafRef.current = requestAnimationFrame(animate);
    return () => { if (pulseRafRef.current) { cancelAnimationFrame(pulseRafRef.current); pulseRafRef.current = null; } };
  }, [map, boardedId]);

  // ─── 실시간 업데이트 구독 ───
  useEffect(() => {
    if (!map) return;

    const handleUpdate = (units: RealtimeUnit[]) => {
      const ap = activePathRef.current;

      // ── 탑승 열차 위치 추적 + 1정거장전 알림 (필터링 전 전체 units에서) ──
      const bId = boardedIdRef.current;
      if (bId) {
        const boardedUnit = units.find(u => u.id === bId);
        if (boardedUnit) {
          // pulse source 업데이트
          const bSrc = map.getSource('transit-boarded-source') as any;
          if (bSrc?.setData) {
            bSrc.setData({
              type: 'FeatureCollection',
              features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: boardedUnit.pos }, properties: {} }]
            });
          }
          setBoardedPos([...boardedUnit.pos] as [number, number]);

          // 도착 1정거장전 알림
          if (ap?.segments && boardedUnit.currentStationName) {
            const seg = ap.segments.find(s => s.line === boardedUnit.lineName);
            if (seg && seg.stations.length >= 2) {
              const exitStation    = seg.stations[seg.stations.length - 1];
              const preExitStation = seg.stations[seg.stations.length - 2];
              const curNorm = normStation(boardedUnit.currentStationName);
              const preNorm = normStation(preExitStation);
              // 1정거장 전 역에 진입하는 순간 알림 (중복 방지)
              if (curNorm === preNorm && alertedStationRef.current !== exitStation) {
                alertedStationRef.current = exitStation;
                try { navigator.vibrate?.([200, 100, 400, 100, 200]); } catch {}
                setAlertMsg(`다음역은 "${exitStation}"입니다.\n하차 준비를 하세요.`);
                setTimeout(() => setAlertMsg(null), 8000);
              }
            }
          }
        }
      }

      // 1. 경로 탐색 필터
      let filtered: RealtimeUnit[] = ap?.segments?.length
        ? units.filter(u => filterByPath(u, ap))
        : units;

      // 2. 활성 노선 필터
      const al = activeLineRef.current;
      if (al) filtered = filtered.filter(u => u.lineName === al);

      // 3. 뷰포트 컬링 (25% 버퍼)
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

      // 4. 노선별 최대 열차수 캡
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
          id:             u.id,
          type:           u.type,
          label:          u.label,
          lineName:       u.lineName,
          lineColor:      u.lineColor,
          bearing:        u.bearing,
          isSimulated:    u.isSimulated,
          opacity:        u.opacity,
          updnLine:       u.updnLine ?? '',
          currentStation: u.currentStationName ?? '',
        },
      }));

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
      const props  = feat.properties;
      const id     = props.id as string;
      const coords = feat.geometry?.coordinates as [number, number];

      if (selectedId === id) {
        setSelectedId(null); setSelectedInfo(null); setSelectedPos(null);
      } else {
        setSelectedId(id);
        setSelectedPos(coords);
        setSelectedInfo({ label: props.label, lineName: props.lineName, lineColor: props.lineColor });
      }
    };

    const onMapClick = (e: any) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['transit-trains'] });
      if (!hits.length) { setSelectedId(null); setSelectedInfo(null); setSelectedPos(null); }
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

  // ─── activeLine 변경 시 opacity 표현식 갱신 ───
  useEffect(() => {
    if (!map) return;
    try {
      map.setPaintProperty('transit-trains', 'icon-opacity', buildOpacityExpr(activeLineRef.current));
    } catch {}
  }, [map, activeLine]);

  const isTrainVisible = activeTab === 'subway' || activeTab === 'subway+bus';
  const isBusVisible   = activeTab === 'bus'    || activeTab === 'subway+bus';
  const trainVis: "visible" | "none" = isTrainVisible ? "visible" : "none";
  const busVis:   "visible" | "none" = isBusVisible   ? "visible" : "none";

  const showSelectedPopup = !!(selectedId && selectedInfo && selectedPos && isTrainVisible && !boardedId);
  const showBoardedPopup  = !!(boardedId && boardedInfo && boardedPos && isTrainVisible);

  return (
    <>
      {/* ── 탑승 열차 펄스 소스 ── */}
      <Source id="transit-boarded-source" type="geojson" data={EMPTY_GEOJSON}>
        <Layer
          id="transit-boarded-pulse"
          type="circle"
          layout={{ visibility: (boardedId && isTrainVisible) ? 'visible' : 'none' }}
          paint={{
            'circle-radius':          14,
            'circle-color':           'transparent',
            'circle-opacity':         0.5,
            'circle-stroke-width':    2.5,
            'circle-stroke-color':    boardedInfo ? `#${boardedInfo.lineColor}` : '#ffffff',
            'circle-stroke-opacity':  0.8,
          }}
        />
      </Source>

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
          paint={{ 'icon-opacity': buildOpacityExpr(activeLine) }}
        />

        {/* 선택된 열차 레이블 (행선지) */}
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
            'text-color':      '#ffffff',
            'text-halo-color': '#000000',
            'text-halo-width': 2,
          }}
        />

        {/* 버스 */}
        <Layer
          id="transit-buses"
          type="symbol"
          filter={['==', ['get', 'type'], 'bus']}
          layout={{
            'visibility':              busVis,
            'icon-image':              'rocket',
            'icon-rotate':             ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-size':               ['interpolate', ['linear'], ['zoom'], 10, 0.1, 14, 0.2, 18, 0.4],
            'icon-allow-overlap':      true,
            'icon-ignore-placement':   true,
          }}
          paint={{}}
        />
      </Source>

      {/* ── 선택 열차 팝업 (탑승 전) ── */}
      {showSelectedPopup && (
        <Popup
          longitude={selectedPos![0]}
          latitude={selectedPos![1]}
          anchor="bottom"
          offset={28}
          closeButton={false}
          closeOnClick={false}
          className="transit-train-popup"
        >
          <div
            className="min-w-[160px] rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'rgba(10,10,15,0.95)', border: `2px solid #${selectedInfo!.lineColor}`, backdropFilter: 'blur(12px)' }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* 헤더: 노선명 + 닫기 */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `#${selectedInfo!.lineColor}` }} />
              <span className="text-zinc-300 text-[10px] font-bold truncate">{selectedInfo!.lineName}</span>
              <button
                onClick={() => { setSelectedId(null); setSelectedInfo(null); setSelectedPos(null); }}
                className="ml-auto text-zinc-500 hover:text-white text-[14px] leading-none"
              >×</button>
            </div>
            {/* 행선지 */}
            <div className="px-3 pb-2.5 text-[14px] font-black text-white leading-snug">
              {selectedInfo!.label}
            </div>
            {/* 열차 탑승 버튼 */}
            <button
              onClick={() => {
                setBoardedId(selectedId);
                setBoardedInfo(selectedInfo);
                setBoardedPos(selectedPos);
                boardedIdRef.current = selectedId;
                alertedStationRef.current = null;
                setSelectedId(null); setSelectedInfo(null); setSelectedPos(null);
              }}
              className="w-full py-2.5 text-[12px] font-black text-white transition-opacity hover:opacity-90 active:opacity-70"
              style={{ background: `#${selectedInfo!.lineColor}` }}
            >
              열차 탑승
            </button>
          </div>
        </Popup>
      )}

      {/* ── 탑승중 팝업 ── */}
      {showBoardedPopup && (
        <Popup
          longitude={boardedPos![0]}
          latitude={boardedPos![1]}
          anchor="bottom"
          offset={28}
          closeButton={false}
          closeOnClick={false}
          className="transit-train-popup"
        >
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-xl"
            style={{ background: `#${boardedInfo!.lineColor}` }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
            <span className="text-white text-[11px] font-black whitespace-nowrap">탑승중</span>
            <button
              onClick={deBoard}
              className="ml-1 text-white/60 hover:text-white text-[13px] leading-none"
            >×</button>
          </div>
        </Popup>
      )}

      {/* ── 도착 알림 토스트 ── */}
      {alertMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none w-[280px]">
          <div
            className="px-5 py-4 rounded-2xl shadow-2xl text-white text-[12px] font-bold text-center whitespace-pre-line leading-relaxed"
            style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(16px)', border: `2px solid #${boardedInfo?.lineColor ?? 'ffffff'}` }}
          >
            🚉 {alertMsg}
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

  const updn = unit.updnLine ?? '';
  const unitDir: '0' | '1' =
    updn === '1' || updn.includes('하행') || updn.includes('외선') || updn.includes('outer')
      ? '1' : '0';
  if (unitDir !== seg.direction) return false;

  if (!unit.currentStationName) return true;
  const ln = unit.lineName;
  const currIdx  = stationIdx(ln, unit.currentStationName);
  const entryIdx = stationIdx(ln, seg.stations[0]);
  const exitIdx  = stationIdx(ln, seg.stations[seg.stations.length - 1]);

  if (entryIdx < 0 || exitIdx < 0) return false;
  if (currIdx < 0) return true;

  const isDownward = entryIdx < exitIdx;
  if (isDownward) {
    return currIdx >= entryIdx - 2 && currIdx < exitIdx;
  } else {
    return currIdx <= entryIdx + 2 && currIdx > exitIdx;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// opacity MapLibre 표현식 빌더
// ─────────────────────────────────────────────────────────────────────────────
function buildOpacityExpr(activeLine: string | null | undefined): any {
  if (activeLine) {
    return [
      'case',
      ['==', ['get', 'lineName'], activeLine],
      ['get', 'opacity'],
      ['*', ['get', 'opacity'], 0.2],
    ];
  }
  return ['get', 'opacity'];
}

export default memo(TransitRealtimeLayers);
