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

        const animInterval = setInterval(() => {
            if (!map || !map.isStyleLoaded()) return;

            const now = Date.now();
            const updated = busesRef.current.map(b => {
                const elapsed = (now - b.lastUpdate) / 1000;
                const speed = 0.0002; 
                const angle = (now + b.seed) / 10000;
                
                return {
                    id: b.id,
                    routeName: b.routeName,
                    lat: b.lat + Math.sin(angle) * (speed * 10),
                    lng: b.lng + Math.cos(angle) * (speed * 10),
                    lastUpdate: b.lastUpdate,
                    angle: (angle * 180 / Math.PI) + 90
                };
            });
            
            const source = map.getSource('bus-realtime-source');
            if (source && updated.length > 0) {
                source.setData(convertBusPositionsToGeoJSON(updated));
            }
        }, 150);

        return () => {
            clearInterval(apiInterval);
            clearInterval(animInterval);
        };
    }, [enabled, filterRoute, map]);

    return null;
}
