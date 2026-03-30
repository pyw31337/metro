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
    // ... (existing code remains) ...
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
            const fallbackUrl = `${baseUrl}/sample/json/realtimeStationArrival/1/5/${cleanName}`;
            json = await fetchWithFallbacks(fallbackUrl);
        }

        const arrivals: StationArrival[] = json?.realtimeArrivalList || [];
        
        // Filter to max 3 per direction (up/inner vs down/outer)
        const upTrains: StationArrival[] = [];
        const downTrains: StationArrival[] = [];
        
        arrivals.forEach(arr => {
            if (arr.updnLine.includes("상행") || arr.updnLine.includes("내선")) {
                if (upTrains.length < 3) upTrains.push(arr);
            } else {
                if (downTrains.length < 3) downTrains.push(arr);
            }
        });

        // Sort by barvlDt (arrival time in seconds) string-to-number
        const sorted = [...upTrains, ...downTrains].sort((a, b) => {
            return parseInt(a.barvlDt || "9999") - parseInt(b.barvlDt || "9999");
        });

        return sorted;
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
