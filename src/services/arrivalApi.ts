export interface StationArrival {
    lineName: string;
    subwayId: string;
    updnLine: string; // 0: 상행/내선, 1: 하행/외선
    trainLineNm: string; // "방화행 - 마장방면"
    statnNm: string;
    arrivalMsg2: string; // "전역 도착", "3분 후 도착"
    arrivalMsg3: string; // "마장"
    arvlCd: string; // 0:진입, 1:도착, 2:출발, 3:전역출발, 4:전역진입, 5:전역도착, 99:운행중
    barvlDt: string; // 남은시간(초)
}

export const fetchStationArrivals = async (stationName: string): Promise<StationArrival[]> => {
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    const cleanName = stationName.replace(/역$/, '');
    
    // Seoul Open API drops HTTPS connections, so we must use HTTP. 
    // If the site is deployed on HTTPS (e.g., GitHub Pages), we must wrap it in a proxy to prevent Mixed Content blocking.
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const baseUrl = `http://swopenapi.seoul.go.kr/api/subway`;
    
    const fetchWithFallbacks = async (targetUrl: string) => {
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

    // Attempt with user key first
    const primaryUrl = `${baseUrl}/${apiKey}/json/realtimeStationArrival/1/30/${encodeURIComponent(cleanName)}`;
    
    try {
        let json = await fetchWithFallbacks(primaryUrl);
        
        // Fallback to sample key if user key lacks real-time permissions
        if (json?.status === 500 && json?.code === "ERROR-338") {
            const fallbackUrl = `${baseUrl}/sample/json/realtimeStationArrival/1/5/${encodeURIComponent(cleanName)}`;
            json = await fetchWithFallbacks(fallbackUrl);
        }

        const arrivals: StationArrival[] = json?.realtimeStationArrivalList || json?.realtimeStationArrival?.row || [];
        
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
