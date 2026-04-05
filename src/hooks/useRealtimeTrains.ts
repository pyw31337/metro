"use client";

import { useEffect, useRef } from 'react';
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
    lastUpdate: number;
    progress: number;
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
    const r = Math.max(0, Math.min(1.1, ratio));
    return {
        lat: start.lat + (end.lat - start.lat) * Math.min(1, r),
        lng: start.lng + (end.lng - start.lng) * Math.min(1, r)
    };
}

function getDirection(updn: string): 1 | -1 {
    return (updn === '0' || updn === '1001' || updn.includes('상행') || updn.includes('내선')) ? 1 : -1;
}

export function useRealtimeTrains(map: any | null) {
    const trainsRef = useRef<Train[]>([]);
    const lastApiUpdateRef = useRef<number>(Date.now());

    useEffect(() => {
        if (!map) return;

        const fetchRealtime = async () => {
            const lineNames = ["1호선", "2호선", "3호선", "4호선", "5호선", "6호선", "7호선", "8호선", "9호선", "경의중앙선", "경춘선", "수인분당선", "신분당선"];
            
            try {
                const allFetchedTrains: Train[] = [];
                for (const name of lineNames) {
                    try {
                        const json = await subwayApi.getPositions(name);
                        const list: RealtimePosition[] = json?.realtimePositionList || [];
                        
                        list.forEach(rt => {
                            const targetLines = SUBWAY_LINES.filter(l => l.name === name);
                            const normalizedStatnNm = normalizeStationName(rt.statnNm);

                            for (const line of targetLines) {
                                const stationIdx = line.stations.findIndex(s => normalizeStationName(s.name) === normalizedStatnNm);
                                
                                if (stationIdx !== -1) {
                                    const dir = getDirection(rt.updnLine);
                                    let initialProgress = 0.05;
                                    if (rt.trainSttus === '0') initialProgress = 0.8; 
                                    if (rt.trainSttus === '1') initialProgress = 0.95; 
                                    if (rt.trainSttus === '2') initialProgress = 0.1; 

                                    allFetchedTrains.push({
                                        id: `${rt.trainNo}-${name}`,
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
                                        trainSttus: rt.trainSttus,
                                        lat: 0, lng: 0, lineColor: line.color.toUpperCase()
                                    });
                                    break; 
                                }
                            }
                        });
                        // Fast fetch but staggered
                        await new Promise(resolve => setTimeout(resolve, 50)); 
                    } catch (err) {}
                }

                if (allFetchedTrains.length > 0) {
                    trainsRef.current = allFetchedTrains;
                    lastApiUpdateRef.current = Date.now();
                }
            } catch (err) {
                console.error("Failed to fetch realtime trains:", err);
            }
        };

        // Initial fetch
        fetchRealtime();

        // 10s interval as requested
        const apiInterval = setInterval(fetchRealtime, 10000);

        // Immediate refresh on focus/visible
        const handleRefresh = () => fetchRealtime();
        window.addEventListener('focus', handleRefresh);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') fetchRealtime();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Animation logic 60fps
        const geojsonRef: any = { type: "FeatureCollection", features: [] };
        let rafId: number;

        const animate = () => {
            if (!map || !map.isStyleLoaded()) {
                rafId = requestAnimationFrame(animate);
                return;
            }

            const now = Date.now();
            const source: any = map.getSource('train-source');
            if (!source) {
                rafId = requestAnimationFrame(animate);
                return;
            }

            // Sync features array length
            if (geojsonRef.features.length !== trainsRef.current.length) {
                geojsonRef.features = trainsRef.current.map(() => ({
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [0, 0] },
                    properties: {}
                }));
            }

            const elapsedSinceApi = (now - lastApiUpdateRef.current) / 1000;

            trainsRef.current.forEach((t, i) => {
                const line = SUBWAY_LINES.find(l => l.id === t.lineId);
                if (!line || !line.stations) return;

                // Move progress linearly between updates
                // avg station gap ~120s
                let currentProgress = t.progress;
                if (t.status === 'RUNNING') {
                    currentProgress += (elapsedSinceApi / 120);
                }
                
                const currentStation = line.stations[t.stationIndex];
                const nextStationIdx = t.stationIndex + t.direction;
                const nextStation = line.stations[nextStationIdx] || currentStation;
                const pos = interpolate(currentStation, nextStation, currentProgress);

                const feat = geojsonRef.features[i];
                if (feat) {
                    feat.geometry.coordinates = [pos.lng, pos.lat];
                    Object.assign(feat.properties, t, {
                        lat: pos.lat,
                        lng: pos.lng,
                        type: "train"
                    });
                }
            });

            if (geojsonRef.features.length > 0) {
                source.setData(geojsonRef);
            }

            rafId = requestAnimationFrame(animate);
        };
        rafId = requestAnimationFrame(animate);

        return () => {
            clearInterval(apiInterval);
            cancelAnimationFrame(rafId);
            window.removeEventListener('focus', handleRefresh);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [map]);

    return null;
}
