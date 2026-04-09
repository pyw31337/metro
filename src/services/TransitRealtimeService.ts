import { EventEmitter } from 'events';
import { fetchTrainPositions } from './arrivalApi';
import { MetropolitanBusService } from './busApi';
import { db } from './db';

import { SUBWAY_LINES } from '@/data/subway-lines';
import { RealtimePosition } from '@/hooks/useRealtimeTrains';
import { normalizeLineName } from '@/utils/stationUtils';

export interface RealtimeUnit {
  id: string;
  type: 'bus' | 'subway';
  pos: [number, number];
  bearing: number;
  label: string;
  lineName: string;
  lineColor: string;
}

const SUBWAY_POLLING_NAMES = [
  '1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선', 
  '경의중앙선', '공항철도', '수인분당선', '신분당선', '경춘선', '신림선', '우이신설선'
];

class TransitRealtimeService extends EventEmitter {
  private worker: Worker | null = null;
  private updateInterval: number = 15000;
  private isRunning: boolean = false;
  private currentUnits: RealtimeUnit[] = [];
  private stationCoordsCache: Map<string, [number, number]> = new Map();
  private trackedBusRoutes: Set<string> = new Set(); // format: "cityCode:routeId"

  constructor() {
    super();
    if (typeof window !== 'undefined') {
      this.initWorker();
    }
  }

  private initWorker() {
    this.worker = new Worker(
      new URL('../workers/transit-processor.worker.ts', import.meta.url)
    );
    
    this.worker.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'TICK_UPDATE') {
        this.currentUnits = data;
        this.emit('update', data);
      }
    };
  }

  public trackBusRoute(cityCode: string, routeId: string) {
    this.trackedBusRoutes.add(`${cityCode}:${routeId}`);
    this.poll(); // Trigger immediate update
  }

  public untrackBusRoute(cityCode: string, routeId: string) {
    this.trackedBusRoutes.delete(`${cityCode}:${routeId}`);
  }

  private async getStationCoord(name: string): Promise<[number, number] | null> {
    const clean = name.replace(/\(.*\)/, '').replace(/역$/, '').trim();
    // Try multiple name variants for the most flexible matching
    const variants = [clean, clean + '역', name];
    
    // 1. Try local IndexedDB (High Accuracy)
    for (const variant of variants) {
        if (this.stationCoordsCache.has(variant)) {
            return this.stationCoordsCache.get(variant)!;
        }
        try {
            const station = await db.stations.where('name').equals(variant).first();
            if (station && station.lng && station.lat) {
                const coord: [number, number] = [station.lng, station.lat];
                this.stationCoordsCache.set(variant, coord);
                return coord;
            }
        } catch (e) {}
    }

    // 2. Fallback to Static Data (Baseline reliability)
    console.log(`📡 Fallback lookup for: ${name}`);
    for (const line of SUBWAY_LINES) {
        const match = line.stations.find(s => 
            s.name === clean || 
            s.name === name || 
            s.name === (clean + '역')
        );
        if (match) {
            const coord: [number, number] = [match.lng, match.lat];
            this.stationCoordsCache.set(name, coord);
            return coord;
        }
    }
    
    return null;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // 🔥 IMMEDIATELY show simulation units on boot so map is never empty
    const simulated = this.generateSimulatedSubwayResults();
    this.emitSimulatedUnits(simulated);
    
    this.poll();
    console.log('💎 TransitRealtimeService Started. Sent initial simulation data.');
  }

  public stop() {
    this.isRunning = false;
  }

  public getUnits() {
    return this.currentUnits;
  }

  private async poll() {
    if (!this.isRunning) return;

    try {
      // 1. Subway Polling
      const trainPromises = SUBWAY_POLLING_NAMES.map(line => fetchTrainPositions(line));
      const trainResults = await Promise.all(trainPromises);
      const flattenedResults = trainResults.flat();
      
      let finalFlattened = flattenedResults;

      // 🚨 QUOTA CHECK: If no trains found or all keys failed, try simulation mode
      if (flattenedResults.length === 0) {
          console.warn('⚠️ API Quota hit or no data. Entering Simulation Mode for verification.');
          finalFlattened = this.generateSimulatedSubwayResults();
          this.worker?.postMessage({ type: 'CLEAR_REAL' });
      } else {
          console.log(`📡 Realtime Polling: Fetched ${flattenedResults.length} trains.`);
          this.worker?.postMessage({ type: 'CLEAR_SIMULATED' });
      }
      
      const subwayUnits = await Promise.all(finalFlattened.map(async train => {
        const coord = await this.getStationCoord(train.statnNm);
        if (!coord) return null;

        const staticLine = SUBWAY_LINES.find(l => l.name === train.subwayNm || normalizeLineName(l.name) === normalizeLineName(train.subwayNm));
        const lineColor = (staticLine?.color || "#3b82f6").replace('#', '').toUpperCase();

        return {
          id: `train-${train.subwayId || 'sim'}-${train.trainNo}`,
          type: 'subway' as const,
          nextPos: coord,
          lineName: train.subwayNm,
          lineColor: lineColor,
          label: `${train.trainNo}\n${train.arrivalNm || '진입'}`,
        };
      }));

      // ... existing bus polling logic ...
      const busPromises = Array.from(this.trackedBusRoutes).map(async key => {
        const [cityCode, routeId] = key.split(':');
        try {
          const [positions, routeInfo] = await Promise.all([
            MetropolitanBusService.fetchBusPositions(cityCode, routeId),
            MetropolitanBusService.fetchLocalRouteInfo(routeId)
          ]);

          return positions.map(pos => ({
            id: `bus-${routeId}-${pos.id}`,
            type: 'bus' as const,
            nextPos: [pos.lng, pos.lat] as [number, number],
            lineName: routeInfo?.no || routeId,
            lineColor: "3b82f6", 
            label: pos.no || routeInfo?.no || "BUS",
          }));
        } catch (e) { return []; }
      });
      const busResults = await Promise.all(busPromises);

      const allUnits = [
        ...subwayUnits.filter(u => u !== null),
        ...busResults.flat()
      ];

      if (allUnits.length > 0) {
        this.worker?.postMessage({ type: 'UPDATE_UNITS', data: allUnits });
      } else {
        // Fallback if results are somehow empty after mapping
        const simulated = this.generateSimulatedSubwayResults();
        this.emitSimulatedUnits(simulated);
      }
      
    } catch (err) {
      console.error('Realtime polling failed, entering simulation mode:', err);
      const simulated = this.generateSimulatedSubwayResults();
      this.emitSimulatedUnits(simulated);
    }

    setTimeout(() => this.poll(), this.updateInterval);
  }

  private async emitSimulatedUnits(simulated: any[]) {
      const subwayUnits = await Promise.all(simulated.map(async train => {
        const coord = await this.getStationCoord(train.statnNm);
        if (!coord) return null;
        return {
          id: `train-sim-${train.trainNo}`,
          type: 'subway' as const,
          nextPos: coord,
          lineName: train.subwayNm,
          lineColor: "FF5722", // Distinct simulation color
          label: `${train.trainNo}\n${train.arrivalNm || '시뮬레이션'}`,
        };
      }));
      this.worker?.postMessage({ type: 'UPDATE_UNITS', data: subwayUnits.filter(u => u !== null) });
  }

  private simulatedTrains: any[] | null = null;

  /**
   * Generates mock subway results for UI verification when API is down
   */
  private generateSimulatedSubwayResults(): any[] {
      if (!this.simulatedTrains) {
          this.simulatedTrains = [];
          const linesToSimulate = SUBWAY_LINES.slice(0, 9); // Lines 1-9
          
          linesToSimulate.forEach(line => {
              if (!line.stations || line.stations.length < 5) return;
              
              // Add 10 trains per line!
              for (let i = 0; i < 10; i++) {
                  const randomIndex = Math.floor(Math.random() * (line.stations.length - 1));
                  this.simulatedTrains!.push({
                      subwayId: line.id,
                      subwayNm: line.name,
                      currentStationIndex: randomIndex,
                      direction: Math.random() > 0.5 ? 1 : -1,
                      trainNo: `SIM${line.id.substring(0,1)}${i}`,
                  });
              }
          });
      } else {
         // Move each train forward smoothly!
         this.simulatedTrains.forEach(train => {
             const line = SUBWAY_LINES.find(l => l.id === train.subwayId);
             if (line) {
                 // 80% chance to move to next station every 15 sec (so they don't get stuck too long)
                 if (Math.random() < 0.8) {
                    let nextIndex = train.currentStationIndex + train.direction;
                    // Bounce at the ends of the line
                    if (nextIndex < 0 || nextIndex >= line.stations.length) {
                        train.direction *= -1; 
                        nextIndex = train.currentStationIndex + train.direction;
                    }
                    train.currentStationIndex = nextIndex;
                 }
             }
         });
      }

      const results: any[] = [];
      this.simulatedTrains.forEach(train => {
          const line = SUBWAY_LINES.find(l => l.id === train.subwayId);
          if (line) {
             const station = line.stations[train.currentStationIndex];
             let nextIndex = train.currentStationIndex + train.direction;
             if (nextIndex < 0 || nextIndex >= line.stations.length) nextIndex = train.currentStationIndex;
             const nextStation = line.stations[nextIndex];
             
             results.push({
                 subwayId: train.subwayId,
                 subwayNm: train.subwayNm,
                 statnNm: station.name,
                 trainNo: train.trainNo,
                 arrivalNm: nextStation.name + '행',
                 trainSttus: "1" // STOPPED/MOVING
             });
          }
      });
      return results;
  }
}

export const transitRealtimeService = new TransitRealtimeService();
