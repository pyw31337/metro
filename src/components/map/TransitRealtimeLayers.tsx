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
  const [, setSimStatus] = useState<SimStatus>('starting');

  // ── 선택 상태 ──
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<TrainInfo | null>(null);
  const [selectedPos,  setSelectedPos]  = useState<[number, number] | null>(null);

  // ── 탑승 상태 ──
  const [boardedId,   setBoardedId]   = useState<string | null>(null);
  const [boardedInfo, setBoardedInfo] = useState<TrainInfo | null>(null);
  const [boardedPos,  setBoardedPos]  = useState<[number, number] | null>(null);
  const [alertMsg,    setAlertMsg]    = useState<string | null>(null);
  const [alertType,   setAlertType]   = useState<'info' | 'transfer' | 'exit'>('info');

  const boardedIdRef        = useRef<string | null>(null);
  const selectedIdRef       = useRef<string | null>(null);
  const alertedStationRef   = useRef<string | null>(null);
  const prevStationRef      = useRef<string | null>(null);  // 경로 없을 때 역 변화 감지
  const pulseRafRef         = useRef<number | null>(null);

  useEffect(() => { boardedIdRef.current  = boardedId;  }, [boardedId]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ─── 탑승 해제 ───
  const deBoard = useCallback(() => {
    setBoardedId(null);
    setBoardedInfo(null);
    setBoardedPos(null);
    boardedIdRef.current = null;
    alertedStationRef.current = null;
    prevStationRef.current = null;
  }, []);

  // ─── 레이어 z-order 보장 ───
  // leading+trailing 방식: sourcedata 첫 발생 시 즉시 실행(leading) + 폭풍 후 한 번 더(trailing)
  // trailing-only 200ms debounce는 sourcedata 폭풍이 계속되면 실행이 지연돼 열차가 노선 아래로 묻히는 버그 유발
  useEffect(() => {
    if (!map) return;
    const TRAIN_LAYERS = ['transit-boarded-pulse-0', 'transit-boarded-pulse-1', 'transit-boarded-pulse-2', 'transit-trains-gray', 'transit-trains', 'transit-buses'];
    const ensureOnTop = () => {
      try { TRAIN_LAYERS.forEach(id => { if (map.getLayer(id)) map.moveLayer(id); }); } catch {}
    };
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;
    let lastCallTime = 0;
    const THROTTLE_MS = 150;
    const debouncedEnsure = () => {
      const now = Date.now();
      // leading: 마지막 실행 후 THROTTLE_MS 이상 지났으면 즉시 실행
      if (now - lastCallTime >= THROTTLE_MS) {
        ensureOnTop();
        lastCallTime = now;
      }
      // trailing: 이벤트 폭풍 끝난 후 한 번 더
      if (trailingTimer) clearTimeout(trailingTimer);
      trailingTimer = setTimeout(() => { ensureOnTop(); lastCallTime = Date.now(); }, THROTTLE_MS);
    };
    if (map.isStyleLoaded()) ensureOnTop();
    map.on('style.load', ensureOnTop);
    map.on('sourcedata', debouncedEnsure);
    return () => {
      map.off('style.load', ensureOnTop);
      map.off('sourcedata', debouncedEnsure);
      if (trailingTimer) clearTimeout(trailingTimer);
    };
  }, [map]);

  const activePathRef = useRef(activePath);
  useEffect(() => { activePathRef.current = activePath; }, [activePath]);
  const activeLineRef = useRef(activeLine);
  useEffect(() => { activeLineRef.current = activeLine; }, [activeLine]);

  // ─── 탑승 열차 펄스 애니메이션 — 3중 링 리플 ───
  useEffect(() => {
    if (!map || !boardedId) {
      if (pulseRafRef.current) { cancelAnimationFrame(pulseRafRef.current); pulseRafRef.current = null; }
      return;
    }
    const CYCLE_MS = 2400;
    const start = performance.now();
    const animate = () => {
      const t = (performance.now() - start) % CYCLE_MS / CYCLE_MS;
      for (let i = 0; i < 3; i++) {
        const phase = (t + i / 3) % 1;
        const eased = 1 - Math.pow(1 - phase, 2);
        try {
          map.setPaintProperty(`transit-boarded-pulse-${i}`, 'circle-radius', 12 + eased * 38);
          map.setPaintProperty(`transit-boarded-pulse-${i}`, 'circle-stroke-opacity', Math.pow(1 - phase, 1.8) * 0.7);
        } catch {}
      }
      pulseRafRef.current = requestAnimationFrame(animate);
    };
    pulseRafRef.current = requestAnimationFrame(animate);
    return () => { if (pulseRafRef.current) { cancelAnimationFrame(pulseRafRef.current); pulseRafRef.current = null; } };
  }, [map, boardedId]);

  // ─── 탑승 열차 펄스 색상 동기화 ───
  useEffect(() => {
    if (!map || !boardedInfo) return;
    const color = `#${boardedInfo.lineColor}`;
    for (let i = 0; i < 3; i++) {
      try { map.setPaintProperty(`transit-boarded-pulse-${i}`, 'circle-stroke-color', color); } catch {}
    }
  }, [map, boardedInfo]);

  // ─── 실시간 업데이트 구독 ───
  useEffect(() => {
    if (!map) return;

    const handleUpdate = (units: RealtimeUnit[]) => {
      const ap = activePathRef.current;

      // ── 선택 열차 위치 실시간 추적 ──
      const sId = selectedIdRef.current;
      if (sId) {
        const selUnit = units.find(u => u.id === sId);
        if (selUnit) setSelectedPos([...selUnit.pos] as [number, number]);
      }

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

          // ── 탑승 진동 알림 ──
          const cur = boardedUnit.currentStationName;
          if (ap?.segments?.length && cur) {
            // ── 경로 있음: 환승역 또는 목적지 1정거장 전 알림 ──
            const curNorm = normStation(cur);
            const seg = ap.segments.find(s => s.line === boardedUnit.lineName);
            if (seg && seg.stations.length >= 2) {
              const exitStation    = seg.stations[seg.stations.length - 1];
              const preExitStation = seg.stations[seg.stations.length - 2];
              if (curNorm === normStation(preExitStation) && alertedStationRef.current !== exitStation) {
                alertedStationRef.current = exitStation;
                // 전체 경로의 최종 목적지 여부 판별
                const lastSeg  = ap.segments[ap.segments.length - 1];
                const finalDest = lastSeg.stations[lastSeg.stations.length - 1];
                const isFinalDest = exitStation === finalDest;
                if (isFinalDest) {
                  try { navigator.vibrate?.([200, 100, 400, 100, 200]); } catch {}
                  setAlertType('exit');
                  setAlertMsg(`다음역은 "${exitStation}"입니다.\n하차 준비를 하세요.`);
                } else {
                  try { navigator.vibrate?.([200, 100, 200]); } catch {}
                  setAlertType('transfer');
                  setAlertMsg(`다음역 "${exitStation}"에서 환승하세요.`);
                }
                setTimeout(() => setAlertMsg(null), 8000);
              }
            }
          } else if (cur) {
            // ── 경로 없음: 역 진입마다 가벼운 진동 ──
            const prevSt = prevStationRef.current;
            if (prevSt !== null && normStation(cur) !== normStation(prevSt)) {
              try { navigator.vibrate?.([100, 50, 100]); } catch {}
              setAlertType('info');
              setAlertMsg(`현재역: ${cur}`);
              setTimeout(() => setAlertMsg(null), 5000);
            }
            prevStationRef.current = cur;
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
          colorProgress:  u.colorProgress ?? 1,
          isDwelling:     u.isDwelling ?? false,
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
      const hits = map.queryRenderedFeatures(e.point, { layers: ['transit-trains', 'transit-buses'] });
      if (!hits.length) { setSelectedId(null); setSelectedInfo(null); setSelectedPos(null); }
    };

    map.on('click', 'transit-trains', onTrainClick);
    map.on('click', 'transit-buses',  onTrainClick);
    map.on('click', onMapClick);
    map.on('mouseenter', 'transit-trains', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'transit-trains', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'transit-buses',  () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'transit-buses',  () => { map.getCanvas().style.cursor = ''; });

    return () => {
      map.off('click', 'transit-trains', onTrainClick);
      map.off('click', 'transit-buses',  onTrainClick);
      map.off('click', onMapClick);
    };
  }, [map, selectedId]);


  // ─── activeLine 변경 시 opacity 표현식 갱신 (회색/노선색 레이어 모두) ───
  useEffect(() => {
    if (!map) return;
    try {
      map.setPaintProperty('transit-trains',      'icon-opacity', buildColorOpacityExpr(activeLineRef.current));
      map.setPaintProperty('transit-trains-gray', 'icon-opacity', buildGrayOpacityExpr(activeLineRef.current));
    } catch {}
  }, [map, activeLine]);

  const isTrainVisible = activeTab === 'subway' || activeTab === 'subway+bus';
  const isBusVisible   = activeTab === 'bus'    || activeTab === 'subway+bus';
  const trainVis: "visible" | "none" = isTrainVisible ? "visible" : "none";
  const busVis:   "visible" | "none" = isBusVisible   ? "visible" : "none";

  const selectedIsBus     = !!(selectedId?.startsWith('bus-'));
  const showSelectedPopup = !!(selectedId && selectedInfo && selectedPos && (selectedIsBus ? isBusVisible : isTrainVisible) && !boardedId);
  const showBoardedPopup  = !!(boardedId && boardedInfo && boardedPos && isTrainVisible);

  return (
    <>
      {/* ── 탑승 열차 펄스 소스 (3중 링 리플) ── */}
      <Source id="transit-boarded-source" type="geojson" data={EMPTY_GEOJSON}>
        {[0, 1, 2].map(i => (
          <Layer
            key={i}
            id={`transit-boarded-pulse-${i}`}
            type="circle"
            layout={{ visibility: (boardedId && isTrainVisible) ? 'visible' : 'none' }}
            paint={{
              'circle-radius':          12,
              'circle-color':           'transparent',
              'circle-opacity':         0,
              'circle-stroke-width':    2,
              'circle-stroke-color':    boardedInfo ? `#${boardedInfo.lineColor}` : '#ffffff',
              'circle-stroke-opacity':  0,
            }}
          />
        ))}
      </Source>

      <Source id="transit-realtime-source" type="geojson" data={geoData}>

        {/* 열차 아이콘 — 회색 (베어링 미초기화): 정차 시 ∥, 주행 시 ∧ */}
        <Layer
          id="transit-trains-gray"
          type="symbol"
          filter={['==', ['get', 'type'], 'subway']}
          layout={{
            'visibility':               trainVis,
            'icon-image':               'train-card-dwell-AAAAAA',
            'icon-size':                ['interpolate', ['linear'], ['zoom'], 10, 0.096, 14, 0.20, 18, 0.40],
            'icon-rotate':              0,
            'icon-rotation-alignment':  'map',
            'icon-allow-overlap':       true,
            'icon-ignore-placement':    true,
            'symbol-sort-key':          999,
          }}
          paint={{ 'icon-opacity': buildGrayOpacityExpr(activeLine) }}
        />

        {/* 열차 아이콘 — 노선색 (베어링 초기화 후 페이드인): 정차 시 ∥, 주행 시 ∧ */}
        <Layer
          id="transit-trains"
          type="symbol"
          filter={['==', ['get', 'type'], 'subway']}
          layout={{
            'visibility':               trainVis,
            'icon-image':               ['case', ['get', 'isDwelling'], ['concat', 'train-card-dwell-', ['get', 'lineColor']], ['concat', 'train-card-', ['get', 'lineColor']]],
            'icon-size':                ['interpolate', ['linear'], ['zoom'], 10, 0.096, 14, 0.20, 18, 0.40],
            'icon-rotate':              ['case', ['get', 'isDwelling'], 0, ['get', 'bearing']],
            'icon-rotation-alignment':  'map',
            'icon-allow-overlap':       true,
            'icon-ignore-placement':    true,
            'symbol-sort-key':          1000,
          }}
          paint={{ 'icon-opacity': buildColorOpacityExpr(activeLine) }}
        />


        {/* 버스 — 원형 배경 */}
        <Layer
          id="transit-buses"
          type="circle"
          filter={['==', ['get', 'type'], 'bus']}
          layout={{ 'visibility': busVis }}
          paint={{
            'circle-radius':         ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 11, 18, 16],
            'circle-color':          ['concat', '#', ['get', 'lineColor']],
            'circle-opacity':        ['get', 'opacity'],
            'circle-stroke-width':   1.5,
            'circle-stroke-color':   '#ffffff',
            'circle-stroke-opacity': ['get', 'opacity'],
          }}
        />

        {/* 버스 — 노선번호 텍스트 */}
        <Layer
          id="transit-bus-label"
          type="symbol"
          filter={['==', ['get', 'type'], 'bus']}
          layout={{
            'visibility':              busVis,
            'text-field':              ['get', 'lineName'],
            'text-font':               ['Open Sans Bold'],
            'text-size':               ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 10, 18, 13],
            'text-anchor':             'center',
            'text-allow-overlap':      true,
            'text-ignore-placement':   true,
            'text-max-width':          5,
          }}
          paint={{
            'text-color':   '#ffffff',
            'text-opacity': ['get', 'opacity'],
          }}
        />
      </Source>

      {/* ── 선택 열차 팝업 (탑승 전) ── */}
      {showSelectedPopup && (
        <Popup
          longitude={selectedPos![0]}
          latitude={selectedPos![1]}
          anchor="top"
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
            {/* 행선지 / 노선번호 */}
            <div className="px-3 pb-2.5 text-[14px] font-black text-white leading-snug">
              {selectedInfo!.label}
            </div>
            {/* 탑승 버튼 — 지하철만 */}
            {!selectedIsBus && (
              <button
                onClick={() => {
                  setBoardedId(selectedId);
                  setBoardedInfo(selectedInfo);
                  setBoardedPos(selectedPos);
                  boardedIdRef.current = selectedId;
                  alertedStationRef.current = null;
                  prevStationRef.current = null;
                  setSelectedId(null); setSelectedInfo(null); setSelectedPos(null);
                }}
                className="w-full py-2.5 text-[12px] font-black text-white transition-opacity hover:opacity-90 active:opacity-70"
                style={{ background: `#${selectedInfo!.lineColor}` }}
              >
                열차 탑승
              </button>
            )}
          </div>
        </Popup>
      )}

      {/* ── 탑승중 팝업 ── */}
      {showBoardedPopup && (
        <Popup
          longitude={boardedPos![0]}
          latitude={boardedPos![1]}
          anchor="top"
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

      {/* ── 탑승 알림 토스트 ── */}
      {alertMsg && (() => {
        const icon  = alertType === 'exit' ? '🚉' : alertType === 'transfer' ? '🔄' : '📍';
        const color = alertType === 'exit'
          ? `#${boardedInfo?.lineColor ?? 'ffffff'}`
          : alertType === 'transfer'
          ? '#f59e0b'
          : 'rgba(255,255,255,0.3)';
        return (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none w-[280px]">
            <div
              className="px-5 py-4 rounded-2xl shadow-2xl text-white text-[12px] font-bold text-center whitespace-pre-line leading-relaxed"
              style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(16px)', border: `2px solid ${color}` }}
            >
              {icon} {alertMsg}
            </div>
          </div>
        );
      })()}
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
function baseOpacityExpr(activeLine: string | null | undefined): any {
  if (activeLine) {
    return ['case', ['==', ['get', 'lineName'], activeLine], ['get', 'opacity'], ['*', ['get', 'opacity'], 0.2]];
  }
  return ['get', 'opacity'];
}

/** 노선색 레이어: opacity × colorProgress */
function buildColorOpacityExpr(activeLine: string | null | undefined): any {
  return ['*', baseOpacityExpr(activeLine), ['get', 'colorProgress']];
}

/** 회색 레이어: opacity × (1 - colorProgress) */
function buildGrayOpacityExpr(activeLine: string | null | undefined): any {
  return ['*', baseOpacityExpr(activeLine), ['max', 0, ['-', 1, ['get', 'colorProgress']]]];
}


export default memo(TransitRealtimeLayers);
