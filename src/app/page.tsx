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

        if (!wcKey && !seoulKey) return; // Mock 유지

        setWcLoading(true);

        const load = async () => {
            try {
                // data.go.kr WC API (서울교통공사_역사공중화장실정보)
                if (wcKey && wcKey.length > 10) {
                    const SERVICE_ID = "15098783";
                    const url = `https://api.odcloud.kr/api/${SERVICE_ID}/v1/uddi:c88f27c0-3282-441a-8218-3f0b5ff59ab4?page=1&perPage=1000&serviceKey=${wcKey}`;
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
                                accessible: r.DSBL_YN === "Y",
                            }))
                            .filter((item: WCItem) => item.lat !== 0 && item.lng !== 0);

                        if (items.length > 0) {
                            setWcItems(items);
                            return;
                        }
                    }
                }

                // 서울 열린데이터광장 fallback
                if (seoulKey && seoulKey.length > 10) {
                    const url = `https://openapi.seoul.go.kr:8088/${seoulKey}/json/tbTraficWheelChrAdit/1/1000/`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const json = await res.json();
                        const rows = json?.tbTraficWheelChrAdit?.row || [];
                        const items: WCItem[] = rows
                            .filter((r: any) => r.LAT && r.LOT)
                            .map((r: any, i: number) => ({
                                id: `seoul-wc-${i}`,
                                name: `${r.STATION_NM}역 장애인화장실`,
                                station: r.STATION_NM || "",
                                line: r.LINE_NUM || "",
                                lat: parseFloat(r.LAT),
                                lng: parseFloat(r.LOT),
                                address: r.LOCATION || "",
                                floor: "B",
                                gender: "mixed",
                                accessible: true,
                            }))
                            .filter((item: WCItem) => item.lat !== 0 && item.lng !== 0);

                        if (items.length > 0) setWcItems(items);
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
