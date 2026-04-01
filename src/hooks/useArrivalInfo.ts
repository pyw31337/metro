import { useState, useEffect } from 'react';
import { fetchStationArrivals } from '@/services/arrivalApi';
import { StationArrival } from '@/types/metro';
import { db } from '@/services/db';
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
                // 1. Fetch Arrivals using the robust service
                const processedArrivals = await fetchStationArrivals(cleanName);
                setArrivals(processedArrivals);

                // 2. Timetable lookup/fallback
                try {
                    let stored = await db.getStoredTimetable(cleanName, "기본", "week");
                    
                    const updateScheduleState = (data: any[]) => {
                        if (data.length > 0) {
                            setSchedules({
                                "기본": {
                                    firstTrain: data[0].departureTime || "05:30",
                                    lastTrain: data[data.length - 1].departureTime || "24:00"
                                }
                            });
                        } else {
                            setSchedules({ "기본": { firstTrain: "05:30", lastTrain: "24:00" } });
                        }
                    };

                    if (!stored || stored.length === 0) {
                        DataIngestionService.triggerTimetableByStationName(cleanName).then(async () => {
                            const newStored = await db.getStoredTimetable(cleanName, "기본", "week");
                            updateScheduleState(newStored);
                        });
                    } else {
                        updateScheduleState(stored);
                    }
                } catch (e) {
                    setSchedules({ "기본": { firstTrain: "05:30", lastTrain: "24:00" } });
                }
            } catch (error) {
                console.error("Arrival fetch error", error);
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
