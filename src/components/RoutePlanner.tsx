"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { findPathWithStrategy as findShortestPath, PathResult } from "@/utils/pathfinding";
import { SUBWAY_LINES } from "@/data/subway-lines";
import { searchStations } from "@/utils/hangulSearch";
import { matchesSearch } from "@/utils/hangulSearch";
import type { ActiveTab } from "./MapBackground";
import type { WCItem } from "./WCLayer";
import type { BusStop } from "./BusStopLayer";

interface RoutePlannerProps {
    onPathFound: (result: PathResult | null) => void;
    activeTab: ActiveTab;
    onTabChange: (tab: ActiveTab) => void;
    isDarkMode: boolean;
    onDarkModeToggle: () => void;
    wcItems: WCItem[];
    wcLoading?: boolean;
    busStops: BusStop[];
    selectedBusStop: BusStop | null;
    selectedWC: WCItem | null;
    onBusStopSelect: (stop: BusStop | null) => void;
    onWCSelect: (item: WCItem | null) => void;
}

// ─── Timeline Types ───────────────────────────────────────────────────────────
type SegmentType = "WALK" | "SUBWAY";

interface TimelineSegment {
    type: SegmentType;
    lineName?: string;
    lineColor?: string;
    startStation: string;
    endStation: string;
    duration: number;
    distance?: number;
    stationCount?: number;
    stations?: string[];
    startTime: string;
    endTime: string;
    headsign?: string;
    nextStation?: string;
    door?: string;
    quickTransfer?: string;
    walkTime?: number;
}

const getTime = (base: Date, addMin: number): string => {
    const d = new Date(base.getTime() + addMin * 60000);
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
};

// ─── Timeline Component ───────────────────────────────────────────────────────
function TimelineView({ segments, pathResult }: { segments: TimelineSegment[]; pathResult: PathResult | null }) {
    if (!segments.length) return null;
    return (
        <div className="flex flex-col w-full font-sans relative">
            {/* Summary */}
            <div className="flex flex-col mb-6 pb-5 border-b border-gray-100 px-1 sticky top-0 bg-white z-20">
                <div className="flex items-end gap-2 mb-2">
                    <span className="text-[32px] font-black text-gray-900 leading-none tracking-tighter">
                        {pathResult?.totalWeight}
                        <span className="text-[20px] font-bold ml-1 text-gray-700">분</span>
                    </span>
                    <span className="text-blue-600 font-bold text-xs mb-1.5 px-1.5 py-0.5 bg-blue-50 rounded-full">최단시간</span>
                </div>
                <div className="text-[14px] text-gray-500 flex items-center gap-3">
                    <span className="text-gray-800 font-bold">도착 {segments[segments.length - 1].endTime}</span>
                    <span className="w-px h-3 bg-gray-300" />
                    <span>환승 {pathResult?.transferCount}회</span>
                    <span className="w-px h-3 bg-gray-300" />
                    <span>카드 1,650원</span>
                </div>
            </div>

            {/* Segments */}
            <div className="relative pl-2 pr-1">
                {segments.map((seg, idx) => {
                    const isWalk = seg.type === "WALK";
                    const isLast = idx === segments.length - 1;
                    const color = seg.lineColor || "#999";

                    if (isWalk) {
                        return (
                            <div key={idx} className="flex relative pb-6 min-h-[60px]">
                                <div className="w-[52px] text-[13px] text-gray-400 font-medium text-right pr-4 flex-shrink-0 pt-1">{seg.startTime}</div>
                                <div className="relative flex flex-col items-center w-5 flex-shrink-0">
                                    <div className="absolute top-3 bottom-[-24px] w-px border-l-2 border-dotted border-gray-300 left-1/2 z-0" />
                                    <div className="z-10 bg-white py-1">
                                        <div className="w-6 h-6 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100">
                                            <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 pl-4 pt-1 text-[14px] text-gray-600">
                                    <span className="text-gray-400 mr-1">도보</span>
                                    <span className="font-bold text-gray-800">{seg.duration}분</span>
                                    <span className="text-gray-300 mx-2">|</span>
                                    <span className="text-gray-400">{seg.distance}m</span>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={idx} className="flex relative pb-10 last:pb-0">
                            <div className="w-[52px] flex flex-col justify-between text-right pr-4 flex-shrink-0">
                                <div className="text-[14px] font-bold text-gray-900 leading-none pt-0.5">{seg.startTime}</div>
                                {isLast && <div className="text-[14px] font-bold text-gray-900 mt-auto leading-none pb-0.5">{seg.endTime}</div>}
                            </div>
                            <div className="relative flex flex-col items-center w-5 flex-shrink-0">
                                {!isLast && (
                                    <div className="absolute top-3.5 bottom-[-40px] w-[5px] left-1/2 -translate-x-1/2 z-0" style={{ backgroundColor: color }} />
                                )}
                                <div className="z-10 w-[18px] h-[18px] rounded-full bg-white border-[4px] shadow-sm" style={{ borderColor: color }} />
                                {isLast && (
                                    <div className="absolute bottom-0 z-10 w-[18px] h-[18px] rounded-full bg-white border-[4px] shadow-sm" style={{ borderColor: color }} />
                                )}
                            </div>
                            <div className="flex-1 pl-4">
                                <div className="flex items-center gap-2 mb-2 -mt-1">
                                    <span className="text-[20px] font-black text-gray-900 tracking-tight">{seg.startStation}</span>
                                </div>
                                {!isLast && (
                                    <div className="flex flex-col gap-2">
                                        <div className="text-[13px] text-gray-500">
                                            <span
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[11px] font-bold mr-2"
                                                style={{ backgroundColor: color }}
                                            >
                                                {seg.lineName}
                                            </span>
                                            {seg.nextStation} 방면
                                        </div>
                                        <button className="self-start flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg transition border border-gray-100 text-[13px]">
                                            <span className="font-bold text-gray-800">{seg.duration}분</span>
                                            <span className="w-px h-3 bg-gray-300" />
                                            <span className="text-gray-500">{seg.stationCount}개 역</span>
                                        </button>
                                    </div>
                                )}
                                {isLast && (
                                    <div className="flex items-center gap-2 mt-auto pt-1" style={{ marginTop: "calc(100% - 4px)" }}>
                                        <span className="text-[20px] font-black text-gray-900 tracking-tight">{seg.endStation}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── All Station Names (flat list for autocomplete) ───────────────────────────
const ALL_STATION_NAMES: string[] = Array.from(
    new Set(SUBWAY_LINES.flatMap((l) => l.stations.map((s) => s.name)))
);

// ─── Autocomplete Input ───────────────────────────────────────────────────────
function StationInput({
    value, onChange, onSelect, placeholder, dotColor, isDarkMode
}: {
    value: string; onChange: (v: string) => void; onSelect: (v: string) => void;
    placeholder: string; dotColor: string; isDarkMode: boolean;
}) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (value.trim().length === 0) { setSuggestions([]); return; }
        const results = searchStations(ALL_STATION_NAMES, value, 8);
        setSuggestions(results);
        setOpen(results.length > 0);
    }, [value]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const bg = isDarkMode ? "#1e1f22" : "#fff";
    const border = isDarkMode ? "#3a3b3d" : "#e5e7eb";
    const textColor = isDarkMode ? "#f1f1f1" : "#111827";
    const placeholderColor = isDarkMode ? "#666" : "#9ca3af";
    const suggBg = isDarkMode ? "#2a2b2e" : "#fff";
    const suggHover = isDarkMode ? "#333" : "#f9fafb";

    return (
        <div className="relative" ref={ref}>
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                <div className="w-2 h-2 rounded-full border-[3px] border-white" style={{ backgroundColor: dotColor, boxShadow: `0 0 0 1px ${dotColor}` }} />
            </div>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setOpen(true)}
                placeholder={placeholder}
                style={{ background: bg, borderColor: border, color: textColor }}
                className="w-full h-[52px] pl-10 pr-4 rounded-xl border outline-none text-[15px] font-bold transition-all shadow-sm"
            />
            {open && suggestions.length > 0 && (
                <div
                    className="absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-xl z-50 overflow-hidden"
                    style={{ background: suggBg, borderColor: border }}
                >
                    {suggestions.map((s) => (
                        <button
                            key={s}
                            className="w-full text-left px-4 py-2.5 text-[14px] font-medium transition-colors"
                            style={{ color: textColor }}
                            onMouseEnter={e => (e.currentTarget.style.background = suggHover)}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            onMouseDown={() => { onSelect(s); setOpen(false); }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── WC Bottom Sheet Content ──────────────────────────────────────────────────
function WCSheet({ item, onClose, isDarkMode }: { item: WCItem; onClose: () => void; isDarkMode: boolean }) {
    const bg = isDarkMode ? "#1e1f22" : "#fff";
    const text = isDarkMode ? "#f1f1f1" : "#111827";
    const sub = isDarkMode ? "#8b8c8f" : "#6b7280";
    return (
        <div className="flex flex-col gap-4" style={{ color: text }}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="text-[22px] font-black tracking-tight mb-1">{item.name}</div>
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">{item.line}</span>
                        <span className="text-[13px]" style={{ color: sub }}>{item.floor}층</span>
                        {item.accessible && <span className="text-[13px] text-green-600 font-bold">♿ 장애인 이용 가능</span>}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 text-[14px]" style={{ color: sub }}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{item.address}</span>
            </div>
            <a
                href={`https://map.naver.com/v5/search/${encodeURIComponent(item.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 7m0 13V7" />
                </svg>
                길찾기
            </a>
        </div>
    );
}

// ─── Bus Bottom Sheet Content ─────────────────────────────────────────────────
function BusSheet({ stop, onClose, isDarkMode }: { stop: BusStop; onClose: () => void; isDarkMode: boolean }) {
    const text = isDarkMode ? "#f1f1f1" : "#111827";
    const sub = isDarkMode ? "#8b8c8f" : "#6b7280";
    return (
        <div className="flex flex-col gap-4" style={{ color: text }}>
            <div>
                <div className="text-[22px] font-black tracking-tight mb-1">{stop.name}</div>
                <div className="text-[13px]" style={{ color: sub }}>{stop.region} 지역</div>
            </div>
            <div>
                <div className="text-[12px] font-bold mb-2" style={{ color: sub }}>운행 노선</div>
                <div className="flex flex-wrap gap-1.5">
                    {stop.routes.map((r) => (
                        <span key={r} className="px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700 text-[12px] font-bold">{r}</span>
                    ))}
                </div>
            </div>
            <a
                href={`https://map.naver.com/v5/search/${encodeURIComponent(stop.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 7m0 13V7" />
                </svg>
                길찾기
            </a>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RoutePlanner({
    onPathFound, activeTab, onTabChange, isDarkMode, onDarkModeToggle,
    wcItems, wcLoading = false, busStops, selectedBusStop, selectedWC, onBusStopSelect, onWCSelect
}: RoutePlannerProps) {
    const [startVal, setStartVal] = useState("");
    const [endVal, setEndVal] = useState("");
    const [busQuery, setBusQuery] = useState("");
    const [pathResult, setPathResult] = useState<PathResult | null>(null);
    const [timelineData, setTimelineData] = useState<TimelineSegment[]>([]);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

    // Filtered bus stops
    const filteredBusStops = busQuery.trim()
        ? busStops.filter((s) => matchesSearch(s.name, busQuery) || matchesSearch(s.region, busQuery))
        : busStops;

    // Generate timeline from path
    const generateTimeline = useCallback((path: string[]): TimelineSegment[] => {
        if (!path || path.length < 2) return [];
        const segs: TimelineSegment[] = [];
        let now = new Date();
        now.setMinutes(now.getMinutes() + 2);
        let cur: Partial<TimelineSegment> | null = null;

        const getCommonLines = (a: string, b: string) => {
            const sa = SUBWAY_LINES.flatMap((l) => l.stations).find((s) => s.name === a);
            const sb = SUBWAY_LINES.flatMap((l) => l.stations).find((s) => s.name === b);
            if (!sa || !sb) return [];
            return sa.lines.filter((l) => sb.lines.includes(l));
        };

        for (let i = 0; i < path.length - 1; i++) {
            const s1 = path[i], s2 = path[i + 1];
            const common = getCommonLines(s1, s2);
            let line = common[0];
            if (cur?.lineName && common.includes(cur.lineName)) line = cur.lineName;

            if (cur && cur.lineName !== line) {
                segs.push(cur as TimelineSegment);
                const ws = getTime(now, 0);
                now = new Date(now.getTime() + 5 * 60000);
                segs.push({ type: "WALK", startStation: cur.endStation!, endStation: s1, duration: 5, distance: 276, startTime: ws, endTime: getTime(now, 0) });
                cur = null;
            }

            now = new Date(now.getTime() + 2 * 60000);
            const lineInfo: typeof SUBWAY_LINES[0] | undefined = SUBWAY_LINES.find((l) => l.name === line);

            if (!cur) {
                cur = {
                    type: "SUBWAY", lineName: line, lineColor: lineInfo?.color || "#999",
                    startStation: s1, endStation: s2, duration: 2, stationCount: 1,
                    stations: [s1, s2],
                    startTime: getTime(new Date(now.getTime() - 120000), 0), endTime: getTime(now, 0),
                    headsign: `${path[path.length - 1]}`, nextStation: s2
                };
            } else {
                cur.endStation = s2; cur.duration! += 2; cur.stationCount! += 1;
                cur.stations!.push(s2); cur.endTime = getTime(now, 0);
            }
        }
        if (cur) segs.push(cur as TimelineSegment);
        return segs;
    }, []);

    // Route calculation
    useEffect(() => {
        if (activeTab !== "subway") return;
        const t = setTimeout(() => {
            const s = startVal.trim(), e = endVal.trim();
            if (!s || !e) { setPathResult(null); onPathFound(null); return; }
            const res = findShortestPath([s, e], "time");
            if (res) {
                setPathResult(res);
                setTimelineData(generateTimeline(res.path));
                onPathFound(res);
                setMobileDrawerOpen(true);
            } else {
                setPathResult(null); onPathFound(null);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [startVal, endVal, activeTab, onPathFound, generateTimeline]);

    // Colors
    const bg = isDarkMode ? "#18191c" : "#fff";
    const border = isDarkMode ? "#2f3033" : "#f3f4f6";
    const text = isDarkMode ? "#f1f1f1" : "#111827";
    const subText = isDarkMode ? "#8b8c8f" : "#9ca3af";

    // Tab config
    const tabs: { id: ActiveTab; label: string; icon: string }[] = [
        { id: "subway", label: "지하철", icon: "🚇" },
        { id: "bus", label: "버스", icon: "🚌" },
        { id: "wc", label: "화장실", icon: "🚻" },
    ];

    return (
        <>
            {/* ── DESKTOP SIDEBAR ─────────────────────────────────────────── */}
            <div
                className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-[400px] z-[5000] shadow-xl border-r"
                style={{ background: bg, borderColor: border }}
            >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 flex flex-col flex-shrink-0">
                    {/* Logo Row */}
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-1.5 select-none">
                            <span className="text-[26px] font-black tracking-tighter" style={{ color: text }}>Metro</span>
                            <span className="bg-[#FF0000] text-white text-[18px] font-bold px-1.5 rounded-[4px] leading-none flex items-center h-[26px]">Live</span>
                        </div>
                        {/* Dark Mode Toggle */}
                        <button
                            onClick={onDarkModeToggle}
                            className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                            style={{ background: isDarkMode ? "#2a2b2e" : "#f3f4f6" }}
                            title={isDarkMode ? "라이트 모드" : "다크 모드"}
                        >
                            {isDarkMode ? "☀️" : "🌙"}
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1.5 p-1 rounded-xl mb-5" style={{ background: isDarkMode ? "#2a2b2e" : "#f3f4f6" }}>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => { onTabChange(tab.id); onBusStopSelect(null); onWCSelect(null); }}
                                className="flex-1 h-9 rounded-lg text-[13px] font-bold flex items-center justify-center gap-1 transition-all"
                                style={{
                                    background: activeTab === tab.id ? (isDarkMode ? "#3a3b3e" : "#fff") : "transparent",
                                    color: activeTab === tab.id ? text : subText,
                                    boxShadow: activeTab === tab.id ? "0 1px 4px rgba(0,0,0,0.1)" : "none"
                                }}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Search Area by Tab */}
                    {activeTab === "subway" && (
                        <div className="flex flex-col gap-2.5">
                            <StationInput
                                value={startVal} onChange={setStartVal} onSelect={setStartVal}
                                placeholder="출발역 입력" dotColor="#22c55e" isDarkMode={isDarkMode}
                            />
                            <div className="flex items-center gap-2">
                                <div className="flex-1 border-t" style={{ borderColor: isDarkMode ? "#333" : "#e5e7eb" }} />
                                <button
                                    onClick={() => { const tmp = startVal; setStartVal(endVal); setEndVal(tmp); }}
                                    className="w-8 h-8 rounded-full flex items-center justify-center border transition-all hover:scale-110 active:scale-95"
                                    style={{ background: bg, borderColor: isDarkMode ? "#444" : "#e5e7eb", color: text }}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                </button>
                                <div className="flex-1 border-t" style={{ borderColor: isDarkMode ? "#333" : "#e5e7eb" }} />
                            </div>
                            <StationInput
                                value={endVal} onChange={setEndVal} onSelect={setEndVal}
                                placeholder="도착역 입력" dotColor="#ef4444" isDarkMode={isDarkMode}
                            />
                        </div>
                    )}

                    {activeTab === "bus" && (
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[18px]">🔍</div>
                            <input
                                type="text"
                                value={busQuery}
                                onChange={(e) => setBusQuery(e.target.value)}
                                placeholder="정류장명 또는 지역 검색 (예: 종로, 강남)"
                                className="w-full h-[52px] pl-10 pr-4 rounded-xl border outline-none text-[14px] font-medium transition-all"
                                style={{
                                    background: isDarkMode ? "#1e1f22" : "#fff",
                                    borderColor: isDarkMode ? "#3a3b3d" : "#e5e7eb",
                                    color: text
                                }}
                            />
                        </div>
                    )}

                    {activeTab === "wc" && (
                        <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: isDarkMode ? "#1e2235" : "#eff6ff" }}>
                            <span className="text-xl">{wcLoading ? "⏳" : "🚻"}</span>
                            <div>
                                <div className="text-[13px] font-bold" style={{ color: isDarkMode ? "#93c5fd" : "#2563eb" }}>
                                    {wcLoading ? "화장실 데이터 로딩 중…" : "지하철역 내 공공화장실"}
                                </div>
                                <div className="text-[11px]" style={{ color: subText }}>
                                    {wcLoading ? "공공데이터 API에서 불러오는 중입니다" : "지도 마커를 클릭하면 상세 정보를 볼 수 있습니다"}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                    {/* Subway: Timeline or empty */}
                    {activeTab === "subway" && (
                        <div className="px-5 pb-10 pt-2">
                            {pathResult ? (
                                <TimelineView segments={timelineData} pathResult={pathResult} />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-64 opacity-50">
                                    <div className="text-6xl mb-4">🗺️</div>
                                    <p className="text-[15px] font-bold" style={{ color: subText }}>출발역과 도착역을 입력하세요</p>
                                    <p className="text-[12px] mt-1" style={{ color: subText }}>초성 검색 가능 (예: ㄱㄴ → 강남)</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bus: Stop list */}
                    {activeTab === "bus" && (
                        <div className="px-4 pb-10 pt-2">
                            {filteredBusStops.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 opacity-50">
                                    <div className="text-5xl mb-3">🚌</div>
                                    <p className="text-[14px] font-bold" style={{ color: subText }}>검색 결과가 없습니다</p>
                                </div>
                            ) : (
                                <>
                                    {selectedBusStop && (
                                        <div className="mb-4 p-4 rounded-xl border" style={{ background: isDarkMode ? "#1e2235" : "#fff7ed", borderColor: isDarkMode ? "#3a3b3d" : "#fed7aa" }}>
                                            <BusSheet stop={selectedBusStop} onClose={() => onBusStopSelect(null)} isDarkMode={isDarkMode} />
                                        </div>
                                    )}
                                    <div className="text-[11px] font-bold mb-2 uppercase tracking-wider" style={{ color: subText }}>
                                        정류장 {filteredBusStops.length}개
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        {filteredBusStops.map((stop) => (
                                            <button
                                                key={stop.id}
                                                onClick={() => onBusStopSelect(stop)}
                                                className="w-full text-left px-4 py-3 rounded-xl border transition-all"
                                                style={{
                                                    background: selectedBusStop?.id === stop.id
                                                        ? (isDarkMode ? "#1e2235" : "#fff7ed")
                                                        : (isDarkMode ? "#1e1f22" : "#fafafa"),
                                                    borderColor: selectedBusStop?.id === stop.id
                                                        ? "#f97316" : (isDarkMode ? "#2f3033" : "#e5e7eb"),
                                                    color: text
                                                }}
                                            >
                                                <div className="font-bold text-[14px] mb-0.5">{stop.name}</div>
                                                <div className="text-[12px]" style={{ color: subText }}>{stop.region} · 노선 {stop.routes.length}개</div>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* WC: Item list */}
                    {activeTab === "wc" && (
                        <div className="px-4 pb-10 pt-2">
                            {selectedWC && (
                                <div className="mb-4 p-4 rounded-xl border" style={{ background: isDarkMode ? "#1e2235" : "#eff6ff", borderColor: isDarkMode ? "#3a3b3d" : "#bfdbfe" }}>
                                    <WCSheet item={selectedWC} onClose={() => onWCSelect(null)} isDarkMode={isDarkMode} />
                                </div>
                            )}
                            <div className="text-[11px] font-bold mb-2 uppercase tracking-wider" style={{ color: subText }}>
                                화장실 {wcItems.length}개
                            </div>
                            <div className="flex flex-col gap-1">
                                {wcItems.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => onWCSelect(item)}
                                        className="w-full text-left px-4 py-3 rounded-xl border transition-all"
                                        style={{
                                            background: selectedWC?.id === item.id
                                                ? (isDarkMode ? "#1e2235" : "#eff6ff")
                                                : (isDarkMode ? "#1e1f22" : "#fafafa"),
                                            borderColor: selectedWC?.id === item.id
                                                ? "#3b82f6" : (isDarkMode ? "#2f3033" : "#e5e7eb"),
                                            color: text
                                        }}
                                    >
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="font-bold text-[14px]">{item.station}역</span>
                                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">{item.line}</span>
                                            {item.accessible && <span className="text-[11px] text-green-600">♿</span>}
                                        </div>
                                        <div className="text-[12px]" style={{ color: subText }}>{item.floor}층 · {item.address.substring(0, 20)}…</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── MOBILE BOTTOM SHEET ──────────────────────────────────────── */}
            <div className="md:hidden fixed bottom-0 left-0 w-full z-[5000] flex flex-col justify-end pointer-events-none">
                <div
                    className="pointer-events-auto rounded-t-[24px] shadow-2xl border-t transition-all duration-300"
                    style={{
                        background: bg,
                        borderColor: border,
                        maxHeight: mobileDrawerOpen ? "80vh" : "auto"
                    }}
                >
                    {/* Handle */}
                    <div className="flex justify-center py-3 cursor-pointer" onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}>
                        <div className="w-10 h-1 rounded-full" style={{ background: isDarkMode ? "#444" : "#d1d5db" }} />
                    </div>

                    <div className="px-4 pb-6">
                        {/* Tabs */}
                        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: isDarkMode ? "#2a2b2e" : "#f3f4f6" }}>
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => { onTabChange(tab.id); onBusStopSelect(null); onWCSelect(null); }}
                                    className="flex-1 h-8 rounded-lg text-[12px] font-bold flex items-center justify-center gap-1 transition-all"
                                    style={{
                                        background: activeTab === tab.id ? (isDarkMode ? "#3a3b3e" : "#fff") : "transparent",
                                        color: activeTab === tab.id ? text : subText,
                                        boxShadow: activeTab === tab.id ? "0 1px 4px rgba(0,0,0,0.1)" : "none"
                                    }}
                                >
                                    <span>{tab.icon}</span>
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Subway inputs (mobile) */}
                        {activeTab === "subway" && (
                            <div className="flex gap-2 mb-3">
                                <input
                                    value={startVal} onChange={(e) => setStartVal(e.target.value)}
                                    placeholder="출발역"
                                    className="flex-1 h-10 px-3 rounded-xl border text-[14px] font-bold outline-none"
                                    style={{ background: isDarkMode ? "#1e1f22" : "#f9fafb", borderColor: isDarkMode ? "#333" : "#e5e7eb", color: text }}
                                />
                                <input
                                    value={endVal} onChange={(e) => setEndVal(e.target.value)}
                                    placeholder="도착역"
                                    className="flex-1 h-10 px-3 rounded-xl border text-[14px] font-bold outline-none"
                                    style={{ background: isDarkMode ? "#1e1f22" : "#f9fafb", borderColor: isDarkMode ? "#333" : "#e5e7eb", color: text }}
                                />
                            </div>
                        )}

                        {/* Bus search (mobile) */}
                        {activeTab === "bus" && (
                            <input
                                type="text"
                                value={busQuery}
                                onChange={(e) => setBusQuery(e.target.value)}
                                placeholder="정류장 또는 지역 검색"
                                className="w-full h-10 px-4 rounded-xl border outline-none text-[14px] mb-3"
                                style={{ background: isDarkMode ? "#1e1f22" : "#f9fafb", borderColor: isDarkMode ? "#333" : "#e5e7eb", color: text }}
                            />
                        )}

                        {/* Scrollable result area */}
                        <div className={`overflow-y-auto transition-all ${mobileDrawerOpen ? "max-h-[50vh]" : "max-h-0 overflow-hidden"}`}>
                            {activeTab === "subway" && pathResult && (
                                <TimelineView segments={timelineData} pathResult={pathResult} />
                            )}

                            {activeTab === "bus" && selectedBusStop && (
                                <div className="p-4 rounded-xl border" style={{ background: isDarkMode ? "#1e2235" : "#fff7ed", borderColor: "#fed7aa" }}>
                                    <BusSheet stop={selectedBusStop} onClose={() => onBusStopSelect(null)} isDarkMode={isDarkMode} />
                                </div>
                            )}

                            {activeTab === "bus" && !selectedBusStop && filteredBusStops.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    {filteredBusStops.slice(0, 10).map((s) => (
                                        <button key={s.id} onClick={() => { onBusStopSelect(s); setMobileDrawerOpen(true); }}
                                            className="text-left px-4 py-3 rounded-xl border"
                                            style={{ background: isDarkMode ? "#1e1f22" : "#fafafa", borderColor: isDarkMode ? "#2f3033" : "#e5e7eb", color: text }}>
                                            <div className="font-bold text-[14px]">{s.name}</div>
                                            <div className="text-[11px]" style={{ color: subText }}>{s.region} · {s.routes.length}개 노선</div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {activeTab === "wc" && selectedWC && (
                                <div className="p-4 rounded-xl border" style={{ background: isDarkMode ? "#1e2235" : "#eff6ff", borderColor: "#bfdbfe" }}>
                                    <WCSheet item={selectedWC} onClose={() => onWCSelect(null)} isDarkMode={isDarkMode} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
