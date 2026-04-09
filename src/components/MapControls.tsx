"use client";

import { useState, useMemo } from "react";
import { Plus, Minus, Crosshair, Menu, X, Sun, Moon, CloudSun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
        { id: "dark", icon: isDarkMode ? <Sun size={20} /> : <Moon size={20} />, onClick: onDarkModeToggle, label: "테마" },
        { id: "weather", icon: <CloudSun size={20} />, onClick: onWeatherToggle, label: "날씨" },
        { id: "locate", icon: <Crosshair size={20} />, onClick: onLocate, label: "위치" },
        { id: "zoomIn", icon: <Plus size={20} />, onClick: onZoomIn, label: "확대" },
        { id: "zoomOut", icon: <Minus size={20} />, onClick: onZoomOut, label: "축소" },
    ], [isDarkMode, onDarkModeToggle, onWeatherToggle, onLocate, onZoomIn, onZoomOut]);

    return (
        <div className="flex flex-col items-center gap-3">
            {/* Main Menu Toggle */}
            <button
                onClick={() => { hapticLight(); setIsOpen(!isOpen); }}
                className={`w-14 h-14 rounded-3xl flex items-center justify-center transition-all ${isOpen ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-2xl scale-[1.05]' : 'glass-premium text-zinc-600 dark:text-zinc-200 border border-zinc-200 dark:border-white/10 shadow-xl'}`}
                aria-label="Toggle Menu"
            >
                <motion.div
                    initial={false}
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                    {isOpen ? <X size={24} strokeWidth={2.5} /> : <Menu size={24} strokeWidth={2.5} />}
                </motion.div>
            </button>

            {/* Cascading Menu Items */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        className="flex flex-col gap-3"
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        variants={{
                            visible: { transition: { staggerChildren: 0.05 } },
                            hidden: { transition: { staggerChildren: 0.03, staggerDirection: -1 } }
                        }}
                    >
                        {menuItems.map((item) => (
                            <motion.button
                                key={item.id}
                                onClick={() => {
                                    hapticLight();
                                    item.onClick();
                                }}
                                variants={{
                                    visible: { y: 0, opacity: 1, scale: 1 },
                                    hidden: { y: -20, opacity: 0, scale: 0.8 }
                                }}
                                className="w-12 h-12 rounded-2xl flex items-center justify-center text-zinc-600 dark:text-zinc-200 bg-white/95 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-lg hover:scale-105 active:scale-95 transition-all"
                                title={item.label}
                            >
                                {item.icon}
                            </motion.button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
