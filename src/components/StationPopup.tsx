"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { createRoot } from "react-dom/client";

interface StationPopupProps {
    name: string;
    type: "subway" | "bus";
    onSetStart: (name: string) => void;
    onSetEnd: (name: string) => void;
    isDarkMode: boolean;
}

export default function StationPopup({ name, type, onSetStart, onSetEnd, isDarkMode }: StationPopupProps) {
    const bg = isDarkMode ? "#18191c" : "#ffffff";
    const text = isDarkMode ? "#f1f1f1" : "#111827";
    const border = isDarkMode ? "#2f3033" : "#f3f4f6";

    return (
        <div className="flex flex-col p-2 min-w-[160px]" style={{ color: text }}>
            <div className="text-[16px] font-black mb-3 tracking-tight border-b pb-2" style={{ borderColor: border }}>
                <span className="mr-2">{type === "subway" ? "🚇" : "🚌"}</span>
                {name}
            </div>
            
            <div className="flex flex-col gap-1.5">
                <button 
                    onClick={() => onSetStart(name)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-[13px] font-bold transition-all active:scale-95"
                >
                    <span>출발지로 설정</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                </button>
                
                <button 
                    onClick={() => onSetEnd(name)}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[13px] font-bold transition-all active:scale-95"
                >
                    <span>도착지로 설정</span>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

// Helper to create a Leaflet-compatible popup content string OR use a React portal
export function createStationPopup(props: StationPopupProps) {
    const container = document.createElement("div");
    const root = createRoot(container);
    root.render(<StationPopup {...props} />);
    return container;
}
