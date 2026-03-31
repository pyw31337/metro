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

        pathResult.path.forEach((curr, idx) => {
            if (idx === 0) return;
            const prev = pathResult.path[idx - 1];
            
            const getLine = (sName: string) => 
                stations.find(s => s.name.replace(/역$/, '') === sName.replace(/역$/, ''))?.lines || [];
            
            const prevLines: string[] = getLine(prev);
            const currLines: string[] = getLine(curr);
            const common = prevLines.filter((l: string) => currLines.includes(l));
            
            if (common.length > 0) {
                const next = pathResult.path[idx + 1];
                if (next) {
                    const nextLines: string[] = getLine(next);
                    const outLines = currLines.filter((l: string) => nextLines.includes(l));
                    
                    if (outLines.length > 0 && common[0] !== outLines[0]) {
                        const key = `${curr}-${common[0]}-${outLines[0]}`;
                        if (!verifiedPlats[key] && !fetchingRef.current.has(key)) {
                            fetchingRef.current.add(key);
                            fetchTransferPlatform(curr, common[0], outLines[0]).then(plat => {
                                setVerifiedPlats(prevPlat => ({ ...prevPlat, [key]: plat }));
                            });
                        }
                    }
                }
            }
        });
    }, [pathResult, stations]);

    return verifiedPlats;
};
