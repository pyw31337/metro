import { useEffect, useRef } from "react";
import { convertBusPositionsToGeoJSON } from "@/utils/geoJsonUtils";

export interface BusPosition {
    id: string;
    routeName: string;
    lat: number;
    lng: number;
    lastUpdate: number;
    angle?: number;
}

export function useBusPositions(enabled: boolean, filterRoute: string | null | undefined, map: any | null) {
    const busesRef = useRef<any[]>([]);

    useEffect(() => {
        if (!enabled || !map) {
            busesRef.current = [];
            return;
        }

        const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";

        const fetchPositions = async () => {
            const now = Date.now();
            
            if (!apiKey || apiKey.length < 10) {
                const mockRoutes = ["143", "150", "160", "273", "300", "421", "501", "700", "740", "심야N13"];
                const newMocks = mockRoutes.flatMap((route, i) => {
                    return [1, 2].map(j => {
                        const id = `mock-bus-${route}-${j}`;
                        const seed = (i * 10 + j) * 1000;
                        const latBase = 37.5665 + (Math.sin(seed / 50000) * 0.05);
                        const lngBase = 126.9780 + (Math.cos(seed / 50000) * 0.05);
                        
                        return {
                            id,
                            routeName: route,
                            lat: latBase,
                            lng: lngBase,
                            seed,
                            lastUpdate: now
                        };
                    });
                }).filter(b => !filterRoute || b.routeName === filterRoute);
                
                busesRef.current = newMocks;
                return;
            }

            // Real API logic would go here
        };

        const apiInterval = setInterval(fetchPositions, 10000);
        fetchPositions();

        // Persistent GeoJSON for ZERO ALLOCATION
        const geojsonRef = {
            type: "FeatureCollection" as const,
            features: [] as any[]
        };

        let lastUpdateTime = 0;
        let rafId: number;

        const animate = (time: number) => {
            if (!map || !map.isStyleLoaded()) {
                rafId = requestAnimationFrame(animate);
                return;
            }

            // High Throttling: 2fps (500ms) for mobile silence
            if (time - lastUpdateTime < 500) {
                rafId = requestAnimationFrame(animate);
                return;
            }
            lastUpdateTime = time;

            const now = Date.now();
            const source = map.getSource('bus-realtime-source');
            if (!source) {
                rafId = requestAnimationFrame(animate);
                return;
            }

            // Sync features array size
            if (geojsonRef.features.length !== busesRef.current.length) {
                geojsonRef.features = busesRef.current.map(() => ({
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [0, 0] },
                    properties: {}
                }));
            }

            busesRef.current.forEach((b, i) => {
                const angle = (now + (b.seed || 0)) / 10000;
                const speed = 0.0002;
                
                const lat = b.lat + Math.sin(angle) * (speed * 10);
                const lng = b.lng + Math.cos(angle) * (speed * 10);
                const rot = (angle * 180 / Math.PI) + 90;

                // MUTATE IN-PLACE - ZERO ALLOCATION
                const feat = geojsonRef.features[i];
                feat.geometry.coordinates[0] = lng;
                feat.geometry.coordinates[1] = lat;
                
                Object.assign(feat.properties, b, {
                    lat,
                    lng,
                    angle: rot,
                    type: "bus_realtime"
                });
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
        };
    }, [enabled, filterRoute, map]);

    return null;
}
