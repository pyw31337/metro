import { EventEmitter } from 'events';
import { fetchTrainPositions } from './arrivalApi';
import { MetropolitanBusService } from './busApi';
import { db } from './db';

export interface RealtimeUnit {
  id: string;
  type: 'bus' | 'subway';
  pos: [number, number];
  bearing: number;
  label: string;
  lineName: string;
}

const SUBWAY_LINES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '경의중앙', '공항철도', '수인분당', '신분당'];

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
    if (this.stationCoordsCache.has(name)) {
      return this.stationCoordsCache.get(name)!;
    }
    const station = await db.getStationByName(name);
    if (station && station.lng && station.lat) {
      const coord: [number, number] = [station.lng, station.lat];
      this.stationCoordsCache.set(name, coord);
      return coord;
    }
    return null;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.poll();
    console.log('💎 TransitRealtimeService Started');
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
      const trainPromises = SUBWAY_LINES.map(line => fetchTrainPositions(line));
      const trainResults = await Promise.all(trainPromises);
      
      const subwayUnits = await Promise.all(trainResults.flat().map(async train => {
        const coord = await this.getStationCoord(train.statnNm);
        if (!coord) return null;
        return {
          id: `train-${train.subwayId}-${train.trainNo}`,
          type: 'subway' as const,
          nextPos: coord,
          lineName: train.subwayNm,
          label: `${train.trainNo}\n${train.arrivalNm}`,
        };
      }));

      // 2. Bus Polling
      const busPromises = Array.from(this.trackedBusRoutes).map(async key => {
        const [cityCode, routeId] = key.split(':');
        const [positions, routeInfo] = await Promise.all([
          MetropolitanBusService.fetchBusPositions(cityCode, routeId),
          MetropolitanBusService.fetchLocalRouteInfo(routeId)
        ]);

        return positions.map(pos => ({
          id: `bus-${routeId}-${pos.id}`,
          type: 'bus' as const,
          nextPos: [pos.lng, pos.lat] as [number, number],
          lineName: routeInfo?.no || routeId,
          label: pos.no || routeInfo?.no || "BUS",
        }));
      });
      const busResults = await Promise.all(busPromises);

      const allUnits = [
        ...subwayUnits.filter(u => u !== null),
        ...busResults.flat()
      ];

      if (allUnits.length > 0) {
        this.worker?.postMessage({ type: 'UPDATE_UNITS', data: allUnits });
      }
      
    } catch (err) {
      console.error('Realtime polling failed:', err);
    }

    setTimeout(() => this.poll(), this.updateInterval);
  }
}

export const transitRealtimeService = new TransitRealtimeService();
