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
    const variants = [clean, clean + '역', name];
    
    for (const variant of variants) {
        if (this.stationCoordsCache.has(variant)) {
            return this.stationCoordsCache.get(variant)!;
        }
        const station = await db.stations.where('name').equals(variant).first();
        if (station && station.lng && station.lat) {
            const coord: [number, number] = [station.lng, station.lat];
            this.stationCoordsCache.set(variant, coord);
            return coord;
        }
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
      const trainPromises = SUBWAY_POLLING_NAMES.map(line => fetchTrainPositions(line));
      const trainResults = await Promise.all(trainPromises);
      const flattenedResults = trainResults.flat();
      
      console.log(`📡 Realtime Polling: Fetched ${flattenedResults.length} trains.`);
      
      const subwayUnits = await Promise.all(flattenedResults.map(async train => {
        const coord = await this.getStationCoord(train.statnNm);
        if (!coord) {
            // console.warn(`🔍 Coord not found for station: ${train.statnNm}`);
            return null;
        }

        const staticLine = SUBWAY_LINES.find(l => l.name === train.subwayNm || normalizeLineName(l.name) === normalizeLineName(train.subwayNm));
        const lineColor = (staticLine?.color || "#3b82f6").replace('#', '').toUpperCase();

        return {
          id: `train-${train.subwayId}-${train.trainNo}`,
          type: 'subway' as const,
          nextPos: coord,
          lineName: train.subwayNm,
          lineColor: lineColor,
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
          lineColor: "3b82f6", // Default blue for buses
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
