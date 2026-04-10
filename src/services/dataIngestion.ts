import { db } from './db';
import { Station, Facility, WCItem, OperationalData, TimetableEntry, TransferInfo, ParkingLot, StationExit } from '@/types/metro';
import { fetchWithFallbacks } from './arrivalApi';
import { normalizeLineName } from '@/utils/stationUtils';
import { normStation } from '@/data/stationRegistry';

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
    private static API_KEY = process.env.NEXT_PUBLIC_SEOUL_API_KEY || 'sample';
    private static BUS_API_KEY = process.env.NEXT_PUBLIC_BUS_API_KEY || 'sample';
    private static DATA_GO_KR_KEY = process.env.NEXT_PUBLIC_DATA_GO_KR_KEY || 'sample';
    private static SYNC_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    /**
     * Resolve correct asset path for GH Pages or local
     */
    private static getAssetPath(path: string) {
        if (typeof window === 'undefined') return path;
        const base = window.location.pathname.startsWith('/metro') ? '/metro' : '';
        return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
    }

    private static tasks: IngestionTask[] = [
        { id: 'toilets', label: '역내 화장실 정보', progress: 0, status: 'waiting' },
        { id: 'elevators', label: '엘리베이터 위치', progress: 0, status: 'waiting' },
        { id: 'lifts', label: '휠체어 리프트', progress: 0, status: 'waiting' },
        { id: 'distances', label: '역간 거리/소요시간', progress: 0, status: 'waiting' },
        { id: 'transfers', label: '빠른 환승 정보', progress: 0, status: 'waiting' },
        { id: 'details', label: '역 주소 및 전화번호', progress: 0, status: 'waiting' },
        { id: 'parking', label: '환승 주차장', progress: 0, status: 'waiting' },
        { id: 'metadata', label: '역 코드 메타데이터', progress: 0, status: 'waiting' },
        { id: 'bus_expansion', label: '버스 노선도 확장(서울/경기/강원/충청)', progress: 0, status: 'waiting' },
    ];

    private static updateTask(id: string, updates: Partial<IngestionTask>, callback?: ProgressCallback) {
        const index = this.tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            this.tasks[index] = { ...this.tasks[index], ...updates };
            if (callback) callback([...this.tasks]);
        }
    }

    /**
     * SWR (Stale-While-Revalidate) Sync Logic
     */
    static async checkAndSyncStaleData(onProgress?: ProgressCallback) {
        const categories = ['toilets', 'bus_stops', 'metadata'];
        const now = Date.now();

        for (const cat of categories) {
            const log = await db.syncLogs.get(cat);
            if (!log || (now - log.lastSync) > this.SYNC_THRESHOLD_MS) {
                console.log(`🔄 [SWR] Category ${cat} is stale. Syncing in background...`);
                // Trigger specific ingestion based on category
                if (cat === 'toilets') await this.ingestStationToilets(onProgress);
                if (cat === 'bus_stops') await this.ingestMasterBusStops(onProgress);
                if (cat === 'metadata') {
                    await this.ingestStationMetadata(onProgress);
                    await this.ingestMasterTimetables(onProgress);
                }
                
                await db.syncLogs.put({ key: cat, lastSync: now });
            }
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
            await this.ingestExitFacilities(onProgress); 
            await this.ingestMasterBusStops(onProgress); 
            await this.ingestMasterTimetables(onProgress); // 📅 NEW: pre-fetched timetables
            // await this.ingestMajorBusHubs(onProgress); // 🚨 DISABLED: Causes 8000+ errors due to CORS/Rate-limiting

            console.log('✅ All data refreshed.');
        } catch (err) {
            console.error('❌ Data refresh failed:', err);
        }
    }

    /**
     * 1. Ingest Station & Public Toilets (Nationwide)
     * Source: master-toilets.json (generated by ingest-all.ts)
     */
    static async ingestStationToilets(callback?: ProgressCallback) {
        this.updateTask('toilets', { status: 'running', progress: 10 }, callback);
        try {
            const res = await fetch(this.getAssetPath('/data/master-toilets.json'));
            if (!res.ok) {
                console.warn('⚠️ master-toilets.json not found. Skipping.');
                this.updateTask('toilets', { status: 'completed', progress: 100 }, callback);
                return;
            }
            const items = await res.json();
            if (!Array.isArray(items) || items.length === 0) {
                this.updateTask('toilets', { status: 'completed', progress: 100 }, callback);
                return;
            }

            this.updateTask('toilets', { progress: 30 }, callback);

            // Chunked insertion for 20k+ records
            const CHUNK_SIZE = 2000;
            for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                const chunk = items.slice(i, i + CHUNK_SIZE).map((item: any) => ({
                    id: item.id || `wc-${Math.random().toString(36).substr(2, 9)}`,
                    name: item.name || '공중화장실',
                    lat: parseFloat(item.lat || '0'),
                    lng: parseFloat(item.lng || '0'),
                    accessible: !!(item.accessible || item.ds > 0),
                    femaleStalls: parseInt(item.fs || item.femaleStalls || '0'),
                    maleStalls: parseInt(item.ms || item.maleStalls || '0'),
                    maleUrinals: parseInt(item.mu || item.maleUrinals || '0'),
                    emergencyBell: !!(item.bell || item.emergencyBell),
                    diapers: !!(item.diaper || item.diapers),
                    address: item.address || '',
                    openTime: item.ot || item.openTime || '24시간',
                    source: item.source || 'MOIS',
                    isInsideGate: !!item.isInsideGate
                })).filter(it => it.lat !== 0);

                await db.wc.bulkPut(chunk);
                const pct = 30 + Math.floor(((i + CHUNK_SIZE) / items.length) * 65);
                this.updateTask('toilets', { progress: Math.min(pct, 98) }, callback);
            }

            this.updateTask('toilets', { status: 'completed', progress: 100 }, callback);
            console.log(`🚽 Ingested ${items.length} nationwide toilets.`);
            
            // Mark last sync
            await db.syncLogs.put({ key: 'toilets', lastSync: Date.now() });
        } catch (err) {
            this.handleError('toilets', err, callback);
        }
    }

    /**
     * 2. Ingest Elevators
     * Source: OA-21212
     */
    static async ingestElevators(callback?: ProgressCallback) {
        this.updateTask('elevators', { status: 'running', progress: 10 }, callback);
        try {
            // Priority 1: Local Master Data
            let items: any[] = [];
            try {
                const localRes = await fetch(this.getAssetPath('/data/master-elevators.json'));
                if (localRes.ok) items = await localRes.json();
            } catch (e) {}

            // Priority 2: Remote API (Fallback)
            if (items.length === 0) {
                const url = `https://openapi.seoul.go.kr:443/${this.API_KEY}/json/SearchSubwayStationElevator/1/1000/`;
                const json = await fetchWithFallbacks(url);
                items = json.SearchSubwayStationElevator?.row || [];
            }

            this.updateTask('elevators', { progress: 50 }, callback);

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
            this.updateTask('elevators', { status: 'failed', error: 'API unreachable' }, callback);
        }
    }

    /**
     * 3. Ingest Wheelchair Lifts
     * Source: OA-21211
     */
    static async ingestLifts(callback?: ProgressCallback) {
        this.updateTask('lifts', { status: 'running', progress: 10 }, callback);
        try {
            // Priority 1: Local Master Data
            let items: any[] = [];
            try {
                const localRes = await fetch(this.getAssetPath('/data/master-lifts.json'));
                if (localRes.ok) items = await localRes.json();
            } catch (e) {}

            // Priority 2: Remote API (Fallback)
            if (items.length === 0) {
                const url = `https://openapi.seoul.go.kr:443/${this.API_KEY}/json/SearchSubwayStationWheelchairLift/1/1000/`;
                const json = await fetchWithFallbacks(url);
                items = json.SearchSubwayStationWheelchairLift?.row || [];
            }

            this.updateTask('lifts', { progress: 50 }, callback);

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
            this.updateTask('lifts', { status: 'failed', error: 'API unreachable' }, callback);
        }
    }

    /**
     * 4. Ingest Inter-station distances & durations
     * Source: OA-12034
     */
    static async ingestInterStationDistances(callback?: ProgressCallback) {
        this.updateTask('distances', { status: 'running', progress: 10 }, callback);
        try {
            // Priority 1: Local Master Data
            let items: any[] = [];
            try {
                const localRes = await fetch(this.getAssetPath('/data/master-distances.json'));
                if (localRes.ok) items = await localRes.json();
            } catch (e) {}

            // Priority 2: Remote API (Fallback)
            if (items.length === 0) {
                const url = `https://openapi.seoul.go.kr:443/${this.API_KEY}/json/SearchStationDistance/1/1000/`;
                const json = await fetchWithFallbacks(url);
                items = json.SearchStationDistance?.row || [];
            }

            this.updateTask('distances', { progress: 50 }, callback);

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
            this.updateTask('distances', { status: 'failed', error: 'API unreachable' }, callback);
        }
    }

    /**
     * 5. Ingest Fast Transfer Information
     * Source: data.go.kr 15151816
     */
    static async ingestFastTransfers(callback?: ProgressCallback) {
        this.updateTask('transfers', { status: 'running', progress: 10 }, callback);
        try {
            // Priority 1: Local Master Data
            let items: any[] = [];
            try {
                const localRes = await fetch(this.getAssetPath('/data/master-transfers.json'));
                if (localRes.ok) items = await localRes.json();
            } catch (e) {}

            // Priority 2: Remote API (Fallback)
            if (items.length === 0 && this.DATA_GO_KR_KEY !== 'sample') {
                const url = `https://api.odcloud.kr/api/15151816/v1/uddi:e9c2bb71-05e8-4767-8397-9df787ee70f6?page=1&perPage=5000&serviceKey=${encodeURIComponent(this.DATA_GO_KR_KEY)}`;
                const res = await fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    items = json.data || [];
                }
            }

            this.updateTask('transfers', { progress: 50 }, callback);

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
            this.updateTask('transfers', { status: 'failed', error: 'API unreachable' }, callback);
        }
    }

    /**
     * 6. Ingest Detailed Station Info (Addresses, Tel)
     * Source: Seoul StationAdresTelno
     */
    static async ingestDetailedStationInfo(callback?: ProgressCallback) {
        this.updateTask('details', { status: 'running', progress: 10 }, callback);
        try {
            // Priority 1: Local Master Data
            let items: any[] = [];
            try {
                const localRes = await fetch(this.getAssetPath('/data/master-details.json'));
                if (localRes.ok) items = await localRes.json();
            } catch (e) {}

            // Priority 2: Remote API (Fallback)
            if (items.length === 0) {
                const url = `https://openapi.seoul.go.kr:443/${this.API_KEY}/json/StationAdresTelno/1/1000/`;
                const json = await fetchWithFallbacks(url);
                items = json.StationAdresTelno?.row || [];
            }

            this.updateTask('details', { progress: 30 }, callback);

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
            this.updateTask('details', { status: 'failed', error: 'API unreachable' }, callback);
        }
    }

    /**
     * 7. Ingest Parking Lots
     * Source: data.go.kr 15086929
     */
    static async ingestParkingLots(callback?: ProgressCallback) {
        this.updateTask('parking', { status: 'running', progress: 10 }, callback);
        try {
            // Priority 1: Local Master Data
            let items: any[] = [];
            try {
                const localRes = await fetch(this.getAssetPath('/data/master-parking.json'));
                if (localRes.ok) items = await localRes.json();
            } catch (e) {}

            // Priority 2: Remote API (Fallback)
            if (items.length === 0 && this.DATA_GO_KR_KEY !== 'sample') {
                const url = `https://api.odcloud.kr/api/15086929/v1/uddi:5e2b02a7-5735-464a-85b5-779836365735?page=1&perPage=1000&serviceKey=${encodeURIComponent(this.DATA_GO_KR_KEY)}`;
                const res = await fetch(url);
                if (res.ok) {
                    const json = await res.json();
                    items = json.data || [];
                }
            }

            this.updateTask('parking', { progress: 50 }, callback);

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
            this.updateTask('parking', { status: 'failed', error: 'API unreachable' }, callback);
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
        try {
            // Priority 1: Local Master Data
            let items: any[] = [];
            try {
                const localRes = await fetch(this.getAssetPath('/data/master-metadata.json'));
                if (localRes.ok) items = await localRes.json();
            } catch (e) {}

            // Priority 2: Remote API (Fallback)
            if (items.length === 0) {
                const url = `https://openapi.seoul.go.kr:443/${this.API_KEY}/json/SearchSTNBySubwayLineService/1/1000/`;
                const json = await fetchWithFallbacks(url);
                items = json.SearchSTNBySubwayLineService?.row || [];
            }

            this.updateTask('metadata', { progress: 30 }, callback);

            let count = 0;
            for (const item of items) {
                // Try exact match then fuzzy (strip parentheses)
                let existing = await db.getStationByName(item.STATION_NM);
                if (!existing) {
                    const cleanName = normStation(item.STATION_NM);
                    existing = await db.getStationByName(cleanName);
                }

                if (existing) {
                    const lineName = normalizeLineName(item.LINE_NUM);
                    
                    // Save to specialized metadata table for transfer support
                    await db.saveStationCode({
                        name: existing.name,
                        line: lineName,
                        stationCd: item.STATION_CD
                    }).catch(() => {});

                    // Keep legacy field for single-line stations for backward compat
                    if (!existing.stationCd || existing.lineNum === item.LINE_NUM) {
                        await db.stations.update(existing.id!, {
                            stationCd: item.STATION_CD,
                            lineNum: item.LINE_NUM,
                            frCode: item.FR_CODE
                        });
                    }
                    count++;
                }
                if (count % 100 === 0) {
                    this.updateTask('metadata', { progress: 30 + (count / items.length) * 70 }, callback);
                }
            }
            this.updateTask('metadata', { status: 'completed', progress: 100 }, callback);
            console.log(`🆔 Ingested metadata for ${items.length} stations.`);
        } catch (err) {
            this.updateTask('metadata', { status: 'failed', error: 'API unreachable' }, callback);
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
                const url = `https://openapi.seoul.go.kr:443/${this.API_KEY}/json/SearchSTNTimeTableByIDService/1/500/${stationCd}/${dayType}/${direction}/`;
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
     * 8. Ingest Major Bus Hubs (Stops within 500m of subway exits)
     * Source: master-bus-hubs.json (Local First)
     */
    static async ingestMajorBusHubs(callback?: ProgressCallback) {
        this.updateTask('bus_expansion', { status: 'running', progress: 10 }, callback);
        try {
            let items: any[] = [];
            try {
                const res = await fetch(this.getAssetPath('/data/master-bus-hubs.json'));
                if (res.ok) items = await res.json();
            } catch (e) {}

            if (items.length > 0) {
                const busStops = items.map((item: any) => ({
                    id: String(item.nodeid || item.id),
                    name: item.nodenm || item.name,
                    lat: parseFloat(item.gpslati || item.lat),
                    lng: parseFloat(item.gpslong || item.lng),
                    region: '수도권/광역',
                    routes: [],
                    cityCode: String(item.citycode || '')
                }));
                await db.busStops.bulkPut(busStops);
            }

            this.updateTask('bus_expansion', { status: 'completed', progress: 100 }, callback);
            console.log('✅ Major bus hubs ingested.');
        } catch (error) {
            this.handleError('bus_expansion', error, callback);
        }
    }

    /**
     * 10. Ingest Exit Facilities (Nearby Landmarks)
     * Source: master-exit-facilities.json (generated by ingest-all.ts)
     */
    static async ingestExitFacilities(callback?: ProgressCallback) {
        this.updateTask('details', { status: 'running', progress: 10 }, callback);
        try {
            const res = await fetch(this.getAssetPath('/data/master-exit-facilities.json'));
            if (!res.ok) {
                this.updateTask('details', { progress: 100 }, callback);
                return;
            }
            const items = await res.json();
            if (!Array.isArray(items) || items.length === 0) {
                this.updateTask('details', { progress: 100 }, callback);
                return;
            }

            this.updateTask('details', { progress: 40 }, callback);

            // Fetch stations to map CD to Name
            const allStations: Station[] = await db.stations.toArray();
            const cdToNameMap = new Map<string, string>(
                allStations.filter(s => !!s.stationCd).map(s => [s.stationCd!, s.name])
            );

            const mapped: StationExit[] = items.map((item: any) => {
                const stationName = cdToNameMap.get(item.stationCd) || '';
                return {
                    stationName,
                    exitNo: item.exitNo,
                    lat: item.lat,
                    lng: item.lng,
                    landmarks: [item.facilityNm]
                };
            }).filter(ex => ex.stationName !== '');

            // Merge landmarks for same exit
            const merged = new Map<string, StationExit>();
            mapped.forEach(ex => {
                const key = `${ex.stationName}-${ex.exitNo}`;
                if (merged.has(key)) {
                    const existing = merged.get(key)!;
                    if (!existing.landmarks.includes(ex.landmarks[0])) {
                        existing.landmarks.push(ex.landmarks[0]);
                    }
                } else {
                    merged.set(key, ex);
                }
            });

            await db.stationExits.bulkPut(Array.from(merged.values()));
            this.updateTask('details', { status: 'completed', progress: 100 }, callback);
            console.log(`🚪 Ingested ${merged.size} unique exit facility mappings.`);
        } catch (error) {
            this.handleError('details', error, callback);
        }
    }
    static async ingestMasterBusStops(callback?: ProgressCallback) {
        this.updateTask('bus_expansion', { status: 'running', progress: 10 }, callback);
        try {
            const res = await fetch(this.getAssetPath('/data/master-bus-stops.json'));
            if (!res.ok) {
                this.updateTask('bus_expansion', { status: 'completed', progress: 100 }, callback);
                return;
            }
            const items: any[] = await res.json();
            if (!Array.isArray(items) || items.length === 0) {
                this.updateTask('bus_expansion', { status: 'completed', progress: 100 }, callback);
                return;
            }

            this.updateTask('bus_expansion', { progress: 40 }, callback);

            // Batch insert in chunks of 2000 to avoid memory pressure
            const CHUNK_SIZE = 2000;
            for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                const chunk = items.slice(i, i + CHUNK_SIZE).map((item: any) => ({
                    id: String(item.id),
                    name: item.name,
                    lat: parseFloat(item.lat),
                    lng: parseFloat(item.lng),
                    region: item.region || '전국',
                    routes: [],
                    cityCode: String(item.cityCode || ''),
                })).filter((s: any) => s.lat !== 0 && s.lng !== 0);

                await db.busStops.bulkPut(chunk);
                const pct = 40 + Math.floor(((i + CHUNK_SIZE) / items.length) * 55);
                this.updateTask('bus_expansion', { progress: Math.min(pct, 95) }, callback);
            }

            this.updateTask('bus_expansion', { status: 'completed', progress: 100 }, callback);
            console.log(`🚌 Ingested ${items.length} nationwide bus stops.`);
        } catch (error) {
            this.handleError('bus_expansion', error, callback);
        }
    }
    
    /**
     * 11. Ingest Master Timetables
     * Source: master-timetables.json (generated by ingest-schedules.js)
     */
    static async ingestMasterTimetables(callback?: ProgressCallback) {
        this.updateTask('metadata', { status: 'running', progress: 50 }, callback);
        try {
            const res = await fetch(this.getAssetPath('/data/master-timetables.json'));
            if (!res.ok) {
                console.warn('⚠️ master-timetables.json not found.');
                return;
            }
            const items: any[] = await res.json();
            if (!Array.isArray(items) || items.length === 0) return;

            const CHUNK_SIZE = 5000;
            for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                const chunk: TimetableEntry[] = items.slice(i, i + CHUNK_SIZE).map(item => ({
                    stationName: item.s,
                    line: item.l,
                    dayType: item.dt === 'w' ? 'week' : item.dt === 's' ? 'sat' : 'sun',
                    direction: item.di === 'u' ? 'up' : 'down',
                    arrivalTime: item.at,
                    departureTime: item.dtm,
                    trainNo: '', // Not in static
                    destination: item.dest
                }));
                await db.saveTimetable(chunk);
                const pct = 50 + Math.floor(((i + CHUNK_SIZE) / items.length) * 45);
                this.updateTask('metadata', { progress: Math.min(pct, 98) }, callback);
            }
            console.log(`📅 Ingested ${items.length} master timetable entries.`);
        } catch (err) {
            console.error('❌ Failed to ingest master timetables:', err);
        }
    }

    /**
     * Fetch all bus stops for a specific city on-demand.
     */
    static async fetchRegionalBusStops(cityCode: string, callback?: ProgressCallback) {
        if (this.DATA_GO_KR_KEY === 'sample') return;
        const url = `https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList?serviceKey=${encodeURIComponent(this.DATA_GO_KR_KEY)}&_type=json&cityCode=${cityCode}&pageNo=1&numOfRows=10000`;
        try {
            const res = await fetch(url);
            const json = await res.json();
            const items = json.response?.body?.items?.item || [];
            
            const busStops = items.map((item: any) => ({
                id: String(item.nodeid),
                name: item.nodenm,
                lat: parseFloat(item.gpslati),
                lng: parseFloat(item.gpslong),
                region: '광역',
                routes: [],
                cityCode: cityCode
            }));
            await db.busStops.bulkPut(busStops);
            console.log(`📍 Ingested ${busStops.length} bus stops for city ${cityCode}.`);
        } catch (err) {
            console.debug(`Failed to ingest bus stops for city ${cityCode}:`, err);
        }
    }

    /**
     * Trigger timetable ingestion for a specific station name
     */
    static async triggerTimetableByStationName(stationName: string) {
        try {
            const cleanName = stationName.replace(/역+$/, '').trim();
            const station = await db.getStationByName(cleanName);
            if (!station) return;

            // Trigger ingestion for ALL lines of this station
            for (const line of station.lines) {
                const normalized = normalizeLineName(line);
                let code = await db.getStationCode(cleanName, normalized);
                
                // Fallback for metadata not yet synced for this specific line
                if (!code && (station.lineNum === line || station.lineNum === normalized)) {
                    code = station.stationCd;
                }

                if (code) {
                    this.ingestTimetables(cleanName, normalized, code).catch(() => {});
                }
            }
        } catch (err) {
            // silent fail
        }
    }

    /**
     * Unified error handler for ingestion tasks
     */
    private static handleError(taskId: string, error: any, callback?: ProgressCallback) {
        console.warn(`⚠️ [Ingestion] Task ${taskId} failed:`, error instanceof Error ? error.message : String(error));
        this.updateTask(taskId as any, { 
            status: 'failed', 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, callback);
    }
}
