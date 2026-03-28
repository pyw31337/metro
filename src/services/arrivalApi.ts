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
    const apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) return [];

    // Normalize: remove "역" suffix if present
    const cleanName = stationName.replace(/역$/, '');
    const url = `https://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival/0/30/${encodeURIComponent(cleanName)}`;

    try {
        const res = await fetch(url);
        const json = await res.json();
        const arrivals: StationArrival[] = json?.realtimeStationArrival?.row || [];
        return arrivals;
    } catch (err) {
        console.error("Failed to fetch station arrivals:", err);
        return [];
    }
};
