import { StationArrival, TimetableEntry } from '@/types/metro';
import { db } from './db';
import { DataIngestionService } from './dataIngestion';
import { getStaticTimetable, getEstimatedArrivalsFromStatic } from '@/data/static-timetables';
import transferData from '../data/transfer-info.json';
import { API_ENDPOINTS } from '@/utils/api-client';
import { normalizeLineName } from '@/utils/stationUtils';

const LINE_ID_MAP: { [key: string]: string } = {
    "1": "1001", "2": "1002", "3": "1003", "4": "1004", "5": "1005",
    "6": "1006", "7": "1007", "8": "1008", "9": "1009",
    "1호선": "1001", "2호선": "1002", "3호선": "1003", "4호선": "1004", "5호선": "1005",
    "6호선": "1006", "7호선": "1007", "8호선": "1008", "9호선": "1009",
    "경의중앙": "1063", "경춘": "1067", "수인분당": "1075", "신분당": "1077", "공항철도": "1065", "GTX-A": "1032"
};

export interface TrainPosition {
    subwayId: string;
    subwayNm: string;
    statnId: string;
    statnNm: string;
    trainNo: string;
    lastRecptnDt: string;
    updnLine: string;
    directAt: string;
    trainSttus: string; 
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
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getTime();
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
            const res = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
            if (res.ok) return await res.json();
        } catch (e) {
            // Silently try proxies
        }
    }

    const proxies = [
        `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`
    ];

    for (const proxy of proxies) {
        try {
            const res = await fetch(proxy, { signal: AbortSignal.timeout(6000) });
            if (res.ok) {
                const json = await res.json();
                if (!json?.RESULT?.CODE?.includes("ERROR-500")) return json;
            }
        } catch (e) {
            // Silently try next proxy
        }
    }
    throw new Error(`All fetch attempts failed for ${targetUrl}`);
};

export const fetchStationArrivals = async (stationName: string): Promise<StationArrival[]> => {
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    const fetchUniqueArrivals = async (name: string): Promise<StationArrival[]> => {
        const baseUrl = `https://swopenapi.seoul.go.kr/api/subway`;
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
                    bstatnNm: item.bstatnNm || "",
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

    const cleanName = stationName.replace(/역+$/, '');
    const variants = [stationName, cleanName];
    if (cleanName === "서울") variants.unshift("서울역");
    if (cleanName === "남부터미널") variants.push("남부터미널(예술의전당)");
    if (cleanName === "교대") variants.push("교대(법원.검찰청)");
    if (cleanName === "독립문") variants.push("독립문역"); // Just in case
    if (cleanName === "쌍용") variants.push("쌍용(나사렛대)");
    if (cleanName === "신촌" && !stationName.includes("경의중앙선")) variants.push("신촌(지하)");

    const uniqueVariants = Array.from(new Set(variants));
    
    try {
        let allArrivals: StationArrival[] = [];
        const variantResults = await Promise.all(uniqueVariants.map(v => fetchUniqueArrivals(v).catch(() => [])));
        const seenTrains = new Set<string>();
        variantResults.forEach(data => {
            data.forEach(arrival => {
                const key = `${arrival.subwayId}-${arrival.updnLine}-${arrival.btrainNo || arrival.trainLineNm}`;
                if (!seenTrains.has(key)) {
                    allArrivals.push(arrival);
                    seenTrains.add(key);
                }
            });
        });

        // If API fails or returns nothing, check static fallback immediately
        if (allArrivals.length === 0) {
            allArrivals = getEstimatedArrivalsFromStatic(cleanName);
        }

        const upArrivals: StationArrival[] = [];
        const downArrivals: StationArrival[] = [];

        allArrivals.forEach(arrival => {
            const isUp = arrival.updnLine.includes("상행") || arrival.updnLine.includes("내선") || arrival.updnLine.includes("상선");
            if (isUp) upArrivals.push(arrival);
            else downArrivals.push(arrival);
        });

        const sortAndLimit = (list: StationArrival[]) => {
            return list
                .sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt))
                .slice(0, 3);
        };

        return [...sortAndLimit(upArrivals), ...sortAndLimit(downArrivals)];
    } catch (err) {
        return getEstimatedArrivalsFromStatic(cleanName);
    }
};

/**
 * Converts a DB TimetableEntry into a StationArrival object for UI consistency
 */
export const convertTimetableToArrival = (entry: TimetableEntry, waitTimeSeconds: number): StationArrival => {
    return {
        lineName: entry.line,
        subwayId: "", 
        updnLine: (entry.direction === 'up' || entry.direction === 'inner') ? '상행' : '하행',
        trainLineNm: `${entry.destination}행`,
        statnNm: entry.stationName,
        arvlMsg2: waitTimeSeconds < 60 ? "곧 도착" : `${Math.floor(waitTimeSeconds / 60)}분 후`,
        arvlMsg3: "",
        arvlCd: "99",
        bstatnNm: entry.destination,
        barvlDt: waitTimeSeconds.toString(),
        btrainNo: entry.trainNo,
        isScheduled: true
    };
};

/**
 * Merges live API data with scheduled DB data to ensure no "정보 없음" states.
 */
export const mergeLiveAndScheduled = (live: StationArrival[], scheduled: StationArrival[]): StationArrival[] => {
    const upLive = live.filter(l => l.updnLine.includes('상행') || l.updnLine.includes('내선'));
    const downLive = live.filter(l => !l.updnLine.includes('상행') && !l.updnLine.includes('내선'));

    const upSched = scheduled.filter(s => s.updnLine.includes('상행') || s.updnLine.includes('내선'));
    const downSched = scheduled.filter(s => !s.updnLine.includes('상행') && !s.updnLine.includes('내선'));

    const mergeSide = (lSide: StationArrival[], sSide: StationArrival[]) => {
        const side = [...lSide];
        
        // Ensure we have exactly 3 (or as many as possible)
        sSide.forEach(s => {
            if (side.length < 3) {
                // Check if this scheduled train is significantly later than the last live train
                const lastLiveDt = side.length > 0 ? parseInt(side[side.length - 1].barvlDt) : -1;
                // Reduce gap to 30s so we don't accidentally skip valid upcoming trains
                if (parseInt(s.barvlDt) > lastLiveDt + 30) { 
                    side.push(s);
                }
            }
        });
        
        // Final trim and sort
        return side.sort((a,b) => parseInt(a.barvlDt) - parseInt(b.barvlDt)).slice(0, 3);
    };

    return [...mergeSide(upLive, upSched), ...mergeSide(downLive, downSched)];
};

export const fetchTrainCongestion = async (subwayNm: string, trainNo: string) => {
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

    const url = `https://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeTrainCongestion/0/5/${subwayId}/${trainNo}`;
    
    try {
        const json = await fetchWithFallbacks(url);
        const isSuccess = json?.status === 200 || json?.errorMessage?.status === 200 || json?.RESULT?.CODE === "INFO-000";
        if (isSuccess) {
            return json?.realtimeTrainCongestionList?.[0] || null;
        }
        return null;
    } catch (err) {
        return null;
    }
};

export const fetchTransferPlatform = async (stationName: string, fromLine: string, toLine: string) => {
    if (!stationName) return null;
    const cleanStation = stationName.replace(/\(.*\)/, '').replace(/역$/, '').trim();
    const cleanFromLine = normalizeLineName(fromLine);
    const cleanToLine = normalizeLineName(toLine);

    try {
        const stored = await db.getTransferInfo(cleanStation, cleanFromLine, cleanToLine);
        if (stored) return stored.platform;
        if (stationName !== cleanStation) {
            const storedOrig = await db.getTransferInfo(stationName.replace(/역$/, ''), cleanFromLine, cleanToLine);
            if (storedOrig) return storedOrig.platform;
        }
    } catch (e) {}

    const staticStation = (transferData as any[]).find(s => 
        s.stationName === cleanStation || s.stationName === stationName.replace(/역$/, '')
    );
    if (staticStation) {
        const staticMatch = staticStation.transfers.find((t: any) => 
            normalizeLineName(t.from) === cleanFromLine && normalizeLineName(t.to) === cleanToLine
        );
        if (staticMatch) return staticMatch.platform;
    }

    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";
    
    const tryFetch = async (queryName: string) => {
        const url = `https://openapi.seoul.go.kr:443/${apiKey}/json/CardSubwayTransferPos/1/50/${encodeURIComponent(queryName)}`;
        try {
            const json = await fetchWithFallbacks(url);
            const list = json?.CardSubwayTransferPos?.row || [];
            const match = list.find((item: any) => {
                const apiFrom = normalizeLineName(item.LINE_NUM);
                const apiTo = normalizeLineName(item.TRNSIT_LINE_NM);
                return (apiFrom === cleanFromLine && apiTo === cleanToLine);
            });
            if (match) {
                const platform = match.TRNSIT_POS || match.PLATFORM_INFO || match.TRNSIT_PLATFORM_NO;
                if (platform) {
                    db.saveTransferInfo({
                        stationName: cleanStation,
                        fromLine: cleanFromLine,
                        toLine: cleanToLine,
                        platform: String(platform)
                    }).catch(() => {});
                    return String(platform);
                }
            }
        } catch (e) {
            return null;
        }
        return null;
    };

    let result = await tryFetch(cleanStation);
    if (result) return result;
    if (stationName !== cleanStation) {
        result = await tryFetch(stationName.replace(/역$/, ''));
        if (result) return result;
    }
    return null;
};

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
        return [];
    }
};

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
        return [];
    }
};
