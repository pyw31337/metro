import { EventEmitter } from 'events';
import { fetchTrainPositions, fetchArrivalBasedPositions, TrainPosition } from './arrivalApi';
import { lagMsFrom, getSeoulApiIssue, onSeoulApiIssue, SeoulApiIssue, hasRealKey, usingPublicProxy } from './seoulApi';
import { MetropolitanBusService } from './busApi';
import { SUBWAY_LINES } from '@/data/subway-lines';
import { resolveMotion, edgePath } from '@/geo/lineNetwork';
import { LngLat, cumulative, bearing } from '@/geo/geoMath';
import { distanceAt, type MotionSpec } from '@/geo/trainMotion';
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
  colorProgress: number;  // 0=회색, 1=노선색 (베어링 초기화 후 800ms 전환)
  isDwelling: boolean;    // 역사 정차 중 (Phase 2) — 아이콘 ∧→|| 전환
  updnLine?: string;
  currentStationName?: string;
  /** 마지막 실측 이벤트 요약 (예: "강남 도착") */
  eventText?: string;
  /** 마지막 실측 이벤트 시각 (epoch ms, 없으면 undefined) */
  eventTs?: number;
  /** 보고 후 20초 이상 지나 화면 위치가 추정치인지 */
  estimated?: boolean;
  /** run-in / dwell / run-out / hold */
  phase?: string;
  nextStationName?: string | null;
}

// 서비스 전체 시뮬레이션 상태 (UI에서 구독 가능)
export type SimStatus = 'starting' | 'simulated' | 'mixed' | 'live';
export type { SeoulApiIssue };

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────
// 위치 API 는 역 이벤트(진입/도착/출발) 단위로만 갱신되므로 12.5초보다 촘촘히 불러도 정확도 이득이 없다.
// 20초 주기 + 화면에 보이는 노선만 + 탭 비활성 시 일시정지로 호출량을 줄인다.
const POLLING_INTERVAL_MS = 20_000;
/** 공개 CORS 프록시 사용 시(느리고 요청 제한이 있음) 폴링 간격 */
const POLLING_INTERVAL_PUBLIC_PROXY_MS = 30_000;
const STAGGER_MS          = 200;    // 노선 간 호출 간격 (공개 프록시에 동시 요청이 몰리지 않게)
const DWELL_MS            = 20_000; // 역 정차 시간 기본값 (도시철도 평균 20~30초)
const PROBE_EVERY_N_POLLS = 3;      // 도착 API 프로브는 3회 폴링마다 1번
const STALE_MS            = 10 * 60_000; // 10분 넘게 이벤트가 없으면 유령 열차로 보고 제외
const STALE_DWELL_MS      = 20 * 60_000; // 도착(정차) 상태는 종착역 대기 등을 고려해 20분

// ─────────────────────────────────────────────────────────────────────────────
// 구간 소요시간 — 1) 시간표 기반 실측(korail-travel-times.json) 2) 노선 평균속도 + 거리
// ─────────────────────────────────────────────────────────────────────────────
const LINE_SPEED_KMH: Record<string, number> = {
  '1호선': 40,  '2호선': 32,  '3호선': 38,  '4호선': 38,
  '5호선': 38,  '6호선': 32,  '7호선': 38,  '8호선': 32,
  '9호선': 42,  '경의중앙선': 55, '공항철도': 75,
  '수인분당선': 45, '신분당선': 72, '경춘선': 55,
  '신림선': 35, '우이신설선': 30,
  '서해선': 60, '경강선': 100, 'GTX-A': 150,
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

// 시간표에서 계산한 역간 평균 소요시간 (분). 키: `${노선}|${출발역}|${도착역}`
const TRAVEL_MIN = new Map<string, number>();
let travelTimesRequested = false;

function loadTravelTimes() {
  if (travelTimesRequested || typeof window === 'undefined') return;
  travelTimesRequested = true;
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  fetch(`${base}/data/korail-travel-times.json`)
    .then(r => (r.ok ? r.json() : []))
    .then((rows: { line: string; from: string; to: string; avgMin: number }[]) => {
      for (const r of rows) {
        if (!r || !(r.avgMin > 0)) continue;
        const a = normStation(r.from), b = normStation(r.to);
        TRAVEL_MIN.set(`${r.line}|${a}|${b}`, r.avgMin);
        if (!TRAVEL_MIN.has(`${r.line}|${b}|${a}`)) TRAVEL_MIN.set(`${r.line}|${b}|${a}`, r.avgMin);
      }
    })
    .catch(() => { /* 추정치로 동작 */ });
}

/**
 * 두 역 사이 주행 시간(ms). 시간표 기반 값이 있으면 정차시간을 빼고 사용, 없으면 거리/평균속도.
 * 최소 40초 / 최대 6분으로 클램프.
 */
function segmentMsBetween(
  lineName: string,
  fromName: string, from: [number, number],
  toName: string, to: [number, number],
): number {
  const tt = TRAVEL_MIN.get(`${lineName}|${normStation(fromName)}|${normStation(toName)}`);
  let ms: number;
  if (tt) {
    ms = tt * 60_000 - DWELL_MS;
  } else {
    const speed = LINE_SPEED_KMH[lineName] ?? 40;
    const dist  = haversineKm(from[1], from[0], to[1], to[0]);
    if (dist < 0.05) return 60_000;
    // 가감속을 고려해 15초 가산
    ms = (dist / speed) * 3_600_000 + 15_000;
  }
  return Math.max(40_000, Math.min(360_000, Math.round(ms / 1000) * 1000));
}

const SUBWAY_POLLING_NAMES = [
  '1호선', '2호선', '3호선', '4호선', '5호선',
  '6호선', '7호선', '8호선', '9호선',
  '경의중앙선', '공항철도', '수인분당선', '신분당선',
  '경춘선', '신림선', '우이신설선',
  '서해선', '경강선', 'GTX-A',
];

// 도착 API 프로브 스테이션 — 위치 API 누락 열차(종착역 대기) 보완
// 서울시 도착 API는 서울시 밖 역을 제공하지 않으므로(공식 안내: 광명·서동탄·춘천 등 미제공)
// 서울시 안에 있는 종착역만 남겨 헛호출을 없앴다.
const ARRIVAL_PROBE_STATIONS = [
  '성수', '신설동', '까치산',   // 2호선 지선
  '오금',                       // 3호선
  '방화', '마천',               // 5호선
  '응암', '신내',               // 6호선
  '개화', '중앙보훈병원',       // 9호선
  '청량리',                     // 수인분당선·경춘선·경의중앙선
  '신사',                       // 신분당선
  '샛강', '관악산',             // 신림선
  '북한산우이',                 // 우이신설선
];

// ─────────────────────────────────────────────────────────────────────────────
// 정적 인덱스 (모듈 로드 시 1회 빌드)
// ─────────────────────────────────────────────────────────────────────────────
const LINE_COLOR   = new Map<string, string>();
const STATION_META = new Map<string, { coord: [number, number]; lineName: string }>();

(function buildIndex() {
  for (const line of SUBWAY_LINES) {
    LINE_COLOR.set(line.name, line.color);
    for (const station of line.stations) {
      const meta = { coord: [station.lng, station.lat] as [number, number], lineName: line.name };
      if (!STATION_META.has(station.name)) STATION_META.set(station.name, meta);
      const alias = normStation(station.name);
      if (!STATION_META.has(alias)) STATION_META.set(alias, meta);
    }
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// 이벤트 → 타임라인 (노선 선형 위의 경로 + 시간)
//
// 보고된 역(k)을 기준으로 [직전 역 → k → 다음 역] 경로를 노선 선형에서 잘라 쓴다.
//   Phase 1  [0, segIn)            : 직전 역 → k  주행
//   Phase 2  [segIn, segIn+dwell)  : k 정차
//   Phase 3  [segIn+dwell, …)      : k → 다음 역 주행
//
// trainSttus 별 이벤트 시점:
//   '3' 전역출발 : 0 (직전 역을 막 떠남)       barvlDt 있으면 segIn - barvlDt
//   '0' 진입     : 도착 직전                   barvlDt 있으면 segIn - barvlDt
//   '1' 도착     : segIn (정차 시작)
//   '2' 출발     : segIn + dwell
// 여기에 (현재 - recptnDt) 만큼 더 진행시킨다(서울시 보정 가이드). 미래 시각은 0으로 클램프.
//
// 외삽 한계 (화면 신뢰도를 위해 보수적으로):
//   - '0'/'3'(k 로 오는 중): k 에서 멈춘다
//   - '1'/'2'(k 에 있음/떠남): 다음 역에서 멈춘다
//   - 직전/다음 역을 확신할 수 없으면(분기역인데 종착역 불명 등) 경로를 만들지 않고 k 에 둔다
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_TEXT: Record<string, string> = { '0': '진입', '1': '도착', '2': '출발', '3': '전역 출발' };

function elapsedAtEvent(sttus: string, segMs: number, dwellMs: number, barvlDt?: number): number {
  if ((sttus === '0' || sttus === '3') && barvlDt !== undefined && barvlDt > 0) {
    return Math.max(0, segMs - barvlDt * 1000);
  }
  switch (sttus) {
    case '3': return 0;
    case '0': return Math.max(segMs * 0.8, segMs - 20_000);
    case '1': return segMs;
    case '2': return segMs + dwellMs;
    default:  return segMs * 0.5;
  }
}

interface Timeline {
  motion: Omit<MotionSpec, 'startMs'>;
  elapsedMs: number;        // 현재 시점의 타임라인 위치 (maxElapsed 로 클램프됨)
  reportedElapsedMs: number; // 보고 시점(지연 0)의 타임라인 위치
  stationName: string;      // 보고된 역
  prevName: string | null;
  nextName: string | null;
  reason: string;
  directionBearing: number;
}

function pathLength(path: LngLat[] | null): number {
  if (!path) return 0;
  const c = cumulative(path);
  return c[c.length - 1];
}

function resolveTimeline(
  lineName: string,
  stationName: string,
  destName: string,
  updnLine: string | undefined,
  sttus: string,
  lagMs: number,
  barvlDt?: number,
): Timeline | null {
  const m = resolveMotion(lineName, stationName, destName, updnLine);
  if (!m) return null;
  const node = (k: string) => m.graph.nodes.get(k)!;
  const inPath  = m.prev ? edgePath(lineName, m.prev, m.at) : null;
  const outPath = m.next ? edgePath(lineName, m.at, m.next) : null;
  const segIn  = inPath  ? segmentMsBetween(lineName, node(m.prev!).name, node(m.prev!).coord, node(m.at).name, node(m.at).coord) : 0;
  const segOut = outPath ? segmentMsBetween(lineName, node(m.at).name, node(m.at).coord, node(m.next!).name, node(m.next!).coord) : 0;
  const path: LngLat[] = [...(inPath ?? [node(m.at).coord]), ...(outPath ? outPath.slice(1) : [])];

  const approaching = sttus === '0' || sttus === '3' || !(sttus in STATUS_TEXT);
  const maxElapsed = approaching ? segIn + DWELL_MS : segIn + DWELL_MS + segOut;
  const atEvent = elapsedAtEvent(sttus, segIn, DWELL_MS, barvlDt);
  const elapsed = Math.min(atEvent + Math.max(0, lagMs), maxElapsed);

  const bFrom = m.prev ? node(m.prev).coord : node(m.at).coord;
  const bTo   = m.next ? node(m.next).coord : node(m.at).coord;

  return {
    motion: { path, dIn: pathLength(inPath), dOut: pathLength(outPath), segInMs: segIn, dwellMs: DWELL_MS, segOutMs: segOut, maxElapsedMs: maxElapsed },
    elapsedMs: elapsed,
    reportedElapsedMs: Math.min(atEvent, maxElapsed),
    stationName: node(m.at).name,
    prevName: m.prev ? node(m.prev).name : null,
    nextName: m.next ? node(m.next).name : null,
    reason: m.reason,
    directionBearing: bearing(bFrom, bTo),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 열차 유닛 빌드
// ─────────────────────────────────────────────────────────────────────────────
function resolveLineName(rawLineName: string, stationName: string): string {
  if (LINE_COLOR.has(rawLineName)) return rawLineName;
  const compact = (rawLineName || '').replace(/[·\s]/g, '');
  if (LINE_COLOR.has(compact)) return compact;
  // middot("경의·중앙선") 또는 알 수 없는 변형 → 역 메타로 폴백
  const meta = STATION_META.get(stationName) ?? STATION_META.get(normStation(stationName));
  return meta?.lineName ?? rawLineName;
}

export interface LiveTrainUnit {
  id: string;
  type: 'subway';
  motion: MotionSpec;
  lineName: string;
  lineColor: string;
  label: string;
  status: string;
  eventKey: string;
  eventTs?: number;
  eventText: string;
  source?: string;
  updnLine?: string;
  currentStationName: string;
  nextStationName: string | null;
  isSimulated: false;
  directionBearing: number;
}

/** 실측 열차 (위치 API / 도착 API) */
function buildLiveUnit(train: TrainPosition, now: number): LiveTrainUnit | null {
  const lag = lagMsFrom(train.recptnDt, now);
  const lagMs = Number.isFinite(lag) ? lag : 0;
  const staleLimit = train.trainSttus === '1' ? STALE_DWELL_MS : STALE_MS;
  if (Number.isFinite(lag) && lag > staleLimit) return null; // 오래된 이벤트 → 유령 열차 방지

  const lineName = resolveLineName(train.subwayNm, train.statnNm);
  const dest = normStation((train.lstnyNm || '').replace(/종착$/, ''));
  const tl = resolveTimeline(lineName, train.statnNm, dest, train.updnLine, train.trainSttus, lagMs, train.barvlDt);
  if (!tl) return null; // 노선 그래프에서 역을 찾지 못하면 다른 곳에 그리지 않는다

  const color = (LINE_COLOR.get(lineName) ?? '#3b82f6').replace('#', '').toUpperCase();
  const label = dest ? `${dest}행` : (tl.nextName ? `${tl.nextName} 방면` : lineName);
  const eventTs = Number.isFinite(lag) ? now - lag : undefined;
  const sttusText = STATUS_TEXT[train.trainSttus];

  return {
    id: `train-${train.subwayId || lineName}-${train.trainNo}`,
    type: 'subway',
    motion: {
      ...tl.motion,
      startMs: now - tl.elapsedMs,
      reportedD: distanceAt({ ...tl.motion, startMs: 0 }, tl.reportedElapsedMs).d,
    },
    lineName,
    lineColor: color,
    label,
    status: train.trainSttus,
    // 같은 이벤트가 반복 보고되면 재기준하지 않도록 이벤트 키를 함께 보낸다
    eventKey: `${train.statnNm}|${train.trainSttus}|${train.recptnDt}|${tl.nextName ?? ''}`,
    eventTs,
    eventText: sttusText ? `${train.statnNm} ${sttusText}` : train.statnNm,
    source: train.source,
    updnLine: train.updnLine,
    currentStationName: tl.stationName,
    nextStationName: tl.nextName,
    isSimulated: false,
    directionBearing: tl.directionBearing,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TransitRealtimeService
// ─────────────────────────────────────────────────────────────────────────────
class TransitRealtimeService extends EventEmitter {
  private worker: Worker | null = null;
  private isRunning = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCount = 0;
  private trackedBusRoutes = new Set<string>();
  // 버스 이전 위치 캐시 — 인터폴레이션용
  private busLastPos = new Map<string, [number, number]>();

  // 노선별 실제 데이터 수신 여부 추적
  private linesWithRealData = new Set<string>();
  // 위치 API로 최근 갱신된 열차 (도착 API 보완 데이터가 덮어쓰지 않도록)
  private positionSeenAt = new Map<string, number>();
  // 전체 시뮬레이션 상태
  private _simStatus: SimStatus = 'starting';
  // viewport에 보이는 노선 목록 (null = 전체 폴링)
  private visibleLines: Set<string> | null = null;

  private unsubscribeIssue: (() => void) | null = null;
  private onVisibility = () => {
    if (!this.isRunning) return;
    if (document.visibilityState === 'visible') {
      // 복귀 즉시 갱신
      if (this.pollTimer) clearTimeout(this.pollTimer);
      this._poll();
    }
  };

  constructor() {
    super();
    if (typeof window !== 'undefined') {
      this._initWorker();
    }
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
  get apiIssue(): SeoulApiIssue { return getSeoulApiIssue(); }

  // ───── 공개 API ─────
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    loadTravelTimes();

    this.unsubscribeIssue = onSeoulApiIssue(issue => this.emit('apiIssue', issue));
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }

    // 시간표로 지어낸 '시뮬레이션 열차'는 더 이상 그리지 않는다.
    // 실측 데이터가 없으면 지도에 열차를 표시하지 않고 상태 표시로 알린다.

    // 즉시 첫 폴링 시작
    this._poll();
  }

  stop() {
    this.isRunning = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.unsubscribeIssue?.();
    this.unsubscribeIssue = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.worker?.postMessage({ type: 'STOP' });
  }

  /** 지도 화면이 보이지 않을 때 열차 위치 폴링을 멈춘다 (일일 호출 한도 절약) */
  private paused = false;
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused && this.isRunning) {
      if (this.pollTimer) clearTimeout(this.pollTimer);
      this._poll();
    }
  }

  /** viewport에 보이는 노선 목록 설정 — null이면 전체 폴링, 빈 Set이면 시뮬레이션만 */
  setVisibleLines(lines: string[] | null) {
    this.visibleLines = lines ? new Set(lines) : null;
  }

  /** 특정 노선을 즉시 재폴링 — 역/열차 클릭 시 해당 노선 데이터 우선 갱신 */
  refreshLine(lineName: string) {
    if (!this.isRunning) return;
    this._pollLine(lineName);
  }

  trackBusRoute(cityCode: string, routeId: string) {
    this.trackedBusRoutes.add(`${cityCode}:${routeId}`);
  }

  untrackBusRoute(cityCode: string, routeId: string) {
    this.trackedBusRoutes.delete(`${cityCode}:${routeId}`);
  }

  // ───── 실시간 폴링 ─────
  private _markLineLive(lineName: string) {
    if (this.linesWithRealData.has(lineName)) return;
    this.linesWithRealData.add(lineName);
    this.worker?.postMessage({ type: 'CLEAR_LINE_SIM', lineName });
    this._updateSimStatus();
  }

  /** 응답이 느린 경우(공개 프록시) 같은 노선 요청이 겹치지 않게 막는다 */
  private inflightLines = new Set<string>();

  private _pollLine(lineName: string) {
    if (this.inflightLines.has(lineName)) return;
    this.inflightLines.add(lineName);
    fetchTrainPositions(lineName)
      .finally(() => this.inflightLines.delete(lineName))
      .then(trains => {
        if (!this.isRunning || trains.length === 0) return;
        const now = Date.now();
        const units = trains.map(t => buildLiveUnit(t, now)).filter((u): u is LiveTrainUnit => u !== null);
        if (units.length === 0) return;
        for (const u of units) this.positionSeenAt.set(u.id, now);
        this._markLineLive(lineName);
        this.worker?.postMessage({ type: 'UPDATE_UNITS', data: units });
      })
      .catch(() => { /* 다음 폴링에서 재시도 */ });
  }

  private _poll() {
    if (!this.isRunning) return;

    // 탭이 백그라운드면 호출하지 않는다 (일일 호출 한도 절약)
    // 지도 화면이 꺼져 있을 때(도착 안내 화면)도 호출하지 않는다
    const hidden = this.paused || (typeof document !== 'undefined' && document.visibilityState === 'hidden');

    if (!hidden) {
      this.pollCount++;

      // 지하철 노선 순차 폴링 — viewport 필터 적용 (보이는 노선만, null이면 전체)
      const linesToPoll = this.visibleLines
        ? SUBWAY_POLLING_NAMES.filter(l => this.visibleLines!.has(l))
        : SUBWAY_POLLING_NAMES;

      linesToPoll.forEach((lineName, i) => {
        setTimeout(() => { if (this.isRunning) this._pollLine(lineName); }, i * STAGGER_MS);
      });

      // 버스 폴링
      if (this.trackedBusRoutes.size > 0) this._pollBuses(linesToPoll.length);

      // 도착 API 프로브 — 종착역 대기 열차 보완 (3회에 1번, 서울시 내 종착역만)
      // sample 키는 도착정보 API 에서 '서울'역만 응답하므로 실제 키가 있을 때만 호출한다.
      if (hasRealKey() && this.pollCount % PROBE_EVERY_N_POLLS === 1) this._probeTerminals();
    }

    // 다음 폴링 예약
    this.pollTimer = setTimeout(() => {
      this._poll();
    }, usingPublicProxy() ? POLLING_INTERVAL_PUBLIC_PROXY_MS : POLLING_INTERVAL_MS);
  }

  private _pollBuses(offset: number) {
    Array.from(this.trackedBusRoutes).forEach((key, i) => {
      const [cityCode, routeId] = key.split(':');
      setTimeout(() => {
        Promise.all([
          MetropolitanBusService.fetchBusPositions(cityCode, routeId),
          MetropolitanBusService.fetchLocalRouteInfo(routeId),
        ]).then(([positions, routeInfo]) => {
          const routeNo = routeInfo?.no ?? routeId;
          const busColor = getBusRouteStyle(routeNo).bg.replace('#', '').toUpperCase();
          const busUnits = positions.map(pos => {
            const unitId = `bus-${routeId}-${pos.id}`;
            const curPos: [number, number] = [pos.lng, pos.lat];
            const prev = this.busLastPos.get(unitId) ?? curPos;
            this.busLastPos.set(unitId, curPos);
            return {
              id: unitId,
              type: 'bus' as const,
              prevPos:   prev,
              nextPos:   curPos,
              futurePos: curPos,
              lineName:  routeNo,
              lineColor: busColor,
              label:     routeNo,
              isSimulated: false,
              // 폴링 주기 동안 prev→cur를 부드럽게 이동
              segmentMs:     POLLING_INTERVAL_MS,
              nextSegmentMs: POLLING_INTERVAL_MS,
              dwellMs:       0,
            };
          });
          const currentIds = new Set(busUnits.map(u => u.id));
          for (const k of this.busLastPos.keys()) {
            if (k.startsWith(`bus-${routeId}-`) && !currentIds.has(k)) this.busLastPos.delete(k);
          }
          if (busUnits.length > 0) {
            this.worker?.postMessage({ type: 'UPDATE_UNITS', data: busUnits });
          }
        }).catch(() => {});
      }, (offset + i) * STAGGER_MS);
    });
  }

  private _probeTerminals() {
    const PROBE_BATCH = 5;
    const PROBE_BATCH_GAP = 300; // ms
    const runProbeBatch = (stations: string[]) => {
      if (!this.isRunning) return;
      stations.forEach(async (stationName) => {
        try {
          const positions = await fetchArrivalBasedPositions(stationName);
          if (!positions.length) return;
          const now = Date.now();
          const units = positions
            .map(t => buildLiveUnit(t, now))
            .filter(Boolean)
            // 위치 API가 최근(60초) 갱신한 열차는 더 정확하므로 덮어쓰지 않는다
            .filter((u: any) => now - (this.positionSeenAt.get(u.id) ?? 0) > 60_000);
          if (!units.length) return;
          for (const unit of units as any[]) this._markLineLive(unit.lineName);
          this.worker?.postMessage({ type: 'UPDATE_UNITS', data: units });
        } catch { /* noop */ }
      });
    };
    for (let b = 0; b < ARRIVAL_PROBE_STATIONS.length; b += PROBE_BATCH) {
      const batch = ARRIVAL_PROBE_STATIONS.slice(b, b + PROBE_BATCH);
      setTimeout(() => runProbeBatch(batch), 1500 + Math.floor(b / PROBE_BATCH) * PROBE_BATCH_GAP);
    }
  }

  private _updateSimStatus() {
    const total = SUBWAY_POLLING_NAMES.length;
    const live  = this.linesWithRealData.size;

    let status: SimStatus;
    if (live === 0)            status = 'simulated';
    else if (live >= total)    status = 'live';
    else                       status = 'mixed';

    if (status !== this._simStatus) {
      this._simStatus = status;
      this.emit('simStatus', status);
    }
  }
}

export const transitRealtimeService = new TransitRealtimeService();

/** 테스트 전용 내부 함수 노출 */
export const __test__ = { resolveTimeline, buildLiveUnit, elapsedAtEvent, segmentMsBetween, DWELL_MS };
