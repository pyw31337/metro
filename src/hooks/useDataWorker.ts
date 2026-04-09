"use client";

import { useEffect, useRef, useCallback } from "react";

// Each call gets a unique ID so concurrent requests don't cross-resolve
let _msgIdCounter = 0;

export function useDataWorker() {
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        workerRef.current = new Worker(new URL("../workers/data-worker.ts", import.meta.url));
        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    /** Send a message and await the matching reply by msgId */
    const sendMessage = useCallback(<T>(type: string, replyType: string, payload: object): Promise<T | null> => {
        return new Promise((resolve) => {
            if (!workerRef.current) return resolve(null);
            const msgId = ++_msgIdCounter;

            const handleMessage = (e: MessageEvent) => {
                if (e.data.type === replyType && e.data.msgId === msgId) {
                    workerRef.current?.removeEventListener("message", handleMessage);
                    resolve(e.data.payload as T);
                }
            };

            workerRef.current.addEventListener("message", handleMessage);
            workerRef.current.postMessage({ type, msgId, payload });
        });
    }, []);

    const findPath = useCallback((points: string[]) =>
        sendMessage<Record<string, any>>("FIND_PATH", "PATH_RESULT", { points }),
    [sendMessage]);

    const findNearestStation = useCallback((lat: number, lng: number, stations: any[]) =>
        sendMessage<any>("FIND_NEAREST_STATION", "NEAREST_STATION_RESULT", { lat, lng, stations }),
    [sendMessage]);

    const sortWCs = useCallback((items: any[], userLat: number, userLng: number) =>
        sendMessage<any[]>("SORT_WC", "SORTED_WC_RESULT", { items, userLat, userLng }),
    [sendMessage]);

    const mergeArrivals = useCallback((live: any[], scheduled: any[]) =>
        sendMessage<any[]>("MERGE_ARRIVALS", "MERGE_ARRIVALS_RESULT", { live, scheduled }),
    [sendMessage]);

    return { findPath, findNearestStation, sortWCs, mergeArrivals };
}
