"use client";

import React from 'react';
import { 
    X, MapPin, Clock, 
    Accessibility, Bell, Baby,
    Users, ChevronRight, Info
} from 'lucide-react';
import { WCItem } from '@/types/metro';

interface ToiletDetailPanelProps {
    wc: WCItem;
    onClose: () => void;
}

export default function ToiletDetailPanel({ wc, onClose }: ToiletDetailPanelProps) {
    const isOpenNow = () => {
        if (!wc.openTime || wc.openTime === '24시간' || wc.openTime === '00:00~24:00') return true;
        try {
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            const [start, end] = wc.openTime.split('~');
            return timeStr >= start && timeStr <= end;
        } catch (e) {
            return true;
        }
    };

    const openStatus = isOpenNow();

    return (
        <div className="absolute bottom-24 left-4 right-4 md:left-auto md:right-6 md:w-[400px] z-[100] animate-in fade-in zoom-in slide-in-from-bottom-8 duration-500">
            <div className="group relative bg-[#1a1a24]/80 dark:bg-[#0a0a0f]/90 backdrop-blur-3xl border border-white/10 rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden p-6 text-white transition-all hover:border-blue-500/30">
                {/* Glow Effect */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/20 blur-[64px] rounded-full pointer-events-none group-hover:bg-blue-600/30 transition-all duration-700" />
                <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-600/10 blur-[64px] rounded-full pointer-events-none group-hover:bg-purple-600/20 transition-all duration-700" />

                {/* Header */}
                <div className="relative flex justify-between items-start mb-5">
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10 ${
                                wc.isInsideGate ? 'bg-blue-500 text-white border-blue-400' : 'bg-white/5 text-zinc-400'
                            }`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${wc.isInsideGate ? 'bg-white animate-pulse' : 'bg-zinc-500'}`} />
                                {wc.isInsideGate ? '🚇 Inside Gate' : '📍 Outside Gate'}
                            </div>
                            
                            {openStatus ? (
                                <div className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20 tracking-widest uppercase flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Open Now
                                </div>
                            ) : (
                                <div className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-bold border border-rose-500/20 tracking-widest uppercase flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                    Closed
                                </div>
                            )}
                        </div>
                        <h2 className="text-2xl font-black tracking-tight leading-none bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                            {wc.name.split('화장실')[0]}
                            <span className="text-blue-500 font-medium ml-1">Restroom</span>
                        </h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:scale-110 active:scale-95 group/close"
                    >
                        <X size={18} className="text-zinc-400 group-hover/close:text-white transition-colors" />
                    </button>
                </div>

                {/* Info Bar */}
                <div className="relative flex items-center gap-3 text-zinc-400 text-xs px-4 py-3 bg-white/5 rounded-2xl border border-white/5 mb-6 group-hover:border-white/10 transition-colors">
                    <MapPin size={14} className="text-blue-500" />
                    <span className="truncate flex-1 font-medium italic opacity-70">
                        {wc.address || 'Location data unavailable'}
                    </span>
                    <button className="text-[10px] font-bold text-blue-500 hover:text-blue-400 transition-colors">COPY</button>
                </div>

                {/* Capacity Grid */}
                <div className="relative grid grid-cols-3 gap-3 mb-6">
                    {[
                        { label: 'Female', value: wc.femaleStalls, icon: Users, color: 'hover:border-pink-500/30' },
                        { label: 'Male Stalls', value: wc.maleStalls, icon: Users, color: 'hover:border-blue-500/30' },
                        { label: 'Urinals', value: wc.maleUrinals, icon: Info, color: 'hover:border-zinc-500/30' }
                    ].map((stat, idx) => (
                        <div key={idx} className={`bg-white/5 backdrop-blur-md rounded-2xl p-3 flex flex-col items-center justify-center border border-white/5 transition-all duration-300 hover:bg-white/10 ${stat.color} group/stat`}>
                            <stat.icon size={16} className="text-zinc-500 mb-1.5 group-hover/stat:text-white transition-colors" />
                            <span className="text-[9px] text-zinc-500 uppercase font-black tracking-tighter mb-1 select-none">{stat.label}</span>
                            <span className="text-lg font-black text-white">{stat.value || '-'}</span>
                        </div>
                    ))}
                </div>

                {/* Amenities Section */}
                <div className="relative space-y-2 mb-6">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all group-hover:border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Clock size={16} className="text-blue-500" />
                            </div>
                            <span className="text-sm font-semibold tracking-tight">Hours</span>
                        </div>
                        <span className="text-sm font-black text-blue-400">{wc.openTime || '24 Hours'}</span>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-zinc-500/10 rounded-lg">
                                <Accessibility size={16} className="text-zinc-500" />
                            </div>
                            <span className="text-sm font-semibold tracking-tight">Features</span>
                        </div>
                        <div className="flex gap-2.5">
                            {[
                                { show: wc.accessible, icon: Accessibility, color: 'text-blue-400 bg-blue-500/10' },
                                { show: wc.diapers, icon: Baby, color: 'text-amber-400 bg-amber-500/10' },
                                { show: wc.emergencyBell, icon: Bell, color: 'text-rose-400 bg-rose-500/10' }
                            ].map((feat, idx) => feat.show && (
                                <div key={idx} className={`p-1.5 rounded-lg border border-white/10 ${feat.color}`}>
                                    <feat.icon size={14} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Tip */}
                {wc.location && (
                    <div className="relative p-4 bg-gradient-to-br from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-2xl">
                        <div className="flex gap-3">
                            <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] leading-relaxed text-zinc-300 font-medium italic">
                                "{wc.location}"
                            </p>
                        </div>
                    </div>
                )}
                
                {/* Visual Accent */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-50" />
            </div>
        </div>
    );
}

