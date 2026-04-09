import { EventEmitter } from 'events';
import { fetchTrainPositions } from './arrivalApi';
import { MetropolitanBusService } from './busApi';

import { SUBWAY_LINES } from '@/data/subway-lines';
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

// ============================================================
// 🚀 정적 데이터 사전 인덱싱 (모듈 로드 시 1회 실행)
// ============================================================
// 각 역명 → {coord, lineId, stationIndex} 매핑
interface StationMeta {
  coord: [number, number];
  lineId: string;
  lineName: string;
  stationIndex: number;
}
const STATION_META_MAP = new Map<string, StationMeta>();
const LINE_COLOR_MAP = new Map<string, string>();

(function buildIndex() {
  const seen = new Set<string>(); // 중복 노선명 처리
  for (const line of SUBWAY_LINES) {
    LINE_COLOR_MAP.set(line.name, line.color);
    line.stations.forEach((station, idx) => {
      // 동일 역명이 여러 노선에 있는 경우 먼저 발견된 것 우선
      const key = station.name;
      if (!STATION_META_MAP.has(key)) {
        STATION_META_MAP.set(key, {
          coord: [station.lng, station.lat],
          lineId: line.id,
          lineName: line.name,
          stationIndex: idx,
        });
      }
      // 괄호 제거 변형도 등록
      const clean = key.replace(/\(.*?\)/g, '').replace(/역$/, '').trim();
      if (clean !== key && !STATION_META_MAP.has(clean)) {
        STATION_META_MAP.set(clean, {
          coord: [station.lng, station.lat],
          lineId: line.id,
          lineName: line.name,
          stationIndex: idx,
        });
      }
    });
  }
  console.log(`📍 Station index built: ${STATION_META_MAP.size} entries`);
})();

// 역명으로 메타 즉시(동기) 조회
function getStationMeta(name: string): StationMeta | null {
  if (!name) return null;
  if (STATION_META_MAP.has(name)) return STATION_META_MAP.get(name)!;
  const clean = name.replace(/\(.*?\)/g, '').replace(/역$/, '').trim();
  return STATION_META_MAP.get(clean) || STATION_META_MAP.get(clean + '역') || null;
}

// 같은 노선에서 인접 역 좌표 반환 (prevPos 계산용)
function getAdjacentStationCoord(
  lineName: string,
  currentStationName: string,
  isDownward: boolean // true = 하행(index 증가), false = 상행(index 감소)
): [number, number] | null {
  const line = SUBWAY_LINES.find(l => l.name === lineName);
  if (!line) return null;
  const idx = line.stations.findIndex(s => s.name === currentStationName);
  if (idx < 0) return null;
  const prevIdx = isDownward ? idx - 1 : idx + 1;
  if (prevIdx < 0 || prevIdx >= line.stations.length) return null;
  const prev = line.stations[prevIdx];
  return [prev.lng, prev.lat];
}

// ============================================================
// TransitRealtimeService
// ============================================================
class TransitRealtimeService extends EventEmitter {
  private worker: Worker | null = null;
  private isRunning: boolean = false;
  private currentUnits: RealtimeUnit[] = [];
  private trackedBusRoutes: Set<string> = new Set();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private hasSentRealData: boolean = false;

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
  }

  public untrackBusRoute(cityCode: string, routeId: string) {
    this.trackedBusRoutes.delete(`${cityCode}:${routeId}`);
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // ✅ 1. 즉시 시뮬레이션 열차 표시 (이동 포함)
    this.sendSimulation();

    // ✅ 2. 즉시 실시간 폴링 시작
    this.poll();

    console.log('💎 TransitRealtimeService started (instant coord cache, per-line fire-and-forget)');
  }

  public stop() {
    this.isRunning = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  public getUnits() {
    return this.currentUnits;
  }

  // ============================================================
  // 단일 열차 유닛 빌드 (동기 - 캐시 조회)
  // ============================================================
  private buildUnit(train: any): any | null {
    const meta = getStationMeta(train.statnNm);
    if (!meta) return null;

    const coord = meta.coord;
    const lineName = train.subwayNm;
    const rawColor = LINE_COLOR_MAP.get(lineName) || '#3b82f6';
    const lineColor = rawColor.replace('#', '').toUpperCase();

    // 이전 역 좌표 계산 → prevPos로 사용, 열차가 처음 나타날 때도 이동 시작
    const isDownward = train.updnLine === '1';
    const prevPos = getAdjacentStationCoord(lineName, train.statnNm, isDownward) || coord;

    // 레이블: 종착역명 + 방향 화살표
    const destination = train.lstnyNm || train.statnTnm || '';
    const label = destination
      ? (isDownward ? `◀ ${destination}행` : `${destination}행 ▶`)
      : (isDownward ? '◀ 하행' : '상행 ▶');

    return {
      id: `train-${train.subwayId || 'sim'}-${train.trainNo}`,
      type: 'subway' as const,
      prevPos,
      nextPos: coord,
      lineName,
      lineColor,
      label,
      status: train.arvlCd || '99', // 0:진입, 1:도착, 2:출발, 99:운행중
    };
  }

  // ============================================================
  // 실시간 폴링 — 노선별 fire-and-forget, 완료 즉시 워커 업데이트
  // ============================================================
  private poll() {
    if (!this.isRunning) return;

    let anySuccess = false;

    // 각 노선을 독립적으로 폴링 — 응답 오는 즉시 화면 반영
    SUBWAY_POLLING_NAMES.forEach(lineName => {
      fetchTrainPositions(lineName)
        .then(trains => {
          if (!this.isRunning || trains.length === 0) return;
          
          const units = trains.map(t => this.buildUnit(t)).filter(Boolean);
          if (units.length === 0) return;

          if (!this.hasSentRealData) {
            // 첫 실제 데이터가 오면 시뮬레이션 제거
            this.hasSentRealData = true;
            this.worker?.postMessage({ type: 'CLEAR_SIMULATED' });
          }

          this.worker?.postMessage({ type: 'UPDATE_UNITS', data: units });
          anySuccess = true;
        })
        .catch(() => {});
    });

    // 버스 폴링
    if (this.trackedBusRoutes.size > 0) {
      Array.from(this.trackedBusRoutes).forEach(key => {
        const [cityCode, routeId] = key.split(':');
        Promise.all([
          MetropolitanBusService.fetchBusPositions(cityCode, routeId),
          MetropolitanBusService.fetchLocalRouteInfo(routeId)
        ]).then(([positions, routeInfo]) => {
          const busUnits = positions.map(pos => ({
            id: `bus-${routeId}-${pos.id}`,
            type: 'bus' as const,
            prevPos: [pos.lng, pos.lat] as [number, number],
            nextPos: [pos.lng, pos.lat] as [number, number],
            lineName: routeInfo?.no || routeId,
            lineColor: '3b82f6',
            label: pos.no || routeInfo?.no || 'BUS',
          }));
          if (busUnits.length > 0) {
            this.worker?.postMessage({ type: 'UPDATE_UNITS', data: busUnits });
          }
        }).catch(() => {});
      });
    }

    // 12초 후 재폴링
    this.pollTimer = setTimeout(() => {
      this.hasSentRealData = false; // 매 사이클 초기화 (시뮬 → 실제 전환 재처리)
      this.hasSentRealData = true;  // 실제로는 계속 실제 모드 유지
      this.poll();
    }, 12000);
  }

  // ============================================================
  // 시뮬레이션 — prevPos/nextPos 모두 설정해 즉시 이동
  // ============================================================
  private simulatedTrains: any[] | null = null;

  private sendSimulation() {
    const results = this.generateSimResults();
    const units = results.map(train => this.buildUnit(train)).filter(Boolean);
    if (units.length > 0) {
      this.worker?.postMessage({ type: 'UPDATE_UNITS', data: units });
      console.log(`🎭 Simulation: ${units.length} trains rendered`);
    }
  }

  private generateSimResults(): any[] {
    const LINE_NAMES = [
      '1호선','2호선','3호선','4호선','5호선','6호선','7호선','8호선','9호선',
      '경의중앙선','수인분당선','신분당선','공항철도','경춘선','신림선','우이신설선','인천1호선','인천2호선'
    ];

    if (!this.simulatedTrains) {
      this.simulatedTrains = [];
      const seen = new Set<string>();

      for (const line of SUBWAY_LINES) {
        if (!LINE_NAMES.includes(line.name)) continue;
        if (seen.has(line.name)) continue;
        if (!line.stations || line.stations.length < 4) continue;
        seen.add(line.name);

        const step = Math.max(1, Math.floor(line.stations.length / 10));
        for (let i = 0; i < line.stations.length; i += step) {
          const direction = (i % 2 === 0) ? 1 : -1;
          this.simulatedTrains.push({
            subwayId: line.id,
            subwayNm: line.name,
            currentStationIndex: i,
            direction,
            trainNo: `SIM-${line.id}-${i}`,
          });
        }
      }
    } else {
      // 매 12초마다 한 역 전진
      for (const train of this.simulatedTrains) {
        const line = SUBWAY_LINES.find(l => l.id === train.subwayId);
        if (!line) continue;
        let next = train.currentStationIndex + train.direction;
        if (next < 0 || next >= line.stations.length) {
          train.direction *= -1;
          next = train.currentStationIndex + train.direction;
        }
        train.currentStationIndex = Math.max(0, Math.min(line.stations.length - 1, next));
      }
    }

    const results: any[] = [];
    for (const train of this.simulatedTrains) {
      const line = SUBWAY_LINES.find(l => l.id === train.subwayId);
      if (!line) continue;
      const idx = train.currentStationIndex;
      const station = line.stations[idx];
      const terminal = train.direction > 0
        ? line.stations[line.stations.length - 1]
        : line.stations[0];

      results.push({
        subwayId: train.subwayId,
        subwayNm: line.name,
        statnNm: station.name,
        trainNo: train.trainNo,
        lstnyNm: terminal.name,
        statnTnm: terminal.name,
        updnLine: train.direction > 0 ? '1' : '0',
        trainSttus: '1',
      });
    }
    return results;
  }
}

export const transitRealtimeService = new TransitRealtimeService();
