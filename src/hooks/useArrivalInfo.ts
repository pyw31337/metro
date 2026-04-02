import { useState, useEffect } from 'react';
import { StationArrival, TimetableEntry } from '@/types/metro';
import { db } from '@/services/db';
import { fetchStationArrivals, mergeLiveAndScheduled, convertTimetableToArrival } from '@/services/arrivalApi';
import { DataIngestionService } from '@/services/dataIngestion';
import { normalizeLineName } from '@/utils/stationUtils';

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

                // 1. Fetch Station Data to get Lines
                const station = await db.getStationByName(cleanName);
                if (!station) {
                    setLoading(false);
                    return;
                }

                // 2. Instant Baseline: Fetch from Local DB for all lines
                const targetLines = station.lines.map(normalizeLineName);
                
                let combinedTimetable: TimetableEntry[] = [];
                const lineSchedules: Record<string, ScheduleInfo> = {};

                for (const line of targetLines) {
                    const entries = await db.getStoredTimetable(cleanName, line, dayType).catch(() => [] as TimetableEntry[]);
                    if (entries.length > 0) {
                        combinedTimetable = [...combinedTimetable, ...entries];
                        lineSchedules[line] = {
                            firstTrain: entries[0].departureTime || entries[0].arrivalTime || "05:30",
                            lastTrain: entries[entries.length - 1].departureTime || entries[entries.length - 1].arrivalTime || "24:00"
                        };
                    } else {
                        // Trigger background ingestion for this specific line
                        const code = await db.getStationCode(cleanName, line);
                        if (code) {
                            DataIngestionService.ingestTimetables(cleanName, line, code).catch(() => {});
                        }
                    }
                }

                let scheduledArrivals: StationArrival[] = [];
                if (combinedTimetable.length > 0) {
                    scheduledArrivals = combinedTimetable
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
                    setSchedules(lineSchedules);
                } else {
                    // Start background ingestion if missing (full station trigger)
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
