"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, Navigation2, X } from "lucide-react";

interface DirectionCompassProps {
    userLocation: [number, number] | null;
    targetLocation: [number, number] | null;
    targetName?: string;
    onClose: () => void;
}

export default function DirectionCompass({ userLocation, targetLocation, targetName, onClose }: DirectionCompassProps) {
    const [heading, setHeading] = useState<number | null>(null);
    const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');

    useEffect(() => {
        const handleOrientation = (e: DeviceOrientationEvent) => {
            // @ts-ignore - webkitCompassHeading is non-standard but widely supported on iOS
            const compassHeading = e.webkitCompassHeading || (360 - (e.alpha || 0));
            if (compassHeading !== undefined) setHeading(compassHeading);
        };

        const requestPermission = async () => {
            // iOS 13+ requires explicit permission for DeviceOrientation
            if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
                try {
                    const status = await (DeviceOrientationEvent as any).requestPermission();
                    setPermissionStatus(status === 'granted' ? 'granted' : 'denied');
                    if (status === 'granted') window.addEventListener('deviceorientation', handleOrientation);
                } catch (err) {
                    console.error("Compass permission error:", err);
                    setPermissionStatus('denied');
                }
            } else {
                window.addEventListener('deviceorientation', handleOrientation);
                setPermissionStatus('granted');
            }
        };

        if (permissionStatus === 'prompt') {
            requestPermission();
        }

        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, [permissionStatus]);

    const bearing = useMemo(() => {
        if (!userLocation || !targetLocation) return 0;
        const [lat1, lon1] = userLocation.map(c => c * Math.PI / 180);
        const [lat2, lon2] = targetLocation.map(c => c * Math.PI / 180);

        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        const b = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        return b;
    }, [userLocation, targetLocation]);

    const distance = useMemo(() => {
        if (!userLocation || !targetLocation) return 0;
        const R = 6371000; // meters
        const dLat = (targetLocation[0] - userLocation[0]) * Math.PI / 180;
        const dLon = (targetLocation[1] - userLocation[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(userLocation[0] * Math.PI / 180) * Math.cos(targetLocation[0] * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }, [userLocation, targetLocation]);

    // Arrow pointing direction relative to phone top
    const relativeAngle = heading !== null ? (bearing - heading + 360) % 360 : 0;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[1000] w-[260px] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl rounded-3xl border border-white/20 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-5"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Navigation2 size={16} fill="currentColor" />
                        </div>
                        <div>
                            <h4 className="text-[13px] font-black text-zinc-900 dark:text-white leading-tight">화장실 길안내</h4>
                            <p className="text-[10px] font-bold text-blue-500">{targetName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-400">
                        <X size={14} />
                    </button>
                </div>

                <div className="relative h-32 flex flex-col items-center justify-center">
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 dark:opacity-5">
                        <Compass size={120} />
                    </div>
                    
                    {/* Circle Background */}
                    <div className="w-24 h-24 rounded-full border-2 border-dashed border-zinc-200 dark:border-white/10 flex items-center justify-center">
                        {/* The Pointer */}
                        <motion.div 
                            animate={{ rotate: relativeAngle }}
                            transition={{ type: "spring", stiffness: 100, damping: 15 }}
                            className="relative w-full h-full flex items-center justify-center"
                        >
                            <div className="w-1 h-12 bg-gradient-to-t from-blue-500 to-rose-500 rounded-full relative -top-6">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-rose-500 -mt-1" />
                            </div>
                        </motion.div>
                    </div>

                    <div className="mt-4 flex flex-col items-center">
                        <span className="text-[20px] font-black text-zinc-900 dark:text-white tabular-nums">
                            {distance < 1000 ? `${Math.round(distance)}m` : `${(distance/1000).toFixed(1)}km`}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">직선거리</span>
                    </div>
                </div>

                {permissionStatus === 'denied' && (
                    <div className="mt-4 p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-center">
                        <p className="text-[9px] font-bold text-rose-500">나침반 권한이 거부되었습니다.<br/>브라우저 설정에서 센서 권한을 허용해주세요.</p>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
