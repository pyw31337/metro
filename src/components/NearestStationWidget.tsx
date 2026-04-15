"use client";

import { memo, useMemo } from "react";
import { Train, MapPin } from "lucide-react";
import { useArrivalInfo } from "@/hooks/useArrivalInfo";
import type { Station } from "@/types/metro";

const LINE_COLORS: Record<string, string> = {
  "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE",
  "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C",
  "9호선": "#BDB092", "수인분당선": "#F5A200", "신분당선": "#D4003B",
  "경의중앙선": "#77C4A3", "공항철도": "#0090D2", "경춘선": "#0C8E72",
  "신림선": "#6789CA", "우이신설선": "#B0B0B0",
};

interface Props {
  nearestStation: Station | null;
  onSelectStation: (name: string) => void;
}

export const NearestStationWidget = memo(function NearestStationWidget({ nearestStation, onSelectStation }: Props) {
  const { arrivals, loading } = useArrivalInfo(nearestStation?.name ?? null);

  const nextTrains = useMemo(() => {
    if (!arrivals.length) return [];
    // 방향별로 첫 번째 열차만 최대 3개
    const seen = new Set<string>();
    const out: typeof arrivals = [];
    for (const a of arrivals) {
      const key = a.updnLine ?? a.lineName ?? "?";
      if (!seen.has(key)) { seen.add(key); out.push(a); }
      if (out.length === 3) break;
    }
    return out;
  }, [arrivals]);

  if (!nearestStation) return null;

  const secToDisplay = (barvlDt: string, arvlCd: string) => {
    if (arvlCd === "1") return "정차중";
    if (arvlCd === "0") return "곧 도착";
    const sec = parseInt(barvlDt);
    if (isNaN(sec) || sec <= 0) return "도착";
    if (sec < 60) return `${sec}초`;
    return `${Math.floor(sec / 60)}분`;
  };

  return (
    <button
      onClick={() => onSelectStation(nearestStation.name)}
      className="w-full text-left animate-fade-in-up flex flex-col gap-2 px-3 py-2.5 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-200/60 dark:border-white/8 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all active:scale-[0.99]"
      aria-label={`${nearestStation.name} 도착 정보`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MapPin size={11} className="text-blue-500 shrink-0" />
          <span className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">내 근처 역</span>
        </div>
        {loading && (
          <span className="text-[9px] text-zinc-400 font-bold animate-pulse">조회중...</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Train size={14} className="text-zinc-400 shrink-0" />
        <span className="text-[14px] font-black text-zinc-900 dark:text-white">{nearestStation.name}</span>
        <div className="flex gap-1 flex-wrap">
          {nearestStation.lines?.map((l: string) => {
            const color = LINE_COLORS[l] ?? "#888";
            const short = l.replace("호선", "").replace("선", "").slice(0, 3);
            return (
              <span key={l} className="px-1.5 py-0.5 rounded-full text-[9px] font-black text-white" style={{ backgroundColor: color }}>
                {short}
              </span>
            );
          })}
        </div>
      </div>

      {/* 다음 열차 목록 */}
      {nextTrains.length > 0 ? (
        <div className="flex gap-2 flex-wrap">
          {nextTrains.map((a, i) => {
            const color = LINE_COLORS[a.lineName ?? ""] ?? "#888";
            const time = secToDisplay(a.barvlDt ?? "0", a.arvlCd ?? "99");
            return (
              <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-white/8 border border-zinc-100 dark:border-white/5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[11px] font-black tabular-nums text-zinc-800 dark:text-white">{time}</span>
                <span className="text-[9px] text-zinc-400 font-bold truncate max-w-[56px]">{a.bstatnNm}행</span>
                {!a.isScheduled && (
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse shrink-0" title="실시간" />
                )}
              </div>
            );
          })}
        </div>
      ) : !loading ? (
        <span className="text-[11px] text-zinc-400 font-bold">운행 정보 없음</span>
      ) : null}
    </button>
  );
});
