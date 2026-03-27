"use client";

import { Map } from "lucide-react";

export default function Logo() {
    return (
        <div className="absolute top-8 left-8 z-[6000] pointer-events-none select-none hidden lg:block">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-black rounded-[14px] flex items-center justify-center shadow-2xl glass border border-white/10">
                    <Map size={24} className="text-white fill-white/20" />
                </div>
                <div className="flex flex-col -gap-1">
                    <h1 className="text-[20px] font-black tracking-tighter text-black dark:text-white leading-tight">
                        BMW <span className="text-zinc-400">Live</span>
                    </h1>
                    <p className="text-[10px] text-zinc-500 font-extrabold tracking-[0.2em] uppercase opacity-70">
                        Premium Mobility
                    </p>
                </div>
            </div>
        </div>
    );
}
