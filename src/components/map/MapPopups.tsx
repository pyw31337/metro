"use client";

import { useEffect, useMemo, memo } from "react";
import { Popup } from "react-map-gl/maplibre";
import { X, MapPin, Accessibility, Bell, Baby, RefreshCw } from "lucide-react";
import { StationArrival, ActiveTab } from "@/types/metro";
import { parseSeoulDate } from "@/services/arrivalApi";
import { getLineLongName } from "@/utils/stationUtils";
import { WCItem, BusStop, RouteSegment } from "@/types/metro";
import { ArrivalHeader, ArrivalItemListItem } from "./ArrivalInfo";
import { SUBWAY_LINES, STATION_LINE_IDX } from "@/data/subway-lines";
import { useCongestion } from "@/hooks/useCongestion";
import CongestionInfo from "./CongestionInfo";
import { useBusArrivals } from "@/hooks/useBusArrivals";
import { hapticLight } from "@/utils/haptic";

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
  onSelectBusRoute?: (routeNo: string, cityCode?: string) => void;
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
  // Naver Map: 좌표 기반 지도 열기 (거리뷰 버튼은 지도 내에서 클릭)
  // 모바일: nmap 딥링크, 웹 fallback: 좌표 + zoom17
  const naverWeb = address
    ? `https://map.naver.com/v5/search/${encodeURIComponent(address)}?c=${lng},${lat},17,0,0,0,dh`
    : `https://map.naver.com/v5/entry/coordinates/${lng},${lat}?c=${lng},${lat},17,0,0,0,dh`;
  const naverApp = `nmap://map?lat=${lat}&lng=${lng}&zoom=17${address ? `&query=${encodeURIComponent(address)}` : ''}&appname=metro.live`;
  const kakao    = `https://map.kakao.com/link/roadview/${lat},${lng}`;
  return (
    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-100 dark:border-white/5">
      <a
        href={naverApp}
        onClick={e => { e.preventDefault(); window.location.href = naverApp; setTimeout(() => { window.open(naverWeb, '_blank'); }, 300); }}
        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#03C75A] text-white text-[10px] font-bold transition-transform active:scale-95"
      >
        네이버지도
      </a>
      <a
        href={kakao}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#FEE500] text-[#3c1e1e] text-[10px] font-bold transition-transform active:scale-95"
      >
        카카오 로드뷰
      </a>
    </div>
  );
};

const BusArrivalList = ({ stopId, cityCode, onSelectBusRoute }: { stopId: string, cityCode: string, onSelectBusRoute?: (routeNo: string, cityCode?: string) => void }) => {
  const { arrivals, loading } = useBusArrivals(stopId, cityCode);

  if (loading) return <div className="py-4 text-center text-[11px] text-zinc-400 animate-pulse">도착 정보 로딩중...</div>;
  if (arrivals.length === 0) return <div className="py-4 text-center text-[11px] text-zinc-400">도착 정보가 없습니다.</div>;

  return (
    <div className="space-y-2 mt-2 max-h-[180px] overflow-y-auto no-scrollbar">
      {arrivals.map((bus: any, idx: number) => (
        <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 transition-all hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
          <div className="flex items-center gap-2">
             <button 
                onClick={(e) => { e.stopPropagation(); onSelectBusRoute?.(bus.routeNo, cityCode); }}
                className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[11px] font-black hover:bg-emerald-600 transition-colors shadow-sm"
             >
                {bus.routeNo}
             </button>
             <span className="text-[10px] text-zinc-400 font-medium">{bus.remainStops}정류장 남음</span>
          </div>
          <span className="text-[11px] font-black text-rose-500">
            {bus.arrivalTime < 60 ? "곧 도착" : `${Math.floor(bus.arrivalTime / 60)}분 후`}
          </span>
        </div>
      ))}
    </div>
  );
};

const BusRouteStaticList = ({ routes, cityCode, onSelectBusRoute }: { routes: string[], cityCode: string, onSelectBusRoute?: (routeNo: string, cityCode?: string) => void }) => {
    if (!routes || routes.length === 0) return null;
    return (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/5">
            <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 mb-2 uppercase tracking-tight">전체 노선 ({routes.length})</h4>
            <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto no-scrollbar">
                {routes.map((r, i) => (
                    <button 
                        key={i}
                        onClick={(e) => { e.stopPropagation(); onSelectBusRoute?.(r, cityCode); }}
                        className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300 text-[10px] font-black hover:bg-emerald-500 hover:text-white transition-all active:scale-95 border border-transparent hover:border-emerald-400 shadow-sm"
                    >
                        {r}
                    </button>
                ))}
            </div>
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
    return STATION_LINE_IDX.get(selectedStationName) ?? [];
  }, [activeTab, selectedStationName]);

  useEffect(() => {
    if (popupCoords && activeTab === 'subway' && !activeLine && badges.length > 0) {
      onActiveLineChange(badges[0].lineName);
    }
  }, [popupCoords, activeTab, activeLine, badges, onActiveLineChange]);

  return (
    <>
      {/* 1. Station/Bus Detail Popup */}
      {popupCoords && ((activeTab === 'subway' && selectedStationName) || (activeTab === 'bus' && selectedBusStop)) && (
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
                className="p-4 w-[280px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-white/20 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-zinc-100 dark:border-white/5">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <h3 className="text-[18px] font-black text-zinc-900 dark:text-white truncate max-w-[150px]">
                            {activeTab === 'subway' ? selectedStationName : selectedBusStop?.name}
                        </h3>
                        {activeTab === 'subway' && (
                            arrivalLoading
                                ? <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                                : isLiveArrival
                                    ? <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    : <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
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
                        className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar py-1 w-full min-w-0 scroll-smooth pointer-events-auto"
                        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onWheel={(e) => e.stopPropagation()}
                    >
                        {badges.map((badge, idx) => {
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
                                    className={`inline-flex items-center justify-center h-[26px] px-3 rounded-full text-[10px] font-black shadow-sm shrink-0 transition-all active:scale-90 ${isActive ? 'text-white scale-105' : 'bg-white border opacity-80'}`}
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
                
                {/* Navigation Actions */}
                <div className="grid grid-cols-3 gap-1.5 mb-4">
                    {(() => {
                        const stationName = selectedStationName || selectedBusStop?.name || selectedWC?.name || "";
                        const isStartSet = !!startStation;
                        if (!stationName) return null;
                        
                        return (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); hapticLight(); onSetStart(stationName); setPopupCoords(null); }}
                                    className={`py-2 rounded-xl text-[11px] font-black shadow-sm transition-all active:scale-95 ${!isStartSet ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/20'}`}
                                >
                                    출발지
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); hapticLight(); onSetWaypoint(stationName); setPopupCoords(null); }}
                                    className="py-2 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 text-zinc-800 dark:text-white text-[11px] font-black transition-all active:scale-95"
                                >
                                    경유지
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); hapticLight(); onSetEnd(stationName); setPopupCoords(null); }}
                                    className={`py-2 rounded-xl text-[11px] font-black shadow-sm transition-all active:scale-95 ${isStartSet ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/20'}`}
                                >
                                    도착지
                                </button>
                            </>
                        );
                    })()}
                </div>

                <div className="space-y-2">
                    {(activeTab === 'subway' && selectedStationName) ? (
                        arrivalLoading && stationArrivals.length === 0 ? (
                            <div className="py-4 flex items-center justify-center gap-2 text-zinc-400 dark:text-white/30 text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:0.2s]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:0.4s]" />
                            </div>
                        ) : stationArrivals.length > 0 ? (() => {
                            // 이미 지난 열차 제거 (barvlDt <= 0 이고 당역·진입 아닌 것)
                            const notExpired = (arr: any) =>
                                arr.arvlCd === '1' || arr.arvlCd === '0' || (parseInt(arr.barvlDt) || 0) > 0;
                            const isUp   = (arr: any) => arr.updnLine.includes('상행') || arr.updnLine.includes('내선') || arr.updnLine.includes('상선');
                            const isDown = (arr: any) => arr.updnLine.includes('하행') || arr.updnLine.includes('외선') || arr.updnLine.includes('하선');

                            const validArrivals = filteredArrivals.filter(notExpired);
                            const allUp   = validArrivals.filter(isUp);
                            const allDown = validArrivals.filter(isDown);

                            // 경로 검색 중: 해당 역의 경로 방향만 표시
                            const showUp   = routeDirection === null || routeDirection === '0';
                            const showDown = routeDirection === null || routeDirection === '1';
                            const upTrains   = showUp   ? allUp   : [];
                            const downTrains = showDown ? allDown : [];

                            const offHourMsg = (() => { const h = new Date().getHours(); return (h >= 1 && h < 5) ? "운행 종료" : "정보 없음"; })();

                            // 경로 방향 한쪽만 표시할 때는 전체 너비로
                            const singleDirection = routeDirection !== null;
                            return (
                            <div className={`mt-1 ${singleDirection ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-2'}`}>
                                {showUp && (
                                <div className="flex flex-col gap-1.5">
                                    <ArrivalHeader
                                        defaultTitle="상행 · 내선"
                                        trains={upTrains}
                                        textColor="text-blue-500 dark:text-blue-400"
                                        borderColor="border-blue-500/20"
                                    />
                                    {upTrains.length > 0 ? (
                                        upTrains.slice(0, 3).map((arr: any, i: number) => (
                                            <div key={i} className="flex items-center gap-1.5 group">
                                                <div className="flex-1">
                                                    <ArrivalItemListItem arr={arr} timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-[10px] text-zinc-400 text-center py-2">{offHourMsg}</div>
                                    )}
                                </div>
                                )}
                                {showDown && (
                                <div className="flex flex-col gap-1.5">
                                    <ArrivalHeader
                                        defaultTitle="하행 · 외선"
                                        trains={downTrains}
                                        textColor="text-orange-500 dark:text-orange-400"
                                        borderColor="border-orange-500/20"
                                    />
                                    {downTrains.length > 0 ? (
                                        downTrains.slice(0, 3).map((arr: any, i: number) => (
                                            <div key={i} className="flex items-center gap-1.5 group">
                                                <div className="flex-1">
                                                    <ArrivalItemListItem arr={arr} timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-[10px] text-zinc-400 text-center py-2">{offHourMsg}</div>
                                    )}
                                </div>
                                )}
                            </div>
                        );
                    })() : (
                            <div className="py-4 text-center text-zinc-400 dark:text-white/30 text-[11px] font-bold">
                                {(() => {
                                    const hour = new Date().getHours();
                                    return (hour >= 1 && hour < 5) ? "운행 시간이 아닙니다." : "도착 정보가 없습니다.";
                                })()}
                            </div>
                        )
                    ) : (selectedBusStop) ? (
                        <>
                            <BusArrivalList stopId={selectedBusStop.id} cityCode={selectedBusStop.cityCode || "11"} onSelectBusRoute={onSelectBusRoute} />
                            <BusRouteStaticList routes={selectedBusStop.routes} cityCode={selectedBusStop.cityCode || "11"} onSelectBusRoute={onSelectBusRoute} />
                        </>
                    ) : null}
                </div>
                
                {selectedBusStop && (
                   <RoadViewButtons lat={selectedBusStop.lat} lng={selectedBusStop.lng}  />
                )}
            </div>
        </Popup>
      )}

      {/* 2. Train Detail Popup */}
      {selectedTrain && (
        <Popup
            longitude={selectedTrain.lng}
            latitude={selectedTrain.lat}
            closeButton={false}
            closeOnClick={false}
            onClose={() => setSelectedTrain(null)}
            anchor="bottom"
            offset={20}
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
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-blue-500 text-white uppercase tracking-tighter">화장실</span>
                        </div>
                        <h3 className="text-[14px] font-black truncate">{selectedWC.name?.replace(' 화장실', '')}</h3>
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
                    <a
                        href={`https://map.naver.com/v5/search/${encodeURIComponent(selectedWC.address || selectedWC.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => hapticLight()}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-[#03C75A] text-white text-[10px] font-bold transition-transform active:scale-95"
                    >
                        네이버 길안내
                    </a>
                    <a
                        href={`https://map.kakao.com/link/to/${encodeURIComponent(selectedWC.name || '화장실')},${selectedWC.lat},${selectedWC.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => hapticLight()}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-[#FEE500] text-[#3c1e1e] text-[10px] font-bold transition-transform active:scale-95"
                    >
                        카카오 길안내
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
