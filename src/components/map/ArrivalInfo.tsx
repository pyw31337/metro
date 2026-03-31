"use client";

import { useState } from "react";
import { StationArrival } from "@/types/metro";
import { SUBWAY_LINES } from "@/data/subway-lines";

export const ArrivalHeader = ({ defaultTitle, trains, textColor, borderColor }: { defaultTitle: string, trains: StationArrival[], textColor: string, borderColor: string }) => {
    const [showSchedule, setShowSchedule] = useState(false);
    
    let title = defaultTitle;
    if (trains.length > 0) {
        const dest = trains[0].trainLineNm.split('-')[0].replace('행', '').trim();
        const base = defaultTitle.split('·')[0].trim();
        
        // Map 내선/외선 and determine 상/하/좌/우
        let dir = base;
        if (base.includes('내선')) dir = '좌행 (내선)';
        else if (base.includes('외선')) dir = '우행 (외선)';
        else if (base.includes('상행')) dir = '상행';
        else if (base.includes('하행')) dir = '하행';

        title = `${dir} (${dest}행)`; 
    }

    return (
        <button 
            onClick={(e) => { e.stopPropagation(); setShowSchedule(!showSchedule); }}
            className={`w-full text-left focus:outline-none transition-transform active:scale-95`}
        >
            <div className={`text-[11px] font-black ${textColor} text-center pb-2 border-b-2 ${borderColor}`}>
                {showSchedule ? '첫차 05:00 / 막차 12:00' : title}
            </div>
        </button>
    );
};

export const ArrivalItemListItem = ({ arr, timeDisplayMode, onToggleTimeDisplay }: { arr: StationArrival, timeDisplayMode: "duration" | "arrival", onToggleTimeDisplay?: () => void }) => {
    
    let stopsLeft = "";
    if (arr.arvlMsg2.includes("정거장") || arr.arvlMsg2.includes("역 전") || arr.arvlMsg2.includes("번째 전역") || arr.arvlMsg2.includes("역전")) {
        const match = arr.arvlMsg2.match(/\d+/);
        if (match) stopsLeft = `${match[0]}역전`;
    } 

    if (!stopsLeft && arr.arvlMsg3 && arr.statnNm) {
        const cleanTrainLoc = arr.arvlMsg3.replace(/역$/, '');
        const cleanUserLoc = arr.statnNm.replace(/역$/, '');
        
        if (cleanTrainLoc !== cleanUserLoc) {
            let dist = -1;
            for (const line of SUBWAY_LINES) {
                const idx1 = line.stations.findIndex(s => s.name.replace(/역$/, '') === cleanUserLoc);
                const idx2 = line.stations.findIndex(s => s.name.replace(/역$/, '') === cleanTrainLoc);
                if (idx1 !== -1 && idx2 !== -1) {
                    dist = Math.abs(idx1 - idx2);
                    break;
                }
            }
            if (dist > 0) stopsLeft = `${dist}역전`;
        }
    }

    if (!stopsLeft) {
        let fallback = arr.arvlMsg2.split("(")[0].trim().replace("정거장", "역");
        if (!fallback.includes("분") && !fallback.includes("초")) {
            stopsLeft = fallback;
        }
    }

    if (arr.statnNm) {
        const cleanName = arr.statnNm.replace(/역$/, '');
        stopsLeft = stopsLeft.replace(new RegExp(`${cleanName}역?`, 'g'), "당역");
    }
    
    let timeSec = parseInt(arr.barvlDt) || 0;
    
    if (timeSec === 0 && stopsLeft) {
        if (stopsLeft.includes("당역")) timeSec = 30;
        else if (stopsLeft.includes("역전")) {
            const m = stopsLeft.match(/\d+/);
            if (m) timeSec = parseInt(m[0]) * 180;
        }
    }

    let relativeStr = "";
    let clockStr = "";
    
    if (timeSec > 0) {
        const d = new Date(Date.now() + timeSec * 1000);
        clockStr = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        const m = Math.floor(timeSec / 60);
        relativeStr = m > 0 ? `${m}분후` : `곧 도착`;
    } else {
        clockStr = "";
        relativeStr = "정보 없음";
    }
    
    let displayTime = timeDisplayMode === "duration" ? relativeStr : clockStr;

    // Line color mapping for status text
    const lineColors: Record<string, string> = {
        "1": "#0052A4", "2": "#00A84D", "3": "#EF7C1C", "4": "#00A5DE",
        "5": "#996CAC", "6": "#CD7C2F", "7": "#747F00", "8": "#E6186C",
        "9": "#BDB092", "수인분당": "#F5A200", "신분당": "#D4003B", "경의중앙": "#77C4A3",
        "공항철도": "#0090D2", "경춘": "#0C8E72", "인천1": "#7CA8D5", "인천2": "#ED8B00"
    };
    const lineNum = arr.subwayId.slice(-1);
    const statusColor = lineColors[lineNum] || "#000000";

    const isHighlight = stopsLeft.includes("당역") || stopsLeft.includes("진입") || stopsLeft.includes("도착") || stopsLeft.includes("전역");

    return (
        <button 
            onClick={(e) => { e.stopPropagation(); if(onToggleTimeDisplay) onToggleTimeDisplay(); }}
            className="w-full focus:outline-none flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/5 active:scale-95 transition-transform"
        >
            <span className={`text-[12px] leading-tight font-black ${isHighlight ? '' : 'text-zinc-900 dark:text-white'}`} style={isHighlight ? { color: statusColor } : {}}>
                {displayTime}
            </span>
            <span className={`text-[11px] font-bold leading-tight ${isHighlight ? '' : 'text-zinc-400 dark:text-zinc-500'}`} style={isHighlight ? { color: statusColor } : {}}>
                {stopsLeft}
            </span>
        </button>
    );
};
