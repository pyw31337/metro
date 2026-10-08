"use client";

import { useState, useMemo, useId } from "react";
import { Plus, Minus, Crosshair, Menu, X, Eclipse, CloudSun, Contrast } from "lucide-react";
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

/**
 * 지도 우상단 컨트롤.
 * - 하나의 반경 체계(16px), 틴트 그림자, 눌림 피드백(scale 0.97)
 * - 테마 토글은 해/달 아이콘 대신 상태를 글로 보여주는 토글(aria-pressed)
 * - 아이콘 버튼은 모두 aria-label + 툴팁 라벨
 */
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
    const menuId = useId();

    const menuItems = useMemo(() => [
        { id: "dark",     icon: <Eclipse size={18} strokeWidth={2} />,  onClick: onDarkModeToggle,     label: isDarkMode ? "라이트 모드로" : "다크 모드로", pressed: isDarkMode },
        { id: "contrast", icon: <Contrast size={18} strokeWidth={2} />, onClick: onHighContrastToggle, label: isHighContrast ? "고대비 끄기" : "고대비 켜기", pressed: isHighContrast },
        { id: "weather",  icon: <CloudSun size={18} strokeWidth={2} />, onClick: onWeatherToggle,      label: "날씨" },
        { id: "locate",   icon: <Crosshair size={18} strokeWidth={2} />, onClick: onLocate,            label: "내 위치" },
    ], [isDarkMode, onDarkModeToggle, isHighContrast, onHighContrastToggle, onWeatherToggle, onLocate]);

    const surface = "bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-900/[0.06] dark:border-white/[0.08] shadow-[0_1px_2px_rgba(24,24,27,0.06),0_8px_24px_-6px_rgba(24,24,27,0.18)]";
    const iconBtn = "press w-11 h-11 flex items-center justify-center focus-visible:outline-offset-[-3px] hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.06]";
    const iconColor = "text-zinc-700 dark:text-zinc-200";

    return (
        <nav className="flex flex-col items-end gap-2" aria-label="지도 컨트롤">
            <button
                onClick={() => { hapticLight(); setIsOpen(!isOpen); }}
                className={`press w-11 h-11 rounded-2xl flex items-center justify-center ${isOpen ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-lg' : `${surface} text-zinc-700 dark:text-zinc-200`}`}
                aria-label={isOpen ? "설정 닫기" : "설정 열기"}
                aria-expanded={isOpen}
                aria-controls={menuId}
            >
                {isOpen ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
            </button>

            {isOpen && (
                <div id={menuId} role="group" aria-label="지도 설정" className={`flex flex-col rounded-2xl overflow-hidden animate-fade-in-up ${surface}`}>
                    {menuItems.map((item, i) => (
                        <button
                            key={item.id}
                            onClick={() => { hapticLight(); item.onClick(); }}
                            className={`${iconBtn} group relative ${i > 0 ? 'border-t border-zinc-900/[0.06] dark:border-white/[0.06]' : ''} ${item.pressed ? 'text-blue-600 dark:text-blue-400' : iconColor}`}
                            aria-label={item.label}
                            aria-pressed={item.pressed}
                        >
                            {item.icon}
                            <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-50 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-zinc-100 dark:text-zinc-900">
                                {item.label}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* 줌은 항상 노출: 지도 앱에서 가장 자주 쓰는 컨트롤 */}
            <div role="group" aria-label="확대 축소" className={`flex flex-col rounded-2xl overflow-hidden ${surface}`}>
                <button onClick={() => { hapticLight(); onZoomIn(); }} className={`${iconBtn} ${iconColor}`} aria-label="확대">
                    <Plus size={18} strokeWidth={2} />
                </button>
                <button onClick={() => { hapticLight(); onZoomOut(); }} className={`${iconBtn} ${iconColor} border-t border-zinc-900/[0.06] dark:border-white/[0.06]`} aria-label="축소">
                    <Minus size={18} strokeWidth={2} />
                </button>
            </div>
        </nav>
    );
}
