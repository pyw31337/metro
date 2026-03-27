import { useState, useEffect } from "react";
import { fetchWithCache, API_ENDPOINTS } from "@/utils/api-client";

export interface BusPosition {
    id: string;
    routeName: string;
    lat: number;
    lng: number;
    lastUpdate: number;
}

export function useBusPositions(enabled: boolean, filterRoute?: string | null) {
    const [buses, setBuses] = useState<BusPosition[]>([]);

    useEffect(() => {
        if (!enabled) {
            setBuses([]);
            return;
        }

        const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || "";

        const fetchPositions = async () => {
            const now = Date.now();
            if (!apiKey || apiKey.length < 10) {
                // Mock generator with smooth coordinate updates
                const mockBuses: BusPosition[] = [
                    { id: "bus-100", routeName: "100", lat: 37.5716 + (Math.sin(now/5000)*0.005), lng: 126.9769 + (Math.cos(now/5000)*0.005), lastUpdate: now },
                    { id: "bus-143", routeName: "143", lat: 37.5706 + (Math.sin(now/4000)*0.008), lng: 126.9918 + (Math.cos(now/4000)*0.008), lastUpdate: now },
                    { id: "bus-150", routeName: "150", lat: 37.4979 + (Math.sin(now/6000)*0.01), lng: 127.0276 + (Math.cos(now/6000)*0.01), lastUpdate: now },
                ].filter(b => !filterRoute || b.routeName === filterRoute);
                setBuses(mockBuses);
                return;
            }

            try {
                // Example route: Seoul 143 (Route ID example)
                // In production, we'd fetch this dynamically based on map bounds
                const routeId = "100100022"; // 143 Bus
                const url = `https://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteBusLocationList?serviceKey=${apiKey}&cityCode=11&routeId=${routeId}&_type=json`;
                
                const data = await fetchWithCache<any>(url);
                if (data?.response?.body?.items?.item) {
                    const items = Array.isArray(data.response.body.items.item) ? data.response.body.items.item : [data.response.body.items.item];
                    const mapped: BusPosition[] = items.map((item: any) => ({
                        id: `real-bus-${item.vehicleno}`,
                        routeName: "143",
                        lat: parseFloat(item.gpslat),
                        lng: parseFloat(item.gpslnt),
                        lastUpdate: Date.now()
                    }));
                    setBuses(prev => {
                        const next = [...prev];
                        mapped.forEach(mb => {
                            const idx = next.findIndex(nb => nb.id === mb.id);
                            if (idx !== -1) next[idx] = mb;
                            else next.push(mb);
                        });
                        return next;
                    });
                }
            } catch (error) {
                console.error("Bus position fetch error", error);
            }
        };

        const interval = setInterval(fetchPositions, 15000);
        fetchPositions();

        return () => clearInterval(interval);
    }, [enabled]);

    return buses;
}
