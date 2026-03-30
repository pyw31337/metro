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

export const fetchWithFallbacks = async (targetUrl: string) => {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (!isHttps) {
        const res = await fetch(targetUrl);
        return await res.json();
    }

    // Multiple free CORS proxies to ensure high availability on static sites
    const proxies = [
        `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`
    ];

    let lastError = null;
    for (const proxy of proxies) {
        try {
            const res = await fetch(proxy);
            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error("All proxies failed");
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
        
        // Deduplicate and group
        const upMap = new Map<string, StationArrival>();
        const downMap = new Map<string, StationArrival>();
        
        rawList.forEach(item => {
            // Use btrainNo as primary key, fallback to composite key if missing
            const trainId = (item.btrainNo && item.btrainNo !== "0000") 
                ? item.btrainNo 
                : `${item.trainLineNm}-${item.arvlMsg2}-${item.updnLine}`;
            
            const arrival: StationArrival = {
                lineName: item.subwayNm || "",
                subwayId: item.subwayId || "",
                updnLine: item.updnLine || "",
                trainLineNm: item.trainLineNm || "",
                statnNm: item.statnNm || "",
                arvlMsg2: item.arvlMsg2 || "",
                arvlMsg3: item.arvlMsg3 || "",
                arvlCd: item.arvlCd || "",
                barvlDt: item.barvlDt || "0",
                btrainNo: item.btrainNo || ""
            };

            if (arrival.updnLine.includes("상행") || arrival.updnLine.includes("내선")) {
                if (!upMap.has(trainId)) upMap.set(trainId, arrival);
            } else {
                if (!downMap.has(trainId)) downMap.set(trainId, arrival);
            }
        });

        // Convert to arrays and sort by seconds remaining
        const getSortedTop3 = (map: Map<string, StationArrival>) => {
            return Array.from(map.values())
                .sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt))
                .slice(0, 3);
        };

        const finalArrivals = [...getSortedTop3(upMap), ...getSortedTop3(downMap)];
        return finalArrivals;
    } catch (err) {
        console.error("Failed to fetch station arrivals:", err);
        return [];
    }
};

export const fetchTrainCongestion = async (subwayNm: string, trainNo: string) => {
    const lineMap: { [key: string]: string } = {
        "1호선": "1001", "2호선": "1002", "3호선": "1003", "4호선": "1004", "5호선": "1005",
        "6호선": "1006", "7호선": "1007", "8호선": "1008", "9호선": "1009",
        "경의중앙선": "1063", "경춘선": "1067", "수인분당선": "1075", "신분당선": "1077"
    };
    
    const subwayId = lineMap[subwayNm];
    if (!subwayId) return null;

    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    const url = `http://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeTrainCongestion/0/5/${subwayId}/${trainNo}`;
    
    try {
        const json = await fetchWithFallbacks(url);
        if (json?.status === 200) {
            return json?.realtimeTrainCongestionList?.[0] || null;
        }
        return null;
    } catch (err) {
        console.warn("Congestion fetching skipped or failed:", err);
        return null;
    }
};

export const fetchTransferPlatform = async (stationName: string, fromLine: string, toLine: string) => {
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    const cleanStation = stationName.replace(/역$/, '');
    const cleanFromLine = fromLine.replace(/선$/, '');
    const cleanToLine = toLine.replace(/선$/, '');

    // CardSubwayTransferPos: [인증키]/json/CardSubwayTransferPos/1/50/[역명]
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/CardSubwayTransferPos/1/50/${encodeURIComponent(cleanStation)}`;
    
    try {
        const json = await fetchWithFallbacks(url);
        const list = json?.CardSubwayTransferPos?.row || [];
        
        // Find the matching transfer route
        // Matches like "1" (fromLine) to "2" (toLine)
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
