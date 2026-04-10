"use client";

import { useState, useEffect, useRef } from "react";
import { StationArrival } from "@/types/metro";
import { SUBWAY_LINES } from "@/data/subway-lines";

// ─────────────────────────────────────────────────────────────────────────────
// 노선 색상 매핑
// ─────────────────────────────────────────────────────────────────────────────
const LINE_COLOR: Record<string, string> = {
  "1": "#0052A4", "2": "#00A84D", "3": "#EF7C1C", "4": "#00A5DE",
  "5": "#996CAC", "6": "#CD7C2F", "7": "#747F00", "8": "#E6186C",
  "9": "#BDB092",
  "수인분당": "#F5A200", "신분당": "#D4003B", "경의중앙": "#77C4A3",
  "공항철도": "#0090D2", "경춘": "#0C8E72", "인천1": "#7CA8D5", "인천2": "#ED8B00",
};

function getLineColor(subwayId: string): string {
  // subwayId 마지막 숫자 or 노선명 매핑 시도
  const num = subwayId?.slice(-1);
  if (LINE_COLOR[num]) return LINE_COLOR[num];
  for (const [key, color] of Object.entries(LINE_COLOR)) {
    if (subwayId?.includes(key)) return color;
  }
  return "#000000";
}

// ─────────────────────────────────────────────────────────────────────────────
// 도착 정보 아이템
// ─────────────────────────────────────────────────────────────────────────────
interface ArrivalItemProps {
  arr: StationArrival;
  timeDisplayMode: "duration" | "arrival";
  onToggleTimeDisplay?: () => void;
}

export const ArrivalItemListItem = ({ arr, timeDisplayMode, onToggleTimeDisplay }: ArrivalItemProps) => {
  // ── 정거장 수 파싱 ──
  let stopsLeft = parseStopsLeft(arr);

  // ── 도착 시간 계산 (초 단위, 마운트 시점 기준) ──
  const initialSec = useRef<number>((() => {
    // arvlCd "0"=진입, "1"=당역 → treat as ~20s remaining
    if (arr.arvlCd === '0' || arr.arvlCd === '1') return 20;
    let t = parseInt(arr.barvlDt) || 0;
    if (t === 0) {
      if (stopsLeft.includes("당역")) t = 30;
      else {
        const m = stopsLeft.match(/(\d+)역/);
        if (m) t = parseInt(m[1]) * 150;
      }
    }
    return t;
  })());
  const mountedAt = useRef(Date.now());

  // Live countdown state — ticks every second only while timeSec > 0
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const elapsed = () => Math.floor((Date.now() - mountedAt.current) / 1000);
    const remaining = () => Math.max(0, initialSec.current - elapsed());
    if (remaining() <= 0) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      if (remaining() <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const timeSec = Math.max(0, initialSec.current - Math.floor((Date.now() - mountedAt.current) / 1000));

  const relativeStr = formatRelative(timeSec);
  const clockStr    = initialSec.current > 0
    ? new Date(mountedAt.current + initialSec.current * 1000).toLocaleTimeString('ko-KR', {
        hour: '2-digit', minute: '2-digit', hour12: false
      })
    : '';

  const displayTime = timeDisplayMode === "duration" ? relativeStr : (clockStr || relativeStr);

  // ── 종착역 / 분기 ──
  const rawDest = (arr.bstatnNm || arr.trainLineNm?.split('-')[0] || '').replace('행', '').trim();
  const isDivergent = /인천|서동탄|병점|신창|고색|광명|천안/.test(rawDest);

  // ── 강조 여부 ──
  const isHighlight = stopsLeft.includes("당역") || stopsLeft.includes("진입")
    || arr.arvlCd === "0" || arr.arvlCd === "1";

  const lineColor = getLineColor(arr.subwayId ?? '');

  // ── 도착 코드 오버라이드 ──
  if (arr.arvlCd === "1") stopsLeft = "당역";
  else if (arr.arvlCd === "0") stopsLeft = "진입";

  return (
    <button
      onClick={() => onToggleTimeDisplay?.()}
      className={`
        w-full flex items-center justify-between px-3 py-2.5 rounded-xl
        bg-black/[0.03] dark:bg-white/5
        border transition-transform active:scale-[0.98]
        ${isDivergent ? 'border-orange-400/60' : 'border-black/5 dark:border-white/5'}
      `}
    >
      {/* 왼쪽: 데이터 유형 배지 + 시간 */}
      <div className="flex items-center gap-1.5 min-w-0">
        {arr.isScheduled ? (
          <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-black border border-amber-500/30">
            예정
          </span>
        ) : (
          <span className="shrink-0 flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black border border-emerald-500/30">
            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        )}
        <span
          className="text-[13px] font-black leading-tight"
          style={isHighlight ? { color: lineColor } : {}}
        >
          {displayTime}
        </span>
        {isDivergent && (
          <span className="shrink-0 text-[9px] px-1 py-0.5 border border-orange-400 text-orange-400 rounded font-black leading-none">
            {rawDest}
          </span>
        )}
      </div>

      {/* 오른쪽: 몇 역 전 */}
      <span
        className="text-[11px] font-bold leading-tight shrink-0 ml-2"
        style={isHighlight ? { color: lineColor } : { color: '#94a3b8' }}
      >
        {stopsLeft}
      </span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 열 헤더 (종착역 표시)
// ─────────────────────────────────────────────────────────────────────────────
interface ArrivalHeaderProps {
  defaultTitle: string;
  trains: StationArrival[];
  textColor: string;
  borderColor: string;
}

export const ArrivalHeader = ({ defaultTitle, trains, textColor, borderColor }: ArrivalHeaderProps) => {
  let title = defaultTitle;
  if (trains.length > 0) {
    const dest = (trains[0].bstatnNm || trains[0].trainLineNm?.split('-')[0] || '')
      .replace('행', '').trim();
    if (dest) title = dest;
  }
  return (
    <div className={`text-[11px] font-black ${textColor} text-center pb-2 border-b-2 ${borderColor} whitespace-nowrap truncate`}>
      {title}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 유틸: 정거장 수 파싱
// ─────────────────────────────────────────────────────────────────────────────
function parseStopsLeft(arr: StationArrival): string {
  const msg2 = arr.arvlMsg2 ?? '';
  const msg3 = arr.arvlMsg3 ?? '';

  // 한국어 "N 정거장 전" 패턴
  if (/정거장|역 전|번째 전역|역전/.test(msg2)) {
    const m = msg2.match(/\d+/);
    if (m) return `${m[0]}역전`;
  }

  // arvlMsg3 기반 거리 계산
  if (!arr.isScheduled && msg3 && arr.statnNm) {
    const cleanTrain = msg3.replace(/역$/, '');
    const cleanUser  = arr.statnNm.replace(/역$/, '');
    if (cleanTrain !== cleanUser) {
      let dist = -1;
      for (const line of SUBWAY_LINES) {
        const i1 = line.stations.findIndex(s => s.name.replace(/역$/, '') === cleanUser);
        const i2 = line.stations.findIndex(s => s.name.replace(/역$/, '') === cleanTrain);
        if (i1 !== -1 && i2 !== -1) { dist = Math.abs(i1 - i2); break; }
      }
      if (dist > 0) return `${dist}역전`;
    }
  }

  // msg2 폴백 — 분/초 언급 없는 텍스트만 사용
  const fallback = msg2.split('(')[0].trim().replace('정거장', '역');
  if (fallback && !/분|초/.test(fallback)) return fallback;

  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸: 상대 시간 포매팅
// ─────────────────────────────────────────────────────────────────────────────
function formatRelative(sec: number): string {
  if (sec <= 0) return '정보 없음';
  if (sec < 30) return '곧 도착';
  if (sec < 60) return `${sec}초 후`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}분 ${s}초 후` : `${m}분 후`;
}
