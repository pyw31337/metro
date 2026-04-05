import { useState, useEffect } from 'react';
import { StationArrival } from '@/types/metro';
import { fetchStationArrivals, getScheduledArrivalsFromDB } from '@/services/arrivalApi';
import { normalizeStationName } from '@/utils/stationUtils';

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

        const cleanName = normalizeStationName(stationName);

        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Get Scheduled Baseline immediately from Local DB
                const scheduled = await getScheduledArrivalsFromDB(cleanName);
                
                // Group by line for schedule info (first/last train)
                const lineScheds: Record<string, ScheduleInfo> = {};
                scheduled.forEach(s => {
                    if (!lineScheds[s.lineName!]) {
                        lineScheds[s.lineName!] = { firstTrain: "05:30", lastTrain: "23:50" };
                    }
                    // In a real app we'd have exact first/last in the master-timetables, 
                    // for now we use placeholders or derive if possible.
                });

                if (scheduled.length > 0) {
                    setArrivals(scheduled.slice(0, 6)); // Show first 6 scheduled as baseline
                    setSchedules(lineScheds);
                }

                // 2. Fetch Live data (which now internally merges with DB scheduled if live is missing)
                const liveAndMerged = await fetchStationArrivals(cleanName);
                if (liveAndMerged.length > 0) {
                    setArrivals(liveAndMerged);
                } else if (scheduled.length === 0) {
                    // This is the true "No Information" state - should be extremely rare now
                    setArrivals([]);
                }

            } catch (error) {
                console.error("Arrival fetch error:", error);
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
