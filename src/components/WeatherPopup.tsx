"use client";

import { useEffect, useState } from "react";
import { X, Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Wind } from "lucide-react";
import { motion } from "framer-motion";

interface WeatherData {
    address: string;
    daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
    };
}

interface WeatherPopupProps {
    lat: number;
    lng: number;
    onClose: () => void;
    isDarkMode?: boolean;
}

const getWeatherIcon = (code: number) => {
    if (code === 0) return <Sun className="text-yellow-400" size={24} />;
    if (code <= 3) return <Cloud className="text-zinc-400" size={24} />;
    if (code <= 48) return <Wind className="text-zinc-300" size={24} />;
    if (code <= 65) return <CloudRain className="text-blue-400" size={24} />;
    if (code <= 77) return <CloudSnow className="text-blue-200" size={24} />;
    if (code <= 82) return <CloudRain className="text-blue-500" size={24} />;
    if (code >= 95) return <CloudLightning className="text-purple-400" size={24} />;
    return <Sun className="text-yellow-400" size={24} />;
};

const getDayName = (dateStr: string) => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const d = new Date(dateStr);
    return days[d.getDay()];
};

export default function WeatherPopup({ lat, lng, onClose, isDarkMode = false }: WeatherPopupProps) {
    const [data, setData] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Reverse Geocoding
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`);
                const geoJson = await geoRes.json();
                const address = geoJson.display_name.split(',').slice(0, 2).join(', ').trim();

                // 2. Weather Forecast
                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
                const weatherJson = await weatherRes.json();

                setData({
                    address: address || "알 수 없는 위치",
                    daily: weatherJson.daily
                });
            } catch (err) {
                console.error("Weather fetch failed", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [lat, lng]);

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed top-24 right-20 z-[3000] w-[320px] glass-premium rounded-[32px] overflow-hidden border border-white/20 dark:border-white/10 shadow-2xl"
        >
            <div className="p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-white/40 mb-1">현재 지도 중심 주소</span>
                        <h3 className="text-[15px] font-black text-zinc-900 dark:text-white leading-tight">
                            {loading ? "위치 확인 중..." : data?.address}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
                        <X size={18} className="text-zinc-400" />
                    </button>
                </div>

                <div className="h-px bg-black/5 dark:bg-white/5 w-full" />

                <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-white/40">7일 기상 예보</span>
                    
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-7 gap-1">
                            {data?.daily.time.map((time, i) => (
                                <div key={i} className="flex flex-col items-center gap-2 p-1 py-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                                    <span className={`text-[11px] font-black ${i === 0 ? 'text-blue-500' : 'text-zinc-500 dark:text-white/60'}`}>
                                        {i === 0 ? "오늘" : getDayName(time)}
                                    </span>
                                    {getWeatherIcon(data.daily.weather_code[i])}
                                    <div className="flex flex-col items-center -gap-0.5">
                                        <span className="text-[11px] font-black text-zinc-900 dark:text-white">{Math.round(data.daily.temperature_2m_max[i])}°</span>
                                        <span className="text-[9px] font-bold text-zinc-400">{Math.round(data.daily.temperature_2m_min[i])}°</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
