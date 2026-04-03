"use client";

import { Marker } from "react-map-gl/maplibre";
import { Station, BusStop, WCItem } from "@/types/metro";
import { memo } from "react";

interface NearbyPulseMarkersProps {
    nearestStation: Station | null;
    nearestBusStop: BusStop | null;
    nearestWC: WCItem | null;
    isDarkMode: boolean;
    activeTab: string;
}

const PulseMarker = ({ lng, lat, isDarkMode, label }: { lng: number; lat: number; isDarkMode: boolean; label: string }) => {
    return (
        <Marker longitude={lng} latitude={lat} anchor="center">
            <div className="relative flex items-center justify-center">
                {/* 3 Concentric Waves */}
                <div className="absolute w-4 h-4 rounded-full border-2 border-red-500 animate-[pulse-wave_2s_infinite_0s]" />
                <div className="absolute w-4 h-4 rounded-full border-2 border-red-500 animate-[pulse-wave_2s_infinite_0.6s]" />
                <div className="absolute w-4 h-4 rounded-full border-2 border-red-500 animate-[pulse-wave_2s_infinite_1.2s]" />
                
                {/* Core Circle */}
                <div 
                    className={`relative z-10 w-3.5 h-3.5 rounded-full border-[2.5px] border-red-600 shadow-lg transition-colors duration-500 ${
                        isDarkMode ? "bg-black" : "bg-white"
                    }`} 
                />
                
                {/* Optional Label for Debug/UX */}
                {/* <span className="absolute top-6 whitespace-nowrap text-[9px] font-black p-1 rounded bg-white/80 dark:bg-black/80 shadow-sm backdrop-blur-sm">
                    {label}
                </span> */}
            </div>
        </Marker>
    );
};

const NearbyPulseMarkers = ({ nearestStation, nearestBusStop, nearestWC, isDarkMode, activeTab }: NearbyPulseMarkersProps) => {
    return (
        <>
            {/* 1. Nearest Subway Station (Always show if available) */}
            {nearestStation && (activeTab === 'subway' || activeTab === 'subway+bus') && (
                <PulseMarker 
                    lng={nearestStation.lng} 
                    lat={nearestStation.lat} 
                    isDarkMode={isDarkMode} 
                    label="가까운 역"
                />
            )}

            {/* 2. Nearest Bus Stop (Show in Bus tab) */}
            {nearestBusStop && (activeTab === 'bus' || activeTab === 'subway+bus') && (
                <PulseMarker 
                    lng={nearestBusStop.lng} 
                    lat={nearestBusStop.lat} 
                    isDarkMode={isDarkMode} 
                    label="가까운 정류장"
                />
            )}

            {/* 3. Nearest Restroom (Show in WC tab or combined) */}
            {nearestWC && (activeTab === 'wc' || activeTab === 'subway+bus') && (
                <PulseMarker 
                    lng={nearestWC.lng} 
                    lat={nearestWC.lat} 
                    isDarkMode={isDarkMode} 
                    label="가까운 화장실"
                />
            )}
        </>
    );
};

export default memo(NearbyPulseMarkers);
