import { EventEmitter } from 'events';
import { fetchTrainPositions } from './arrivalApi';
import { MetropolitanBusService } from './busApi';
import { SUBWAY_LINES } from '@/data/subway-lines';
import { normStation } from '@/data/stationRegistry';
import { getBusRouteStyle } from '@/utils/busRouting';

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
const DWELL_MS            = 30_000; // 역 정차 시간 기본값 (30초)

// ─────────────────────────────────────────────────────────────────────────────
// 구간 소요시간 계산 — 노선별 실측 기반 평균 속도(km/h) + Haversine 거리
// ─────────────────────────────────────────────────────────────────────────────
const LINE_SPEED_KMH: Record<string, number> = {
  '1호선': 40,  '2호선': 32,  '3호선': 38,  '4호선': 38,
  '5호선': 38,  '6호선': 32,  '7호선': 38,  '8호선': 32,
  '9호선': 42,  '경의중앙선': 55, '공항철도': 75,
  '수인분당선': 45, '신분당선': 72, '경춘선': 55,
  '신림선': 35, '우이신설선': 30,
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6371;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 두 좌표([lng,lat] GeoJSON 형식) 간 실제 열차 주행 소요시간(ms) 추정.
 * 최소 45초 / 최대 5분으로 클램프.
 */
function calcSegmentMs(lineName: string, from: [number, number], to: [number, number]): number {
  const speed = LINE_SPEED_KMH[lineName] ?? 40;
  const dist  = haversineKm(from[1], from[0], to[1], to[0]);
  if (dist < 0.05) return 60_000; // 사실상 같은 역 — 1분 기본
  const ms = (dist / speed) * 3_600_000;
  return Math.max(45_000, Math.min(300_000, Math.round(ms / 1000) * 1000));
}

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
// Per-line O(1) station index: Map<lineName, Map<stationName, stationIndex>>
const LINE_STATION_IDX: Map<string, Map<string, number>> = new Map(
  SUBWAY_LINES.map(l => [l.name, new Map(l.stations.map((s, i) => [s.name, i]))])
);

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
      const alias = normStation(key);
      if (alias !== key && !STATION_META.has(alias)) {
        STATION_META.set(alias, STATION_META.get(key)!);
      }
    });
  }
})();

function getStationMeta(name: string): StationMeta | null {
  if (!name) return null;
  if (STATION_META.has(name)) return STATION_META.get(name)!;
  const clean = normStation(name);
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
function resolveLineStationIdx(lineName: string, stationName: string): number {
  const m = LINE_STATION_IDX.get(lineName);
  if (!m) return -1;
  // exact → normalized (역 suffix, 괄호 제거)
  return m.get(stationName) ?? m.get(normStation(stationName)) ?? -1;
}

function getAdjacentCoord(
  lineName: string,
  stationName: string,
  isDownward: boolean
): [number, number] | null {
  const line = LINE_BY_NAME.get(lineName);
  if (!line) return null;
  const idx = resolveLineStationIdx(lineName, stationName);
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
  const idx = resolveLineStationIdx(lineName, stationName);
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

  const coord = meta.coord;
  // API subwayNm might have dots/middots ("경의·중앙선") — normalise to canonical
  const rawLineName = train.subwayNm as string;
  const lineName = LINE_COLOR.has(rawLineName)
    ? rawLineName
    : (meta.lineName ?? rawLineName);
  const color = (LINE_COLOR.get(lineName) ?? LINE_COLOR.get(meta.lineName) ?? '#3b82f6').replace('#', '').toUpperCase();

  const isDownward = parseIsDownward(train.updnLine);
  const prevAdj    = getAdjacentCoord(lineName, train.statnNm, isDownward);
  const nextAdj    = getNextCoord(lineName, train.statnNm, isDownward);
  const prevPos    = prevAdj ?? coord;
  const futurePos  = nextAdj ?? coord;

  // 구간 소요시간: 노선별 평균 속도 + Haversine 거리로 계산
  const segmentMs     = prevAdj ? calcSegmentMs(lineName, prevAdj, coord)   : 90_000;
  const nextSegmentMs = nextAdj ? calcSegmentMs(lineName, coord, nextAdj)   : 90_000;

  const dest  = train.lstnyNm ?? train.statnTnm ?? '';
  const arrow = isDownward ? '◀' : '▶';
  const label = dest ? `${arrow} ${dest}행` : (isDownward ? '◀ 하행' : '상행 ▶');

  const arvlCd = train.arvlCd ?? '99';

  // arvlCd → initial animation ratio (3단계 모델 기준)
  // '0' 진입:      역 도착 직전 ~85% 지점
  // '1' 당역:      역 도착 = dwell 시작 (ratio 1.0)
  // '2' 출발:      dwell 종료 직후 (ratio 1.05 ≈ nextSegmentMs의 5% 진행)
  // '3' 전역출발:  이전 역 출발 직후 ~25% 지점
  // '99' 운행중:   구간 중간 ~50% 추정
  const ARVL_RATIO: Record<string, number> = { '0': 0.85, '1': 1.0, '2': 1.05, '3': 0.25 };
  const initialRatio = ARVL_RATIO[arvlCd] ?? 0.5;

  // 노선 위 1차원 순서 정보: 워커에서 충돌 방지에 사용
  const stationIdx = LINE_STATION_IDX.get(lineName)?.get(train.statnNm)
    ?? LINE_STATION_IDX.get(lineName)?.get(normStation(train.statnNm))
    ?? 0;
  const lineDir = isDownward ? 1 : -1;

  return {
    id: `train-${train.subwayId ?? 'u'}-${train.trainNo || `${train.statnNm}-${train.updnLine ?? '0'}`}`,
    type: 'subway' as const,
    prevPos,
    nextPos: coord,
    futurePos,
    lineName,
    lineColor: color,
    label,
    status: arvlCd,
    initialRatio,
    segmentMs,
    nextSegmentMs,
    dwellMs: DWELL_MS,
    updnLine: train.updnLine,
    currentStationName: train.statnNm,
    isSimulated,
    lineStationIdx: stationIdx,
    lineDir,
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
            const routeNo = routeInfo?.no ?? routeId;
            const busColor = getBusRouteStyle(routeNo).bg.replace('#', '').toUpperCase();
            const busUnits = positions.map(pos => ({
              id: `bus-${routeId}-${pos.id}`,
              type: 'bus' as const,
              prevPos:   [pos.lng, pos.lat] as [number, number],
              nextPos:   [pos.lng, pos.lat] as [number, number],
              futurePos: [pos.lng, pos.lat] as [number, number],
              lineName:  routeNo,
              lineColor: busColor,
              label:     routeNo,
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
