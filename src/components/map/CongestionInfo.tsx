"use client";

import { CongestionData } from "@/services/congestionApi";
import { Users, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CongestionInfoProps {
  data: CongestionData;
}

const CongestionInfo = ({ data }: CongestionInfoProps) => {
  const getLevelColor = (level: string) => {
    switch (level) {
      case '여유': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
      case '보통': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case '혼잡': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      default: return 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case '상승': return <TrendingUp size={12} className="text-rose-500" />;
      case '하락': return <TrendingDown size={12} className="text-emerald-500" />;
      default: return <Minus size={12} className="text-zinc-400" />;
    }
  };

  return (
    <div className="mt-2 p-3 rounded-2xl bg-black/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Users size={14} className="text-zinc-400 shrink-0" />
          <span className="text-[11px] font-black text-zinc-500 uppercase tracking-wider truncate">
            실시간 역내 혼잡도
          </span>
        </div>
        <div className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${getLevelColor(data.congestionLevel)}`}>
          {data.congestionLevel}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {getTrendIcon(data.trend)}
          <span className="text-[10px] font-bold text-zinc-400">
            {data.trend === '상승' ? '인구 증가 중' : data.trend === '하락' ? '인구 감소 중' : '안정적'}
          </span>
        </div>
        <span className="text-[9px] font-medium text-zinc-400/60 tabular-nums">
          {data.timestamp.split(' ')[1]} 기준
        </span>
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-500 line-clamp-2 italic">
        "{data.msg}"
      </p>
    </div>
  );
};

export default CongestionInfo;
