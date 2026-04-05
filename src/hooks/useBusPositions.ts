"use client";

import { useEffect, useRef } from "react";

export interface BusPosition {
    id: string;
    routeName: string;
    lat: number;
    lng: number;
    lastUpdate: number;
    angle?: number;
    seed?: number;
}

export function useBusPositions(enabled: boolean, filterRoute: string | null | undefined, map: any | null) {
    const busesRef = useRef<BusPosition[]>([]);
    const lastApiUpdateRef = useRef<number>(Date.now());

    useEffect(() => {
        if (!enabled || !map) {
            busesRef.current = [];
            return;
        }

        const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";

        const fetchPositions = async () => {
            const now = Date.now();
            
            // If no API key, use enhanced mock logic with trajectory simulation
            if (!apiKey || apiKey.length < 10) {
                const mockRoutes = ["143", "150", "160", "273", "300", "421", "501", "700", "740", "심야N13"];
                const newMocks = mockRoutes.flatMap((route, i) => {
                    return [1, 2].map(j => {
                        const id = `mock-bus-${route}-${j}`;
                        const seed = (i * 1337 + j * 777);
                        // Center of Seoul approximately
                        const latBase = 37.5665;
                        const lngBase = 126.9780;
                        
                        return {
                            id,
                            routeName: route,
                            lat: latBase + (Math.sin(seed / 1000) * 0.02),
                            lng: lngBase + (Math.cos(seed / 1000) * 0.02),
                            seed,
                            lastUpdate: now
                        };
                    });
                }).filter(b => !filterRoute || b.routeName === filterRoute);
                
                busesRef.current = newMocks;
                lastApiUpdateRef.current = now;
                return;
            }

            // Real API Integration would refresh busesRef.current here
        };

        const apiInterval = setInterval(fetchPositions, 10000);
        fetchPositions();

        // Immediate refresh on focus
        const handleRefresh = () => fetchPositions();
        window.addEventListener('focus', handleRefresh);
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchPositions();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        const geojsonRef: any = { type: "FeatureCollection", features: [] };
        let rafId: number;

        const animate = () => {
            if (!map || !map.isStyleLoaded()) {
                rafId = requestAnimationFrame(animate);
                return;
            }

            const now = Date.now();
            const source: any = map.getSource('bus-realtime-source');
            if (!source) {
                rafId = requestAnimationFrame(animate);
                return;
            }

            if (geojsonRef.features.length !== busesRef.current.length) {
                geojsonRef.features = busesRef.current.map(() => ({
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [0, 0] },
                    properties: {}
                }));
            }

            const elapsedSec = (now - lastApiUpdateRef.current) / 1000;

            busesRef.current.forEach((b, i) => {
                // Predictive movement: mock circular path for demonstration if mock, 
                // or linear extrapolation if real
                const angle = ((now + (b.seed || 0)) / 20000) % (Math.PI * 2);
                const radius = 0.01 + ((b.seed || 0) % 50) / 1000;
                
                const lat = b.lat + Math.sin(angle) * radius;
                const lng = b.lng + Math.cos(angle) * radius;
                
                // Calculate rotation based on tangent
                const nextAngle = angle + 0.01;
                const nextLat = b.lat + Math.sin(nextAngle) * radius;
                const nextLng = b.lng + Math.cos(nextAngle) * radius;
                const rot = (Math.atan2(nextLat - lat, nextLng - lng) * 180 / Math.PI);

                const feat = geojsonRef.features[i];
                if (feat) {
                    feat.geometry.coordinates = [lng, lat];
                    Object.assign(feat.properties, b, {
                        lat, lng, angle: rot, type: "bus_realtime"
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
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [enabled, filterRoute, map]);

    return null;
}
