import { TimetableEntry } from '@/types/metro';

/**
 * STATIC_TIMETABLE_REGISTRY
 * 
 * Provides a guaranteed baseline schedule for high-traffic stations
 * when APIs or local IndexedDB lack data. 
 * This ensures "No Information" (정보 없음) is never shown for these stations.
 */
export const STATIC_TIMETABLE_REGISTRY: Record<string, TimetableEntry[]> = {
    "독립문": [
        ...generatePattern("독립문", "3호선", "up", "대화", "05:35", "23:58", 7),
        ...generatePattern("독립문", "3호선", "down", "오금", "05:42", "24:05", 7),
    ],
    "강남": [
        ...generatePattern("강남", "2호선", "inner", "내선순환", "05:30", "24:10", 3),
        ...generatePattern("강남", "2호선", "outer", "외선순환", "05:35", "24:15", 3),
        ...generatePattern("강남", "신분당선", "up", "광교", "05:30", "24:00", 5),
    ],
    "서울역": [
        ...generatePattern("서울역", "1호선", "up", "소요산", "05:10", "23:50", 5),
        ...generatePattern("서울역", "1호선", "down", "인천/서동탄", "05:15", "24:05", 5),
        ...generatePattern("서울역", "4호선", "up", "진접", "05:30", "23:55", 6),
        ...generatePattern("서울역", "4호선", "down", "오이도", "05:40", "24:10", 6),
        ...generatePattern("서울역", "공항철도", "down", "인천공항2터미널", "05:20", "23:40", 12),
        ...generatePattern("서울역", "GTX-A", "up", "운정중앙", "05:30", "24:00", 15),
        ...generatePattern("서울역", "GTX-A", "down", "동탄", "05:30", "24:00", 15),
    ],
    "서울": [
        ...generatePattern("서울역", "1호선", "up", "소요산", "05:10", "23:50", 5),
        ...generatePattern("서울역", "1호선", "down", "인천/서동탄", "05:15", "24:05", 5),
        ...generatePattern("서울역", "4호선", "up", "진접", "05:30", "23:55", 6),
        ...generatePattern("서울역", "4호선", "down", "오이도", "05:40", "24:10", 6),
        ...generatePattern("서울역", "공항철도", "down", "인천공항2터미널", "05:20", "23:40", 12),
        ...generatePattern("서울역", "GTX-A", "up", "운정중앙", "05:30", "24:00", 15),
        ...generatePattern("서울역", "GTX-A", "down", "동탄", "05:30", "24:00", 15),
    ],
    "홍대입구": [
        ...generatePattern("홍대입구", "2호선", "inner", "내선순환", "05:30", "24:10", 4),
        ...generatePattern("홍대입구", "2호선", "outer", "외선순환", "05:35", "24:15", 4),
    ],
    "잠실": [
        ...generatePattern("잠실", "2호선", "inner", "내선순환", "05:30", "24:10", 3),
        ...generatePattern("잠실", "2호선", "outer", "외선순환", "05:35", "24:15", 3),
        ...generatePattern("잠실", "8호선", "up", "암사", "05:40", "24:10", 6),
        ...generatePattern("잠실", "8호선", "down", "모란", "05:45", "24:15", 6),
    ],
    "신도림": [
        ...generatePattern("신도림", "1호선", "up", "소요산", "05:00", "24:00", 4),
        ...generatePattern("신도림", "1호선", "down", "인천/서동탄", "05:05", "24:10", 4),
        ...generatePattern("신도림", "2호선", "inner", "내선순환", "05:30", "24:15", 3),
    ],
    "남부터미널": [
        ...generatePattern("남부터미널", "3호선", "up", "대화", "05:42", "23:55", 7),
        ...generatePattern("남부터미널", "3호선", "down", "오금", "05:45", "24:10", 7),
    ],
    "보라매": [
        // Line 7
        ...generatePattern("보라매", "7호선", "up", "장암", "05:38", "23:50", 8),
        ...generatePattern("보라매", "7호선", "down", "석남", "05:45", "24:05", 8),
        // Sillim Line
        ...generatePattern("보라매", "신림선", "up", "샛강", "05:30", "23:55", 5),
        ...generatePattern("보라매", "신림선", "down", "관악산", "05:40", "24:08", 5),
    ]
};

/**
 * Helper to generate a realistic pattern of train times
 */
function generatePattern(
    station: string, 
    line: string, 
    direction: 'up' | 'down' | 'inner' | 'outer', 
    destination: string, 
    startTime: string, 
    endTime: string, 
    interval: number
): TimetableEntry[] {
    const entries: TimetableEntry[] = [];
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    let currentH = startH;
    let currentM = startM;
    
    while (currentH < endH || (currentH === endH && currentM <= endM)) {
        const isPeak = (currentH >= 7 && currentH <= 9) || (currentH >= 17 && currentH <= 19);
        const actualInterval = isPeak ? Math.max(3, interval - 2) : interval;
        
        entries.push({
            stationName: station,
            line: line,
            dayType: 'week',
            direction: direction,
            arrivalTime: `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}:00`,
            departureTime: `${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}:00`,
            trainNo: `${line.substring(0,1)}${direction === 'up' ? '1' : '2'}${String(entries.length).padStart(3, '0')}`,
            destination: destination,
            destStation: destination
        });
        
        currentM += actualInterval;
        if (currentM >= 60) {
            currentH += Math.floor(currentM / 60);
            currentM %= 60;
        }
    }
    
    const weekendEntries = entries.map(e => ({ ...e, dayType: 'sat' as const }));
    const sundayEntries = entries.map(e => ({ ...e, dayType: 'sun' as const }));
    
    return [...entries, ...weekendEntries, ...sundayEntries];
}

import { StationArrival } from '@/types/metro';

export const getEstimatedArrivalsFromStatic = (stationName: string, activeLine?: string | null): StationArrival[] => {
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    const currentTimeInSeconds = currentH * 3600 + currentM * 60 + now.getSeconds();
    
    const dayType = now.getDay() === 0 ? "sun" : (now.getDay() === 6 ? "sat" : "week");
    
    const allEntries = STATIC_TIMETABLE_REGISTRY[stationName] || [];
    const filteredByDay = allEntries.filter(e => e.dayType === dayType);
    
    // Sort and find upcoming
    const mapped: StationArrival[] = filteredByDay
        .map(e => {
            const [h, m, s] = e.arrivalTime.split(':').map(Number);
            const entryTimeInSeconds = h * 3600 + m * 60 + (s || 0);
            const waitTime = entryTimeInSeconds - currentTimeInSeconds;
            
            return {
                lineName: e.line,
                subwayId: "", // Optional in types
                updnLine: e.direction === 'up' ? '상행' : '하행',
                trainLineNm: `${e.destination}행`,
                statnNm: e.stationName,
                arvlMsg2: waitTime < 60 ? "곧 도착" : `${Math.floor(waitTime / 60)}분 후`,
                arvlMsg3: e.destination,
                arvlCd: "99",
                bstatnNm: e.destination,
                barvlDt: waitTime.toString(),
                btrainNo: e.trainNo,
                isScheduled: true
            };
        })
        .filter(a => parseInt(a.barvlDt) > 0)
        .sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt));

    return mapped.slice(0, 8); // Top upcoming
};

export const getStaticTimetable = (stationName: string, line: string, dayType: string): TimetableEntry[] => {
    const data = STATIC_TIMETABLE_REGISTRY[stationName] || [];
    return data.filter(e => e.line === line && e.dayType === dayType);
};
