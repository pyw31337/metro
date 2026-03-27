"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PathResult } from "@/utils/pathfinding";
import type { ActiveTab } from "@/components/MapBackground";
import type { WCItem } from "@/components/WCLayer";
import type { BusStop } from "@/components/BusStopLayer";
import wcData from "@/data/wc.json";
import busData from "@/data/bus-stops.json";

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

    const wcItems = wcData as WCItem[];
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
                onWCClick={setSelectedWC}
                onBusStopClick={setSelectedBusStop}
            />
            <RoutePlanner
                onPathFound={handlePathFound}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                isDarkMode={isDarkMode}
                onDarkModeToggle={() => setIsDarkMode((d) => !d)}
                wcItems={wcItems}
                busStops={busStops}
                selectedBusStop={selectedBusStop}
                selectedWC={selectedWC}
                onBusStopSelect={setSelectedBusStop}
                onWCSelect={setSelectedWC}
            />
        </main>
    );
}
