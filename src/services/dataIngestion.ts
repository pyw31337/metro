import { db } from './db';
import { Facility, WCItem, OperationalData, TimetableEntry, TransferInfo, ParkingLot } from '@/types/metro';
import { fetchWithFallbacks } from './arrivalApi';
import { normalizeLineName } from '@/utils/stationUtils';

export interface IngestionTask {
    id: string;
    label: string;
    progress: number; // 0 to 100
    status: 'waiting' | 'running' | 'completed' | 'failed';
    error?: string;
}

export type ProgressCallback = (tasks: IngestionTask[]) => void;

/**
 * DataIngestionService
 * Handles fetching, parsing, and normalizing 50+ Seoul Open Data datasets
 * into the optimized local IndexedDB schema.
 */
export class DataIngestionService {
    private static API_KEY = process.env.NEXT_PUBLIC_SEOUL_OPEN_DATA_KEY || 'sample';
    private static DATA_GO_KR_KEY = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || 'sample';

    private static tasks: IngestionTask[] = [
        { id: 'toilets', label: '역내 화장실 정보', progress: 0, status: 'waiting' },
        { id: 'elevators', label: '엘리베이터 위치', progress: 0, status: 'waiting' },
        { id: 'lifts', label: '휠체어 리프트', progress: 0, status: 'waiting' },
        { id: 'distances', label: '역간 거리/소요시간', progress: 0, status: 'waiting' },
        { id: 'transfers', label: '빠른 환승 정보', progress: 0, status: 'waiting' },
        { id: 'details', label: '역 주소 및 전화번호', progress: 0, status: 'waiting' },
        { id: 'parking', label: '환승 주차장', progress: 0, status: 'waiting' },
        { id: 'metadata', label: '역 코드 메타데이터', progress: 0, status: 'waiting' },
    ];

    private static updateTask(id: string, updates: Partial<IngestionTask>, callback?: ProgressCallback) {
        const index = this.tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            this.tasks[index] = { ...this.tasks[index], ...updates };
            if (callback) callback([...this.tasks]);
        }
    }

    /**
     * Main orchestration method to refresh static data
     */
    static async refreshStaticData(onProgress?: ProgressCallback) {
        console.log('🔄 Starting full data refresh from Public Data Portals...');
        
        // Reset tasks
        this.tasks.forEach(t => {
            t.progress = 0;
            t.status = 'waiting';
        });
        if (onProgress) onProgress([...this.tasks]);

        try {
            await this.ingestStationToilets(onProgress);
            await this.ingestElevators(onProgress);
            await this.ingestLifts(onProgress);
            await this.ingestInterStationDistances(onProgress);
            await this.ingestStaticTransferData(onProgress);
            await this.ingestFastTransfers(onProgress);
            await this.ingestDetailedStationInfo(onProgress);
            await this.ingestParkingLots(onProgress);
            await this.ingestStationMetadata(onProgress);

            console.log('✅ All data refreshed.');
        } catch (err) {
            console.error('❌ Data refresh failed:', err);
        }
    }

    /**
     * 1. Ingest Station Toilets (Focus: Inside/Outside Gate)
     * Source: OA-22726, OA-22501, etc.
     */
    static async ingestStationToilets(callback?: ProgressCallback) {
        this.updateTask('toilets', { status: 'running', progress: 10 }, callback);
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchPublicToiletAndStation/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            this.updateTask('toilets', { progress: 50 }, callback);
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
            this.updateTask('toilets', { status: 'completed', progress: 100 }, callback);
            console.log(`🚽 Ingested ${mapped.length} station toilets.`);
        } catch (err) {
            this.updateTask('toilets', { status: 'failed', error: String(err) }, callback);
            console.warn('Failed to ingest toilets:', err);
        }
    }

    /**
     * 2. Ingest Elevators
     * Source: OA-21212
     */
    static async ingestElevators(callback?: ProgressCallback) {
        this.updateTask('elevators', { status: 'running', progress: 10 }, callback);
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchSubwayStationElevator/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            this.updateTask('elevators', { progress: 50 }, callback);
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
            this.updateTask('elevators', { status: 'completed', progress: 100 }, callback);
            console.log(`🛗 Ingested ${mapped.length} elevators.`);
        } catch (err) {
            this.updateTask('elevators', { status: 'failed', error: String(err) }, callback);
            console.warn('Failed to ingest elevators:', err);
        }
    }

    /**
     * 3. Ingest Wheelchair Lifts
     * Source: OA-21211
     */
    static async ingestLifts(callback?: ProgressCallback) {
        this.updateTask('lifts', { status: 'running', progress: 10 }, callback);
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchSubwayStationWheelchairLift/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            this.updateTask('lifts', { progress: 50 }, callback);
            const items = json.SearchSubwayStationWheelchairLift?.row || [];

            const mapped: Facility[] = items.map((item: any) => ({
                id: `lift-${item.STATION_NM}-${item.STATION_ID}`,
                stationName: item.STATION_NM,
                line: item.LINE_NUM,
                category: 'lift',
                locationDesc: item.LOCATION,
                isInsideGate: item.IN_OUT_GATE === 'IN',
                lat: parseFloat(item.LAT),
                lng: parseFloat(item.LNG),
                details: `운행상태: ${item.USE_YN}`
            }));

            await db.facilities.bulkPut(mapped);
            this.updateTask('lifts', { status: 'completed', progress: 100 }, callback);
            console.log(`♿ Ingested ${mapped.length} wheelchair lifts.`);
        } catch (err) {
            this.updateTask('lifts', { status: 'failed', error: String(err) }, callback);
            console.warn('Failed to ingest lifts:', err);
        }
    }

    /**
     * 4. Ingest Inter-station distances & durations
     * Source: OA-12034
     */
    static async ingestInterStationDistances(callback?: ProgressCallback) {
        this.updateTask('distances', { status: 'running', progress: 10 }, callback);
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchStationDistance/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            this.updateTask('distances', { progress: 50 }, callback);
            const items = json.SearchStationDistance?.row || [];

            const mapped: OperationalData[] = items.map((item: any) => ({
                fromStation: item.STATION_NM,
                toStation: item.NEXT_STATION_NM,
                line: item.LINE_NUM,
                distance: parseFloat(item.DISTANCE),
                duration: parseFloat(item.DURATION)
            }));

            await db.operational.bulkPut(mapped);
            this.updateTask('distances', { status: 'completed', progress: 100 }, callback);
            console.log(`📏 Ingested ${mapped.length} inter-station distance records.`);
        } catch (err) {
            this.updateTask('distances', { status: 'failed', error: String(err) }, callback);
            console.warn('Failed to ingest distances:', err);
        }
    }

    /**
     * 5. Ingest Fast Transfer Information
     * Source: data.go.kr 15151816
     */
    static async ingestFastTransfers(callback?: ProgressCallback) {
        this.updateTask('transfers', { status: 'running', progress: 10 }, callback);
        const url = `https://api.odcloud.kr/api/15151816/v1/uddi:e9c2bb71-05e8-4767-8397-9df787ee70f6?page=1&perPage=5000&serviceKey=${this.DATA_GO_KR_KEY}`;
        try {
            const res = await fetch(url);
            const json = await res.json();
            this.updateTask('transfers', { progress: 50 }, callback);
            const items = json.data || [];

            const mappedTransfers: TransferInfo[] = items.map((item: any) => {
                const car = item.CAR_ORDR || item['차량번호'] || item['CAR_NO'];
                const door = item.CAR_ETRC_NO || item['문번호'] || item['ED_NO'] || item['CAR_ETRC_NM'];
                return {
                    stationName: item.STIN_NM || item['역명'] || item['STN_NM'],
                    fromLine: normalizeLineName(item.LN_NM || item['호선'] || item['LINE_NM']),
                    toLine: normalizeLineName(item.CHTN_LN_CD || item['환승호선'] || item['TRNSIT_LN_NM']),
                    platform: `${car}-${door}`,
                    fastCar: car ? String(car) : undefined,
                    fastDoor: door ? String(door) : undefined
                };
            });

            await db.transfers.bulkPut(mappedTransfers);
            this.updateTask('transfers', { status: 'completed', progress: 100 }, callback);
            console.log(`⚡ Ingested ${mappedTransfers.length} fast transfer records.`);
        } catch (err) {
            this.updateTask('transfers', { status: 'failed', error: String(err) }, callback);
            console.warn('Failed to ingest fast transfers:', err);
        }
    }

    /**
     * 6. Ingest Detailed Station Info (Addresses, Tel)
     * Source: Seoul StationAdresTelno
     */
    static async ingestDetailedStationInfo(callback?: ProgressCallback) {
        this.updateTask('details', { status: 'running', progress: 10 }, callback);
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/StationAdresTelno/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            this.updateTask('details', { progress: 30 }, callback);
            const items = json.StationAdresTelno?.row || [];

            // Fetch all stations first to avoid O(N) sequential queries
            const allStations = await db.stations.toArray();
            const stationMap = new Map(allStations.map(s => [s.name, s]));

            console.log(`📞 Processing detailed info for ${items.length} stations...`);
            
            await db.transaction('rw', db.stations, async () => {
                let count = 0;
                for (const item of items) {
                    const station = stationMap.get(item.STATN_NM);
                    if (station) {
                        await db.stations.update(station.id!, {
                            address: item.ADRES,
                            tel: item.TELNO
                        });
                    }
                    count++;
                    if (count % 100 === 0) {
                        this.updateTask('details', { progress: 30 + (count / items.length) * 70 }, callback);
                    }
                }
            });
            this.updateTask('details', { status: 'completed', progress: 100 }, callback);
            console.log(`✅ Detailed info updated.`);
        } catch (err) {
            this.updateTask('details', { status: 'failed', error: String(err) }, callback);
            console.warn('Failed to ingest station info:', err);
        }
    }

    /**
     * 7. Ingest Parking Lots
     * Source: data.go.kr 15086929
     */
    static async ingestParkingLots(callback?: ProgressCallback) {
        this.updateTask('parking', { status: 'running', progress: 10 }, callback);
        const url = `https://api.odcloud.kr/api/15086929/v1/uddi:5e2b02a7-5735-464a-85b5-779836365735?page=1&perPage=1000&serviceKey=${this.DATA_GO_KR_KEY}`;
        try {
            const res = await fetch(url);
            const json = await res.json();
            this.updateTask('parking', { progress: 50 }, callback);
            const items = json.data || [];

            const mapped: ParkingLot[] = items.map((item: any) => ({
                name: item['주차장명'] || item.PKLT_NM,
                stationName: item['역명'] || item.STIN_NM,
                address: item['주소'] || item.ADDR,
                capacity: parseInt(item['주차면수'] || item.PKLT_CPCT || '0'),
                feeInfo: item['요금정보'] || item.FEE_INFO,
                location: [parseFloat(item.LAT), parseFloat(item.LNG)]
            }));

            // Filter out invalid location data
            const valid = mapped.filter(p => !isNaN(p.location[0]) && !isNaN(p.location[1]));
            await db.parkingLots.bulkPut(valid);
            this.updateTask('parking', { status: 'completed', progress: 100 }, callback);
            console.log(`🚗 Ingested ${valid.length} parking lots.`);
        } catch (err) {
            this.updateTask('parking', { status: 'failed', error: String(err) }, callback);
            console.warn('Failed to ingest parking lots:', err);
        }
    }

    /**
     * 8. Ingest Exits and Landmarks
     */
    static async ingestExitsAndLandmarks() {
        // Implementation for combining exit coords and nearby landmarks
        // This usually requires cross-referencing multiple datasets
        console.log('📍 Exit and landmark ingestion scheduled.');
    }

    /**
     * 5. Ingest Station Metadata (Universal ID Mapping)
     * Source: OA-121 (SearchSTNBySubwayLineService)
     */
    static async ingestStationMetadata(callback?: ProgressCallback) {
        this.updateTask('metadata', { status: 'running', progress: 10 }, callback);
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchSTNBySubwayLineService/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            this.updateTask('metadata', { progress: 30 }, callback);
            const items = json.SearchSTNBySubwayLineService?.row || [];

            let count = 0;
            for (const item of items) {
                // Try exact match then fuzzy (strip parentheses)
                let existing = await db.getStationByName(item.STATION_NM);
                if (!existing) {
                    const cleanName = item.STATION_NM.replace(/\(.*\)/, '').replace(/역$/, '').trim();
                    existing = await db.getStationByName(cleanName);
                }

                if (existing) {
                    await db.stations.update(existing.id!, {
                        stationCd: item.STATION_CD,
                        lineNum: item.LINE_NUM,
                        frCode: item.FR_CODE
                    });
                }
                count++;
                if (count % 100 === 0) {
                    this.updateTask('metadata', { progress: 30 + (count / items.length) * 70 }, callback);
                }
            }
            this.updateTask('metadata', { status: 'completed', progress: 100 }, callback);
            console.log(`🆔 Ingested metadata for ${items.length} stations.`);
        } catch (err) {
            this.updateTask('metadata', { status: 'failed', error: String(err) }, callback);
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

    /**
     * 7. Ingest Static Transfer Data
     * Source: /data/transfer-info.json (and potentially API later)
     */
    static async ingestStaticTransferData(callback?: ProgressCallback) {
        if (callback) this.updateTask('transfers', { status: 'running', progress: 10 }, callback);
        try {
            const res = await fetch('/metro/data/transfer-info.json');
            const data = await res.json();
            const allTransfers: TransferInfo[] = [];

            data.forEach((station: any) => {
                station.transfers.forEach((t: any) => {
                    allTransfers.push({
                        stationName: station.stationName,
                        fromLine: normalizeLineName(t.from),
                        toLine: normalizeLineName(t.to),
                        platform: t.platform
                    });
                });
            });

            if (allTransfers.length > 0) {
                await db.transfers.bulkPut(allTransfers);
                console.log(`🔄 Ingested ${allTransfers.length} fast transfer platform records.`);
            }
            if (callback) this.updateTask('transfers', { status: 'completed', progress: 100 }, callback);
        } catch (err) {
            if (callback) this.updateTask('transfers', { status: 'failed', error: String(err) }, callback);
        }
    }

    /**
     * Trigger timetable ingestion for a specific station name
     */
    static async triggerTimetableByStationName(stationName: string) {
        try {
            const cleanName = stationName.replace(/역$/, '').trim();
            const station = await db.getStationByName(cleanName);
            if (station && station.stationCd) {
                const line = station.lines?.[0] || '01호선'; 
                await this.ingestTimetables(station.name, line, station.stationCd);
            }
        } catch (err) {
            console.warn(`Failed to trigger timetable for ${stationName}:`, err);
        }
    }
}
