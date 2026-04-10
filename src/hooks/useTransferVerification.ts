import { useState, useEffect, useRef } from "react";
import { fetchTransferPlatform } from "@/services/arrivalApi";
import { PathResult } from "@/types/metro";
import { STATION_LINE_IDX } from "@/data/subway-lines";

export const useTransferVerification = (pathResult: PathResult | null, stations?: any[]) => {
    const [verifiedPlats, setVerifiedPlats] = useState<Record<string, string>>({});
    const fetchingRef = useRef<Set<string>>(new Set());
    // Keep a ref to the latest verifiedPlats to avoid stale closures in async callbacks
    const verifiedPlatsRef = useRef<Record<string, string>>({});

    useEffect(() => {
        verifiedPlatsRef.current = verifiedPlats;
    }, [verifiedPlats]);

    useEffect(() => {
        if (!pathResult) {
            setVerifiedPlats({});
            fetchingRef.current.clear();
            return;
        }

        const fetchAll = async () => {
            // O(1) lookup via module-level STATION_LINE_IDX — no stations.find() needed
            const getLine = (sName: string): string[] => {
                const cleanName = sName.replace(/\(.*\)/, '').replace(/역$/, '').trim();
                const entries = STATION_LINE_IDX.get(cleanName) ?? STATION_LINE_IDX.get(cleanName + '역') ?? [];
                return entries.map(e => e.lineName);
            };

            const promises = pathResult.path.map(async (curr, idx) => {
                if (idx === 0) return;
                const prev = pathResult.path[idx - 1];

                const prevLines: string[] = getLine(prev);
                const currLines: string[] = getLine(curr);
                const common = prevLines.filter((l: string) => currLines.includes(l));

                if (common.length === 0) return;

                const next = pathResult.path[idx + 1];
                if (!next) return;

                const nextLines: string[] = getLine(next);
                const outLines = currLines.filter((l: string) => nextLines.includes(l));

                if (outLines.length === 0 || common[0] === outLines[0]) return;

                const key = `${curr}-${common[0]}-${outLines[0]}`;

                // Use ref for up-to-date value without stale closure
                if (verifiedPlatsRef.current[key] || fetchingRef.current.has(key)) return;

                fetchingRef.current.add(key);
                try {
                    const plat = await fetchTransferPlatform(curr, common[0], outLines[0]);
                    setVerifiedPlats(prev => ({
                        ...prev,
                        [key]: plat || "정보없음"
                    }));
                } catch {
                    setVerifiedPlats(prev => ({ ...prev, [key]: "정보없음" }));
                } finally {
                    fetchingRef.current.delete(key);
                }
            });

            await Promise.all(promises);
        };

        fetchAll();
    // pathResult identity changes when route changes; STATION_LINE_IDX is module-level (stable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathResult]);

    return verifiedPlats;
};
