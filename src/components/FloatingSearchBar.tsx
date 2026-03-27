"use client";

import { Search, Train, Bus, Map as MapIcon, Bath, Menu } from "lucide-react";
import { motion } from "framer-motion";

interface FloatingSearchBarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    isDarkMode: boolean;
}

export default function FloatingSearchBar({ activeTab, onTabChange, isDarkMode }: FloatingSearchBarProps) {
    const tabs = [
        { id: "subway", label: "지하철", icon: <Train size={18} /> },
        { id: "bus", label: "버스", icon: <Bus size={18} /> },
        { id: "subway+bus", label: "통합", icon: <MapIcon size={18} /> },
        { id: "wc", label: "화장실", icon: <Bath size={18} /> },
    ];

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-md pointer-events-none">
            <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="flex flex-col gap-4"
            >
                {/* ─── Search Card (Glassmorphism) ─────────────────────────── */}
                <div className="glass-premium rounded-[26px] p-2 flex items-center gap-3 pointer-events-auto shadow-2xl">
                    <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center text-white shrink-0">
                        <Menu size={20} />
                    </div>
                    <div className="flex-1 text-zinc-400 font-medium px-1">
                        어디로 가시나요?
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center text-zinc-400">
                        <Search size={22} />
                    </div>
                </div>

                {/* ─── Category Tabs (Pill Buttons) ────────────────────────── */}
                <div className="flex justify-center gap-2 pointer-events-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`
                                flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-bold transition-all
                                ${activeTab === tab.id 
                                    ? "bg-zinc-900 text-white shadow-lg scale-105" 
                                    : "glass-premium text-zinc-500 hover:bg-white/50"
                                }
                            `}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
