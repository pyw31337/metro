"use client";

import { useState, useEffect, useRef, memo } from "react";
import { Train, ArrowRight, RefreshCw, ChevronRight } from "lucide-react";
import type { PathResult, StationArrival } from "@/types/metro";
import { useRouteArrivals, type RouteSegmentArrival } from "@/hooks/useRouteArrivals";

// ─────────────────────────────────────────────────────────────────────────────
// 노선 색상
// ─────────────────────────────────────────────────────────────────────────────
const LINE_COLORS: Record<string, string> = {
  "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE",
  "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C",
  "9호선": "#BDB092", "수인분당선": "#F5A200", "신분당선": "#D4003B",
  "경의중앙선": "#77C4A3", "공항철도": "#0090D2", "경춘선": "#0C8E72",
  "신림선": "#6789CA", "우이신설선": "#B0B0B0",
};
function getLineColor(line: string): string {
  return LINE_COLORS[line] ?? "#64748b";
}

// ─────────────────────────────────────────────────────────────────────────────
// 공유 1초 틱 (모듈 레벨 singleton)
// ─────────────────────────────────────────────────────────────────────────────
const _tickListeners = new Set<() => void>();
let _tickInterval: ReturnType<typeof setInterval> | null = null;
function _subscribe(fn: () => void) {
  _tickListeners.add(fn);
  if (!_tickInterval) _tickInterval = setInterval(() => _tickListeners.forEach(f => f()), 1000);
}
function _unsubscribe(fn: () => void) {
  _tickListeners.delete(fn);
  if (_tickListeners.size === 0 && _tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
}
function useSharedTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick(t => t + 1);
    _subscribe(fn);
    return () => _unsubscribe(fn);
  }, []);
  return tick;
}

// ─────────────────────────────────────────────────────────────────────────────
// 단일 열차 도착 카드
// ─────────────────────────────────────────────────────────────────────────────
interface TrainCardProps {
  arr: StationArrival;
  lineColor: string;
  isFirst: boolean;
}
const TrainCard = memo(({ arr, lineColor, isFirst }: TrainCardProps) => {
  const mountedAt  = useRef(Date.now());
  const initialSec = useRef<number>(
    arr.arvlCd === '1' ? 0
    : arr.arvlCd === '0' ? 12
    : (() => { const t = parseInt(arr.barvlDt); return isNaN(t) || t <= 0 ? 0 : t; })()
  );

  // 공유 틱으로 남은 초 갱신
  useSharedTick();
  const elapsed = Math.floor((Date.now() - mountedAt.current) / 1000);
  const secLeft = Math.max(0, initialSec.current - elapsed);

  const isArrived = arr.arvlCd === '1' || (arr.arvlCd !== '0' && secLeft === 0);
  const isApproach = arr.arvlCd === '0';

  // 탑승 가능성 판정 (단순 시간 기반)
  let catchColor = "#64748b";
  let catchLabel = "";
  if (isArrived || isApproach) {
    catchColor = "#ef4444"; catchLabel = "막차 주의";
  } else if (secLeft <= 90) {
    catchColor = "#f97316"; catchLabel = "서두르세요";
  } else if (secLeft <= 180) {
    catchColor = "#eab308"; catchLabel = "여유 있음";
  } else {
    catchColor = "#22c55e"; catchLabel = "충분";
  }

  // 시간 표시
  let timeStr: string;
  if (isArrived)  timeStr = "정차중";
  else if (isApproach) timeStr = "곧 도착";
  else if (secLeft < 60) timeStr = `${secLeft}초`;
  else timeStr = `${Math.floor(secLeft / 60)}분 ${secLeft % 60 > 0 ? `${secLeft % 60}초` : ""}`.trim();

  // 현재 위치 문구 (arvlMsg2 → 간략화)
  const posMsg = arr.arvlMsg2
    ?.replace('번째 전역(', ' 전(')
    .replace(')', '')
    .replace('전역 출발', '출발')
    .replace('당역 도착', '도착') ?? '';

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
      isFirst ? "bg-white/10 dark:bg-white/8" : "bg-white/5 dark:bg-white/4"
    }`}>
      {/* 시간 */}
      <div className="shrink-0 text-right min-w-[52px]">
        <span
          className={`font-black tabular-nums leading-tight ${isFirst ? "text-[15px]" : "text-[12px]"}`}
          style={{ color: isFirst ? lineColor : "#94a3b8" }}
        >
          {timeStr}
        </span>
      </div>

      {/* 구분선 */}
      <div className="w-px h-6 rounded-full shrink-0" style={{ backgroundColor: isFirst ? lineColor + "80" : "#94a3b840" }} />

      {/* 현재 위치 */}
      <div className="flex flex-col gap-0 min-w-0 flex-1">
        {posMsg ? (
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight truncate">{posMsg}</span>
        ) : null}
        <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 leading-tight truncate">
          {arr.trainLineNm || arr.bstatnNm ? `${arr.bstatnNm ?? ""}행` : arr.updnLine}
        </span>
      </div>

      {/* LIVE 배지 or 예정 */}
      <div className="shrink-0">
        {!arr.isScheduled ? (
          <span className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-black border border-emerald-500/25">
            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        ) : (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-zinc-200/60 dark:bg-white/8 text-zinc-400 font-bold">예정</span>
        )}
      </div>

      {/* 탑승 가능성 점 (첫 열차만) */}
      {isFirst && catchLabel && (
        <div className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: catchColor }} title={catchLabel} />
      )}
    </div>
  );
});
TrainCard.displayName = "TrainCard";

// ─────────────────────────────────────────────────────────────────────────────
// 단일 구간 카드
// ─────────────────────────────────────────────────────────────────────────────
const SegmentCard = memo(({ seg, isLast }: { seg: RouteSegmentArrival; isLast: boolean }) => {
  const lineColor = getLineColor(seg.line);
  const dirLabel = seg.direction === '1'
    ? (seg.line === '2호선' ? '외선' : '하행')
    : (seg.line === '2호선' ? '내선' : '상행');

  const stationCount = 0; // 향후 환승 도보 시간 연동 가능

  return (
    <div className="flex flex-col gap-0">
      {/* 탑승역 헤더 */}
      <div className="flex items-center gap-2 px-3 pb-1.5">
        {/* 노선 색 점 */}
        <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: lineColor }} />
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <span className="text-[13px] font-black text-zinc-900 dark:text-white truncate">{seg.boardStation}</span>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: lineColor + "20", color: lineColor }}>
            {seg.line} {dirLabel}
          </span>
        </div>
        <ChevronRight size={12} className="text-zinc-300 shrink-0" />
        <span className="text-[11px] font-bold text-zinc-400 truncate max-w-[80px]">{seg.alightStation}</span>
      </div>

      {/* 열차 목록 */}
      <div className="flex flex-col gap-1 px-1">
        {seg.loading ? (
          // 스켈레톤
          <div className="flex gap-2 px-3 py-2 rounded-xl bg-white/5">
            <div className="w-12 h-4 rounded bg-zinc-200 dark:bg-white/10 animate-pulse" />
            <div className="flex-1 h-4 rounded bg-zinc-200 dark:bg-white/10 animate-pulse" />
          </div>
        ) : seg.trains.length === 0 ? (
          // 의미 있는 상태만 표시, 나머지는 섹션 자체를 숨김
          seg.serviceStatus === 'not-started' ? (
            <div className="px-3 py-2 text-[11px] font-bold text-sky-400">아직 첫차 전</div>
          ) : seg.serviceStatus === 'ended' ? (
            <div className="px-3 py-2 text-[11px] font-bold text-zinc-400">오늘 운행 종료</div>
          ) : null
        ) : (
          seg.trains.map((t, i) => (
            <TrainCard key={`${t.btrainNo || i}-${t.barvlDt}`} arr={t} lineColor={lineColor} isFirst={i === 0} />
          ))
        )}
      </div>

      {/* 연결선 (마지막 구간 제외) */}
      {!isLast && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-0.5 mt-1">
          <div className="w-3 flex justify-center">
            <div className="w-px h-4 bg-zinc-200 dark:bg-white/10" />
          </div>
          <span className="text-[10px] text-zinc-400 font-bold">
            {seg.alightStation} 환승
          </span>
        </div>
      )}
    </div>
  );
});
SegmentCard.displayName = "SegmentCard";

// ─────────────────────────────────────────────────────────────────────────────
// 메인 패널
// ─────────────────────────────────────────────────────────────────────────────
interface RouteArrivalPanelProps {
  activePath: PathResult | null;
  isDarkMode?: boolean;
}

export const RouteArrivalPanel = memo(({ activePath }: RouteArrivalPanelProps) => {
  const segArrivals = useRouteArrivals(activePath);

  if (!activePath?.segments?.length || segArrivals.length === 0) return null;

  // 마지막 fetch 시각 (가장 최근 것)
  const latestFetch = segArrivals.reduce<number | null>((acc, s) =>
    s.fetchedAt ? Math.max(acc ?? 0, s.fetchedAt) : acc, null
  );
  const hasLive = segArrivals.some(s => s.trains.some(t => !t.isScheduled));

  return (
    <div className="flex flex-col gap-0 mt-2 mb-1 rounded-2xl overflow-hidden bg-zinc-50 dark:bg-white/5 border border-black/5 dark:border-white/8">
      {/* 패널 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/5 dark:border-white/8">
        <div className="flex items-center gap-1.5">
          <Train size={12} className="text-zinc-400" />
          <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">탑승 열차 현황</span>
          {hasLive && (
            <span className="flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-black">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        {latestFetch && (
          <div className="flex items-center gap-1 text-[9px] text-zinc-400">
            <RefreshCw size={9} />
            <RefreshCountdown fetchedAt={latestFetch} />
          </div>
        )}
      </div>

      {/* 구간 목록 */}
      <div className="flex flex-col gap-0 py-2">
        {segArrivals.map((seg, i) => (
          <SegmentCard
            key={`${seg.boardStation}-${seg.line}-${i}`}
            seg={seg}
            isLast={i === segArrivals.length - 1}
          />
        ))}
      </div>

      {/* 안내 문구 */}
      <div className="px-3 pb-2">
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />충분
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mx-1 ml-2" />여유
          <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mx-1 ml-2" />서두르세요
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 mx-1 ml-2" />막차주의
        </p>
      </div>
    </div>
  );
});
RouteArrivalPanel.displayName = "RouteArrivalPanel";

// ─────────────────────────────────────────────────────────────────────────────
// 다음 자동 갱신까지 카운트다운
// ─────────────────────────────────────────────────────────────────────────────
const RefreshCountdown = memo(({ fetchedAt }: { fetchedAt: number }) => {
  useSharedTick();
  const remaining = Math.max(0, 30 - Math.floor((Date.now() - fetchedAt) / 1000));
  return <span>{remaining}초 후 갱신</span>;
});
RefreshCountdown.displayName = "RefreshCountdown";
