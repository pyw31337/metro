"use client";

import { useState, useEffect, useMemo } from "react";
import { Compass, Navigation2, X } from "lucide-react";
import { hapticLight } from "@/utils/haptic";

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
    // When heading is null (compass unavailable), show absolute bearing (north-relative)
    const relativeAngle = heading !== null ? (bearing - heading + 360) % 360 : bearing;
    const compassReady = heading !== null;

    const bearingCardinal = useMemo(() => {
        const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
        return dirs[Math.round(bearing / 45) % 8];
    }, [bearing]);

    return (
        <div className="animate-popup fixed bottom-32 left-1/2 -translate-x-1/2 z-[1000] w-[260px] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl rounded-3xl border border-white/20 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-5"
        >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Navigation2 size={16} fill="currentColor" />
                        </div>
                        <div>
                            <h4 className="text-[13px] font-black text-zinc-900 dark:text-white leading-tight">화장실 길안내</h4>
                            <p className="text-[10px] font-bold text-blue-500 truncate max-w-[120px]">{targetName}</p>
                        </div>
                    </div>
                    <button onClick={() => { hapticLight(); onClose(); }} className="p-1.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-400 active:scale-90 transition-all">
                        <X size={14} />
                    </button>
                </div>

                <div className="relative h-32 flex flex-col items-center justify-center">
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 dark:opacity-5">
                        <Compass size={120} />
                    </div>

                    {/* Circle Background */}
                    <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center transition-colors duration-500 ${compassReady ? 'border-blue-200 dark:border-blue-500/30 border-solid' : 'border-dashed border-zinc-200 dark:border-white/10'}`}>
                        {/* The Pointer */}
                        <div
                            style={{
                                transform: `rotate(${relativeAngle}deg)`,
                                transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                            className="relative w-full h-full flex items-center justify-center"
                        >
                            <div className={`w-1 h-12 rounded-full relative -top-6 transition-opacity duration-300 ${compassReady ? 'opacity-100 bg-gradient-to-t from-blue-500 to-rose-500' : 'opacity-40 bg-gradient-to-t from-zinc-400 to-zinc-600'}`}>
                                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] -mt-1 ${compassReady ? 'border-b-rose-500' : 'border-b-zinc-600'}`} />
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col items-center">
                        <span className="text-[20px] font-black text-zinc-900 dark:text-white tabular-nums">
                            {distance < 1000 ? `${Math.round(distance)}m` : `${(distance/1000).toFixed(1)}km`}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                            {compassReady ? '직선거리' : `${bearingCardinal}방향 · 직선거리`}
                        </span>
                        <span className="text-[9px] font-bold text-zinc-400 mt-0.5">
                            도보 약 {Math.ceil(distance / 67)}분 예상
                        </span>
                    </div>
                </div>

                {!compassReady && permissionStatus !== 'denied' && (
                    <div className="mt-3 p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-center">
                        <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400">기기를 움직이면 나침반이 활성화됩니다</p>
                    </div>
                )}
                {permissionStatus === 'denied' && (
                    <div className="mt-3 p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-center">
                        <p className="text-[9px] font-bold text-rose-500">나침반 권한이 거부되었습니다.<br/>브라우저 설정에서 센서 권한을 허용해주세요.</p>
                    </div>
                )}
        </div>
    );
}
