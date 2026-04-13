"use client";

import { useState, useEffect, useRef } from "react";
import { StationArrival } from "@/types/metro";
import { SUBWAY_LINES } from "@/data/subway-lines";
import { normStation, lineStationIdxMap } from "@/data/stationRegistry";

// ─────────────────────────────────────────────────────────────────────────────
// 공유 1초 틱 (모듈 레벨 singleton) — N개 도착 아이템이 interval 1개만 사용
// ─────────────────────────────────────────────────────────────────────────────
const _tickListeners = new Set<() => void>();
let _tickInterval: ReturnType<typeof setInterval> | null = null;

function _subscribe(fn: () => void) {
  _tickListeners.add(fn);
  if (!_tickInterval) {
    _tickInterval = setInterval(() => { _tickListeners.forEach(f => f()); }, 1000);
  }
}
function _unsubscribe(fn: () => void) {
  _tickListeners.delete(fn);
  if (_tickListeners.size === 0 && _tickInterval) {
    clearInterval(_tickInterval);
    _tickInterval = null;
  }
}

/** 모든 도착 아이템이 공유하는 1초 틱 — 1개의 setInterval만 실행됨 */
function useSharedTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const fn = () => setTick(t => t + 1);
    _subscribe(fn);
    return () => _unsubscribe(fn);
  }, [active]);
  return tick;
}

// ─────────────────────────────────────────────────────────────────────────────
// Station index lookup — delegates to stationRegistry (built once at module init)
// ─────────────────────────────────────────────────────────────────────────────
const LINE_STATION_IDX: Map<string, Map<string, number>> = new Map(
  SUBWAY_LINES.map(l => [l.name, lineStationIdxMap(l.name)!])
);

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
    if (arr.arvlCd === '1') return 0;     // 당역: 이미 도착 (카운트다운 없음)
    if (arr.arvlCd === '0') return 15;    // 진입: 약 15초
    let t = parseInt(arr.barvlDt) || 0;
    if (t === 0) {
      const m = stopsLeft.match(/(\d+)역/);
      if (m) t = parseInt(m[1]) * 150;
    }
    return t;
  })());
  const mountedAt = useRef(Date.now());
  const needsCountdown = initialSec.current > 0 && arr.arvlCd !== '1';

  // 공유 1초 틱 — N개 아이템이 interval 1개만 사용
  useSharedTick(needsCountdown);

  const elapsed = Math.floor((Date.now() - mountedAt.current) / 1000);
  const timeSec = initialSec.current - elapsed;

  // ── 당역(정차중): 항상 표시 ──
  const isAtStation = arr.arvlCd === '1';
  // ── 시간 만료: 당역 아니면 숨김 (이미 떠난 열차) ──
  if (timeSec <= 0 && !isAtStation) return null;

  // ── 종착역 / 분기 ──
  const rawDest = (arr.bstatnNm || arr.trainLineNm?.split('-')[0] || '').replace('행', '').trim();
  const isDivergent = /인천|서동탄|병점|신창|고색|광명|천안/.test(rawDest);

  const lineColor = getLineColor(arr.subwayId ?? '');

  // ── 시간 표시 결정 ──
  let displayTime: string;
  if (isAtStation) {
    displayTime = '정차중';
  } else if (arr.arvlCd === '0') {
    displayTime = '곧 도착';
  } else if (timeDisplayMode === 'arrival' && initialSec.current > 0) {
    displayTime = new Date(mountedAt.current + initialSec.current * 1000).toLocaleTimeString('ko-KR', {
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  } else {
    displayTime = formatRelative(Math.max(0, timeSec));
  }

  // ── 오른쪽 거리 표시 결정 ──
  // "곧 도착"은 시간 표시와 중복 → 표시 안 함
  // arvlCd 오버라이드
  if (isAtStation)           stopsLeft = '';        // 정차중이면 역수 불필요
  else if (arr.arvlCd === '0') stopsLeft = '진입중';
  else if (stopsLeft === '곧 도착' || stopsLeft === '당역' || stopsLeft === '진입') stopsLeft = '';

  const isHighlight = isAtStation || arr.arvlCd === '0';

  return (
    <button
      onClick={() => onToggleTimeDisplay?.()}
      className={`
        w-full px-3 py-1.5 rounded-xl
        bg-black/[0.03] dark:bg-white/5
        border transition-transform active:scale-[0.98] flex items-center justify-between gap-1
        ${isAtStation ? 'border-blue-400/50' : isDivergent ? 'border-orange-400/60' : 'border-black/5 dark:border-white/5'}
      `}
    >
      {/* 좌: LIVE 배지 + 시간 + 분기 배지 */}
      <div className="flex items-center gap-1.5 min-w-0 shrink">
        {!arr.isScheduled && (
          <span className="shrink-0 flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black border border-emerald-500/30">
            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        )}
        <span
          className="text-[14px] font-bold leading-tight whitespace-nowrap"
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

      {/* 우: 현재 위치(역수) — 항상 같은 줄 우측 */}
      {stopsLeft && (
        <span
          className="text-[11px] font-bold leading-tight shrink-0"
          style={isHighlight ? { color: lineColor } : { color: '#94a3b8' }}
        >
          {stopsLeft}
        </span>
      )}
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
    const cleanTrain = normStation(msg3);
    const cleanUser  = normStation(arr.statnNm);
    if (cleanTrain !== cleanUser) {
      let dist = -1;
      for (const [, idxMap] of LINE_STATION_IDX) {
        const i1 = idxMap.get(cleanUser) ?? -1;
        const i2 = idxMap.get(cleanTrain) ?? -1;
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
  if (sec < 30) return '곧 도착';
  if (sec < 60) return `${sec}초 후`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}분 ${s}초 후` : `${m}분 후`;
}
