import { useState, useEffect } from 'react';
import { fetchWithCache } from '@/utils/api-client';
import { getEstimatedArrivalsFromStatic } from '@/data/static-timetables';
import { StationArrival } from '@/types/metro';

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

        const apiKey = "53517344677079773531694a786f6a"; 
        const cleanName = stationName.replace(/역+$/, '');

        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Real-time Arrivals
                const arrivalUrl = `https://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival/0/20/${encodeURIComponent(cleanName)}`;
                const rawArrivals = await fetchWithCache<any>(arrivalUrl);
                
                let processedArrivals: StationArrival[] = [];

                if (rawArrivals?.realtimeStationArrival && rawArrivals.realtimeStationArrival.length > 0) {
                    processedArrivals = rawArrivals.realtimeStationArrival.map((a: any) => ({
                        lineName: a.subwayNm || "",
                        subwayId: a.subwayId || "",
                        updnLine: a.updnLine || "",
                        trainLineNm: a.trainLineNm || "",
                        statnNm: a.statnNm || "",
                        arvlMsg2: a.arvlMsg2 || "",
                        arvlMsg3: a.arvlMsg3 || "",
                        arvlCd: a.arvlCd || "",
                        barvlDt: a.barvlDt || "0",
                        btrainNo: a.btrainNo || "",
                        isScheduled: false
                    }));
                }

                // 2. Fallback to Static if no real-time data
                if (processedArrivals.length === 0) {
                    console.log(`No real-time data for ${cleanName}, falling back to static...`);
                    processedArrivals = getEstimatedArrivalsFromStatic(cleanName);
                }

                setArrivals(processedArrivals);

                // 3. Dummy Schedule fallback (Static)
                setSchedules({
                    "기본": {
                        firstTrain: "05:30",
                        lastTrain: "24:00"
                    }
                });
            } catch (error) {
                console.error("Arrival fetch error", error);
                // Final fallback on error
                setArrivals(getEstimatedArrivalsFromStatic(cleanName));
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
