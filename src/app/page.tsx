"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import { createRoot } from "react-dom/client";
import { PathResult, findShortestPath } from "@/utils/pathfinding";
import type { ActiveTab } from "@/components/MapBackground";
import type { WCItem } from "@/components/WCLayer";
import type { BusStop } from "@/components/BusStopLayer";
import { fetchWCDataClient } from "@/services/wcApi";
import StationPopup from "@/components/StationPopup";
import busData from "@/data/bus-stops.json";
import SearchOverlay from "@/components/SearchOverlay";

const MapBackground = dynamic(() => import("@/components/MapBackground"), { ssr: false });
const BottomPanel = dynamic(() => import("@/components/BottomPanel"), { ssr: false });

export default function Home() {
    const [pathResult, setPathResult] = useState<PathResult | null>(null);
    const [startStation, setStartStation] = useState<string | null>(null);
    const [endStation, setEndStation] = useState<string | null>(null);
    const [waypoints, setWaypoints] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<ActiveTab>("subway");
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [selectedWC, setSelectedWC] = useState<WCItem | null>(null);
    const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);
    const [wcItems, setWcItems] = useState<WCItem[]>([]);
    const [wcLoading, setWcLoading] = useState(false);
    const busStops = busData as BusStop[];
    
    // Map instance ref for popups
    const mapRef = useRef<L.Map | null>(null);

    // ─── Data Loading ──────────────────────────────────────────────────────────
    useEffect(() => {
        setWcLoading(true);
        fetchWCDataClient().then(data => {
            setWcItems(data);
            setWcLoading(false);
        });
    }, []);

    // ─── Pathfinding Logic ─────────────────────────────────────────────────────
    const calculatePath = useCallback((start: string | null, waypoints: string[], end: string | null) => {
        if (!start || !end) {
            setPathResult(null);
            return;
        }
        const points = [start, ...waypoints.filter(w => w.trim() !== ""), end];
        const res = findShortestPath(points);
        setPathResult(res);
    }, []);

    useEffect(() => {
        calculatePath(startStation, waypoints, endStation);
    }, [startStation, waypoints, endStation, calculatePath]);

    // ─── Map Interactions (Popups) ─────────────────────────────────────────────
    const handleMapClick = (name: string, latlng: [number, number], type: "subway" | "bus") => {
        // We need the Leaflet map object to open a popup
        // Instead of a ref, we can find the map from the DOM if needed, 
        // but it's better to pass a 'triggerPopup' to MapBackground.
        // Actually, easiest is to use a global event or a simpler state-based approach.
        // For now, let's assume MapBackground handles the popup creation.
    };

    const setStart = (name: string) => {
        setStartStation(name);
        // MapBackground should automatically close popups when map is clicked elsewhere
    };

    const setEnd = (name: string) => {
        setEndStation(name);
    };

    return (
        <main className="relative w-full h-screen overflow-hidden bg-zinc-950 font-sans">
            {/* Background Map Layer */}
            <div className="absolute inset-0 z-0">
                <MapBackground
                    pathResult={pathResult}
                    startStation={startStation}
                    endStation={endStation}
                    activeTab={activeTab}
                    isDarkMode={isDarkMode}
                    wcItems={wcItems}
                    busStops={busStops}
                    selectedBusStopId={selectedBusStop?.id ?? null}
                    onWCClick={setSelectedWC}
                    onBusStopClick={(stop) => {
                        setSelectedBusStop(stop);
                    }}
                    onStationClick={(name) => {
                        // Managed via automated popup
                    }}
                />
            </div>

            {/* Top Floating UI: Search & Navigation */}
            <SearchOverlay 
                isDarkMode={isDarkMode}
                onSearch={(s, wp, e) => {
                    setStartStation(s);
                    setWaypoints(wp);
                    setEndStation(e);
                }}
            />

            {/* Bottom Floating UI: Results & Tabs */}
            <BottomPanel
                activeTab={activeTab}
                onTabChange={setActiveTab}
                pathResult={pathResult}
                startStation={startStation}
                endStation={endStation}
                onResetPath={() => {
                    setStartStation(null);
                    setEndStation(null);
                    setPathResult(null);
                }}
                isDarkMode={isDarkMode}
                onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
                busStops={busStops}
                wcItems={wcItems}
                selectedBusStop={selectedBusStop}
                selectedWC={selectedWC}
                onBusStopSelect={setSelectedBusStop}
                onWCSelect={setSelectedWC}
            />

            {/* SEO & Accessibility */}
            <h1 className="sr-only">BMW Live - Premium Metro & Bus Transit Dashboard</h1>
        </main>
    );
}
