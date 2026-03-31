import { useState, useEffect, useRef } from "react";
import { fetchTransferPlatform } from "@/services/arrivalApi";
import { PathResult } from "@/types/metro";

export const useTransferVerification = (pathResult: PathResult | null, stations: any[]) => {
    const [verifiedPlats, setVerifiedPlats] = useState<Record<string, string>>({});
    const fetchingRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!pathResult) {
            setVerifiedPlats({});
            fetchingRef.current.clear();
            return;
        }

        const fetchAll = async () => {
            const currentPlats = { ...verifiedPlats };
            let hasNew = false;
            
            const promises = pathResult.path.map(async (curr, idx) => {
                if (idx === 0) return;
                const prev = pathResult.path[idx - 1];
                
                const getLine = (sName: string) => {
                    const cleanName = sName.replace(/\(.*\)/, '').replace(/역$/, '').trim();
                    const station = stations.find(s => s.name.replace(/\(.*\)/, '').replace(/역$/, '').trim() === cleanName);
                    return station?.lines || [];
                };
                
                const prevLines: string[] = getLine(prev);
                const currLines: string[] = getLine(curr);
                const common = prevLines.filter((l: string) => currLines.includes(l));
                
                if (common.length > 0) {
                    const next = pathResult.path[idx + 1];
                    if (next) {
                        const nextLines: string[] = getLine(next);
                        // Find the line we are transferring TO
                        const outLines = currLines.filter((l: string) => nextLines.includes(l));
                        
                        if (outLines.length > 0 && common[0] !== outLines[0]) {
                            const key = `${curr}-${common[0]}-${outLines[0]}`;
                            
                            // If not déjà vu, fetch it
                            if (!currentPlats[key] && !fetchingRef.current.has(key)) {
                                fetchingRef.current.add(key);
                                try {
                                    const plat = await fetchTransferPlatform(curr, common[0], outLines[0]);
                                    // Only update if we actually got a result, otherwise keep as "verifying" state implicitly
                                    // or set a more descriptive placeholder if it really is missing
                                    if (plat) {
                                        currentPlats[key] = plat;
                                        hasNew = true;
                                    } else {
                                        currentPlats[key] = "확인중.."; // Keep showing confirm state instead of "No Info"
                                        hasNew = true;
                                    }
                                } catch (e) {
                                    currentPlats[key] = "확인중..";
                                    hasNew = true;
                                }
                            }
                        }
                    }
                }
            });

            await Promise.all(promises);
            if (hasNew) {
                setVerifiedPlats({ ...currentPlats });
            }
        };

        fetchAll();
    }, [pathResult, stations]);

    return verifiedPlats;
};
