"use client";

import { useState, useEffect, useMemo } from "react";
import { Popup } from "react-map-gl/maplibre";
import { X } from "lucide-react";
import { StationArrival } from "@/types/metro";
import { parseSeoulDate } from "@/services/arrivalApi";
import { getLineShortName, getLineLongName } from "@/utils/stationUtils";
import { WCItem } from "@/components/WCLayer";
import { BusStop } from "@/components/BusStopLayer";
import { ArrivalHeader, ArrivalItemListItem } from "./ArrivalInfo";
import { SUBWAY_LINES } from "@/data/subway-lines";

interface MapPopupsProps {
  popupCoords: [number, number] | null;
  selectedStationName: string | null;
  selectedBusStop: BusStop | null;
  activeTab: string;
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
}

const getLineInfo = (lineName: string) => {
    if (!lineName) return { num: '?', color: '#ccc' };
    const num = lineName.replace('호선', '').replace('서울배차', '').trim();
    const line = SUBWAY_LINES.find(l => l.name.includes(num));
    return { num, color: line?.color || '#ccc' };
};

const getStationBadges = (name: string) => {
    if (!name) return [];
    const cleanName = name.replace(/역+$/, '');
    const badges: { num: string; color: string; lineName: string }[] = [];
    const addedLines = new Set<string>();

    for (const line of SUBWAY_LINES) {
        if (line.stations.some(s => s.name === cleanName || s.name === cleanName + '역')) {
            if (!addedLines.has(line.name)) {
                badges.push({ 
                    num: getLineShortName(line.name), 
                    color: line.color,
                    lineName: line.name 
                });
                addedLines.add(line.name);
            }
        }
    }
    return badges;
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
  onActiveLineChange
}: MapPopupsProps) => {
  const badges = useMemo(() => getStationBadges(selectedStationName || ""), [selectedStationName]);

  useEffect(() => {
    if (badges.length > 0 && (!activeLine || !badges.find(b => b.num === activeLine))) {
        onActiveLineChange(badges[0].num);
    } else if (badges.length === 0 && activeLine) {
        onActiveLineChange(null);
    }
  }, [badges, activeLine, onActiveLineChange]);

  const filteredArrivals = useMemo(() => {
    if (!activeLine) return stationArrivals;
    return stationArrivals.filter(arr => 
        arr.lineName.includes(activeLine) || 
        arr.subwayId.endsWith(activeLine.padStart(2, '0'))
    );
  }, [stationArrivals, activeLine]);

  return (
    <>
      {/* 1. Station/Bus Detail Popup */}
      {popupCoords && ((activeTab === 'subway' && selectedStationName) || (activeTab === 'bus' && selectedBusStop)) && (
        <Popup
            longitude={popupCoords[0]}
            latitude={popupCoords[1]}
            closeButton={false}
            closeOnClick={false}
            onClose={() => setPopupCoords(null)}
            anchor="bottom"
            offset={15}
            className="custom-station-popup"
        >
            <div className="p-4 min-w-[240px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-white/20 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-zinc-100 dark:border-white/5">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <h3 className="text-[18px] font-black text-zinc-900 dark:text-white truncate max-w-[170px]">
                            {selectedStationName || selectedBusStop?.name}
                        </h3>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setPopupCoords(null); }}
                        className="p-1.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-all active:scale-90"
                    >
                        <X size={16} />
                    </button>
                </div>

                {activeTab === 'subway' && badges.length > 0 && (
                    <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar py-0.5">
                        {badges.map((badge, idx) => {
                            const label = getLineLongName(badge.lineName);
                            
                            return (
                                <button 
                                    key={idx}
                                    onClick={(e) => { e.stopPropagation(); onActiveLineChange(badge.num); }}
                                    className={`inline-flex items-center justify-center h-[26px] px-3 rounded-full text-[10px] font-black text-white shadow-sm shrink-0 transition-all active:scale-90 ${activeLine === badge.num ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-900 scale-105' : 'opacity-40 grayscale-[0.3]'}`}
                                    style={{ backgroundColor: badge.color }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}
                
                {/* Navigation Actions */}
                <div className="grid grid-cols-3 gap-1.5 mb-4">
                    {(() => {
                        const stationName = activeTab === 'subway' ? selectedStationName! : selectedBusStop!.name;
                        const isStartSet = !!startStation;
                        
                        return (
                            <>
                                <button 
                                    onClick={() => { onSetEnd(stationName); setPopupCoords(null); }} 
                                    className={`py-2 rounded-xl text-[11px] font-bold shadow-sm transition-all active:scale-95 ${isStartSet ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/20'}`}
                                >
                                    도착
                                </button>
                                <button 
                                    onClick={() => { onSetWaypoint(stationName); setPopupCoords(null); }} 
                                    className="py-2 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 text-zinc-800 dark:text-white text-[11px] font-bold transition-all active:scale-95"
                                >
                                    경유
                                </button>
                                <button 
                                    onClick={() => { onSetStart(stationName); setPopupCoords(null); }} 
                                    className={`py-2 rounded-xl text-[11px] font-bold shadow-sm transition-all active:scale-95 ${!isStartSet ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/20'}`}
                                >
                                    출발
                                </button>
                            </>
                        );
                    })()}
                </div>

                <div className="space-y-2">
                    {activeTab === 'bus' && (
                        <p className="text-[9px] font-black text-zinc-400 dark:text-white/40 uppercase tracking-widest mb-1">
                            경유 노선 정보
                        </p>
                    )}
                    {activeTab === 'bus' && selectedBusStop ? (
                        <div className="flex flex-wrap gap-1">
                             {(typeof selectedBusStop.routes === 'string' ? JSON.parse(selectedBusStop.routes) : (selectedBusStop.routes || [])).map((r: string, i: number) => (
                                <span key={i} className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black border border-emerald-500/20">
                                    {r}
                                </span>
                            ))}
                        </div>
                    ) : stationArrivals.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <div className="flex flex-col gap-1.5">
                                <ArrivalHeader 
                                    defaultTitle="상행 · 내선" 
                                    trains={filteredArrivals.filter((arr: any) => arr.updnLine.includes('상행') || arr.updnLine.includes('내선') || arr.updnLine.includes('상선'))}
                                    textColor="text-blue-500 dark:text-blue-400"
                                    borderColor="border-blue-500/20"
                                />
                                {filteredArrivals.filter((arr: any) => arr.updnLine.includes('상행') || arr.updnLine.includes('내선') || arr.updnLine.includes('상선')).length > 0 ? (
                                    filteredArrivals.filter((arr: any) => arr.updnLine.includes('상행') || arr.updnLine.includes('내선') || arr.updnLine.includes('상선')).slice(0, 3).map((arr: any, i: number) => (
                                        <div key={i} className="flex items-center gap-1">
                                            <ArrivalItemListItem arr={arr} timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} />
                                            {arr.isScheduled && <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-200 dark:bg-white/10 text-zinc-500 font-black">예정</span>}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-[10px] text-zinc-400 text-center py-2">
                                        {(() => {
                                            const hour = new Date().getHours();
                                            return (hour >= 1 && hour < 5) ? "운행 종료" : "정보 없음";
                                        })()}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <ArrivalHeader 
                                    defaultTitle="하행 · 외선" 
                                    trains={filteredArrivals.filter((arr: any) => arr.updnLine.includes('하행') || arr.updnLine.includes('외선') || arr.updnLine.includes('하선'))}
                                    textColor="text-orange-500 dark:text-orange-400"
                                    borderColor="border-orange-500/20"
                                />
                                {filteredArrivals.filter((arr: any) => arr.updnLine.includes('하행') || arr.updnLine.includes('외선') || arr.updnLine.includes('하선')).length > 0 ? (
                                    filteredArrivals.filter((arr: any) => arr.updnLine.includes('하행') || arr.updnLine.includes('외선') || arr.updnLine.includes('하선')).slice(0, 3).map((arr: any, i: number) => (
                                        <div key={i} className="flex items-center gap-1">
                                            <ArrivalItemListItem arr={arr} timeDisplayMode={timeDisplayMode} onToggleTimeDisplay={onToggleTimeDisplay} />
                                            {arr.isScheduled && <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-200 dark:bg-white/10 text-zinc-500 font-black">예정</span>}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-[10px] text-zinc-400 text-center py-2">
                                        {(() => {
                                            const hour = new Date().getHours();
                                            return (hour >= 1 && hour < 5) ? "운행 종료" : "정보 없음";
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="py-4 text-center text-zinc-400 dark:text-white/30 text-[11px] font-bold">
                            {(() => {
                                const hour = new Date().getHours();
                                return (hour >= 1 && hour < 5) ? "운행 시간이 아닙니다." : "도착 정보가 없습니다.";
                            })()}
                        </div>
                    )}
                </div>
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
            <div className="p-3 min-w-[200px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-white/10 shadow-2xl">
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
                                        {selectedTrain.headingTo}행
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
                        onClick={(e) => { e.stopPropagation(); setSelectedTrain(null); }}
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
    </>
  );
};

export default MapPopups;
