import { useState, useEffect } from "react";
import { fetchWithCache, API_ENDPOINTS } from "@/utils/api-client";

export interface BusArrival {
    routeNo: string;
    arrTime: number; // seconds
    arrStopCount: number;
}

export function useRealtimeBuses(nodeId: string | null, cityCode: string = "11") {
    const [arrivals, setArrivals] = useState<BusArrival[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!nodeId) {
            setArrivals([]);
            return;
        }

        const apiKey = process.env.NEXT_PUBLIC_BUS_API_KEY || ""; // TAGO Key

        const fetchArrivals = async () => {
            setLoading(true);
            try {
                // TAGO API: getSttnAcctoArvlPrearnBusList
                const url = API_ENDPOINTS.TAGO_BUS_ARRIVAL(apiKey, cityCode, nodeId);
                const data = await fetchWithCache<any>(url);

                if (data?.response?.body?.items?.item) {
                    const list = Array.isArray(data.response.body.items.item) 
                        ? data.response.body.items.item 
                        : [data.response.body.items.item];
                    
                    const mapped: BusArrival[] = list.map((a: any) => ({
                        routeNo: a.routeno.toString(),
                        arrTime: parseInt(a.arrtime) || 0,
                        arrStopCount: parseInt(a.arrprevstationcnt) || 0
                    }));
                    setArrivals(mapped);
                }
            } catch (error) {
                console.error("TAGO Bus fetch error", error);
            } finally {
                setLoading(false);
            }
        };

        fetchArrivals();
        const interval = setInterval(fetchArrivals, 30000); // 30s update

        return () => clearInterval(interval);
    }, [nodeId, cityCode]);

    return { arrivals, loading };
}
