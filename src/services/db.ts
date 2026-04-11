import Dexie, { type Table } from 'dexie';
import { 
    Station, BusStop, WCItem, 
    Facility, OperationalData, 
    TimetableEntry, StationMetric,
    TransferInfo, StationExit, ParkingLot, StationCode
} from '@/types/metro';

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
    if (stationCount > 0) return;

    // Only load stations (92KB) + timetables — bus/WC are now tile-fetched on demand
    try {
      const stationsRes = await fetch('./data/master-subway.json');
      const stations = stationsRes.ok
        ? await stationsRes.json()
        : await fetch('./data/capitalStations.json').then(r => r.json());

      await this.transaction('rw', [this.stations, this.timetables], async () => {
        const mapped = stations.map((s: any) => ({
          ...s,
          lat: s.lat || s.latitude,
          lng: s.lng || s.longitude,
        }));
        await this.stations.clear();
        await this.stations.bulkAdd(mapped);

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
                destination: item.dest,
              }));
              await this.timetables.bulkAdd(ttMapped);
            }
          }
        } catch (e) {
          console.warn('Could not load master timetables:', e);
        }
      });
    } catch (err) {
      console.error('❌ Failed to initialize database:', err);
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
