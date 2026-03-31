import { useState, useEffect, useRef } from 'react';
import { SUBWAY_LINES } from '@/data/subway-lines';
import { subwayApi } from '@/utils/api-client';
import { normalizeStationName } from '@/utils/stationUtils';

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
    trainNo: string;
    directAt: string;
    trainSttus: string;
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
    return updn === '0' || updn === '1001' ? 1 : -1; // 1001/상행/내선: 1, 1002/하행/외선: -1
}

export function useRealtimeTrains() {
    const [trains, setTrains] = useState<Train[]>([]);
    const trainsRef = useRef<any[]>([]);

    useEffect(() => {
        const fetchRealtime = async () => {
            const lineNames = ["1호선", "2호선", "3호선", "4호선", "5호선", "6호선", "7호선", "8호선", "9호선", "경의중앙선", "경춘선", "수인분당선", "신분당선"];
            
            try {
                const results = await Promise.all(lineNames.map(async (name) => {
                    const json = await subwayApi.getPositions(name);
                    const list: RealtimePosition[] = json?.realtimePositionList || [];
                    return { name, list };
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
                                    lastUpdate: Date.now(),
                                    trainNo: rt.trainNo,
                                    directAt: rt.directAt,
                                    trainSttus: rt.trainSttus
                                });
                                break; // Only add once per train
                            }
                        }
                    });
                });

                const oldMap = new Map(trainsRef.current.map(t => [t.id, t]));
                const mergedTrains = allFetchedTrains.map(newT => {
                    const existing = oldMap.get(newT.id);
                    if (existing && existing.stationIndex === newT.stationIndex) {
                        // Same station, keep moving from where we are
                        return { ...newT, progress: existing.progress, lastUpdate: existing.lastUpdate };
                    }
                    return newT;
                });

                if (mergedTrains.length > 0) {
                    trainsRef.current = mergedTrains;
                }
            } catch (err) {
                console.error("Failed to fetch realtime trains:", err);
            }
        };

        fetchRealtime();
        const apiInterval = setInterval(fetchRealtime, 15000); 

        const animInterval = setInterval(() => {
            const now = Date.now();
            const updated: Train[] = [];
            
            const nextStates = trainsRef.current.map(t => {
                const line = SUBWAY_LINES.find(l => l.id === t.lineId);
                if (!line) return t;

                const elapsed = (now - t.lastUpdate) / 1000; 
                let progress = t.progress + (elapsed * 0.008); 
                if (progress > 0.95) progress = 0.95; 

                const currentStation = line.stations[t.stationIndex];
                const nextStationIdx = t.stationIndex + t.direction;
                const nextStation = line.stations[nextStationIdx] || currentStation;
                const pos = interpolate(currentStation, nextStation, progress);

                const newT = { ...t, progress, lastUpdate: now };
                updated.push({
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
                    isRealtime: true,
                    trainNo: t.trainNo,
                    directAt: t.directAt,
                    trainSttus: t.trainSttus
                } as Train);
                return newT;
            });

            trainsRef.current = nextStates;
            setTrains(updated);
        }, 100); 

        return () => {
            clearInterval(apiInterval);
            clearInterval(animInterval);
        };
    }, []);

    return trains;
}
