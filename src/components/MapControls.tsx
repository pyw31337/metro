"use client";

import { useState, useMemo } from "react";
import { Plus, Minus, Crosshair, Menu, X, Sun, Moon, CloudSun, Contrast } from "lucide-react";
import { hapticLight } from "@/utils/haptic";

interface MapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onLocate: () => void;
    onWeatherToggle: () => void;
    isDarkMode: boolean;
    onDarkModeToggle: () => void;
    isHighContrast: boolean;
    onHighContrastToggle: () => void;
}

export default function MapControls({
    onZoomIn,
    onZoomOut,
    onLocate,
    onWeatherToggle,
    isDarkMode,
    onDarkModeToggle,
    isHighContrast,
    onHighContrastToggle
}: MapControlsProps) {
    const [isOpen, setIsOpen] = useState(false);

    const menuItems = useMemo(() => [
        { id: "locate",   icon: <Crosshair size={18} />, label: "현재 위치", hint: "지도를 내 위치로 이동", onClick: onLocate },
        { id: "weather",  icon: <CloudSun size={18} />, label: "날씨", hint: "현재 지역 날씨 보기", onClick: onWeatherToggle },
        { id: "dark",     icon: isDarkMode ? <Sun size={18} /> : <Moon size={18} />, label: "테마", hint: isDarkMode ? "밝은 화면으로 전환" : "어두운 화면으로 전환", onClick: onDarkModeToggle },
        { id: "contrast", icon: <Contrast size={18} className={isHighContrast ? "text-yellow-400" : ""} />, label: "고대비", hint: "가독성을 더 높이기", onClick: onHighContrastToggle },
        { id: "zoomIn",   icon: <Plus size={18} />, label: "확대", hint: "지도를 더 자세히 보기", onClick: onZoomIn },
        { id: "zoomOut",  icon: <Minus size={18} />, label: "축소", hint: "넓은 범위를 한눈에 보기", onClick: onZoomOut },
    ], [isDarkMode, onDarkModeToggle, isHighContrast, onHighContrastToggle, onWeatherToggle, onLocate, onZoomIn, onZoomOut]);

    return (
        <div className="flex flex-col items-center gap-3">
            {/* Main Menu Toggle */}
            <button
                onClick={() => { hapticLight(); setIsOpen(!isOpen); }}
                className={`w-14 h-14 rounded-3xl flex items-center justify-center transition-all ${isOpen ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-2xl scale-[1.05]' : 'glass-premium text-zinc-600 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 shadow-xl'}`}
                aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
                aria-expanded={isOpen}
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
                <div className="flex flex-col gap-2 items-end">
                    {menuItems.map((item, i) => (
                        <button
                            key={item.id}
                            onClick={() => { hapticLight(); item.onClick(); }}
                            style={{ animationDelay: `${i * 45}ms` }}
                            className="min-w-[156px] rounded-[22px] flex items-center justify-between gap-3 px-3 py-2.5 text-zinc-600 dark:text-zinc-200 bg-white/96 dark:bg-zinc-900/92 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-lg hover:scale-[1.02] active:scale-95 transition-all animate-fade-in-up"
                            aria-label={item.label}
                            title={item.label}
                        >
                            <div className="flex flex-col items-start text-left">
                                <span className="text-[12px] font-black text-zinc-900 dark:text-white">{item.label}</span>
                                <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">{item.hint}</span>
                            </div>
                            <span className="w-9 h-9 rounded-2xl flex items-center justify-center bg-zinc-100 dark:bg-white/8">
                                {item.icon}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
