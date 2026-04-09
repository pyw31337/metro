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
  private updateInterval: number = 12000; // 12초마다 폴링
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
      // 1. Subway Polling — Promise.allSettled으로 일부 노선만 실패해도 나머지는 사용
      const trainPromises = SUBWAY_POLLING_NAMES.map(line => fetchTrainPositions(line));
      
      let flattenedResults: any[] = [];
      try {
        const trainResults = await Promise.allSettled(trainPromises);
        flattenedResults = trainResults
          .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
          .flatMap(r => r.value);
      } catch (e: any) {
        console.warn("⚠️ API fetch error:", e);
      }

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

        // 방향 화살표: updnLine '1' = 상행(▶), '2' = 하행(◀)
        const isUpward = train.updnLine === '1';
        const destination = train.lstnyNm || train.arrivalNm || '';
        const label = destination
          ? (isUpward ? `▶ ${destination}행` : `◀ ${destination}행`)
          : (isUpward ? '▶ 상행' : '◀ 하행');

        return {
          id: `train-${train.subwayId || 'sim'}-${train.trainNo}`,
          type: 'subway' as const,
          nextPos: coord,
          lineName: train.subwayNm,
          lineColor: lineColor,
          label,
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
        
        const staticLine = SUBWAY_LINES.find(l => l.name === train.subwayNm || normalizeLineName(l.name) === normalizeLineName(train.subwayNm));
        const lineColor = (staticLine?.color || "#3b82f6").replace('#', '').toUpperCase();

        const isUpward = train.updnLine === '1';
        const destination = train.lstnyNm || train.arrivalNm?.replace('행', '') || '';
        const label = destination
          ? (isUpward ? `▶ ${destination}행` : `◀ ${destination}행`)
          : (isUpward ? '▶ 상행' : '◀ 하행');

        return {
          id: `train-sim-${train.trainNo}`,
          type: 'subway' as const,
          nextPos: coord,
          lineName: train.subwayNm,
          lineColor: lineColor,
          label,
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
          // 주요 노선 전체 커버 (1~9호선, 경의중앙, 수인분당, 신분당, 공항, 경춘 등)
          const SIMULATED_LINE_NAMES = ['1호선','2호선','3호선','4호선','5호선','6호선','7호선','8호선','9호선',
            '경의중앙선','수인분당선','신분당선','공항철도','경춘선','신림선','우이신설선','인천1호선','인천2호선'];
          const linesToSimulate = SUBWAY_LINES.filter(l => SIMULATED_LINE_NAMES.includes(l.name));
          // 중복 이름 제거 (1호선이 여러 구간으로 나뉜 경우 첫 번째만 사용)
          const seen = new Set<string>();
          
          linesToSimulate.forEach(line => {
              if (seen.has(line.name)) return;
              if (!line.stations || line.stations.length < 4) return;
              seen.add(line.name);

              // 역 간격을 두어 열차 배치 (노선 길이에 따라 적절히)
              const step = Math.max(1, Math.floor(line.stations.length / 8));
              for (let i = 0; i < line.stations.length; i += step) {
                  const direction = (i % 2 === 0) ? 1 : -1;
                  this.simulatedTrains!.push({
                      subwayId: line.id,
                      subwayNm: line.name,
                      currentStationIndex: i,
                      direction,
                      trainNo: `SIM-${line.id}-${i}`,
                  });
              }
          });
      } else {
         // 매 폴링 사이클마다 한 역씩 이동
         this.simulatedTrains.forEach(train => {
             const line = SUBWAY_LINES.find(l => l.id === train.subwayId);
             if (line) {
                let nextIndex = train.currentStationIndex + train.direction;
                if (nextIndex < 0 || nextIndex >= line.stations.length) {
                    train.direction *= -1;
                    nextIndex = train.currentStationIndex + train.direction;
                }
                train.currentStationIndex = Math.max(0, Math.min(line.stations.length - 1, nextIndex));
             }
         });
      }

      const results: any[] = [];
      this.simulatedTrains.forEach(train => {
          const line = SUBWAY_LINES.find(l => l.id === train.subwayId);
          if (line) {
             const idx = train.currentStationIndex;
             const station = line.stations[idx];
             // 종착역: 방향에 따라 맨 앞 or 맨 뒤 역
             const terminalStation = train.direction > 0
               ? line.stations[line.stations.length - 1]
               : line.stations[0];
             
             results.push({
                 subwayId: train.subwayId,
                 subwayNm: train.subwayNm,
                 statnNm: station.name,
                 trainNo: train.trainNo,
                 lstnyNm: terminalStation.name,
                 updnLine: train.direction > 0 ? '1' : '2',
                 trainSttus: '1',
             });
          }
      });
      return results;
  }
}

export const transitRealtimeService = new TransitRealtimeService();
