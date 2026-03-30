import { useState, useEffect, useRef } from 'react';
import { SUBWAY_LINES } from '@/data/subway-lines';
import { fetchWithFallbacks } from '@/services/arrivalApi';

export interface Train {
    id: string;
    lineId: string;
    lineName: string;
    status: 'RUNNING' | 'STOPPED';
    lat: number;
    lng: number;
    headingTo: string;
    direction: 1 | -1;
    stationIndex: number;
    isRealtime?: boolean;
    lineColor: string;
}

interface RealtimePosition {
    subwayId: string;
    subwayNm: string;
    statnNm: string; 
    trainNo: string;
    statnTnm: string; 
    directAt: string; 
    updnLine: string; 
    trainSttus: string; 
}

function interpolate(start: { lat: number, lng: number }, end: { lat: number, lng: number }, ratio: number) {
    const r = Math.max(0, Math.min(1, ratio));
    return {
        lat: start.lat + (end.lat - start.lat) * r,
        lng: start.lng + (end.lng - start.lng) * r
    };
}

function getDirection(updn: string): 1 | -1 {
    return updn === '0' ? -1 : 1;
}

// Helper to normalize station names (remove "역" suffix for better matching)
const normalizeStationName = (name: string) => name.replace(/역$/, '').trim();

export function useRealtimeTrains() {
    const [trains, setTrains] = useState<Train[]>([]);
    const trainsRef = useRef<any[]>([]);

    useEffect(() => {
        const fetchRealtime = async () => {
            const lineNames = ["1호선", "2호선", "3호선", "4호선", "5호선", "6호선", "7호선", "8호선", "9호선", "경의중앙선", "경춘선", "수인분당선", "신분당선"];
            
            try {
                const results = await Promise.all(lineNames.map(async (name) => {
                    try {
                        const apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';
                        const targetUrl = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeTrainPosition/0/100/${name}`;
                        
                        const json = await fetchWithFallbacks(targetUrl);
                        const list: RealtimePosition[] = json?.realtimeTrainPositionList || [];
                        return { name, list };
                    } catch (e) {
                        return { name, list: [] };
                    }
                }));

                const allFetchedTrains: any[] = [];
                results.forEach(({ name, list }) => {
                    list.forEach(rt => {
                        const targetLines = SUBWAY_LINES.filter(l => l.name === name);
                        const normalizedStatnNm = normalizeStationName(rt.statnNm);

                        // Check ALL segments for a match
                        for (const line of targetLines) {
                            const stationIdx = line.stations.findIndex(s => normalizeStationName(s.name) === normalizedStatnNm);
                            
                            if (stationIdx !== -1) {
                                const dir = getDirection(rt.updnLine);
                                let initialProgress = 0.05;
                                if (rt.trainSttus === '0') initialProgress = 0.8; // Entering
                                if (rt.trainSttus === '1') initialProgress = 0.95; // Arrived
                                if (rt.trainSttus === '2') initialProgress = 0.1; // Departed

                                allFetchedTrains.push({
                                    id: `real-${rt.trainNo}-${name}`,
                                    lineId: line.id,
                                    lineName: line.name,
                                    stationIndex: stationIdx,
                                    progress: initialProgress, 
                                    direction: dir,
                                    status: rt.trainSttus === '1' ? 'STOPPED' : 'RUNNING',
                                    headingTo: rt.statnTnm || rt.statnNm, 
                                    lastUpdate: Date.now()
                                });
                                break; // Only add once per train
                            }
                        }
                    });
                });

                if (allFetchedTrains.length > 0) {
                    trainsRef.current = allFetchedTrains;
                }
            } catch (err) {
                console.error("Failed to fetch realtime trains:", err);
            }
        };

        fetchRealtime();
        const apiInterval = setInterval(fetchRealtime, 15000); // 15s refresh to be safe

        const animInterval = setInterval(() => {
            const now = Date.now();
            const updated = trainsRef.current.map(t => {
                const line = SUBWAY_LINES.find(l => l.id === t.lineId);
                if (!line) return null;
                const stations = line.stations;

                // Simple elapsed progress
                const elapsed = (now - t.lastUpdate) / 1000; 
                let progress = t.progress + (elapsed * 0.01); 
                if (progress > 0.95) progress = 0.95; 

                const currentStation = stations[t.stationIndex];
                const nextStationIdx = t.stationIndex + t.direction;
                const nextStation = stations[nextStationIdx] || currentStation;

                const pos = interpolate(currentStation, nextStation, progress);

                return {
                    id: t.id,
                    lineId: t.lineId,
                    lineName: t.lineName,
                    lineColor: line.color,
                    status: t.status,
                    lat: pos.lat,
                    lng: pos.lng,
                    headingTo: t.headingTo,
                    direction: t.direction,
                    stationIndex: t.stationIndex,
                    isRealtime: true
                } as Train;
            }).filter((t): t is Train => t !== null);

            setTrains(updated);
        }, 100); 

        return () => {
            clearInterval(apiInterval);
            clearInterval(animInterval);
        };
    }, []);

    return trains;
}
