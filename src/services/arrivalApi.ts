import { StationArrival, TimetableEntry } from '@/types/metro';
import { db } from './db';
import { DataIngestionService } from './dataIngestion';
import { getStaticTimetable } from '@/data/static-timetables';
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
            const res = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
            return await res.json();
        } catch (e) {}
    }

    const proxies = [
        `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`
    ];

    try {
        const res = await Promise.any(
            proxies.map(async (proxy) => {
                const response = await fetch(proxy, { signal: AbortSignal.timeout(4000) });
                if (!response.ok) throw new Error("Proxy response not ok");
                const json = await response.json();
                if (json?.RESULT?.CODE?.includes("ERROR-500")) {
                     throw new Error("Target API 500 Error");
                }
                return json;
            })
        );
        return res;
    } catch (err) {
        throw new Error("All proxies failed");
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

    const cleanName = stationName.replace(/역+$/, '');
    const variants = [stationName, cleanName];
    if (cleanName === "서울") variants.unshift("서울역");
    if (cleanName === "남부터미널") variants.push("남부터미널(예술의전당)");
    if (cleanName === "교대") variants.push("교대(법원.검찰청)");

    const uniqueVariants = Array.from(new Set(variants));
    
    try {
        let allArrivals: StationArrival[] = [];
        for (const v of uniqueVariants) {
            const data = await fetchUniqueArrivals(v);
            if (data.length > 0) {
                allArrivals = data;
                break;
            }
        }

        if (allArrivals.length === 0) {
            const now = new Date();
            const dayTypeStr = now.getDay() === 0 ? 'sun' : now.getDay() === 6 ? 'sat' : 'week';
            const station = await db.getStationByName(stationName);

            if (station && station.lineNum) {
                let stored: TimetableEntry[] = [];
                if (station.stationCd) {
                    stored = await db.getStoredTimetable(stationName, station.lineNum, dayTypeStr);
                }
                
                if (stored.length === 0) {
                    stored = getStaticTimetable(stationName, station.lineNum, dayTypeStr);
                }

                if (stored.length > 0) {
                    const hourStr = now.getHours().toString().padStart(2, '0');
                    const minStr = now.getMinutes().toString().padStart(2, '0');
                    const currentTime = `${hourStr}:${minStr}:00`;

                    const upcoming = stored
                        .filter(e => e.departureTime > currentTime)
                        .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
                        .slice(0, 4);

                    upcoming.forEach(e => {
                        const [h, m] = e.departureTime.split(':').map(Number);
                        const waitMin = (h * 60 + m) - (now.getHours() * 60 + now.getMinutes());
                        const lineNumOnly = station.lineNum?.replace(/[^0-9]/g, '') || "0";
                        const lineName = station.lines[0] || (lineNumOnly !== "0" ? `${lineNumOnly}호선` : "지하철");

                        allArrivals.push({
                            lineName: lineName,
                            subwayId: LINE_ID_MAP[lineNumOnly] || "9999",
                            updnLine: e.direction === 'up' ? '상행' : '하행',
                            trainLineNm: `${e.destStation || e.destination}행`,
                            statnNm: stationName,
                            arvlMsg2: `${waitMin}분 후 (${e.departureTime.substring(0,5)})`,
                            arvlMsg3: stationName,
                            arvlCd: "99",
                            isScheduled: true,
                            barvlDt: (waitMin * 60).toString(),
                            btrainNo: "SCH-" + e.trainNo
                        });
                    });
                } else if (station.stationCd) {
                    DataIngestionService.ingestTimetables(stationName, station.lineNum, station.stationCd);
                }
            }

            if (allArrivals.length === 0 && station) {
                const hour = now.getHours();
                const minutes = now.getMinutes();
                if ((hour > 5 || (hour === 5 && minutes >= 30)) && (hour < 24 || (hour === 0 && minutes <= 30))) {
                    const lineNumOnly = (station?.lineNum || "").replace(/[^0-9]/g, '');
                    const lineName = station?.lines[0] || (lineNumOnly ? `${lineNumOnly}호선` : "지하철");
                    const subwayId = LINE_ID_MAP[lineNumOnly] || "9999";

                    ["상행", "하행"].forEach(dir => {
                        [1, 2].forEach(i => {
                            const isPeak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20);
                            const waitMin = i * (isPeak ? 4 : 8); 
                            allArrivals.push({
                                lineName: lineName,
                                subwayId: subwayId,
                                updnLine: dir,
                                trainLineNm: `${dir} 전동차`,
                                statnNm: stationName,
                                arvlMsg2: `${Math.max(1, waitMin)}분 후 (예정)`,
                                arvlMsg3: stationName,
                                arvlCd: "99",
                                isScheduled: true,
                                barvlDt: (waitMin * 60).toString(),
                                btrainNo: "9999"
                            });
                        });
                    });
                }
            }
        }

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
        return [];
    }
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

    const url = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeTrainCongestion/0/5/${subwayId}/${trainNo}`;
    
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
        const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/CardSubwayTransferPos/1/50/${encodeURIComponent(queryName)}`;
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
