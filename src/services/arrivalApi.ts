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
    lstnyNm: string;
    arrivalNm: string;
    arvlCd: string;
}

export interface SubwayAlert {
    title: string;
    content: string;
    date: string;
}

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

    const cleanName = stationName.replace(/역$/, '');
    const baseUrl = `http://swopenapi.seoul.go.kr/api/subway`;

    // Attempt with user key first
    const primaryUrl = `${baseUrl}/${apiKey}/json/realtimeStationArrival/1/30/${cleanName}`;
    
    try {
        let json = await fetchWithFallbacks(primaryUrl);
        
        // Fallback to sample key if user key lacks real-time permissions
        if (json?.status === 500 && json?.code === "ERROR-338") {
            const fallbackUrl = `${baseUrl}/sample/json/realtimeStationArrival/1/10/${cleanName}`;
            json = await fetchWithFallbacks(fallbackUrl);
        }

        const rawList: any[] = json?.realtimeArrivalList || [];
        
        // Map to store unique trains by their ID
        const trainMap = new Map<string, StationArrival>();
        
        rawList.forEach(item => {
            // btrainNo is the best unique identifier, but it might be "0000" for some lines
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
            // If we have an existing entry for this train, keep the one that is closer (smaller barvlDt)
            if (!existing || parseInt(arrival.barvlDt) < parseInt(existing.barvlDt)) {
                trainMap.set(trainId, arrival);
            }
        });

        // Group by direction and sort
        const upArrivals: StationArrival[] = [];
        const downArrivals: StationArrival[] = [];

        trainMap.forEach(arrival => {
            if (arrival.updnLine.includes("상행") || arrival.updnLine.includes("내선")) {
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
