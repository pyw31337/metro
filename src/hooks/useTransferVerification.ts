import { useState, useEffect, useRef } from "react";
import { fetchTransferPlatform } from "@/services/arrivalApi";
import { PathResult } from "@/types/metro";

export const useTransferVerification = (pathResult: PathResult | null, stations: any[]) => {
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
            const getLine = (sName: string) => {
                const cleanName = sName.replace(/\(.*\)/, '').replace(/역$/, '').trim();
                const station = stations.find(s => s.name.replace(/\(.*\)/, '').replace(/역$/, '').trim() === cleanName);
                return station?.lines || [];
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
    // stations is stable (from useMemo in page.tsx), pathResult identity changes when route changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathResult]);

    return verifiedPlats;
};
