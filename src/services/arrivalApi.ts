export interface StationArrival {
    lineName: string;
    subwayId: string;
    updnLine: string; // "상행" or "외선"
    trainLineNm: string; // "방화행 - 마장방면"
    statnNm: string;
    arvlMsg2: string;
    arvlMsg3: string;
    arvlCd: string;
    barvlDt: string;
    btrainNo: string;
    isScheduled?: boolean; // NEW: indicate if it's from fallback
}

import transferData from '../data/transfer-info.json';
import { API_ENDPOINTS } from '@/utils/api-client';

export interface TrainPosition {
    subwayId: string;
    subwayNm: string;
    statnId: string;
    statnNm: string;
    trainNo: string;
    lastRecptnDt: string;
    updnLine: string;
    directAt: string;
    trainSttus: string; // 0: Entering, 1: Stopped, 2: Departed ...
    lstnyNm: string;
    arrivalNm: string;
    arvlCd: string;
}

export interface SubwayAlert {
    title: string;
    content: string;
    date: string;
}

export const parseSeoulDate = (dateStr: string): number => {
    if (!dateStr) return Date.now();
    // Try standard YYYY-MM-DD HH:mm:ss
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getTime();
    
    // Fallback for YYYYMMDDHHmmss
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
        return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`).getTime();
    }
    return Date.now();
};

export const fetchWithFallbacks = async (targetUrl: string) => {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (!isHttps) {
        try {
            const res = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
            return await res.json();
        } catch (e) {
            // handle abort
        }
    }

    // Multiple free CORS proxies to ensure high availability on static sites
    const proxies = [
        `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`
    ];

    try {
        // Run all proxy requests in parallel and return the first successful JSON response
        const res = await Promise.any(
            proxies.map(async (proxy) => {
                const response = await fetch(proxy, { signal: AbortSignal.timeout(4000) });
                if (!response.ok) throw new Error("Proxy response not ok");
                const json = await response.json();
                
                // If it's a wrapped openapi 500 ERROR, throw to try next or fail fast
                if (json?.RESULT?.CODE?.includes("ERROR-500")) {
                     throw new Error("Target API 500 Error");
                }
                return json;
            })
        );
        return res;
    } catch (err) {
        console.warn("All fetch proxies failed or timed out for", targetUrl);
        throw new Error("All proxies failed or API returned 500");
    }
};

export const fetchStationArrivals = async (stationName: string): Promise<StationArrival[]> => {
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    const fetchUniqueArrivals = async (name: string): Promise<StationArrival[]> => {
        const baseUrl = `http://swopenapi.seoul.go.kr/api/subway`;
        const primaryUrl = `${baseUrl}/${apiKey}/json/realtimeStationArrival/1/50/${encodeURIComponent(name)}`;
        
        try {
            let json = await fetchWithFallbacks(primaryUrl);
            if (json?.status === 500 && json?.code === "ERROR-338") {
                const fallbackUrl = `${baseUrl}/sample/json/realtimeStationArrival/1/10/${encodeURIComponent(name)}`;
                json = await fetchWithFallbacks(fallbackUrl);
            }

            const rawList: any[] = json?.realtimeArrivalList || [];
            const trainMap = new Map<string, StationArrival>();
            
            rawList.forEach(item => {
                const isReliableNo = item.btrainNo && item.btrainNo !== "0000";
                const trainId = isReliableNo 
                    ? `${item.subwayId}-${item.btrainNo}` 
                    : `${item.subwayId}-${item.updnLine}-${item.trainLineNm}-${item.arvlMsg2}`;
                
                const arrival: StationArrival = {
                    lineName: item.subwayNm || "",
                    subwayId: item.subwayId || "",
                    updnLine: item.updnLine || "",
                    trainLineNm: item.trainLineNm || "",
                    statnNm: item.statnNm || "",
                    arvlMsg2: item.arvlMsg2 || "",
                    arvlMsg3: item.arvlMsg3 || "",
                    arvlCd: item.arvlCd || "",
                    barvlDt: item.barvlDt || "9999",
                    btrainNo: item.btrainNo || ""
                };

                const existing = trainMap.get(trainId);
                if (!existing || parseInt(arrival.barvlDt) < parseInt(existing.barvlDt)) {
                    trainMap.set(trainId, arrival);
                }
            });
            return Array.from(trainMap.values());
        } catch (e) {
            return [];
        }
    };

    // Naming logic: Seoul Open API is flaky about "서울" vs "서울역".
    // 1. Try exact name (e.g., "서울역")
    // 2. Try variant (e.g., "서울")
    const cleanName = stationName.replace(/역+$/, '');
    const variants = [stationName, cleanName];
    if (cleanName === "서울") variants.unshift("서울역");

    // Remove duplicates
    const uniqueVariants = Array.from(new Set(variants));
    
    try {
        let allArrivals: StationArrival[] = [];
        for (const v of uniqueVariants) {
            const data = await fetchUniqueArrivals(v);
            if (data.length > 0) {
                allArrivals = data;
                break; // Found data, stop retrying
            }
        }

        // ─── Timetable Fallback Logic ───────────────────────────────────────────
        if (allArrivals.length === 0) {
            const now = new Date();
            const hour = now.getHours();
            const minutes = now.getMinutes();
            
            // Heuristic: Subway usually runs from 05:30 to 24:30
            if ((hour > 5 || (hour === 5 && minutes >= 30)) && (hour < 24 || (hour === 0 && minutes <= 30))) {
                // Generate 2 mock trains for each direction
                const mockLineName = stationName.includes("호선") ? stationName : "지하철";
                const directions = ["상행", "하행"];
                
                directions.forEach(dir => {
                    [1, 2].forEach(i => {
                        const isPeak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20);
                        const waitMin = i * (isPeak ? 4 : 8); 
                        allArrivals.push({
                            lineName: mockLineName,
                            subwayId: "9999", // Mock ID
                            updnLine: dir,
                            trainLineNm: `${dir} 전동차`,
                            statnNm: stationName,
                            arvlMsg2: `${waitMin}분 후 도착 예정`,
                            arvlMsg3: stationName,
                            arvlCd: "99",
                            barvlDt: (waitMin * 60).toString(),
                            btrainNo: "SCH-" + i,
                            isScheduled: true
                        });
                    });
                });
            }
        }

        // Group by direction and sort
        const upArrivals: StationArrival[] = [];
        const downArrivals: StationArrival[] = [];

        allArrivals.forEach(arrival => {
            if (arrival.updnLine.includes("상행") || arrival.updnLine.includes("내선") || arrival.updnLine.includes("상선")) {
                upArrivals.push(arrival);
            } else {
                downArrivals.push(arrival);
            }
        });

        const sortAndLimit = (list: StationArrival[]) => {
            return list
                .sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt))
                .slice(0, 3);
        };

        return [...sortAndLimit(upArrivals), ...sortAndLimit(downArrivals)];
    } catch (err) {
        console.error("Failed to fetch station arrivals:", err);
        return [];
    }
};

export const fetchTrainCongestion = async (subwayNm: string, trainNo: string) => {
    // Normalize input line name (e.g., '3' -> '3호선', '신분당' -> '신분당선')
    let normalizedNm = subwayNm.trim();
    if (!normalizedNm.endsWith('호선') && !normalizedNm.endsWith('선')) {
        if (!isNaN(Number(normalizedNm))) {
            normalizedNm = normalizedNm + '호선';
        } else {
            normalizedNm = normalizedNm + '선';
        }
    }

    const lineMap: { [key: string]: string } = {
        "1호선": "1001", "2호선": "1002", "3호선": "1003", "4호선": "1004", "5호선": "1005",
        "6호선": "1006", "7호선": "1007", "8호선": "1008", "9호선": "1009",
        "경의중앙선": "1063", "경춘선": "1067", "수인분당선": "1075", "신분당선": "1077"
    };
    
    const subwayId = lineMap[normalizedNm];
    if (!subwayId) return null;

    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    const url = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeTrainCongestion/0/5/${subwayId}/${trainNo}`;
    
    try {
        const json = await fetchWithFallbacks(url);
        // Handle different status reporting formats from Seoul API and proxies
        const isSuccess = json?.status === 200 || json?.errorMessage?.status === 200 || json?.RESULT?.CODE === "INFO-000";
        if (isSuccess) {
            return json?.realtimeTrainCongestionList?.[0] || null;
        }
        return null;
    } catch (err) {
        console.warn("Congestion fetching skipped or failed:", err);
        return null;
    }
};

export const fetchTransferPlatform = async (stationName: string, fromLine: string, toLine: string) => {
    const cleanStation = stationName.replace(/역$/, '');
    const cleanFromLine = fromLine.replace(/선$/, '');
    const cleanToLine = toLine.replace(/선$/, '');

    // 1. Check local DB first
    const localStation = (transferData as any[]).find(s => s.stationName === cleanStation);
    if (localStation) {
        const localMatch = localStation.transfers.find((t: any) => 
            (t.from === cleanFromLine && t.to === cleanToLine)
        );
        if (localMatch) return localMatch.platform;
    }

    // 2. Fallback to API
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    // CardSubwayTransferPos: [인증키]/json/CardSubwayTransferPos/1/50/[역명]
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/CardSubwayTransferPos/1/50/${encodeURIComponent(cleanStation)}`;
    
    try {
        const json = await fetchWithFallbacks(url);
        const list = json?.CardSubwayTransferPos?.row || [];
        
        const match = list.find((item: any) => 
            (item.LINE_NUM === cleanFromLine && item.TRNSIT_LINE_NM === cleanToLine) ||
            (item.LINE_NUM === cleanFromLine && item.TRNSIT_LINE_NM.includes(cleanToLine))
        );

        return match ? match.TRNSIT_PLATFORM_NO : null;
    } catch (err) {
        console.warn("Transfer info fetching failed:", err);
        return null;
    }
};

/**
 * Fetch real-time train positions for a specific line
 */
export const fetchTrainPositions = async (lineName: string): Promise<TrainPosition[]> => {
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    const url = API_ENDPOINTS.SUBWAY_POSITION(apiKey, lineName);
    
    try {
        const json = await fetchWithFallbacks(url);
        return (json?.realtimeSubwayPositionList || []).map((item: any) => ({
            subwayId: item.subwayId,
            subwayNm: item.subwayNm,
            statnId: item.statnId,
            statnNm: item.statnNm,
            trainNo: item.trainNo,
            lastRecptnDt: item.lastRecptnDt,
            updnLine: item.updnLine,
            directAt: item.directAt,
            trainSttus: item.trainSttus || "99",
            lstnyNm: item.lstnyNm,
            arrivalNm: item.arrivalNm,
            arvlCd: item.arvlCd
        }));
    } catch (err) {
        console.error("Failed to fetch train positions:", err);
        return [];
    }
};

/**
 * Fetch subway system alerts (delays, maintenance, etc.)
 */
export const fetchSubwayAlerts = async (): Promise<SubwayAlert[]> => {
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_OPEN_DATA_KEY || "sample";
    const url = API_ENDPOINTS.SUBWAY_ALERTS(apiKey);

    try {
        const json = await fetchWithFallbacks(url);
        return (json?.CardSubwayAlertInfo?.row || []).map((item: any) => ({
            title: item.TITLE,
            content: item.CONTENT,
            date: item.REG_DATE
        }));
    } catch (err) {
        console.warn("Failed to fetch subway alerts:", err);
        return [];
    }
};
