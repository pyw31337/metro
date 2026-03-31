import Dexie, { type Table } from 'dexie';
import { 
    Station, BusStop, WCItem, 
    Facility, OperationalData, 
    TimetableEntry, StationMetric,
    TransferInfo
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

  constructor() {
    super('MetroDatabase');
    this.version(6).stores({
      stations: '++id, name, *lines', 
      busStops: 'id, name, region, *routes',
      wc: 'id, name, station',
      facilities: '++id, stationName, category, isInsideGate',
      operational: '++id, fromStation, toStation, line',
      timetables: '++id, stationName, line, dayType, direction, [stationName+line+dayType]',
      stationMetrics: '++id, stationName, line, hour',
      transfers: '++id, stationName, [stationName+fromLine+toLine]'
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
          fetch('/data/capitalStations.json').then(res => res.json()),
          fetch('/data/bus-stops.json').then(res => res.json()),
          fetch('/data/wc.json').then(res => res.json())
        ]);

        await this.transaction('rw', [this.stations, this.busStops, this.wc], async () => {
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
        // Always ensure transfer data is synced from static JSON
        DataIngestionService.ingestStaticTransferData();
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
      return await this.stations.where('name').equals(name).first();
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
}

export const db = new MetroDatabase();
