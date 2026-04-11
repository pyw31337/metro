"use client";

import { useState, useMemo } from "react";
import { Plus, Minus, Crosshair, Menu, X, Sun, Moon, CloudSun } from "lucide-react";
import { hapticLight } from "@/utils/haptic";

interface MapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onLocate: () => void;
    onWeatherToggle: () => void;
    isDarkMode: boolean;
    onDarkModeToggle: () => void;
}

export default function MapControls({
    onZoomIn,
    onZoomOut,
    onLocate,
    onWeatherToggle,
    isDarkMode,
    onDarkModeToggle
}: MapControlsProps) {
    const [isOpen, setIsOpen] = useState(false);

    const menuItems = useMemo(() => [
        { id: "dark",    icon: isDarkMode ? <Sun size={20} /> : <Moon size={20} />, onClick: onDarkModeToggle, label: "테마" },
        { id: "weather", icon: <CloudSun size={20} />,                              onClick: onWeatherToggle,  label: "날씨" },
        { id: "locate",  icon: <Crosshair size={20} />,                             onClick: onLocate,         label: "위치" },
        { id: "zoomIn",  icon: <Plus size={20} />,                                  onClick: onZoomIn,         label: "확대" },
        { id: "zoomOut", icon: <Minus size={20} />,                                 onClick: onZoomOut,        label: "축소" },
    ], [isDarkMode, onDarkModeToggle, onWeatherToggle, onLocate, onZoomIn, onZoomOut]);

    return (
        <div className="flex flex-col items-center gap-3">
            {/* Main Menu Toggle */}
            <button
                onClick={() => { hapticLight(); setIsOpen(!isOpen); }}
                className={`w-14 h-14 rounded-3xl flex items-center justify-center transition-all ${isOpen ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-2xl scale-[1.05]' : 'glass-premium text-zinc-600 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 shadow-xl'}`}
                aria-label="Toggle Menu"
            >
                <div style={{
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}>
                    {isOpen ? <X size={24} strokeWidth={2.5} /> : <Menu size={24} strokeWidth={2.5} />}
                </div>
            </button>

            {/* Cascading Menu Items */}
            {isOpen && (
                <div className="flex flex-col gap-3">
                    {menuItems.map((item, i) => (
                        <button
                            key={item.id}
                            onClick={() => { hapticLight(); item.onClick(); }}
                            style={{ animationDelay: `${i * 45}ms` }}
                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-zinc-600 dark:text-zinc-200 bg-white/95 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-lg hover:scale-105 active:scale-95 transition-all animate-fade-in-up"
                            title={item.label}
                        >
                            {item.icon}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
