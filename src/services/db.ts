import Dexie, { type Table } from 'dexie';
import { 
    Station, BusStop, WCItem, 
    Facility, OperationalData, 
    TimetableEntry, StationMetric,
    TransferInfo, StationExit, ParkingLot, StationCode
} from '@/types/metro';
import { DataIngestionService } from './dataIngestion';

export class MetroDatabase extends Dexie {
  stations!: Table<Station>;
  busStops!: Table<BusStop>;
  wc!: Table<WCItem>;
  facilities!: Table<Facility>;
  operational!: Table<OperationalData>;
  timetables!: Table<TimetableEntry>;
  stationMetrics!: Table<StationMetric>;
  transfers!: Table<TransferInfo>;
  stationExits!: Table<StationExit>;
  parkingLots!: Table<ParkingLot>;
  stationCodes!: Table<StationCode>;
  syncLogs!: Table<{ key: string; lastSync: number }>;

  constructor() {
    super('MetroDatabase');
    this.version(14).stores({
      stations: '++id, name, *lines, lat, lng', 
      busStops: 'id, name, region, cityCode, lat, lng, *routes',
      wc: 'id, name, station, lat, lng',
      facilities: '++id, stationName, category, isInsideGate',
      operational: '++id, fromStation, toStation, line',
      timetables: '++id, stationName, line, dayType, direction, [stationName+line+dayType]',
      stationMetrics: '++id, stationName, line, hour',
      transfers: '++id, stationName, [stationName+fromLine+toLine]',
      stationExits: '++id, stationName, exitNo',
      parkingLots: '++id, stationName, name',
      stationCodes: '++id, name, line, stationCd',
      syncLogs: 'key'
    });
  }

  /**
   * Initialize data from static sources and external API metadata.
   */
  async initializeData() {
    const stationCount = await this.stations.count();
    if (stationCount === 0) {
      console.log('🚄 Initializing Metro Database for the first time...');
      try {
        const [stations, busStops, wc] = await Promise.all([
          fetch('./data/capitalStations.json').then(res => res.json()),
          fetch('./data/bus-stops.json').then(res => res.json()),
          fetch('./data/wc.json').then(res => res.json())
        ]);

        await this.transaction('rw', [this.stations, this.busStops, this.wc, this.timetables], async () => {
          const mappedStations = stations.map((s: any) => ({
             ...s,
             lat: s.lat || s.latitude,
             lng: s.lng || s.longitude
          }));
          await this.stations.bulkAdd(mappedStations);
          await this.busStops.bulkAdd(busStops);
          
          const mappedWC = wc.map((item: any) => ({
            id: item.id || `wc-${Math.random().toString(36).substr(2, 9)}`,
            name: item.name,
            lat: item.lat || item.latitude,
            lng: item.lng || item.longitude,
            accessible: !!item.accessible,
            diapers: !!item.diapers,
            emergencyBell: !!item.emergencyBell,
            address: item.address,
            station: item.station || item.name.split(' ')[0],
            isInsideGate: !!item.isInsideGate,
            location: item.location
          }));
          await this.wc.bulkAdd(mappedWC);

          // 📅 NEW: Initial offline timetable load
          try {
            const ttRes = await fetch('./data/master-timetables.json');
            if (ttRes.ok) {
              const ttItems = await ttRes.json();
              if (Array.isArray(ttItems) && ttItems.length > 0) {
                const ttMapped: TimetableEntry[] = ttItems.map((item: any) => ({
                  stationName: item.s,
                  line: item.l,
                  dayType: (item.dt === 'w' ? 'week' : item.dt === 's' ? 'sat' : 'sun') as 'week' | 'sat' | 'sun',
                  direction: (item.di === 'u' ? 'up' : 'down') as 'up' | 'down',
                  arrivalTime: item.at,
                  departureTime: item.dtm,
                  trainNo: '',
                  destination: item.dest
                }));
                await this.timetables.bulkAdd(ttMapped);
                console.log(`📅 Loaded ${ttMapped.length} master timetable entries.`);
              }
            }
          } catch (e) {
            console.warn('Could not load initial master timetables:', e);
          }
        });
        console.log('✅ Basic station data loaded.');
        
        // Fetch official metadata (Codes, FR Codes) after loading names
        await Promise.all([
            DataIngestionService.ingestStationMetadata(),
            DataIngestionService.ingestStaticTransferData()
        ]);
      } catch (err) {
        console.error('❌ Failed to initialize database:', err);
      }
    } else {
        // Check if metadata is missing from the first station
        const first = await this.stations.offset(0).first();
        if (first && !first.stationCd) {
            console.log('🆔 Missing station metadata. Refreshing in background...');
            DataIngestionService.ingestStationMetadata();
        }
        // Always ensure transfer data and additional public data are synced
        DataIngestionService.ingestStaticTransferData();
        
        // Orchestrate full public data refresh if facilities or parking are empty
        const facilityCount = await this.facilities.count();
        if (facilityCount === 0) {
            console.log('📡 Triggering first-run public data ingestion (staggered)...');
            setTimeout(() => {
                DataIngestionService.refreshStaticData().catch(err => {
                    console.warn('Background ingestion failed:', err);
                });
            }, 2000);
        }

        // 🔄 NEW: Trigger Stale-While-Revalidate background sync
        DataIngestionService.checkAndSyncStaleData().catch(() => {});
    }
  }

  async searchStations(query: string) {
    if (!query) return [];
    return await this.stations
      .where('name')
      .startsWith(query)
      .limit(10)
      .toArray();
  }

  /**
   * Station metadata override for critical reliability
   */
  private static STATION_METADATA_OVERRIDE: Record<string, any> = {
    "남부터미널": { stationCd: "0331", lineNum: "03호선", frCode: "341" },
    "서울": { stationCd: "0150", lineNum: "01호선", frCode: "133" },
    "교대": { stationCd: "0330", lineNum: "03호선", frCode: "340" },
    "양재": { stationCd: "0332", lineNum: "03호선", frCode: "342" }
  };

  async getStationFacilities(stationName: string) {
      return await this.facilities
        .where('stationName')
        .equals(stationName)
        .toArray();
  }

  async saveTimetable(entries: TimetableEntry[]) {
      if (entries.length === 0) return;
      await this.timetables.bulkPut(entries);
  }

  async getStoredTimetable(stationName: string, line: string, dayType: string): Promise<TimetableEntry[]> {
      return await this.timetables
          .where('[stationName+line+dayType]')
          .equals([stationName, line, dayType])
          .toArray();
  }

  async getStationByName(name: string): Promise<Station | undefined> {
      const station = await this.stations.where('name').equals(name).first();
      
      // Apply hardcoded overrides for 100% reliability on key stations
      if (station && !station.stationCd && MetroDatabase.STATION_METADATA_OVERRIDE[name]) {
          const override = MetroDatabase.STATION_METADATA_OVERRIDE[name];
          station.stationCd = override.stationCd;
          station.lineNum = override.lineNum;
          station.frCode = override.frCode;
          // Asynchronously update DB
          this.stations.update(station.id!, override).catch(() => {});
      }
      
      return station;
  }

  async getTransferInfo(stationName: string, fromLine: string, toLine: string): Promise<TransferInfo | undefined> {
      return await this.transfers
          .where('[stationName+fromLine+toLine]')
          .equals([stationName, fromLine, toLine])
          .first();
  }

  async saveTransferInfo(info: TransferInfo) {
      await this.transfers.put(info);
  }

  async getStationCode(name: string, line: string): Promise<string | undefined> {
      const entry = await this.stationCodes
          .where({ name, line })
          .first();
      return entry?.stationCd;
  }

  async saveStationCode(entry: StationCode) {
      await this.stationCodes.put(entry);
  }
}

export const db = new MetroDatabase();
