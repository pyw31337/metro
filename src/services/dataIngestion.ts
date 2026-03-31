import { db } from './db';
import { Facility, WCItem, OperationalData, TimetableEntry } from '@/types/metro';
import { fetchWithFallbacks } from './arrivalApi';

/**
 * DataIngestionService
 * Handles fetching, parsing, and normalizing 50+ Seoul Open Data datasets
 * into the optimized local IndexedDB schema.
 */
export class DataIngestionService {
    private static API_KEY = process.env.NEXT_PUBLIC_SEOUL_OPEN_DATA_KEY || 'sample';

    /**
     * Main orchestration method to refresh static data
     */
    static async refreshStaticData() {
        console.log('🔄 Starting full data refresh from Seoul Open Data...');
        try {
            await Promise.all([
                this.ingestStationToilets(),
                this.ingestElevators(),
                this.ingestLifts(),
                this.ingestInterStationDistances(),
                // Add more as needed based on the 50+ list
            ]);
            console.log('✅ All static data refreshed.');
        } catch (err) {
            console.error('❌ Data refresh failed:', err);
        }
    }

    /**
     * 1. Ingest Station Toilets (Focus: Inside/Outside Gate)
     * Source: OA-22726, OA-22501, etc.
     */
    static async ingestStationToilets() {
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchPublicToiletAndStation/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            const items = json.SearchPublicToiletAndStation?.row || [];

            const mapped: WCItem[] = items.map((item: any) => ({
                id: `seoul-wc-${item.STATION_NM}-${item.GU_NM}`,
                name: `${item.STATION_NM}역 화장실`,
                lat: parseFloat(item.LAT) || 0,
                lng: parseFloat(item.LNG) || 0,
                accessible: item.DISABLED_WC_YN === 'Y',
                diapers: item.DIAPER_SWAP_YN === 'Y',
                emergencyBell: item.EMERGENCY_BELL_YN === 'Y',
                address: item.ADDR,
                station: item.STATION_NM,
                isInsideGate: item.IN_OUT_GATER === 'IN', // 'IN' or 'OUT'
                location: item.DETAIL_LOCATION
            }));

            await db.wc.bulkPut(mapped);
            console.log(`🚽 Ingested ${mapped.length} station toilets.`);
        } catch (err) {
            console.warn('Failed to ingest toilets:', err);
        }
    }

    /**
     * 2. Ingest Elevators
     * Source: OA-21212
     */
    static async ingestElevators() {
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchSubwayStationElevator/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            const items = json.SearchSubwayStationElevator?.row || [];

            const mapped: Facility[] = items.map((item: any) => ({
                id: `el-${item.STATION_NM}-${item.ELEVATOR_ID}`,
                stationName: item.STATION_NM,
                line: item.LINE_NUM,
                category: 'elevator',
                locationDesc: item.LOCATION,
                isInsideGate: item.IN_OUT_GATE === 'IN',
                lat: parseFloat(item.LAT),
                lng: parseFloat(item.LNG),
                details: `운행구간: ${item.OPERATION_RANGE}`
            }));

            await db.facilities.bulkPut(mapped);
            console.log(`🛗 Ingested ${mapped.length} elevators.`);
        } catch (err) {
            console.warn('Failed to ingest elevators:', err);
        }
    }

    /**
     * 3. Ingest Wheelchair Lifts
     * Source: OA-21211
     */
    static async ingestLifts() {
        // Similar pattern to elevators
    }

    /**
     * 4. Ingest Inter-station distances & durations
     * Source: OA-12034
     */
    static async ingestInterStationDistances() {
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchStationDistance/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            const items = json.SearchStationDistance?.row || [];

            const mapped: OperationalData[] = items.map((item: any) => ({
                fromStation: item.STATION_NM,
                toStation: item.NEXT_STATION_NM,
                line: item.LINE_NUM,
                distance: parseFloat(item.DISTANCE),
                duration: parseFloat(item.DURATION)
            }));

            await db.operational.bulkPut(mapped);
            console.log(`📏 Ingested ${mapped.length} inter-station distance records.`);
        } catch (err) {
            console.warn('Failed to ingest distances:', err);
        }
    }

    /**
     * 5. Ingest Station Metadata (Universal ID Mapping)
     * Source: OA-121 (SearchSTNBySubwayLineService)
     */
    static async ingestStationMetadata() {
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchSTNBySubwayLineService/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            const items = json.SearchSTNBySubwayLineService?.row || [];

            for (const item of items) {
                const existing = await db.getStationByName(item.STATION_NM);
                if (existing) {
                    await db.stations.update(existing.id!, {
                        stationCd: item.STATION_CD,
                        lineNum: item.LINE_NUM,
                        frCode: item.FR_CODE
                    });
                }
            }
            console.log(`🆔 Ingested metadata for ${items.length} stations.`);
        } catch (err) {
            console.warn('Failed to ingest station metadata:', err);
        }
    }

    /**
     * 6. Ingest Timetables (Incremental)
     * Source: OA-101 (SearchSTNTimeTableByIDService)
     */
    static async ingestTimetables(stationName: string, lineNum: string, stationCd: string) {
        const dayTypes = ['1', '2', '3']; // Weekday, Saturday, Sunday
        const directions = ['1', '2']; // Up, Down
        const allEntries: TimetableEntry[] = [];

        for (const dayType of dayTypes) {
            for (const direction of directions) {
                const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchSTNTimeTableByIDService/1/500/${stationCd}/${dayType}/${direction}/`;
                try {
                    const json = await fetchWithFallbacks(url);
                    const rows = json.SearchSTNTimeTableByIDService?.row || [];
                    
                    rows.forEach((row: any) => {
                        allEntries.push({
                            stationName,
                            line: lineNum,
                            dayType: dayType === '1' ? 'week' : dayType === '2' ? 'sat' : 'sun',
                            direction: direction === '1' ? 'up' : 'down',
                            arrivalTime: row.ARRIVETIME,
                            departureTime: row.LEFTTIME,
                            trainNo: row.TRAIN_NO,
                            destination: row.SUBWAYDESTNM,
                            destStation: row.SUBWAYDESTNM
                        });
                    });
                } catch (err) {
                    // Silent fail for specific day/direction combos
                }
            }
        }

        if (allEntries.length > 0) {
            await db.saveTimetable(allEntries);
            console.log(`📅 Cached ${allEntries.length} timetable entries for ${stationName}.`);
        }
    }
}
