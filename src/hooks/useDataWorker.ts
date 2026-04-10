"use client";

import { useEffect, useRef, useCallback } from "react";

// Each call gets a unique ID so concurrent requests don't cross-resolve
let _msgIdCounter = 0;

const WORKER_TIMEOUT_MS = 15_000; // 15초 응답 없으면 null 반환

export function useDataWorker() {
    const workerRef   = useRef<Worker | null>(null);
    // pending handlers: msgId → cleanup fn (allows teardown on unmount)
    const pendingRef  = useRef<Map<number, () => void>>(new Map());

    useEffect(() => {
        workerRef.current = new Worker(new URL("../workers/data-worker.ts", import.meta.url));
        return () => {
            // reject all pending promises so callers don't hang after unmount
            pendingRef.current.forEach(cleanup => cleanup());
            pendingRef.current.clear();
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, []);

    /** Send a message and await the matching reply by msgId */
    const sendMessage = useCallback(<T>(type: string, replyType: string, payload: object): Promise<T | null> => {
        return new Promise((resolve) => {
            if (!workerRef.current) return resolve(null);
            const msgId = ++_msgIdCounter;

            let timeoutId: ReturnType<typeof setTimeout>;

            const cleanup = () => {
                workerRef.current?.removeEventListener("message", handleMessage);
                clearTimeout(timeoutId);
                pendingRef.current.delete(msgId);
            };

            const handleMessage = (e: MessageEvent) => {
                if (e.data.type === replyType && e.data.msgId === msgId) {
                    cleanup();
                    resolve(e.data.payload as T);
                }
            };

            // timeout fallback — prevents Promise from hanging if worker is busy or crashed
            timeoutId = setTimeout(() => {
                cleanup();
                resolve(null);
            }, WORKER_TIMEOUT_MS);

            pendingRef.current.set(msgId, () => { cleanup(); resolve(null); });
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

    return { findPath, findNearestStation, sortWCs };
}
