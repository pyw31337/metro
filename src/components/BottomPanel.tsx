import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Train, Bus, Map as MapIcon, Bath, X, Navigation2, Moon, Sun, ChevronUp, ChevronDown, Plus, MapPin, Navigation } from "lucide-react";
import type { ActiveTab } from "./MapBackground";
import type { PathResult } from "@/utils/pathfinding";
import type { BusStop } from "./BusStopLayer";
import type { WCItem } from "./WCLayer";
import { chosungIncludes } from "@/utils/chosung";
import { SUBWAY_LINES } from "@/data/subway-lines";

interface BottomPanelProps {
    activeTab: ActiveTab;
    onTabChange: (tab: ActiveTab) => void;
    pathResult: PathResult | null;
    startStation: string | null;
    endStation: string | null;
    waypoints: string[];
    onSearch: (start: string, waypoints: string[], end: string) => void;
    onResetPath: () => void;
    isDarkMode: boolean;
    onToggleDarkMode: () => void;
    busStops: BusStop[];
    wcItems: WCItem[];
    selectedBusStop: BusStop | null;
    selectedWC: WCItem | null;
    onBusStopSelect: (stop: BusStop | null) => void;
    onWCSelect: (item: WCItem | null) => void;
}

const ALL_STATIONS = Array.from(new Set(SUBWAY_LINES.flatMap(line => line.stations.map(s => s.name))));

export default function BottomPanel({
    activeTab, onTabChange, pathResult, startStation, endStation, waypoints, onSearch, onResetPath,
    isDarkMode, onToggleDarkMode, busStops, wcItems, selectedBusStop, selectedWC,
    onBusStopSelect, onWCSelect
}: BottomPanelProps) {
    const [sheetState, setSheetState] = useState<"peek" | "half" | "full">("peek");
    const [localStart, setLocalStart] = useState(startStation || "");
    const [localEnd, setLocalEnd] = useState(endStation || "");
    const [localWaypoints, setLocalWaypoints] = useState<string[]>(waypoints || []);
    const [activeInput, setActiveInput] = useState<"start" | "end" | number | null>(null);

    // Sync local state when props change (from map clicks)
    useEffect(() => { setLocalStart(startStation || ""); }, [startStation]);
    useEffect(() => { setLocalEnd(endStation || ""); }, [endStation]);
    useEffect(() => { setLocalWaypoints(waypoints || []); }, [waypoints]);

    const snapPoints = {
        peek: "80px",
        half: "45vh",
        full: "90vh"
    };
    
    useEffect(() => {
        if (pathResult || selectedBusStop || selectedWC) {
            setSheetState("half");
        }
    }, [pathResult, selectedBusStop, selectedWC]);

    const tabs: { id: ActiveTab; label: string; icon: any; colorClass: string }[] = [
        { id: "subway", label: "지하철", icon: Train, colorClass: "bg-blue-600" },
        { id: "bus", label: "버스", icon: Bus, colorClass: "bg-orange-600" },
        { id: "subway+bus", label: "지하철+버스", icon: MapIcon, colorClass: "bg-zinc-800" },
        { id: "wc", label: "화장실", icon: Bath, colorClass: "bg-emerald-600" },
    ];

    const filteredStations = (query: string) => {
        if (!query) return [];
        return ALL_STATIONS.filter(name => chosungIncludes(name, query)).slice(0, 5);
    };

    const handleSelectStation = (name: string) => {
        if (activeInput === "start") setLocalStart(name);
        else if (activeInput === "end") setLocalEnd(name);
        else if (typeof activeInput === "number") {
            const newWps = [...localWaypoints];
            newWps[activeInput] = name;
            setLocalWaypoints(newWps);
        }
        setActiveInput(null);
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[6000] flex flex-col items-center pointer-events-none px-4 pb-4 md:pb-8">
            {/* ─── Floating Navigation Bar ─────────────────────────────────── */}
            <motion.div 
                layout
                className="pointer-events-auto glass rounded-2xl p-1.5 mb-3 flex items-center gap-1 shadow-2xl overflow-hidden max-w-full overflow-x-auto no-scrollbar"
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
            >
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl transition-all whitespace-nowrap ${
                                isActive 
                                ? `${tab.colorClass} text-white shadow-xl scale-[1.05] z-10` 
                                : "text-gray-500 hover:text-zinc-900 dark:hover:text-white"
                            }`}
                        >
                            <Icon size={18} />
                            <span className="text-[13px] font-bold tracking-tight">{tab.label}</span>
                        </button>
                    );
                })}
                <div className="w-px h-6 bg-gray-200 dark:bg-zinc-800 mx-1" />
                <button 
                    onClick={onToggleDarkMode}
                    className="p-2.5 rounded-xl text-gray-500 hover:text-zinc-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-zinc-800 transition-all"
                >
                    {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            </motion.div>

            {/* ─── Triple State Bottom Sheet ──────────────────── */}
            <AnimatePresence>
                <motion.div
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.2}
                    onDragStart={() => {
                        if (sheetState === "peek") setSheetState("half");
                    }}
                    onDragEnd={(_, info) => {
                        if (info.offset.y < -50) setSheetState(sheetState === "peek" ? "half" : "full");
                        else if (info.offset.y > 50) setSheetState(sheetState === "full" ? "half" : "peek");
                    }}
                    animate={{ height: snapPoints[sheetState] }}
                    transition={{ type: "spring", damping: 30, stiffness: 200 }}
                    className="pointer-events-auto glass-dark bg-zinc-950/90 backdrop-blur-3xl w-full max-w-2xl rounded-t-[40px] overflow-hidden bottom-sheet-shadow border-t border-white/5"
                >
                    {/* Control Handle */}
                    <div className="flex flex-col items-center py-4 cursor-grab active:cursor-grabbing border-b border-white/5">
                        <div className="w-10 h-1.5 rounded-full bg-white/10" />
                    </div>

                    <div className="px-6 py-6 overflow-y-auto no-scrollbar scroll-smooth" style={{ maxHeight: "calc(90vh - 60px)" }}>
                        
                        {/* ─── Premium Integrated Search (Uber Style) ─────────────────── */}
                        {(activeTab === "subway" || activeTab === "subway+bus") && !pathResult && (
                            <div className="flex flex-col gap-4 mb-8">
                                <div className="text-white/40 text-[12px] font-black tracking-widest uppercase mb-2">경로 탐색</div>
                                <div className="relative flex flex-col gap-3 bg-white/5 p-5 rounded-[32px] border border-white/5">
                                    {/* Vertical Connect Line */}
                                    <div className="absolute left-[33px] top-[40px] bottom-[40px] w-0.5 bg-zinc-700/50" />
                                    
                                    {/* Start Input */}
                                    <div className="flex items-center gap-4 relative z-10">
                                        <div className="w-3 h-3 rounded-full border-2 border-blue-500 bg-black" />
                                        <input 
                                            placeholder="출발지"
                                            value={localStart}
                                            onChange={(e) => setLocalStart(e.target.value)}
                                            onFocus={() => { setActiveInput("start"); setSheetState("half"); }}
                                            className="flex-1 bg-transparent border-none outline-none text-white text-[16px] font-bold placeholder:text-white/20"
                                        />
                                    </div>

                                    {/* Waypoints */}
                                    {localWaypoints.map((wp, i) => (
                                        <div key={i} className="flex items-center gap-4 relative z-10">
                                            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                                            <input 
                                                placeholder={`경유지 ${i+1}`}
                                                value={wp}
                                                onChange={(e) => {
                                                    const newWps = [...localWaypoints];
                                                    newWps[i] = e.target.value;
                                                    setLocalWaypoints(newWps);
                                                }}
                                                onFocus={() => setActiveInput(i)}
                                                className="flex-1 bg-transparent border-none outline-none text-white text-[16px] font-bold placeholder:text-white/20"
                                            />
                                            <button onClick={() => setLocalWaypoints(localWaypoints.filter((_, idx) => idx !== i))} className="p-1 text-white/20 hover:text-rose-500"><X size={16}/></button>
                                        </div>
                                    ))}

                                    {/* Waypoint Add Button */}
                                    {localWaypoints.length < 2 && (
                                        <button 
                                            onClick={() => setLocalWaypoints([...localWaypoints, ""])}
                                            className="ml-7 text-[13px] font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1.5"
                                        >
                                            <Plus size={14} /> 경유지 추가
                                        </button>
                                    )}

                                    {/* End Input */}
                                    <div className="flex items-center gap-4 relative z-10">
                                        <MapPin size={14} className="text-rose-500" />
                                        <input 
                                            placeholder="도착지"
                                            value={localEnd}
                                            onChange={(e) => setLocalEnd(e.target.value)}
                                            onFocus={() => { setActiveInput("end"); setSheetState("half"); }}
                                            className="flex-1 bg-transparent border-none outline-none text-white text-[16px] font-bold placeholder:text-white/20"
                                        />
                                    </div>

                                    {/* Search Button */}
                                    <button 
                                        onClick={() => onSearch(localStart, localWaypoints, localEnd)}
                                        className="mt-2 w-full h-14 bg-white text-black rounded-2xl font-black text-[15px] hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Navigation size={18} fill="black" /> 경로 찾기
                                    </button>
                                </div>

                                {/* Active Input Suggestions */}
                                <AnimatePresence>
                                    {activeInput !== null && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex flex-wrap gap-2 mt-2"
                                        >
                                            {filteredStations(
                                                activeInput === "start" ? localStart : 
                                                activeInput === "end" ? localEnd : 
                                                localWaypoints[activeInput as number] || ""
                                            ).map(name => (
                                                <button
                                                    key={name}
                                                    onClick={() => handleSelectStation(name)}
                                                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[14px] font-bold text-white hover:bg-white hover:text-black transition-all"
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                        {/* 1. Subway/Route Result */}
                        {(activeTab.includes("subway") && pathResult) && (
                                <div className="flex flex-col gap-6">
                                    <div className="flex items-end justify-between border-b border-white/10 pb-6">
                                        <div className="flex flex-col">
                                            <div className="text-[14px] font-bold text-blue-400 mb-1">최단 시간 경로</div>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-[42px] font-black text-white leading-none tracking-tight">
                                                    {pathResult?.totalWeight}
                                                </span>
                                                <span className="text-[20px] font-bold text-white/70">분</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end text-[13px] text-white/50">
                                            <div className="flex items-center gap-2">
                                                <span>환승 {pathResult?.transferCount}회</span>
                                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                                <span>약 1,550원</span>
                                            </div>
                                            <button onClick={onResetPath} className="mt-2 text-white/40 hover:text-white transition-colors underline underline-offset-4">경로 초기화</button>
                                        </div>
                                    </div>

                                    {/* Simplified Timeline */}
                                    <div className="flex flex-col gap-8 relative pl-6">
                                        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-rose-500 opacity-50" />
                                        
                                        <div className="relative">
                                            <div className="absolute -left-[23px] top-1.5 w-4 h-4 rounded-full bg-blue-500 border-4 border-black" />
                                            <div className="flex flex-col">
                                                <span className="text-[18px] font-bold text-white">{startStation}</span>
                                                <span className="text-[12px] text-white/40">출발</span>
                                            </div>
                                        </div>

                                        <div className="pl-2 py-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                                                <Train size={20} className="text-blue-400" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[14px] text-white/80 font-medium">{pathResult?.totalWeight}분 이동</span>
                                                <span className="text-[12px] text-white/40">{pathResult?.path?.length}개 역 이동</span>
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <div className="absolute -left-[23px] top-1.5 w-4 h-4 rounded-full bg-rose-500 border-4 border-black" />
                                            <div className="flex flex-col">
                                                <span className="text-[18px] font-bold text-white">{endStation}</span>
                                                <span className="text-[12px] text-white/40">도착</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 2. Bus Details */}
                            {activeTab === "bus" && selectedBusStop && (
                                <div className="flex flex-col gap-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex flex-col">
                                            <div className="text-[28px] font-black text-white mb-1 tracking-tight">{selectedBusStop.name}</div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-full bg-orange-600/20 text-orange-400 text-[11px] font-bold">버스 정류장</span>
                                                <span className="text-[13px] text-white/40">{selectedBusStop.region} 지역</span>
                                            </div>
                                        </div>
                                        <button onClick={() => onBusStopSelect(null)} className="p-2 rounded-full bg-white/10 text-white/60 hover:text-white transition-all">
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        {selectedBusStop.routes.map(r => (
                                            <div key={r} className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5">
                                                <div className="w-2 h-2 rounded-full bg-orange-500" />
                                                <span className="text-[15px] font-bold text-white/90">{r}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <button className="w-full h-14 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-orange-900/20 transition-all">
                                        <Navigation2 size={20} /> 실시간 도착 정보 보기
                                    </button>
                                </div>
                            )}

                            {/* 3. WC Details */}
                            {activeTab === "wc" && selectedWC && (
                                <div className="flex flex-col gap-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex flex-col">
                                            <div className="text-[28px] font-black text-white mb-1 tracking-tight">{selectedWC.name}</div>
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 text-[11px] font-bold">공용 화장실</span>
                                                {selectedWC.accessible && <span className="text-[13px] text-blue-400 font-bold">♿ 장애인 이용 가능</span>}
                                            </div>
                                        </div>
                                        <button onClick={() => onWCSelect(null)} className="p-2 rounded-full bg-white/10 text-white/60 hover:text-white transition-all">
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1">
                                            <div className="text-[12px] text-white/30 font-bold uppercase tracking-widest mb-1">상세 위치</div>
                                            <div className="text-[15px] text-white/80 leading-relaxed font-medium">
                                                {selectedWC.address} {selectedWC.floor ? `(${selectedWC.floor})` : ""}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col">
                                                <span className="text-[11px] text-white/30 font-bold mb-1">성별 구분</span>
                                                <span className="text-[14px] text-white/90 font-bold">{selectedWC.gender === "mixed" ? "남녀 공용" : "남녀 분리"}</span>
                                            </div>
                                            {selectedWC.hours && (
                                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col">
                                                    <span className="text-[11px] text-white/30 font-bold mb-1">개방 시간</span>
                                                    <span className="text-[14px] text-white/90 font-bold">{selectedWC.hours}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <a 
                                            href={`https://map.naver.com/v5/search/${encodeURIComponent(selectedWC.address)}`}
                                            target="_blank" rel="noopener noreferrer"
                                            className="flex-1 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 transition-all"
                                        >
                                            <Navigation2 size={20} /> 길찾기
                                        </a>
                                    </div>
                                </div>
                            )}

                        {/* Empty/Welcome State */}
                        {!pathResult && !selectedBusStop && !selectedWC && (
                            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                                <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center">
                                    <Search size={32} className="text-white" />
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-white font-bold text-lg">지도를 클릭하여 시작하세요</span>
                                    <span className="text-white/40 text-[14px]">역사나 정류장을 눌러 경로를 탐색할 수 있습니다</span>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
