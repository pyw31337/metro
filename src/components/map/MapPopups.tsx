"use client";

import { useEffect, useMemo, memo, useState, useCallback, useRef } from "react";
import { Popup } from "react-map-gl/maplibre";
import { X, Accessibility, Bell, Baby, RefreshCw, ChevronRight, MapPin, Clock, ArrowRight } from "lucide-react";
import { StationArrival, ActiveTab } from "@/types/metro";
import { parseSeoulDate } from "@/services/arrivalApi";
import { getLineLongName } from "@/utils/stationUtils";
import { WCItem, BusStop, RouteSegment } from "@/types/metro";
import { ArrivalHeader, ArrivalItemListItem } from "./ArrivalInfo";
import { SUBWAY_LINES } from "@/data/subway-lines";
import { stationLines } from "@/data/stationRegistry";
import { useCongestion } from "@/hooks/useCongestion";
import CongestionInfo from "./CongestionInfo";
import { useBusArrivals } from "@/hooks/useBusArrivals";
import { useStopRoutes } from "@/hooks/useStopRoutes";
import { useBusRouteInfo } from "@/hooks/useBusRouteInfo";
import { useStationFacilities } from "@/hooks/useStationFacilities";
import { useStationAddress, formatShortAddress } from "@/hooks/useStationAddress";
import { useStationExits } from "@/hooks/useStationExits";
import { useSubwayRestrooms } from "@/hooks/useSubwayRestrooms";
import { hapticLight } from "@/utils/haptic";
import { getBusRouteStyle } from "@/utils/busRouting";

interface MapPopupsProps {
  popupCoords: [number, number] | null;
  selectedStationName: string | null;
  selectedBusStop: BusStop | null;
  activeTab: ActiveTab;
  stationArrivals: StationArrival[];
  timeDisplayMode: "duration" | "arrival";
  onToggleTimeDisplay: () => void;
  onSetStart: (name: string) => void;
  onSetEnd: (name: string) => void;
  onSetWaypoint: (name: string) => void;
  startStation: string | null;
  setPopupCoords: (coords: [number, number] | null) => void;
  selectedTrain: any;
  setSelectedTrain: (train: any) => void;
  isLoadingCongestion: boolean;
  congestionData: any;
  trainArrivalDetail?: StationArrival | null;
  activeLine: string | null;
  onActiveLineChange: (line: string | null) => void;
  onSelectBusRoute?: (routeNo: string, cityCode?: string, routeId?: string) => void;
  selectedWC?: WCItem | null;
  onWCClick?: (item: WCItem | null) => void;
  isDarkMode?: boolean;
  arrivalLoading?: boolean;
  isLiveArrival?: boolean;
  onRefreshArrival?: () => void;
  /** 현재 경로의 세그먼트 (방향 필터용) */
  routeSegments?: RouteSegment[];
}

const LINE_COLOR_MAP = new Map(SUBWAY_LINES.map(l => [l.name, l.color]));


const getLineInfo = (lineName: string) => {
    if (!lineName) return { num: '?', color: '#ccc' };
    const num = lineName.replace('호선', '').replace('서울배차', '').trim();
    const color = LINE_COLOR_MAP.get(lineName) ?? LINE_COLOR_MAP.get(num + '호선') ?? '#ccc';
    return { num, color };
};

const RoadViewButtons = ({ lat, lng, address }: { lat: number, lng: number, address?: string }) => {
  const naverPanoApp = `nmap://panorama?lat=${lat}&lng=${lng}&appname=metro.live`;
  const naverPanoWeb = `https://map.naver.com/v5/street?c=${lng},${lat},15,0,0,0,dh`;
  const kakao = `https://map.kakao.com/link/roadview/${lat},${lng}`;
  const openNaver = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.href = naverPanoApp;
    setTimeout(() => { window.open(naverPanoWeb, '_blank'); }, 300);
  };
  return (
    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-100 dark:border-white/5">
      <a href={naverPanoApp} onClick={openNaver}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-[#03C75A] text-white text-[10px] font-bold transition-transform active:scale-95">
        네이버 거리뷰
      </a>
      <a href={kakao} target="_blank" rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-[#FEE500] text-[#3c1e1e] text-[10px] font-bold transition-transform active:scale-95">
        카카오 로드뷰
      </a>
    </div>
  );
};

// ── 선택된 노선의 운행 정보 카드 ───────────────────────────────────
const RouteScheduleCard = ({ routeId, cityCode, arsId }: { routeId: string; cityCode: string; arsId?: string }) => {
  const { info, loading } = useBusRouteInfo(routeId, cityCode, arsId);
  if (loading) return null;
  if (!info) return null;
  return (
    <div className="mt-1.5 p-2 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 space-y-1">
      {(info.startName || info.endName) && (
        <div className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          <MapPin size={9} className="shrink-0" />
          <span className="truncate">{info.startName}</span>
          <ArrowRight size={9} className="shrink-0" />
          <span className="truncate">{info.endName}</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        {info.firstBus && (
          <div className="flex items-center gap-1">
            <Clock size={9} className="text-emerald-500 shrink-0" />
            <span className="text-[10px] font-black text-zinc-700 dark:text-zinc-300">첫차 {info.firstBus}</span>
          </div>
        )}
        {info.lastBus && (
          <div className="flex items-center gap-1">
            <Clock size={9} className="text-rose-400 shrink-0" />
            <span className="text-[10px] font-black text-zinc-700 dark:text-zinc-300">막차 {info.lastBus}</span>
          </div>
        )}
        {info.headwayPeak > 0 && (
          <span className="text-[10px] text-zinc-400">배차 {info.headwayPeak}분</span>
        )}
      </div>
    </div>
  );
};

// ── 버스 정류장 통합 패널 (도착 정보 + 전체 노선 + 스케줄) ──────────
const BusStopPanel = ({ stopId, cityCode, onSelectBusRoute }: {
  stopId: string; cityCode: string;
  onSelectBusRoute?: (no: string, city?: string, id?: string) => void;
}) => {
  const { arrivals, loading: arrLoading } = useBusArrivals(stopId, cityCode);
  const { routes, loading: routeLoading } = useStopRoutes(stopId, cityCode);
  const [selectedRoute, setSelectedRoute] = useState<{ no: string; id: string; cityCode: string } | null>(null);

  // GBIS arrival API가 routeNo를 반환하지 않는 경우 routes 목록으로 보완
  const enrichedArrivals = useMemo(() => {
    if (!arrivals.some((a: any) => !a.routeNo)) return arrivals;
    const routeMap = new Map(routes.map(r => [r.id, r.no]));
    return arrivals.map((bus: any) => ({
      ...bus,
      routeNo: bus.routeNo || routeMap.get(bus.routeId) || bus.routeId?.slice(-4) || "?",
    }));
  }, [arrivals, routes]);

  const handleRouteClick = useCallback((no: string, city: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRoute(prev => (prev?.id === id ? null : { no, id, cityCode: city }));
    onSelectBusRoute?.(no, city, id);
  }, [onSelectBusRoute]);

  // ── 도착 정보 ────────────────────────────────────────────────────
  const arrivalSection = (() => {
    if (arrLoading) return <div className="py-3 text-center text-[11px] text-zinc-400 animate-pulse">도착 정보 로딩중...</div>;
    if (enrichedArrivals.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-tight">실시간 도착</h4>
        <div className="space-y-1.5 max-h-[160px] overflow-y-auto no-scrollbar">
          {enrichedArrivals.map((bus: any, idx: number) => {
            const style = getBusRouteStyle(bus.routeNo);
            const isSelected = selectedRoute?.id === bus.routeId;
            return (
              <div key={idx}>
                <button
                  onClick={(e) => handleRouteClick(bus.routeNo, cityCode, bus.routeId, e)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border transition-all active:scale-[0.98] ${isSelected ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30' : 'bg-zinc-50 dark:bg-white/5 border-zinc-100 dark:border-white/5'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-black shadow-sm"
                      style={{ backgroundColor: style.bg, color: style.text }}>{bus.routeNo}</span>
                    <span className="text-[10px] text-zinc-400">{bus.remainStops}정류장 남음</span>
                  </div>
                  <span className="text-[11px] font-black text-rose-500">
                    {bus.arrivalTime < 60 ? "곧 도착" : `${Math.floor(bus.arrivalTime / 60)}분 후`}
                  </span>
                </button>
                {isSelected && selectedRoute && <RouteScheduleCard routeId={selectedRoute.id} cityCode={selectedRoute.cityCode} arsId={stopId} />}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  // ── 전체 노선 목록 ────────────────────────────────────────────────
  const staticSection = (() => {
    if (routeLoading) return <div className="text-[10px] text-zinc-400 animate-pulse py-1">노선 목록 로딩중...</div>;
    // 도착 정보에 이미 있는 routeId 제외
    const arrivalIds = new Set(arrivals.map((a: any) => a.routeId));
    const extra = routes.filter(r => !arrivalIds.has(r.id));
    if (extra.length === 0) return null;
    return (
      <div>
        <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-tight mb-1.5">전체 노선 ({routes.length})</h4>
        <div className="space-y-1 max-h-[160px] overflow-y-auto no-scrollbar">
          {extra.map((r, i) => {
            const style = getBusRouteStyle(r.no);
            const isSelected = selectedRoute?.id === r.id;
            return (
              <div key={i}>
                <button
                  onClick={(e) => handleRouteClick(r.no, r.cityCode, r.id, e)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl border transition-all active:scale-[0.98] ${isSelected ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30' : 'bg-zinc-50 dark:bg-white/5 border-zinc-100 dark:border-white/5'}`}
                >
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-black shadow-sm"
                    style={{ backgroundColor: style.bg, color: style.text }}>{r.no}</span>
                  <span className="text-[10px] text-zinc-400">노선 보기 →</span>
                </button>
                {isSelected && selectedRoute && <RouteScheduleCard routeId={selectedRoute.id} cityCode={selectedRoute.cityCode} arsId={stopId} />}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  if (!arrLoading && enrichedArrivals.length === 0 && !routeLoading && routes.length === 0) {
    return <div className="py-3 text-center text-[11px] text-zinc-400">도착/노선 정보가 없습니다.</div>;
  }

  return (
    <div className="space-y-3 mt-1">
      {arrivalSection}
      {(arrivalSection || routeLoading || routes.length > 0) && (arrivalSection && routes.length > 0) && (
        <div className="border-t border-zinc-100 dark:border-white/5" />
      )}
      {staticSection}
    </div>
  );
};

const MapPopups = ({
  popupCoords,
  selectedStationName,
  selectedBusStop,
  activeTab,
  stationArrivals,
  timeDisplayMode,
  onToggleTimeDisplay,
  onSetStart,
  onSetEnd,
  onSetWaypoint,
  startStation,
  setPopupCoords,
  selectedTrain,
  setSelectedTrain,
  isLoadingCongestion,
  congestionData,
  trainArrivalDetail,
  activeLine,
  onActiveLineChange,
  onSelectBusRoute,
  selectedWC,
  onWCClick,
  isDarkMode,
  arrivalLoading,
  isLiveArrival,
  onRefreshArrival,
  routeSegments,
}: MapPopupsProps) => {
  // 경로 검색 중일 때 해당 역의 방향 ('0'=상행/내선, '1'=하행/외선, null=필터 없음)
  const routeDirection = useMemo<'0' | '1' | null>(() => {
    if (!routeSegments || !selectedStationName) return null;
    for (const seg of routeSegments) {
      if (seg.stations.includes(selectedStationName)) return seg.direction;
    }
    return null;
  }, [routeSegments, selectedStationName]);
  const { data: realTimeCongestion } = useCongestion(selectedStationName);
  const stationFacilities = useStationFacilities(activeTab === 'subway' ? selectedStationName : null);
  const stationAddr = useStationAddress(activeTab === 'subway' ? selectedStationName : null);
  const stationAddrText = formatShortAddress(stationAddr);
  const stationExits = useStationExits(activeTab === 'subway' ? selectedStationName : null);
  const stationRestrooms = useSubwayRestrooms(activeTab === 'subway' ? selectedStationName : null);
  const [exitExpanded, setExitExpanded] = useState(false);
  const [facilitiesExpanded, setFacilitiesExpanded] = useState(false);

  // 역 바뀌면 섹션 접기
  useEffect(() => {
    setExitExpanded(false);
    setFacilitiesExpanded(false);
  }, [selectedStationName]);

  // ── 노선 탭 드래그 스크롤 (마우스 + 터치) ──────────────────────────────────
  // overflow-x-auto 단독으로는 마우스 드래그 스크롤이 안 됨.
  // MapLibre 팝업이 pointer 이벤트를 중간에 가로채기도 하므로
  // setPointerCapture + preventDefault 조합으로 직접 구현.
  const lineTabsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = lineTabsRef.current;
    if (!el) return;
    let startX = 0, scrollLeft = 0, dragging = false, moved = false;
    const onDown = (e: PointerEvent) => {
      e.stopPropagation();
      startX = e.clientX; scrollLeft = el.scrollLeft;
      dragging = true; moved = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 5) { moved = true; el.setPointerCapture(e.pointerId); }
      if (moved) { e.preventDefault(); e.stopPropagation(); el.scrollLeft = scrollLeft - dx; }
    };
    const onUp = () => { dragging = false; };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [selectedStationName]); // 역 바뀌면 ref 갱신 후 재부착

  const filteredArrivals = useMemo(() => {
    if (!activeLine) return stationArrivals;
    // activeLine 예: "2호선", "수인분당선", "경의중앙선"
    // lineName은 "2호선", "수인분당선" 등 정확히 일치하거나 포함 관계
    const norm = (s: string) => s.replace(/[호\s]/g, '').replace(/선$/, '');
    const activeNorm = norm(activeLine);
    return stationArrivals.filter(arr =>
        arr.lineName === activeLine ||
        arr.lineName.includes(activeLine) ||
        norm(arr.lineName) === activeNorm
    );
  }, [stationArrivals, activeLine]);

  // Default line selection on popup open
  const badges = useMemo(() => {
    if (activeTab !== 'subway' || !selectedStationName) return [];
    return stationLines(selectedStationName);
  }, [activeTab, selectedStationName]);

  useEffect(() => {
    if (popupCoords && activeTab === 'subway' && !activeLine && badges.length > 0) {
      onActiveLineChange(badges[0].lineName);
    }
  }, [popupCoords, activeTab, activeLine, badges, onActiveLineChange]);

  return (
    <>
      {/* 1. Station/Bus Detail Popup */}
      {popupCoords && ((activeTab === 'subway' && selectedStationName) || ((activeTab === 'bus' || activeTab === 'subway+bus') && selectedBusStop)) && (
        <Popup
            key={selectedStationName || selectedBusStop?.id}
            longitude={popupCoords[0]}
            latitude={popupCoords[1]}
            closeButton={false}
            closeOnClick={false}
            onClose={() => {
                setPopupCoords(null);
                onActiveLineChange(null);
            }}
            anchor="bottom"
            offset={15}
            className="custom-station-popup"
        >
            <div
                className="p-4 w-[320px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-white/20 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-zinc-100 dark:border-white/5">
                    <div className="flex flex-col gap-0.5 overflow-hidden min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-[20px] font-black text-zinc-900 dark:text-white truncate max-w-[170px] tracking-tight">
                                {activeTab === 'subway' ? selectedStationName : selectedBusStop?.name}
                            </h3>
                            {activeTab === 'subway' && (
                                arrivalLoading
                                    ? <span className="shrink-0 w-2 h-2 rounded-full bg-zinc-400 animate-pulse" />
                                    : isLiveArrival
                                        ? <span className="shrink-0 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        : <span className="shrink-0 w-2 h-2 rounded-full bg-amber-400" />
                            )}
                        </div>
                        {activeTab === 'subway' && stationAddrText && (
                            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">{stationAddrText}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {activeTab === 'subway' && onRefreshArrival && (
                            <button
                                onClick={(e) => { e.stopPropagation(); hapticLight(); onRefreshArrival(); }}
                                className={`p-1.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-400 hover:text-blue-500 transition-all active:scale-90 ${arrivalLoading ? 'animate-spin' : ''}`}
                            >
                                <RefreshCw size={12} />
                            </button>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                hapticLight();
                                setPopupCoords(null);
                                onActiveLineChange(null);
                            }}
                            className="p-1.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-all active:scale-90"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {activeTab === 'subway' && badges.length > 0 && (
                    <div
                        ref={lineTabsRef}
                        className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar py-1 w-full min-w-0 cursor-grab active:cursor-grabbing"
                        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
                        onWheel={(e) => e.stopPropagation()}
                    >
                        {badges.map((badge: { lineName: string; color: string }, idx: number) => {
                            const label = getLineLongName(badge.lineName);
                            const isActive = activeLine === badge.lineName;
                            
                            return (
                                <button
                                    key={idx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      hapticLight();
                                      onActiveLineChange(badge.lineName);
                                    }}
                                    className={`inline-flex items-center justify-center h-[28px] px-3.5 rounded-full text-[11px] font-black shadow-sm shrink-0 transition-all active:scale-90 ${isActive ? 'text-white scale-105' : 'bg-white border opacity-80'}`}
                                    style={{
                                      touchAction: 'pan-x',
                                      backgroundColor: isActive ? badge.color : 'transparent',
                                      borderColor: isActive ? 'transparent' : badge.color,
                                      color: isActive ? 'white' : badge.color
                                    }}
                                  >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}
                
                {activeTab === 'subway' && realTimeCongestion && (
                    <CongestionInfo data={realTimeCongestion} />
                )}


                {/* Exit Info */}
                {activeTab === 'subway' && stationExits && (() => {
                    const sortedExits = Object.entries(stationExits.exits)
                        .sort((a, b) => {
                            const na = parseInt(a[0]), nb = parseInt(b[0]);
                            return isNaN(na) || isNaN(nb) ? a[0].localeCompare(b[0]) : na - nb;
                        });
                    if (sortedExits.length === 0) return null;
                    return (
                        <div className="mb-3">
                            <button
                                onClick={(e) => { e.stopPropagation(); hapticLight(); setExitExpanded(v => !v); }}
                                className="w-full flex items-center justify-between py-1.5 text-left"
                            >
                                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-tight">
                                    출구 안내 ({sortedExits.length}개)
                                </span>
                                <span className="text-[10px] text-zinc-400">{exitExpanded ? '접기 ▲' : '펼치기 ▼'}</span>
                            </button>
                            {exitExpanded && (
                                <div className="space-y-1.5 max-h-[180px] overflow-y-auto no-scrollbar mt-1">
                                    {sortedExits.map(([exitNo, facilities]) => (
                                        <div key={exitNo} className="flex gap-2 text-[10px]">
                                            <span className="shrink-0 w-7 h-5 flex items-center justify-center rounded-md bg-zinc-800 dark:bg-white/15 text-white dark:text-white font-black text-[9px]">
                                                {exitNo}
                                            </span>
                                            <span className="text-zinc-500 dark:text-zinc-400 leading-5 truncate">
                                                {facilities.slice(0, 4).join(' · ')}
                                                {facilities.length > 4 && <span className="text-zinc-400"> +{facilities.length - 4}</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Facilities — unified accordion */}
                {activeTab === 'subway' && (() => {
                    const fc = stationFacilities;
                    const wc = stationRestrooms?.restrooms ?? fc?.restroom ?? [];
                    const atm = fc?.atm ?? [];
                    const nursery = fc?.nursery ?? [];
                    const locker = fc?.locker ?? [];
                    const badges = [
                        wc.length > 0      && { icon: '🚻', count: wc.length },
                        atm.length > 0     && { icon: '💳', count: atm.length },
                        nursery.length > 0 && { icon: '🍼', count: nursery.length },
                        locker.length > 0  && { icon: '🔒', count: locker.length },
                    ].filter(Boolean) as { icon: string; count: number }[];
                    if (badges.length === 0) return null;

                    return (
                        <div className="mb-3 rounded-xl border border-zinc-100 dark:border-white/8 overflow-hidden">
                            <button
                                onClick={(e) => { e.stopPropagation(); hapticLight(); setFacilitiesExpanded(v => !v); }}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-zinc-50 dark:bg-white/[0.03] hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                            >
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-tight shrink-0">역사 시설</span>
                                    {badges.map(b => (
                                        <span key={b.icon} className="inline-flex items-center gap-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 font-bold">
                                            <span>{b.icon}</span><span>{b.count}</span>
                                        </span>
                                    ))}
                                </div>
                                <span className="text-[10px] text-zinc-400 shrink-0 ml-2">{facilitiesExpanded ? '▲' : '▼'}</span>
                            </button>
                            {facilitiesExpanded && (
                                <div className="px-3 py-2 space-y-3 border-t border-zinc-100 dark:border-white/8">
                                    {/* 화장실 */}
                                    {wc.length > 0 && (
                                        <div>
                                            <div className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-tight">🚻 화장실 ({wc.length}곳)</div>
                                            <div className="space-y-1">
                                                {wc.map((r: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-[11px]">
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 font-black text-[9px]">{r.floor || 'B1'}</span>
                                                        <span className="text-zinc-500 dark:text-zinc-400 flex-1 min-w-0 truncate">
                                                            {r.entrance && <span className="text-zinc-400">{r.entrance}번 출구 · </span>}
                                                            {r.detail || r.info}
                                                        </span>
                                                        {r.wheelchair && <span className="shrink-0 text-blue-400">♿</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {/* ATM */}
                                    {atm.length > 0 && (
                                        <div>
                                            <div className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-tight">💳 ATM ({atm.length}곳)</div>
                                            <div className="space-y-1">
                                                {atm.map((item: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-[11px]">
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 font-black text-[9px]">{item.floor || item.stnFloor || 'B1'}</span>
                                                        <span className="text-zinc-500 dark:text-zinc-400 flex-1 min-w-0 truncate">
                                                            {[item.bank, item.direction, item.detail].filter(Boolean).join(' · ') || item.info || item.name || ''}
                                                        </span>
                                                        {item.hours && <span className="shrink-0 text-zinc-400 text-[9px]">{item.hours}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {/* 수유실 */}
                                    {nursery.length > 0 && (
                                        <div>
                                            <div className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-tight">🍼 수유실 ({nursery.length}곳)</div>
                                            <div className="space-y-1">
                                                {nursery.map((item: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-[11px]">
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 font-black text-[9px]">{item.floor || item.stnFloor || 'B1'}</span>
                                                        <span className="text-zinc-500 dark:text-zinc-400 flex-1 min-w-0 truncate">
                                                            {item.entrance && <span className="text-zinc-400">{item.entrance}번 출구 · </span>}
                                                            {[item.direction, item.detail, item.info].filter(Boolean).join(' · ') || item.name || ''}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {/* 물품보관 */}
                                    {locker.length > 0 && (
                                        <div>
                                            <div className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-tight">🔒 물품보관 ({locker.length}곳)</div>
                                            <div className="space-y-1">
                                                {locker.map((item: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-[11px]">
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 font-black text-[9px]">{item.floor || item.stnFloor || 'B1'}</span>
                                                        <span className="text-zinc-500 dark:text-zinc-400 flex-1 min-w-0 truncate">
                                                            {[item.direction, item.detail, item.info].filter(Boolean).join(' · ') || item.name || ''}
                                                        </span>
                                                        {item.count != null && <span className="shrink-0 text-zinc-400 text-[9px]">{item.count}개</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Arrivals */}
                <div className="space-y-2">
                    {(activeTab === 'subway' && selectedStationName) ? (
                        arrivalLoading && stationArrivals.length === 0 ? (
                            <div className="py-5 flex items-center justify-center gap-2 text-zinc-400 dark:text-white/30 text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:0.2s]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:0.4s]" />
                            </div>
                        ) : stationArrivals.length > 0 ? (() => {
                            const notExpired = (arr: any) =>
                                arr.arvlCd === '1' || arr.arvlCd === '0' || (parseInt(arr.barvlDt) || 0) > 0;
                            const isUp   = (arr: any) => arr.updnLine.includes('상행') || arr.updnLine.includes('내선') || arr.updnLine.includes('상선');
                            const isDown = (arr: any) => arr.updnLine.includes('하행') || arr.updnLine.includes('외선') || arr.updnLine.includes('하선');

                            const validArrivals = filteredArrivals.filter(notExpired);
                            const allUp   = validArrivals.filter(isUp);
                            const allDown = validArrivals.filter(isDown);

                            const showUp   = routeDirection === null || routeDirection === '0';
                            const showDown = routeDirection === null || routeDirection === '1';
                            const upTrains   = showUp   ? allUp   : [];
                            const downTrains = showDown ? allDown : [];

                            const offHourMsg = (() => { const h = new Date().getHours(); return (h >= 1 && h < 5) ? "운행 종료" : "정보 없음"; })();
                            const singleDirection = routeDirection !== null;

                            return (
                                <div className={`${singleDirection ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}`}>
                                    {showUp && (
                                        <div className="flex flex-col gap-1.5 rounded-xl bg-blue-50/60 dark:bg-blue-500/[0.06] p-2">
                                            <ArrivalHeader
                                                defaultTitle="상행 · 내선"
                                                trains={upTrains}
                                                textColor="text-blue-500 dark:text-blue-400"
                                                borderColor="border-blue-500/20"
                                            />
                                            {upTrains.length > 0 ? (
                                                upTrains.slice(0, 3).map((arr: any, i: number) => (
                                                    <ArrivalItemListItem key={i} arr={arr} timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} />
                                                ))
                                            ) : (
                                                <div className="text-[10px] text-zinc-400 text-center py-2">{offHourMsg}</div>
                                            )}
                                        </div>
                                    )}
                                    {showDown && (
                                        <div className="flex flex-col gap-1.5 rounded-xl bg-orange-50/60 dark:bg-orange-500/[0.06] p-2">
                                            <ArrivalHeader
                                                defaultTitle="하행 · 외선"
                                                trains={downTrains}
                                                textColor="text-orange-500 dark:text-orange-400"
                                                borderColor="border-orange-500/20"
                                            />
                                            {downTrains.length > 0 ? (
                                                downTrains.slice(0, 3).map((arr: any, i: number) => (
                                                    <ArrivalItemListItem key={i} arr={arr} timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} />
                                                ))
                                            ) : (
                                                <div className="text-[10px] text-zinc-400 text-center py-2">{offHourMsg}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })() : (
                            <div className="py-5 text-center text-zinc-400 dark:text-white/30 text-[11px] font-bold">
                                {(() => { const h = new Date().getHours(); return (h >= 1 && h < 5) ? "운행 시간이 아닙니다." : "도착 정보가 없습니다."; })()}
                            </div>
                        )
                    ) : (selectedBusStop) ? (
                        <BusStopPanel stopId={selectedBusStop.id} cityCode={selectedBusStop.cityCode || "11"} onSelectBusRoute={onSelectBusRoute} />
                    ) : null}
                </div>

                {/* Navigation Actions — 도착 정보 아래 */}
                {(() => {
                    const stationName = selectedStationName || selectedBusStop?.name || selectedWC?.name || "";
                    const isStartSet = !!startStation;
                    if (!stationName) return null;
                    return (
                        <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-zinc-100 dark:border-white/5">
                            <button
                                onClick={(e) => { e.stopPropagation(); hapticLight(); onSetStart(stationName); setPopupCoords(null); }}
                                className={`py-2.5 rounded-xl text-[11px] font-black shadow-sm transition-all active:scale-95 ${!isStartSet ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/20'}`}
                            >
                                출발지
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); hapticLight(); onSetWaypoint(stationName); setPopupCoords(null); }}
                                className="py-2.5 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 text-zinc-800 dark:text-white text-[11px] font-black transition-all active:scale-95"
                            >
                                경유지
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); hapticLight(); onSetEnd(stationName); setPopupCoords(null); }}
                                className={`py-2.5 rounded-xl text-[11px] font-black shadow-sm transition-all active:scale-95 ${isStartSet ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/20'}`}
                            >
                                도착지
                            </button>
                        </div>
                    );
                })()}

                {selectedBusStop && (
                    <RoadViewButtons lat={selectedBusStop.lat} lng={selectedBusStop.lng} />
                )}
            </div>
        </Popup>
      )}

      {/* 2. Train Detail Popup — anchor="top" so it appears BELOW the train icon, not overlapping the station popup above */}
      {selectedTrain && (
        <Popup
            longitude={selectedTrain.lng}
            latitude={selectedTrain.lat}
            closeButton={false}
            closeOnClick={false}
            onClose={() => setSelectedTrain(null)}
            anchor="top"
            offset={[0, 24]}
            className="custom-train-popup"
        >
            <div 
                className="p-3 min-w-[200px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-white/10 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        {(() => {
                            const info = getLineInfo(selectedTrain.lineName);
                            return (
                                <>
                                    <div 
                                        className="px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 text-[10px] font-black border shadow-sm shrink-0"
                                        style={{ borderColor: info.color, color: info.color }}
                                    >
                                        {selectedTrain.headingTo.replace('행', '')}
                                    </div>
                                    <span className="text-[12px] font-black text-zinc-900 dark:text-white truncate">
                                        {selectedTrain.trainNo}열차
                                    </span>
                                    <span 
                                        className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black text-white shadow-sm shrink-0"
                                        style={{ backgroundColor: info.color }}
                                    >
                                        {info.num}
                                    </span>
                                </>
                            );
                        })()}
                        {selectedTrain.directAt === '1' && (
                            <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white text-[9px] font-black shrink-0">급행</span>
                        )}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); hapticLight(); setSelectedTrain(null); }}
                        className="p-1 -mr-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors shrink-0"
                    >
                        <X size={14} />
                    </button>
                </div>
                
                <div className="space-y-3 mb-4">
                    {/* Row 1: Current Status & Station */}
                    <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2">
                            <div className="px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-white/10 text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
                                {(() => {
                                    switch(selectedTrain.trainSttus) {
                                        case '0': return '진입';
                                        case '1': return '정차';
                                        case '2': return '이동중';
                                        case '3': return '전역출발';
                                        case '4': return '전역진입';
                                        case '5': return '전역도착';
                                        default: return '운행중';
                                    }
                                })()}
                            </div>
                            <span className="text-[11px] font-black text-zinc-900 dark:text-white">
                                {selectedTrain.statnNm}({selectedTrain.lineName.replace(/[^0-9]/g, '') || selectedTrain.lineName[0]})
                            </span>
                        </div>
                        <span className="text-[10px] font-black text-zinc-900 dark:text-white">
                            {(() => {
                                const diff = Math.floor((Date.now() - parseSeoulDate(selectedTrain.lastRecptnDt)) / 60000);
                                if (timeDisplayMode === 'duration') return diff <= 0 ? '방금전' : `${diff}분전`;
                                return new Date(parseSeoulDate(selectedTrain.lastRecptnDt)).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                            })()}
                        </span>
                    </div>

                    {/* Row 2: Expected Arrival */}
                    <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-black/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/5">
                        <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-tighter">도착예정</span>
                            <span className="text-[11px] font-black text-zinc-900 dark:text-white">
                                {selectedTrain.arrivalNm}({selectedTrain.lineName.replace(/[^0-9]/g, '') || selectedTrain.lineName[0]})
                            </span>
                        </div>
                        <span className="text-[11px] font-black text-zinc-900 dark:text-white">
                            {trainArrivalDetail ? (
                                (() => {
                                    const sec = parseInt(trainArrivalDetail.barvlDt) || 0;
                                    if (timeDisplayMode === 'duration') {
                                        const m = Math.floor(sec / 60);
                                        return m > 0 ? `${m}분후` : `곧 도착`;
                                    } else {
                                        const d = new Date(Date.now() + sec * 1000);
                                        return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                    }
                                })()
                            ) : (
                                (() => {
                                    // Intelligent Estimate Fallback
                                    const diffMins = Math.floor((Date.now() - parseSeoulDate(selectedTrain.lastRecptnDt)) / 60000);
                                    let estimate = 5; // Default 5 mins
                                    if (selectedTrain.trainSttus === '1' || selectedTrain.trainSttus === '0') {
                                        estimate = Math.max(3, 5 - diffMins); // If stopped/entering, estimate 3-5 mins
                                    } else if (selectedTrain.trainSttus === '2') {
                                        estimate = Math.max(2, 4 - diffMins); // If departed, estimate 2-4 mins
                                    }
                                    
                                    if (timeDisplayMode === 'duration') return `${estimate}분후`;
                                    const d = new Date(Date.now() + estimate * 60000);
                                    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                })()
                            )}
                        </span>
                    </div>
                </div>

                {congestionData?.congestionTrain && (
                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-white/5">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">칸별 혼잡도</span>
                            {isLoadingCongestion && <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />}
                        </div>
                        
                        <div className="grid grid-cols-10 gap-0.5 h-6 items-end">
                            {congestionData.congestionTrain.split('|').map((val: string, idx: number) => {
                                const v = parseInt(val);
                                const color = v < 35 ? 'bg-emerald-500' : v < 70 ? 'bg-amber-500' : v < 100 ? 'bg-orange-600' : 'bg-rose-600';
                                return (
                                    <div key={idx} className="group relative flex flex-col items-center">
                                        <div 
                                            className={`w-full rounded-t-sm transition-all duration-500 ${color}`}
                                            style={{ height: `${Math.max(10, v/2)}%` }}
                                        />
                                        <div className="opacity-0 group-hover:opacity-100 absolute -top-4 left-1/2 -translate-x-1/2 bg-black text-white text-[7px] px-1 rounded z-10">{v}%</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </Popup>
      )}
      
      {/* 3. Toilet (WC) Detail Popup */}
      {selectedWC && (
        <Popup
            longitude={selectedWC.lng}
            latitude={selectedWC.lat}
            closeButton={false}
            closeOnClick={false}
            onClose={() => onWCClick?.(null)}
            anchor="bottom"
            offset={12}
            className="custom-wc-popup"
        >
            <div 
                className={`p-3 min-w-[220px] max-w-[280px] rounded-2xl border shadow-xl transition-colors duration-300 ${isDarkMode ? 'bg-zinc-900/95 border-white/10 text-white' : 'bg-white/95 border-zinc-200 text-zinc-900'}`}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col min-w-0 flex-1 mr-2">
                        <div className="flex items-center gap-1 mb-1 flex-wrap">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-500 text-white uppercase tracking-tighter">화장실</span>
                            {selectedWC.isInsideGate && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-500">개찰구 내</span>
                            )}
                            {selectedWC.station && (
                                <span className="text-[10px] font-bold text-zinc-400 truncate">{selectedWC.station}</span>
                            )}
                        </div>
                        <h3 className="text-[14px] font-black truncate">{selectedWC.name?.replace(' 화장실', '')}</h3>
                        {selectedWC.location && (
                            <p className="text-[10px] text-zinc-400 font-medium truncate mt-0.5">{selectedWC.location}</p>
                        )}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onWCClick?.(null); }}
                        className="p-1 -mr-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors shrink-0"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-zinc-100 dark:bg-white/5 rounded-xl p-2 flex flex-col items-center">
                        <span className="text-[9px] font-black text-zinc-400 mb-0.5">남성용</span>
                        <div className="flex items-center gap-1.5 text-[11px] font-black">
                            <span>대 {selectedWC.maleStalls || 0}</span>
                            <span className="w-[1px] h-2 bg-zinc-300 dark:bg-white/10" />
                            <span>소 {selectedWC.maleUrinals || 0}</span>
                        </div>
                    </div>
                    <div className="bg-zinc-100 dark:bg-white/5 rounded-xl p-2 flex flex-col items-center">
                        <span className="text-[9px] font-black text-zinc-400 mb-0.5">여성용</span>
                        <div className="text-[11px] font-black">
                           대 {selectedWC.femaleStalls || 0}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mb-3 px-1">
                     <div className="flex gap-1.5">
                         {selectedWC.accessible && (
                            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500" title="장애인 편의">
                                <Accessibility size={12} />
                            </div>
                         )}
                         {selectedWC.emergencyBell && (
                            <div className="w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500" title="비상벨">
                                <Bell size={12} />
                            </div>
                         )}
                         {selectedWC.diapers && (
                            <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500" title="기저귀 교환대">
                                <Baby size={12} />
                            </div>
                         )}
                     </div>
                     <span className="text-[10px] font-bold text-zinc-400">
                        {selectedWC.openTime?.includes('24') || !selectedWC.openTime ? '24시간 운영' : selectedWC.openTime}
                     </span>
                </div>

                <div className="flex gap-1.5 mt-2 pt-2 border-t border-zinc-100 dark:border-white/5">
                    {(() => {
                        const { lat, lng } = selectedWC;
                        const addr = selectedWC.address || selectedWC.name;
                        const navApp = `nmap://navigation?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(addr)}&appname=metro.live`;
                        const navWeb = `https://map.naver.com/v5/entry/coordinates/${lng},${lat}?c=${lng},${lat},17,0,0,0,dh`;
                        const panoApp = `nmap://panorama?lat=${lat}&lng=${lng}&appname=metro.live`;
                        const panoWeb = `https://map.naver.com/v5/street?c=${lng},${lat},15,0,0,0,dh`;
                        return (<>
                            <a href={navApp}
                                onClick={e => { e.preventDefault(); hapticLight(); window.location.href = navApp; setTimeout(() => { window.open(navWeb, '_blank'); }, 300); }}
                                className="flex-1 flex items-center justify-center py-1.5 rounded-lg bg-[#03C75A] text-white text-[10px] font-bold transition-transform active:scale-95">
                                네이버 길안내
                            </a>
                            <a href={panoApp}
                                onClick={e => { e.preventDefault(); hapticLight(); window.location.href = panoApp; setTimeout(() => { window.open(panoWeb, '_blank'); }, 300); }}
                                className="flex-1 flex items-center justify-center py-1.5 rounded-lg bg-[#1ec75a]/80 text-white text-[10px] font-bold transition-transform active:scale-95">
                                거리뷰
                            </a>
                        </>);
                    })()}
                    <a
                        href={`https://map.kakao.com/link/to/${encodeURIComponent(selectedWC.name || '화장실')},${selectedWC.lat},${selectedWC.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => hapticLight()}
                        className="flex-1 flex items-center justify-center py-1.5 rounded-lg bg-[#FEE500] text-[#3c1e1e] text-[10px] font-bold transition-transform active:scale-95"
                    >
                        카카오
                    </a>
                </div>
                {selectedWC.address && (
                    <p className="text-[9px] font-medium text-zinc-400 line-clamp-2 leading-relaxed mt-1.5 px-0.5">
                        {selectedWC.address}
                    </p>
                )}
            </div>
        </Popup>
      )}
    </>
  );
};

export default memo(MapPopups);
