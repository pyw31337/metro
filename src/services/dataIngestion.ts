import { db } from './db';
import { Facility, WCItem, OperationalData, TimetableEntry, TransferInfo, ParkingLot } from '@/types/metro';
import { fetchWithFallbacks } from './arrivalApi';
import { normalizeLineName } from '@/utils/stationUtils';

/**
 * DataIngestionService
 * Handles fetching, parsing, and normalizing 50+ Seoul Open Data datasets
 * into the optimized local IndexedDB schema.
 */
export class DataIngestionService {
    private static API_KEY = process.env.NEXT_PUBLIC_SEOUL_OPEN_DATA_KEY || 'sample';
    private static DATA_GO_KR_KEY = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || 'sample';

    /**
     * Main orchestration method to refresh static data
     */
    static async refreshStaticData() {
        console.log('🔄 Starting full data refresh from Public Data Portals...');
        try {
            // Sequentialize to prevent memory spikes and API rate limiting
            await this.ingestStationToilets();
            await this.ingestElevators();
            await this.ingestLifts();
            await this.ingestInterStationDistances();
            await this.ingestStaticTransferData();
            await this.ingestFastTransfers();
            await this.ingestDetailedStationInfo();
            await this.ingestParkingLots();
            await this.ingestExitsAndLandmarks();

            console.log('✅ All data refreshed.');
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
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchSubwayStationWheelchairLift/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
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
            console.log(`♿ Ingested ${mapped.length} wheelchair lifts.`);
        } catch (err) {
            console.warn('Failed to ingest lifts:', err);
        }
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
     * 5. Ingest Fast Transfer Information
     * Source: data.go.kr 15151816
     */
    static async ingestFastTransfers() {
        const url = `https://api.odcloud.kr/api/15151816/v1/uddi:e9c2bb71-05e8-4767-8397-9df787ee70f6?page=1&perPage=5000&serviceKey=${this.DATA_GO_KR_KEY}`;
        try {
            const res = await fetch(url);
            const json = await res.json();
            const items = json.data || [];

            const mappedTransfers: TransferInfo[] = items.map((item: any) => ({
                stationName: item.STIN_NM,
                fromLine: normalizeLineName(item.LN_NM),
                toLine: normalizeLineName(item.CHTN_LN_CD),
                platform: `${item.CAR_ORDR}-${item.CAR_ETRC_NO}`, // 1-1 형식
                fastCar: String(item.CAR_ORDR),
                fastDoor: String(item.CAR_ETRC_NO)
            }));

            await db.transfers.bulkPut(mappedTransfers);
            console.log(`⚡ Ingested ${mappedTransfers.length} fast transfer records.`);
        } catch (err) {
            console.warn('Failed to ingest fast transfers:', err);
        }
    }

    /**
     * 6. Ingest Detailed Station Info (Addresses, Tel)
     * Source: Seoul StationAdresTelno
     */
    static async ingestDetailedStationInfo() {
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/StationAdresTelno/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            const items = json.StationAdresTelno?.row || [];

            // Fetch all stations first to avoid O(N) sequential queries
            const allStations = await db.stations.toArray();
            const stationMap = new Map(allStations.map(s => [s.name, s]));

            console.log(`📞 Processing detailed info for ${items.length} stations...`);
            
            await db.transaction('rw', db.stations, async () => {
                for (const item of items) {
                    const station = stationMap.get(item.STATN_NM);
                    if (station) {
                        await db.stations.update(station.id!, {
                            address: item.ADRES,
                            tel: item.TELNO
                        });
                    }
                }
            });
            console.log(`✅ Detailed info updated.`);
        } catch (err) {
            console.warn('Failed to ingest station info:', err);
        }
    }

    /**
     * 7. Ingest Parking Lots
     * Source: data.go.kr 15086929
     */
    static async ingestParkingLots() {
        const url = `https://api.odcloud.kr/api/15086929/v1/uddi:5e2b02a7-5735-464a-85b5-779836365735?page=1&perPage=1000&serviceKey=${this.DATA_GO_KR_KEY}`;
        try {
            const res = await fetch(url);
            const json = await res.json();
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
            console.log(`🚗 Ingested ${valid.length} parking lots.`);
        } catch (err) {
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
    static async ingestStationMetadata() {
        const url = `http://openapi.seoul.go.kr:8088/${this.API_KEY}/json/SearchSTNBySubwayLineService/1/1000/`;
        try {
            const json = await fetchWithFallbacks(url);
            const items = json.SearchSTNBySubwayLineService?.row || [];

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

    /**
     * 7. Ingest Static Transfer Data
     * Source: /data/transfer-info.json (and potentially API later)
     */
    static async ingestStaticTransferData() {
        try {
            const res = await fetch('/data/transfer-info.json');
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
        } catch (err) {
        }
    }
}
