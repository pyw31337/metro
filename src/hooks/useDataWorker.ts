"use client";

import { useEffect, useRef, useCallback } from "react";

export function useDataWorker() {
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        workerRef.current = new Worker(new URL("../workers/data-worker.ts", import.meta.url));
        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    const findPath = useCallback((points: string[]) => {
        return new Promise((resolve) => {
            if (!workerRef.current) return resolve(null);
            
            const handleMessage = (e: MessageEvent) => {
                if (e.data.type === "PATH_RESULT") {
                    workerRef.current?.removeEventListener("message", handleMessage);
                    resolve(e.data.payload);
                }
            };
            
            workerRef.current.addEventListener("message", handleMessage);
            workerRef.current.postMessage({ type: "FIND_PATH", payload: { points } });
        });
    }, []);

    const findNearestStation = useCallback((lat: number, lng: number, stations: any[]) => {
        return new Promise((resolve) => {
            if (!workerRef.current) return resolve(null);
            
            const handleMessage = (e: MessageEvent) => {
                if (e.data.type === "NEAREST_STATION_RESULT") {
                    workerRef.current?.removeEventListener("message", handleMessage);
                    resolve(e.data.payload);
                }
            };
            
            workerRef.current.addEventListener("message", handleMessage);
            workerRef.current.postMessage({ type: "FIND_NEAREST_STATION", payload: { lat, lng, stations } });
        });
    }, []);

    const sortWCs = useCallback((items: any[], userLat: number, userLng: number) => {
        return new Promise((resolve) => {
            if (!workerRef.current) return resolve([]);
            
            const handleMessage = (e: MessageEvent) => {
                if (e.data.type === "SORTED_WC_RESULT") {
                    workerRef.current?.removeEventListener("message", handleMessage);
                    resolve(e.data.payload);
                }
            };
            
            workerRef.current.addEventListener("message", handleMessage);
            workerRef.current.postMessage({ type: "SORT_WC", payload: { items, userLat, userLng } });
        });
    }, []);

    return { findPath, findNearestStation, sortWCs };
}
