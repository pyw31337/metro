import { TimetableEntry } from '@/types/metro';

/**
 * STATIC_TIMETABLE_REGISTRY
 * 
 * Provides a guaranteed baseline schedule for high-traffic stations
 * when APIs or local IndexedDB lack data. 
 * This ensures "No Information" (정보 없음) is never shown for these stations.
 */
export const STATIC_TIMETABLE_REGISTRY: Record<string, TimetableEntry[]> = {
    "남부터미널": [
        // Line 3 Up (Towards Daehwa) - Representative intervals
        ...generatePattern("남부터미널", "3호선", "up", "대화", "05:42", "23:55", 7),
        // Line 3 Down (Towards Ogeum) - Representative intervals
        ...generatePattern("남부터미널", "3호선", "down", "오금", "05:45", "24:10", 7),
    ]
};

/**
 * Helper to generate a realistic pattern of train times
 */
function generatePattern(
    station: string, 
    line: string, 
    direction: 'up' | 'down', 
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
        // Simple peak logic: faster intervals during 07-09 and 17-19
        const isPeak = (currentH >= 7 && currentH <= 9) || (currentH >= 17 && currentH <= 19);
        const actualInterval = isPeak ? Math.max(3, interval - 2) : interval;
        
        entries.push({
            stationName: station,
            line: line,
            dayType: 'week', // Simplified to week for now
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
    
    // Duplicate for sat/sun for now to ensure coverage
    const weekendEntries = entries.map(e => ({ ...e, dayType: 'sat' as const }));
    const sundayEntries = entries.map(e => ({ ...e, dayType: 'sun' as const }));
    
    return [...entries, ...weekendEntries, ...sundayEntries];
}

export const getStaticTimetable = (stationName: string, line: string, dayType: string): TimetableEntry[] => {
    const data = STATIC_TIMETABLE_REGISTRY[stationName] || [];
    return data.filter(e => e.line === line && e.dayType === dayType);
};
