"use client";

import { Plus, Minus, Crosshair } from "lucide-react";
import { THEME } from "@/theme/design-system";

interface MapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onLocate: () => void;
    isDarkMode?: boolean;
}

export default function MapControls({ onZoomIn, onZoomOut, onLocate, isDarkMode = false }: MapControlsProps) {
    return (
        <div className="flex flex-col gap-3">
            {/* Zoom In/Out Group */}
            <div className="flex flex-col rounded-2xl overflow-hidden glass-premium border border-zinc-200 dark:border-white/10 shadow-xl">
                <button 
                    onClick={onZoomIn}
                    className="w-12 h-12 flex items-center justify-center text-zinc-600 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors border-b border-zinc-200 dark:border-white/10"
                    aria-label="Zoom In"
                >
                    <Plus size={20} strokeWidth={2.5} />
                </button>
                <button 
                    onClick={onZoomOut}
                    className="w-12 h-12 flex items-center justify-center text-zinc-600 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                    aria-label="Zoom Out"
                >
                    <Minus size={20} strokeWidth={2.5} />
                </button>
            </div>

            {/* Locate Button */}
            <button 
                onClick={onLocate}
                className="w-12 h-12 rounded-2xl glass-premium border border-zinc-200 dark:border-white/10 shadow-xl flex items-center justify-center text-zinc-600 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
                aria-label="Find My Location"
            >
                <Crosshair size={20} strokeWidth={2.5} />
            </button>
        </div>
    );
}
