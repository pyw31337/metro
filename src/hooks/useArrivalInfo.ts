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
                const { getCanonicalName, getAllStationNames } = await import("@/utils/stationRegistry");
                const canonical = getCanonicalName(cleanName);
                const queryNames = getAllStationNames(cleanName);
                const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

                // 1. Instant Baseline: Fetch from Local DB
                let station = null;
                for (const qName of queryNames) {
                    station = await db.getStationByName(qName);
                    if (station) break;
                }

                if (!station) {
                    setLoading(false);
                    return;
                }

                const targetLines = station.lines.map(normalizeLineName);
                let combinedTimetable: TimetableEntry[] = [];
                const lineSchedules: Record<string, ScheduleInfo> = {};

                for (const line of targetLines) {
                    let entries: TimetableEntry[] = [];
                    for (const qName of queryNames) {
                        const results = await db.getStoredTimetable(qName, line, dayType).catch(() => []);
                        if (results.length > 0) {
                            entries = results;
                            break;
                        }
                    }
                    if (entries.length > 0) {
                        combinedTimetable = [...combinedTimetable, ...entries];
                        lineSchedules[line] = {
                            firstTrain: entries[0].departureTime || entries[0].arrivalTime || "05:30",
                            lastTrain: entries[entries.length - 1].departureTime || entries[entries.length - 1].arrivalTime || "24:00"
                        };
                    } else {
                        // Background ingestion trigger
                        const code = await db.getStationCode(cleanName, line);
                        if (code) DataIngestionService.ingestTimetables(cleanName, line, code).catch(() => {});
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
                    
                    // Update UI immediately with baseline
                    setArrivals(scheduledArrivals);
                    setSchedules(lineSchedules);
                    setLoading(false); // Stop main loading early
                }

                // 2. Real-time Augmentation: Non-blocking parallel fetch
                fetchStationArrivals(cleanName)
                    .then(async (liveArrivals) => {
                        const { useDataWorker } = await import("@/hooks/useDataWorker");
                        // We can't really use hooks inside .then() easily, 
                        // so we assume useDataWorker is already initialized in the component if needed.
                        // Or we can just use the provided mergeArrivals from props/context if we had one.
                        // Actually, I'll pass useDataWorker to the hook or just import the worker logic.
                        const { mergeLiveAndScheduled } = await import("@/services/arrivalApi");
                        const combined = mergeLiveAndScheduled(liveArrivals, scheduledArrivals);
                        setArrivals(combined);
                    })
                    .catch(err => {
                        console.warn("Live fetch failed, staying with scheduled", err);
                    })
                    .finally(() => {
                        setLoading(false);
                    });

            } catch (error) {
                console.error("Hybrid arrival fetch error", error);
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000); 

        return () => clearInterval(interval);
    }, [stationName]);

    return { arrivals, schedules, loading };
}
