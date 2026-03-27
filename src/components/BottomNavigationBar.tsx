"use client";

import { Train, Bus, Map as MapIcon, Bath } from "lucide-react";
import { motion } from "framer-motion";

interface BottomNavigationBarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export default function BottomNavigationBar({ activeTab, onTabChange }: BottomNavigationBarProps) {
    const tabs = [
        { id: "subway", label: "지하철", icon: <Train size={24} /> },
        { id: "bus", label: "버스", icon: <Bus size={24} /> },
        { id: "subway+bus", label: "통합", icon: <MapIcon size={24} /> },
        { id: "wc", label: "화장실", icon: <Bath size={24} /> },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[4000] px-4 pb-6 pt-2 pointer-events-none">
            <motion.div 
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="mx-auto max-w-lg glass-premium rounded-[32px] p-2 flex items-center justify-between pointer-events-auto border-white/20 shadow-[0_-10px_40px_rgba(0,0,0,0.2)]"
            >
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className="relative flex-1 flex flex-col items-center gap-1 py-3 transition-all active:scale-90"
                        >
                            {isActive && (
                                <motion.div 
                                    layoutId="nav-pill"
                                    className="absolute inset-0 bg-zinc-900 dark:bg-white rounded-[24px] -z-10"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <div className={`${isActive ? "text-white dark:text-zinc-900" : "text-zinc-400"} transition-colors duration-300`}>
                                {tab.icon}
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-tighter ${isActive ? "text-white dark:text-zinc-900" : "text-zinc-400 opacity-60"}`}>
                                {tab.label}
                            </span>
                        </button>
                    );
                })}
            </motion.div>
        </div>
    );
}
