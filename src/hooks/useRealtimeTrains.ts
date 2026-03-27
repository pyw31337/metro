import { useState, useEffect, useRef } from 'react';
import { SUBWAY_LINES } from '@/data/subway-lines';

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
}

// ─── API Types ───────────────────────────────────────────────────────────────
interface RealtimePosition {
    subwayId: string;
    subwayNm: string;
    statnNm: string; // Current or last station name
    trainNo: string;
    lastStnNm: string; // Destination
    directAt: string; // 1: Express
    lstnyNm: string; // Final destination
    updnLine: string; // 0: Up/Inner, 1: Down/Outer
    trainSttus: string; // 0: Arrival, 1: Approach, 2: Departure, 3: Running
}

// ─── Speed & Interpolation ───────────────────────────────────────────────────
function interpolate(start: { lat: number, lng: number }, end: { lat: number, lng: number }, ratio: number) {
    const r = Math.max(0, Math.min(1, ratio));
    return {
        lat: start.lat + (end.lat - start.lat) * r,
        lng: start.lng + (end.lng - start.lng) * r
    };
}

// Map Seoul API updnLine to our direction
// updnLine: 0 (상행/내선), 1 (하행/외선)
function getDirection(updn: string): 1 | -1 {
    return updn === '0' ? -1 : 1;
}

export function useRealtimeTrains() {
    const [trains, setTrains] = useState<Train[]>([]);
    const lastFetchRef = useRef<number>(0);
    const trainsRef = useRef<any[]>([]);

    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;

        const fetchRealtime = async () => {
            if (!apiKey || apiKey.length < 10) return;

            // Lines to fetch (API names)
            const lineNames = ["1호선", "2호선", "3호선", "4호선", "5호선", "6호선", "7호선", "8호선", "9호선", "경의중앙선", "경춘선", "수인분당선", "신분당선"];
            
            try {
                const allFetchedTrains: any[] = [];

                // Fetching in parallel for speed
                await Promise.all(lineNames.map(async (name) => {
                    try {
                        const url = `https://openapi.seoul.go.kr:8088/${apiKey}/json/realtimeSubwayPosition/1/100/${encodeURIComponent(name)}`;
                        const res = await fetch(url);
                        const json = await res.json();
                        const list: RealtimePosition[] = json?.realtimeSubwayPosition?.row || [];

                        list.forEach(rt => {
                            // Find corresponding line and station in our data
                            const targetLines = SUBWAY_LINES.filter(l => l.name === name);
                            for (const line of targetLines) {
                                const stationIdx = line.stations.findIndex(s => s.name === rt.statnNm);
                                if (stationIdx !== -1) {
                                    const dir = getDirection(rt.updnLine);
                                    allFetchedTrains.push({
                                        id: `real-${rt.trainNo}-${name}`,
                                        lineId: line.id,
                                        lineName: line.name,
                                        stationIndex: stationIdx,
                                        progress: rt.trainSttus === '3' ? 0.5 : 0.1, // If running, place in middle
                                        direction: dir,
                                        status: rt.trainSttus === '3' ? 'RUNNING' : 'STOPPED',
                                        headingTo: rt.trainSttus === '0' ? rt.statnNm : (line.stations[stationIdx + dir]?.name || rt.statnNm),
                                        lastUpdate: Date.now()
                                    });
                                    break;
                                }
                            }
                        });
                    } catch (e) {
                        // Silently fail per line
                    }
                }));

                if (allFetchedTrains.length > 0) {
                    trainsRef.current = allFetchedTrains;
                }
            } catch (err) {
                console.error("Failed to fetch realtime trains", err);
            }
        };

        // Initial fetch
        fetchRealtime();
        const apiInterval = setInterval(fetchRealtime, 15000); // Update every 15s

        // Interpolation animation loop
        const animInterval = setInterval(() => {
            const now = Date.now();
            const updated = trainsRef.current.map(t => {
                const line = SUBWAY_LINES.find(l => l.id === t.lineId)!;
                const stations = line.stations;

                // Simple movement simulation between API pulses
                t.progress += 0.005; 
                if (t.progress > 0.95) t.progress = 0.95; // Wait for API to advance station

                const currentStation = stations[t.stationIndex];
                const nextStation = stations[t.stationIndex + t.direction] || currentStation;

                const pos = interpolate(currentStation, nextStation, t.progress);

                return {
                    id: t.id,
                    lineId: t.lineId,
                    lineName: t.lineName,
                    status: t.status,
                    lat: pos.lat,
                    lng: pos.lng,
                    headingTo: t.headingTo,
                    direction: t.direction,
                    stationIndex: t.stationIndex,
                    isRealtime: true
                };
            });

            // If no realtime data yet or key missing, fallback to mock (only if no data ever loaded)
            if (updated.length === 0 && (!apiKey || apiKey.length < 10)) {
                // Fallback logic could go here, but for now we expect real data or empty
            }

            setTrains(updated);
        }, 1000);

        return () => {
            clearInterval(apiInterval);
            clearInterval(animInterval);
        };
    }, []);

    return trains;
}
