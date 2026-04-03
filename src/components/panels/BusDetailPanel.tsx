"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bus, MapPin, Clock, ChevronRight, RefreshCw } from "lucide-react";
import { BusStop } from "@/types/metro";
import { MetropolitanBusService, BusArrivalItem } from "@/services/busApi";

interface BusDetailPanelProps {
  stop: BusStop;
  onClose: () => void;
  onSetStart?: (name: string) => void;
  onSetEnd?: (name: string) => void;
  onRouteSelect?: (stations: any[]) => void;
  isDarkMode?: boolean;
}

const BUS_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  "광역": { bg: "#ef4444", text: "#fff", label: "광역" },
  "직행좌석": { bg: "#ef4444", text: "#fff", label: "직행" },
  "좌석": { bg: "#3b82f6", text: "#fff", label: "좌석" },
  "일반": { bg: "#10b981", text: "#fff", label: "일반" },
  "마을": { bg: "#f59e0b", text: "#fff", label: "마을" },
  "공항": { bg: "#8b5cf6", text: "#fff", label: "공항" },
};

function getBusTypeBadge(routeNo: string) {
  if (/^M/.test(routeNo)) return BUS_TYPE_COLORS["광역"];
  if (/^9/.test(routeNo)) return BUS_TYPE_COLORS["광역"];
  if (routeNo.length <= 3 && parseInt(routeNo) > 0) return BUS_TYPE_COLORS["일반"];
  if (/^N/.test(routeNo)) return { bg: "#1e293b", text: "#a5f3fc", label: "심야" };
  return BUS_TYPE_COLORS["일반"];
}

export default function BusDetailPanel({ stop, onClose, onSetStart, onSetEnd, onRouteSelect, isDarkMode }: BusDetailPanelProps) {
  const [arrivals, setArrivals] = useState<BusArrivalItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeSequence, setRouteSequence] = useState<any[]>([]);

  const fetchArrivals = useCallback(async () => {
    if (!stop.cityCode) return;
    setIsLoading(true);
    try {
      const data = await MetropolitanBusService.fetchArrivals(stop.id, stop.cityCode);
      setArrivals(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.debug("Bus arrival fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [stop.id, stop.cityCode]);

  useEffect(() => {
    fetchArrivals();
    const interval = setInterval(fetchArrivals, 30000);
    return () => clearInterval(interval);
  }, [fetchArrivals]);

  const fetchSequence = async (routeId: string) => {
    if (selectedRouteId === routeId) {
        setSelectedRouteId(null);
        setRouteSequence([]);
        return;
    }
    setSelectedRouteId(routeId);
    const seq = await MetropolitanBusService.fetchLocalRouteStations(routeId);
    setRouteSequence(seq);
    if (onRouteSelect) onRouteSelect(seq);
  };

  const routes: string[] = typeof stop.routes === "string"
    ? (() => { try { return JSON.parse(stop.routes); } catch { return [stop.routes]; } })()
    : (stop.routes || []);

  const formatTime = (seconds: number) => {
    if (seconds <= 60) return "곧 도착";
    const m = Math.floor(seconds / 60);
    return `${m}분 후`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ type: "spring", damping: 26, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[3000] px-4 pb-6 pt-0"
        style={{ maxWidth: 480, margin: "0 auto" }}
      >
        <div
          className="rounded-3xl overflow-hidden shadow-[0_8px_64px_rgba(0,0,0,0.35)]"
          style={{
            background: isDarkMode
              ? "linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,41,59,0.95) 100%)"
              : "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(241,245,249,0.95) 100%)",
            backdropFilter: "blur(24px)",
            border: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
                >
                  <Bus size={18} color="white" />
                </div>
                <div>
                  <h2 className={`text-[17px] font-black leading-tight ${isDarkMode ? "text-white" : "text-zinc-900"}`}>
                    {stop.name}
                  </h2>
                  {stop.cityCode && (
                    <span className={`text-[10px] font-bold ${isDarkMode ? "text-white/40" : "text-zinc-400"}`}>
                      {stop.region || "정류장"} · {stop.id}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  isDarkMode ? "bg-white/10 text-white/60 hover:bg-white/20" : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                }`}
              >
                <X size={15} />
              </button>
            </div>

            {/* Action Buttons */}
            {(onSetStart || onSetEnd) && (
              <div className="flex gap-2 mt-3">
                {onSetStart && (
                  <button
                    onClick={() => { onSetStart(stop.name); onClose(); }}
                    className="flex-1 py-2 rounded-xl text-[11px] font-black bg-blue-500 hover:bg-blue-600 text-white transition-all active:scale-95 shadow-sm"
                  >
                    출발 설정
                  </button>
                )}
                {onSetEnd && (
                  <button
                    onClick={() => { onSetEnd(stop.name); onClose(); }}
                    className="flex-1 py-2 rounded-xl text-[11px] font-black bg-rose-500 hover:bg-rose-600 text-white transition-all active:scale-95 shadow-sm"
                  >
                    도착 설정
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Real-time Arrivals & Route View */}
          <div className="max-h-[320px] overflow-y-auto no-scrollbar">
            {arrivals.length > 0 && (
              <div className={`px-5 pb-3 border-t ${isDarkMode ? "border-white/5" : "border-zinc-100"}`}>
                <div className="flex items-center justify-between pt-3 mb-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/40" : "text-zinc-400"}`}>
                    실시간 도착
                  </span>
                  <div className="flex items-center gap-1.5">
                    {lastUpdated && (
                      <span className={`text-[9px] ${isDarkMode ? "text-white/30" : "text-zinc-300"}`}>
                        {lastUpdated.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 기준
                      </span>
                    )}
                    <button
                      onClick={fetchArrivals}
                      disabled={isLoading}
                      className={`transition-all ${isLoading ? "animate-spin opacity-50" : "hover:opacity-70"}`}
                    >
                      <RefreshCw size={12} className={isDarkMode ? "text-white/40" : "text-zinc-400"} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {arrivals.slice(0, 5).map((arr, i) => {
                    const badge = getBusTypeBadge(arr.routeNo);
                    const isSelected = selectedRouteId === arr.routeId;
                    return (
                      <div key={i} className="flex flex-col gap-1">
                        <div
                          onClick={() => fetchSequence(arr.routeId)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all active:scale-[0.98] ${
                            isSelected 
                                ? (isDarkMode ? "bg-white/10 ring-1 ring-white/20" : "bg-white ring-1 ring-zinc-200 shadow-sm")
                                : (isDarkMode ? "bg-white/5 hover:bg-white/8" : "bg-zinc-50 hover:bg-zinc-100")
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="px-1.5 py-0.5 rounded-md text-[10px] font-black"
                              style={{ background: badge.bg, color: badge.text }}
                            >
                              {arr.routeNo}
                            </span>
                            <span className={`text-[10px] ${isDarkMode ? "text-white/50" : "text-zinc-400"}`}>
                              {arr.remainStops > 0 ? `${arr.remainStops}정거장` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {arr.isLowFloor && (
                              <span className="px-1 py-0.5 rounded bg-sky-500/10 text-sky-600 text-[8px] font-black">저상</span>
                            )}
                            <span className={`text-[12px] font-black ${
                              arr.arrivalTime <= 90 ? "text-emerald-500" : isDarkMode ? "text-white" : "text-zinc-900"
                            }`}>
                              {formatTime(arr.arrivalTime)}
                            </span>
                          </div>
                        </div>

                        {/* Expandable Route Sequence (Offline Resilience) */}
                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="px-3 pb-3 overflow-hidden"
                            >
                                <div className={`mt-2 p-3 rounded-2xl border ${isDarkMode ? "bg-black/20 border-white/5" : "bg-white border-zinc-100 shadow-inner"}`}>
                                    <p className={`text-[9px] font-black uppercase tracking-tighter mb-2 ${isDarkMode ? "text-white/30" : "text-zinc-400"}`}>
                                        노선 경유 요약 (로컬 최적화)
                                    </p>
                                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                        {routeSequence.length > 0 ? routeSequence.map((s, idx) => (
                                            <div key={idx} className="flex items-start gap-2 group">
                                                <div className="flex flex-col items-center">
                                                    <div className={`w-2 h-2 rounded-full border-2 ${s.id === stop.id ? "bg-emerald-500 border-white" : (isDarkMode ? "border-white/20" : "border-zinc-300")}`} />
                                                    {idx < routeSequence.length - 1 && (
                                                        <div className={`w-0.5 h-4 ${isDarkMode ? "bg-white/5" : "bg-zinc-100"}`} />
                                                    )}
                                                </div>
                                                <span className={`text-[10px] font-medium leading-none ${s.id === stop.id ? (isDarkMode ? "text-emerald-400" : "text-emerald-600 font-black") : (isDarkMode ? "text-white/60" : "text-zinc-500")}`}>
                                                    {s.name}
                                                </span>
                                            </div>
                                        )) : (
                                            <p className="text-[10px] text-zinc-500 animate-pulse">노선 데이터를 로드 중...</p>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Routes List (when no arrivals or filtered) */}
            {routes.length > 0 && !selectedRouteId && (
              <div className={`px-5 pb-5 ${arrivals.length > 0 ? `border-t ${isDarkMode ? "border-white/5" : "border-zinc-100"} pt-3` : ""}`}>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDarkMode ? "text-white/40" : "text-zinc-400"}`}>
                  경유 노선 목록
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {routes.map((r, i) => {
                    const badge = getBusTypeBadge(r);
                    return (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-black shadow-sm"
                        style={{ background: badge.bg, color: badge.text }}
                      >
                        {r}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {routes.length === 0 && arrivals.length === 0 && (
              <div className={`px-5 pb-8 pt-4 text-center ${isDarkMode ? "text-white/30" : "text-zinc-400"}`}>
                <Bus size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-[12px] font-bold">노선 정보가 없습니다</p>
                <p className="text-[10px] mt-1 opacity-60">로컬 데이터베이스 점검 중...</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
