import { useState, useEffect } from 'react';
import { StationArrival, TimetableEntry } from '@/types/metro';
import { db } from '@/services/db';
import { fetchStationArrivals, mergeLiveAndScheduled, convertTimetableToArrival } from '@/services/arrivalApi';
import { DataIngestionService } from '@/services/dataIngestion';

export interface ArrivalInfo extends StationArrival {
    arrivalTime: number; // seconds
}

export interface ScheduleInfo {
    firstTrain: string;
    lastTrain: string;
}

export function useArrivalInfo(stationName: string | null) {
    const [arrivals, setArrivals] = useState<StationArrival[]>([]);
    const [schedules, setSchedules] = useState<Record<string, ScheduleInfo>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!stationName) {
            setArrivals([]);
            setSchedules({});
            return;
        }

        const cleanName = stationName.replace(/역+$/, '');

        const fetchData = async () => {
            setLoading(true);
            try {
                const now = new Date();
                const dayType = now.getDay() === 0 ? "sun" : (now.getDay() === 6 ? "sat" : "week");
                const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

                // 1. Instant Baseline: Fetch from Local DB first
                const storedTimetable = await db.getStoredTimetable(cleanName, "기본", dayType).catch(() => [] as TimetableEntry[]);
                
                let scheduledArrivals: StationArrival[] = [];
                if (storedTimetable && storedTimetable.length > 0) {
                    scheduledArrivals = storedTimetable
                        .map(entry => {
                            const [h, m, s] = (entry.departureTime || entry.arrivalTime).split(':').map(Number);
                            const entrySeconds = h * 3600 + m * 60 + (s || 0);
                            let waitTime = entrySeconds - currentSeconds;
                            if (waitTime < -36000) waitTime += 86400; 
                            return { entry, waitTime };
                        })
                        .filter(item => item.waitTime > 0 && item.waitTime < 7200)
                        .sort((a, b) => a.waitTime - b.waitTime)
                        .map(item => convertTimetableToArrival(item.entry, item.waitTime));
                    
                    // Show baseline immediately
                    setArrivals(scheduledArrivals);
                    setSchedules({
                        "기본": {
                            firstTrain: storedTimetable[0].departureTime || "05:30",
                            lastTrain: storedTimetable[storedTimetable.length - 1].departureTime || "24:00"
                        }
                    });
                } else {
                    // Start background ingestion if missing
                    DataIngestionService.triggerTimetableByStationName(cleanName).catch(() => {});
                }

                // 2. Real-time Augmentation: Fetch from API in background
                const liveArrivals = await fetchStationArrivals(cleanName).catch(() => [] as StationArrival[]);
                
                // 3. Final Merge
                const combined = mergeLiveAndScheduled(liveArrivals, scheduledArrivals);
                setArrivals(combined);

            } catch (error) {
                console.error("Hybrid arrival fetch error", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000); 

        return () => clearInterval(interval);
    }, [stationName]);

    return { arrivals, schedules, loading };
}
