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
    lineColor: string;
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
                        const url = `https://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeSubwayPosition/1/100/${encodeURIComponent(name)}`;
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

        // Interpolation animation loop (60fps feel)
        const animInterval = setInterval(() => {
            const now = Date.now();
            const updated = trainsRef.current.map(t => {
                const line = SUBWAY_LINES.find(l => l.id === t.lineId)!;
                if (!line) return null;
                const stations = line.stations;

                // Time-based smooth interpolation (0-1 range between stations)
                // Assuming ~2 mins (120s) per station on average if no API update
                const elapsed = (now - t.lastUpdate) / 1000; 
                let progress = t.progress + (elapsed * 0.005); // Smooth crawl
                if (progress > 0.98) progress = 0.98; // Stay near station target

                const currentStation = stations[t.stationIndex];
                const nextStation = stations[t.stationIndex + t.direction] || currentStation;

                const pos = interpolate(currentStation, nextStation, progress);

                const res: Train = {
                    id: t.id as string,
                    lineId: t.lineId as string,
                    lineName: t.lineName as string,
                    lineColor: line.color,
                    status: t.status as 'RUNNING' | 'STOPPED',
                    lat: pos.lat,
                    lng: pos.lng,
                    headingTo: t.headingTo as string,
                    direction: t.direction as 1 | -1,
                    stationIndex: t.stationIndex as number,
                    isRealtime: true
                };
                return res;
            })
            .filter((t): t is Train => t !== null);

            setTrains(updated);
        }, 100); // 10fps for smooth movement, set to 100ms for browser performance

        return () => {
            clearInterval(apiInterval);
            clearInterval(animInterval);
        };
    }, []);

    return trains;
}
