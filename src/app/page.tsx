"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { PathResult } from "@/utils/pathfinding";
import type { ActiveTab } from "@/components/MapBackground";
import type { WCItem } from "@/components/WCLayer";
import type { BusStop } from "@/components/BusStopLayer";
import busData from "@/data/bus-stops.json";
import mockWcData from "@/data/wc.json";

const MapBackground = dynamic(() => import("@/components/MapBackground"), { ssr: false });
const RoutePlanner = dynamic(() => import("@/components/RoutePlanner"), { ssr: false });

export default function Home() {
    const [pathResult, setPathResult] = useState<PathResult | null>(null);
    const [startStation, setStartStation] = useState<string | null>(null);
    const [endStation, setEndStation] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ActiveTab>("subway");
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [selectedWC, setSelectedWC] = useState<WCItem | null>(null);
    const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);

    // WC 데이터: API 키가 있으면 실API, 없으면 Mock
    const [wcItems, setWcItems] = useState<WCItem[]>(mockWcData as WCItem[]);
    const [wcLoading, setWcLoading] = useState(false);

    useEffect(() => {
        const wcKey = process.env.NEXT_PUBLIC_WC_API_KEY;
        const seoulKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;

        if (!wcKey && !seoulKey) return; 

        setWcLoading(true);

        const load = async () => {
            try {
                // 1. 공공데이터포털 (data.go.kr) - 서울교통공사 역사공중화장실정보
                if (wcKey && wcKey.length > 10) {
                    const SERVICE_ID = "15098783";
                    const UUID = "c88f27c0-3282-441a-8218-3f0b5ff59ab4";
                    // Note: wcKey as provided by user is encoded (%2B...), so use directly
                    const url = `https://api.odcloud.kr/api/${SERVICE_ID}/v1/uddi:${UUID}?page=1&perPage=1000&serviceKey=${wcKey}`;
                    
                    const res = await fetch(url);
                    if (res.ok) {
                        const json = await res.json();
                        const rows = json?.data || [];
                        const items: WCItem[] = rows
                            .filter((r: any) => r.LATITUDE && r.LONGITUDE)
                            .map((r: any, i: number) => ({
                                id: `api-wc-${i}`,
                                name: r.TOILET_NM || `${r.SUBWAY_STN_NM}역 화장실`,
                                station: r.SUBWAY_STN_NM || "",
                                line: r.LINE_NM || "",
                                lat: parseFloat(r.LATITUDE),
                                lng: parseFloat(r.LONGITUDE),
                                address: r.RDNMADR || r.LNMADR || r.DTAIL_LOC || "",
                                floor: r.DTAIL_LOC || "B",
                                gender: "mixed",
                                accessible: r.DSBL_YN === "Y" || r.DSBL_YN === "가능",
                            }))
                            .filter((item: WCItem) => item.lat !== 0 && item.lng !== 0);

                        if (items.length > 0) {
                            setWcItems(items);
                            setWcLoading(false);
                            return;
                        }
                    } else if (res.status === 401) {
                        console.warn("[WC] API Key pending synchronization (data.go.kr)");
                    }
                }

                // 2. 서울 열린데이터광장 (seoul.go.kr) - 서울교통공사 편의시설위치정보 화장실 현황
                if (seoulKey && seoulKey.length > 10) {
                    // Try tbTraficWheelChrAdit as fallback or SearchConvenienceFacilitiesSTN
                    const serviceNames = ["tbTraficWheelChrAdit", "SeoulSubwayStationRestroomInfo"];
                    
                    for (const svc of serviceNames) {
                        const url = `https://openapi.seoul.go.kr:8088/${seoulKey}/json/${svc}/1/1000/`;
                        const res = await fetch(url);
                        if (res.ok) {
                            const json = await res.json();
                            const rows = json?.[svc]?.row || [];
                            if (rows.length === 0) continue;

                            const items: WCItem[] = rows
                                .filter((r: any) => (r.LAT || r.LATITUDE) && (r.LOT || r.LONGITUDE))
                                .map((r: any, i: number) => ({
                                    id: `seoul-wc-${svc}-${i}`,
                                    name: r.TOILET_NM || r.STATION_NM ? `${r.STATION_NM}역 화장실` : "지하철 화장실",
                                    station: r.STATION_NM || r.SUBWAY_STN_NM || "",
                                    line: r.LINE_NUM || r.LINE_NM || "",
                                    lat: parseFloat(r.LAT || r.LATITUDE),
                                    lng: parseFloat(r.LOT || r.LONGITUDE),
                                    address: r.LOCATION || r.ADDR || "",
                                    floor: r.FLOOR || "B",
                                    gender: "mixed",
                                    accessible: true,
                                }))
                                .filter((item: WCItem) => item.lat !== 0 && item.lng !== 0);

                            if (items.length > 0) {
                                setWcItems(items);
                                setWcLoading(false);
                                return;
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn("[WC] API fetch failed, using mock data:", err);
            } finally {
                setWcLoading(false);
            }
        };

        load();
    }, []);

    const handlePathFound = (result: PathResult | null) => {
        setPathResult(result);
        if (result && result.path.length > 0) {
            setStartStation(result.path[0]);
            setEndStation(result.path[result.path.length - 1]);
        } else {
            setStartStation(null);
            setEndStation(null);
        }
    };

    const busStops = busData as BusStop[];

    return (
        <main className="relative w-full h-screen overflow-hidden">
            <MapBackground
                pathResult={pathResult}
                startStation={startStation}
                endStation={endStation}
                activeTab={activeTab}
                isDarkMode={isDarkMode}
                wcItems={wcItems}
                busStops={activeTab === "bus" ? busStops : []}
                selectedBusStopId={selectedBusStop?.id ?? null}
                onWCClick={(item) => { setSelectedWC(item); }}
                onBusStopClick={(stop) => { setSelectedBusStop(stop); }}
            />
            <RoutePlanner
                onPathFound={handlePathFound}
                activeTab={activeTab}
                onTabChange={(tab) => { setActiveTab(tab); setSelectedBusStop(null); setSelectedWC(null); }}
                isDarkMode={isDarkMode}
                onDarkModeToggle={() => setIsDarkMode((d) => !d)}
                wcItems={wcItems}
                wcLoading={wcLoading}
                busStops={busStops}
                selectedBusStop={selectedBusStop}
                selectedWC={selectedWC}
                onBusStopSelect={setSelectedBusStop}
                onWCSelect={setSelectedWC}
            />
        </main>
    );
}
