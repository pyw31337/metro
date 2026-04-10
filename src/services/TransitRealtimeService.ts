import { EventEmitter } from 'events';
import { fetchTrainPositions } from './arrivalApi';
import { MetropolitanBusService } from './busApi';
import { SUBWAY_LINES } from '@/data/subway-lines';

// ─────────────────────────────────────────────────────────────────────────────
// 공개 인터페이스
// ─────────────────────────────────────────────────────────────────────────────
export interface RealtimeUnit {
  id: string;
  type: 'bus' | 'subway';
  pos: [number, number];
  bearing: number;
  label: string;
  lineName: string;
  lineColor: string;
  isSimulated: boolean;   // 시뮬레이션 열차 여부
  opacity: number;        // 페이드 인/아웃 (0~1)
  updnLine?: string;
  currentStationName?: string;
}

// 서비스 전체 시뮬레이션 상태 (UI에서 구독 가능)
export type SimStatus = 'starting' | 'simulated' | 'mixed' | 'live';

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────
const POLLING_INTERVAL_MS = 12_500;
const STAGGER_MS          = 150;    // 노선 간 폴링 간격
const SIM_EXPIRE_MS       = 90_000; // 90초 후 실측 없으면 시뮬 유지 (이미 표시 중이므로 OK)
const REAL_EXPIRE_MS      = 90_000; // 90초 이상 업데이트 없으면 실측 열차 제거

const SUBWAY_POLLING_NAMES = [
  '1호선', '2호선', '3호선', '4호선', '5호선',
  '6호선', '7호선', '8호선', '9호선',
  '경의중앙선', '공항철도', '수인분당선', '신분당선',
  '경춘선', '신림선', '우이신설선',
];

// ─────────────────────────────────────────────────────────────────────────────
// 정적 인덱스 (모듈 로드 시 1회 빌드)
// ─────────────────────────────────────────────────────────────────────────────
interface StationMeta {
  coord: [number, number];
  lineId: string;
  lineName: string;
  stationIndex: number;
}

const STATION_META = new Map<string, StationMeta>();
const LINE_COLOR   = new Map<string, string>();
const LINE_BY_NAME = new Map(SUBWAY_LINES.map(l => [l.name, l]));
const LINE_BY_ID   = new Map(SUBWAY_LINES.map(l => [l.id,   l]));

(function buildIndex() {
  for (const line of SUBWAY_LINES) {
    LINE_COLOR.set(line.name, line.color);
    line.stations.forEach((station, idx) => {
      const key = station.name;
      if (!STATION_META.has(key)) {
        STATION_META.set(key, {
          coord: [station.lng, station.lat],
          lineId: line.id,
          lineName: line.name,
          stationIndex: idx,
        });
      }
      // 괄호 제거 + 역 접미사 제거 별칭도 등록
      const alias = key.replace(/\(.*?\)/g, '').replace(/역$/, '').trim();
      if (alias !== key && !STATION_META.has(alias)) {
        STATION_META.set(alias, STATION_META.get(key)!);
      }
    });
  }
})();

function getStationMeta(name: string): StationMeta | null {
  if (!name) return null;
  if (STATION_META.has(name)) return STATION_META.get(name)!;
  const clean = name.replace(/\(.*?\)/g, '').replace(/역$/, '').trim();
  return STATION_META.get(clean) ?? STATION_META.get(clean + '역') ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 방향 파싱 — 숫자형 / 한국어 문자열 모두 처리
// ─────────────────────────────────────────────────────────────────────────────
function parseIsDownward(updnLine: string | undefined): boolean {
  if (!updnLine) return true;
  const v = updnLine.trim();
  // 숫자형: 1 = 하행/외선
  if (v === '1') return true;
  if (v === '0') return false;
  // 문자형
  if (v.includes('하행') || v.includes('외선') || v.includes('outer')) return true;
  if (v.includes('상행') || v.includes('내선') || v.includes('inner')) return false;
  return true; // 알 수 없으면 하행으로 기본 처리
}

// 인접 역 좌표 반환
function getAdjacentCoord(
  lineName: string,
  stationName: string,
  isDownward: boolean
): [number, number] | null {
  const line = LINE_BY_NAME.get(lineName);
  if (!line) return null;
  const idx = line.stations.findIndex(s => s.name === stationName);
  if (idx < 0) return null;
  const prevIdx = isDownward ? idx - 1 : idx + 1;
  if (prevIdx < 0 || prevIdx >= line.stations.length) return null;
  const s = line.stations[prevIdx];
  return [s.lng, s.lat];
}

function getNextCoord(
  lineName: string,
  stationName: string,
  isDownward: boolean
): [number, number] | null {
  const line = LINE_BY_NAME.get(lineName);
  if (!line) return null;
  const idx = line.stations.findIndex(s => s.name === stationName);
  if (idx < 0) return null;
  const nextIdx = isDownward ? idx + 1 : idx - 1;
  if (nextIdx < 0 || nextIdx >= line.stations.length) return null;
  const s = line.stations[nextIdx];
  return [s.lng, s.lat];
}

// ─────────────────────────────────────────────────────────────────────────────
// 열차 유닛 빌드
// ─────────────────────────────────────────────────────────────────────────────
function buildUnit(train: any, isSimulated: boolean): any | null {
  const meta = getStationMeta(train.statnNm);
  if (!meta) return null;

  const coord    = meta.coord;
  const lineName = train.subwayNm;
  const color    = (LINE_COLOR.get(lineName) ?? '#3b82f6').replace('#', '').toUpperCase();

  const isDownward = parseIsDownward(train.updnLine);
  const prevPos    = getAdjacentCoord(lineName, train.statnNm, isDownward) ?? coord;
  const futurePos  = getNextCoord(lineName, train.statnNm, isDownward) ?? coord;

  const dest  = train.lstnyNm ?? train.statnTnm ?? '';
  const arrow = isDownward ? '◀' : '▶';
  const label = dest ? `${arrow} ${dest}행` : (isDownward ? '◀ 하행' : '상행 ▶');

  return {
    id: `train-${train.subwayId ?? 'u'}-${train.trainNo}`,
    type: 'subway' as const,
    prevPos,
    nextPos: coord,
    futurePos,
    lineName,
    lineColor: color,
    label,
    status: train.arvlCd ?? '99',
    updnLine: train.updnLine,
    currentStationName: train.statnNm,
    isSimulated,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TransitRealtimeService
// ─────────────────────────────────────────────────────────────────────────────
class TransitRealtimeService extends EventEmitter {
  private worker: Worker | null = null;
  private isRunning = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private trackedBusRoutes = new Set<string>();

  // 노선별 실제 데이터 수신 여부 추적
  private linesWithRealData = new Set<string>();
  // 전체 시뮬레이션 상태
  private _simStatus: SimStatus = 'starting';

  // 시뮬레이션 열차 상태 (재사용)
  private simTrains: any[] | null = null;

  constructor() {
    super();
    if (typeof window !== 'undefined') this._initWorker();
  }

  private _initWorker() {
    this.worker = new Worker(
      new URL('../workers/transit-processor.worker.ts', import.meta.url)
    );
    this.worker.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'TICK_UPDATE') {
        this.emit('update', data as RealtimeUnit[]);
      } else if (type === 'SIM_STATUS') {
        this._simStatus = data as SimStatus;
        this.emit('simStatus', this._simStatus);
      }
    };
  }

  get simStatus(): SimStatus { return this._simStatus; }

  // ───── 공개 API ─────
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // 즉시 시뮬레이션 열차 표시
    this._sendSimulation();

    // 즉시 첫 폴링 시작
    this._poll();
  }

  stop() {
    this.isRunning = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.worker?.postMessage({ type: 'STOP' });
  }

  trackBusRoute(cityCode: string, routeId: string) {
    this.trackedBusRoutes.add(`${cityCode}:${routeId}`);
  }

  untrackBusRoute(cityCode: string, routeId: string) {
    this.trackedBusRoutes.delete(`${cityCode}:${routeId}`);
  }

  // ───── 시뮬레이션 ─────
  private _sendSimulation() {
    const results = this._generateSimResults();
    const units   = results.map(t => buildUnit(t, true)).filter(Boolean);
    if (units.length > 0) {
      this.worker?.postMessage({ type: 'UPDATE_UNITS', data: units });
      this._updateSimStatus();
    }
  }

  private _generateSimResults(): any[] {
    if (!this.simTrains) {
      this.simTrains = [];
      const seen = new Set<string>();
      for (const line of SUBWAY_LINES) {
        if (seen.has(line.name)) continue;
        if (!line.stations || line.stations.length < 4) continue;
        seen.add(line.name);

        const step = Math.max(1, Math.floor(line.stations.length / 10));
        for (let i = 0; i < line.stations.length; i += step) {
          this.simTrains.push({
            lineId: line.id, lineName: line.name,
            stationIndex: i,
            direction: i % 2 === 0 ? 1 : -1,
            trainNo: `SIM-${line.id}-${i}`,
          });
        }
      }
    } else {
      // 매 폴링 주기마다 한 역씩 이동
      for (const t of this.simTrains) {
        const line = LINE_BY_ID.get(t.lineId);
        if (!line) continue;
        let next = t.stationIndex + t.direction;
        if (next < 0 || next >= line.stations.length) {
          t.direction *= -1;
          next = t.stationIndex + t.direction;
        }
        t.stationIndex = Math.max(0, Math.min(line.stations.length - 1, next));
      }
    }

    const results: any[] = [];
    for (const t of this.simTrains) {
      const line = LINE_BY_ID.get(t.lineId);
      if (!line) continue;
      const st       = line.stations[t.stationIndex];
      const terminal = t.direction > 0
        ? line.stations[line.stations.length - 1]
        : line.stations[0];
      results.push({
        subwayId : t.lineId,
        subwayNm : line.name,
        statnNm  : st.name,
        trainNo  : t.trainNo,
        lstnyNm  : terminal.name,
        updnLine : t.direction > 0 ? '1' : '0',
        trainSttus: '1',
      });
    }
    return results;
  }

  // ───── 실시간 폴링 ─────
  private _poll() {
    if (!this.isRunning) return;

    // 지하철 노선 순차 폴링 (STAGGER_MS 간격)
    SUBWAY_POLLING_NAMES.forEach((lineName, i) => {
      setTimeout(() => {
        if (!this.isRunning) return;

        fetchTrainPositions(lineName)
          .then(trains => {
            if (!this.isRunning || trains.length === 0) return;

            const units = trains.map(t => buildUnit(t, false)).filter(Boolean);
            if (units.length === 0) return;

            // 이 노선에 실측 데이터 도착 → 시뮬 열차 제거 요청
            if (!this.linesWithRealData.has(lineName)) {
              this.linesWithRealData.add(lineName);
              this.worker?.postMessage({ type: 'CLEAR_LINE_SIM', lineName });
              this._updateSimStatus();
            }

            this.worker?.postMessage({ type: 'UPDATE_UNITS', data: units });
          })
          .catch(() => {});

      }, i * STAGGER_MS);
    });

    // 버스 폴링
    if (this.trackedBusRoutes.size > 0) {
      Array.from(this.trackedBusRoutes).forEach((key, i) => {
        const [cityCode, routeId] = key.split(':');
        setTimeout(() => {
          Promise.all([
            MetropolitanBusService.fetchBusPositions(cityCode, routeId),
            MetropolitanBusService.fetchLocalRouteInfo(routeId),
          ]).then(([positions, routeInfo]) => {
            const busUnits = positions.map(pos => ({
              id: `bus-${routeId}-${pos.id}`,
              type: 'bus' as const,
              prevPos:   [pos.lng, pos.lat] as [number, number],
              nextPos:   [pos.lng, pos.lat] as [number, number],
              futurePos: [pos.lng, pos.lat] as [number, number],
              lineName:  routeInfo?.no ?? routeId,
              lineColor: '3b82f6',
              label:     pos.no ?? routeInfo?.no ?? 'BUS',
              isSimulated: false,
            }));
            if (busUnits.length > 0) {
              this.worker?.postMessage({ type: 'UPDATE_UNITS', data: busUnits });
            }
          }).catch(() => {});
        }, (SUBWAY_POLLING_NAMES.length + i) * STAGGER_MS);
      });
    }

    // 다음 폴링 예약
    this.pollTimer = setTimeout(() => {
      // 시뮬레이션도 주기에 맞춰 전진
      if (this.simTrains) this._sendSimulation();
      this._poll();
    }, POLLING_INTERVAL_MS);
  }

  private _updateSimStatus() {
    const total = SUBWAY_POLLING_NAMES.length;
    const live  = this.linesWithRealData.size;

    let status: SimStatus;
    if (live === 0)            status = 'simulated';
    else if (live < total / 2) status = 'mixed';
    else if (live >= total)    status = 'live';
    else                       status = 'mixed';

    if (status !== this._simStatus) {
      this._simStatus = status;
      this.emit('simStatus', status);
    }
  }
}

export const transitRealtimeService = new TransitRealtimeService();
