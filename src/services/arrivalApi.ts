import { StationArrival, TimetableEntry } from '@/types/metro';
import { db } from './db';
import { getStaticTimetable, getEstimatedArrivalsFromStatic } from '@/data/static-timetables';
import { API_ENDPOINTS } from '@/utils/api-client';
import { normalizeLineName } from '@/utils/stationUtils';
import { normStation } from '@/data/stationRegistry';

// ── 지하철 시간표 인덱스 (subway-schedule-index.json) ────────────────────────
// 서울시 openapi.seoul.go.kr에서 수집한 799개 역-노선 첫차/막차/행선지 데이터
// (1-9호선 약 458개 역 커버, 코레일 계열 미포함)
interface ScheduleEntry {
  first: string;      // 첫차 시각 "HH:MM" (예: "05:22")
  last:  string|null; // 막차 시각 "HH:MM" 또는 "25:MM" (다음날 새벽)
  dest:  string;      // 행선지 역명 (예: "동두천")
  count: number;      // 총 열차 수
}
interface ScheduleIndexEntry {
  name: string; line: string; frCode: string; stationCd: string;
  week?: Record<string, ScheduleEntry>;
  sat?:  Record<string, ScheduleEntry>;
  sun?:  Record<string, ScheduleEntry>;
}
type ScheduleIndex = Record<string, ScheduleIndexEntry>;
// Station arrivals index: { "역명__노선": { "week": {"1": ["05:16",...], "2": [...]}, "sun": {...} } }
type StationArrivalsIndex = Record<string, Record<string, Record<string, string[]>>>;

const _schedBase = process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'firebase' ? '' : '/metro';
let _schedIndex: ScheduleIndex | null = null;
let _schedLoading: Promise<ScheduleIndex> | null = null;
let _arrIndex: StationArrivalsIndex | null = null;
let _arrIndexLoading: Promise<StationArrivalsIndex> | null = null;

async function getScheduleIndex(): Promise<ScheduleIndex> {
  if (_schedIndex) return _schedIndex;
  if (_schedLoading) return _schedLoading;
  _schedLoading = (async () => {
    try {
      const res = await fetch(`${_schedBase}/data/subway-schedule-index.json`,
        { signal: AbortSignal.timeout(5000) });
      _schedIndex = res.ok ? await res.json() : {};
    } catch { _schedIndex = {}; }
    return _schedIndex!;
  })();
  return _schedLoading;
}

async function getStationArrivalsIndex(): Promise<StationArrivalsIndex> {
  if (_arrIndex) return _arrIndex;
  if (_arrIndexLoading) return _arrIndexLoading;
  _arrIndexLoading = (async () => {
    try {
      const res = await fetch(`${_schedBase}/data/station-arrivals-index.json`,
        { signal: AbortSignal.timeout(8000) });
      _arrIndex = res.ok ? await res.json() : {};
    } catch { _arrIndex = {}; }
    return _arrIndex!;
  })();
  return _arrIndexLoading;
}

const LINE_HEADWAY_MAP: Record<string, number> = {
  '1호선': 7, '2호선': 4, '3호선': 6, '4호선': 6, '5호선': 6,
  '6호선': 7, '7호선': 6, '8호선': 7, '9호선': 6,
  '수인분당선': 8, '경의중앙선': 18, '경춘선': 18, '공항철도': 12,
  '신분당선': 9, '신림선': 8, '우이신설선': 8, 'GTX-A': 20,
};

/**
 * 수집된 시간표 인덱스를 이용해 StationArrival 배열을 반환합니다.
 * 1-9호선 역은 실제 첫차/막차/행선지를 사용하고,
 * 나머지 역은 static 추정치보다 정확한 행선지를 제공합니다.
 */
export const getArrivalsFromScheduleIndex = async (
  stationName: string
): Promise<StationArrival[]> => {
  const index = await getScheduleIndex();
  if (!Object.keys(index).length) return [];

  const clean = normStation(stationName);
  const now   = new Date();
  const h     = now.getHours();
  if (h >= 1 && h < 5) return []; // 운행 종료 시간대

  const dow    = now.getDay();
  const dayKey = dow === 0 ? 'sun' : dow === 6 ? 'sat' : 'week';
  // At midnight (h=0), treat as 24h+ so after-midnight trains compare correctly
  const nowSec = h === 0
    ? 24 * 3600 + now.getMinutes() * 60 + now.getSeconds()
    : h * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const results: StationArrival[] = [];

  for (const [key, entry] of Object.entries(index)) {
    const entryClean = normStation(entry.name);
    if (entryClean !== clean && entry.name !== stationName) continue;

    const dayData = (entry as any)[dayKey] as Record<string, ScheduleEntry> | undefined;
    if (!dayData) continue;

    const freqSec = (LINE_HEADWAY_MAP[entry.line] ?? 10) * 60;

    for (const [dirTag, sched] of Object.entries(dayData)) {
      if (!sched || !sched.first || !sched.dest) continue;

      // 첫차 시각 → 초
      const [fh, fm] = sched.first.split(':').map(Number);
      const firstSec = fh * 3600 + fm * 60;

      // 막차 시각 → 초 (25:xx = 다음날)
      let lastSec = 23 * 3600 + 59 * 60;
      if (sched.last) {
        const [lh, lm] = sched.last.split(':').map(Number);
        lastSec = lh * 3600 + lm * 60; // 25:xx도 그대로 사용
      }

      // 현재 시간이 운행 범위 밖이면 스킵
      // lastSec > 24*3600 이면 다음날 새벽까지 운행 (25:xx, 00:xx)
      const midnightSec = 24 * 3600;
      const isRunning = nowSec >= firstSec && (
        lastSec >= midnightSec             // 자정 이후까지 운행 → 항상 포함
          ? nowSec < lastSec               // 현재가 막차 전
          : nowSec <= lastSec              // 자정 이전 종료 노선
      );
      if (!isRunning) continue;

      const cnt = (sched as any).count;
      const isEstimated = cnt === -1; // 코레일·경전철 일괄추정치
      const isPreciseEst = cnt === -2; // 역별 정밀추정치 (신분당선·공항철도 등)

      // 현재 시간 이후 다음 2편 생성
      for (let i = 1; i <= 2; i++) {
        const waitSec = freqSec * i - (nowSec % freqSec);
        const arrSec  = nowSec + waitSec;
        if (arrSec > lastSec && lastSec < midnightSec) break; // 자정 이전 종료 시 막차 이후 제외

        const updnLine = dirTag === '1' ? '상행' : '하행';
        results.push({
          lineName:    entry.line,
          subwayId:    '',
          updnLine,
          trainLineNm: `${sched.dest}행`,
          statnNm:     entry.name,
          arvlMsg2:    waitSec < 60 ? '곧 도착' : `${Math.floor(waitSec / 60)}분 후`,
          arvlMsg3:    isEstimated ? '(배차간격 추정)' : isPreciseEst ? '(시각 추정)' : '',
          arvlCd:      '99',
          bstatnNm:    sched.dest,
          barvlDt:     String(waitSec),
          btrainNo:    '',
          isScheduled: true,
        });
      }
    }
  }

  return results
    .sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt))
    .slice(0, 8);
};

/**
 * station-arrivals-index.json을 이용해 정확한 열차 시각으로 도착 정보를 반환합니다.
 * 서울 1-9호선 + 코레일(경의중앙선·수인분당선·경춘선·서해선·경강선·1/3/4호선) + 인천1/2호선 700+ 역 커버.
 * 실시간 API 대체 목적이므로 getArrivalsFromScheduleIndex보다 정밀합니다.
 */
export const getArrivalsFromFullTimetable = async (
  stationName: string
): Promise<StationArrival[]> => {
  const arrIndex = await getStationArrivalsIndex();
  if (!Object.keys(arrIndex).length) return [];

  const schedIdx = await getScheduleIndex();
  const clean = normStation(stationName);
  const now   = new Date();
  const h     = now.getHours();
  if (h >= 1 && h < 5) return []; // 운행 종료 시간대

  const dow    = now.getDay();
  // Normalize current time: midnight (h=0) → 1440+m so it compares correctly against both
  // "00:30"-style (→ trainMin = 1470) and "24:30"-style (→ trainMin = 1470) midnight trains.
  // Times with h<4 are treated as after-midnight service (service starts ~05:00).
  const nowMin = h === 0 ? 24 * 60 + now.getMinutes() : h * 60 + now.getMinutes();

  const results: StationArrival[] = [];

  // Find matching entries in the arrival index
  for (const [key, dayData] of Object.entries(arrIndex)) {
    const parts = key.split('__');
    if (parts.length < 2) continue;
    const stnName = parts[0];
    const line = parts.slice(1).join('__');

    if (normStation(stnName) !== clean && stnName !== stationName) continue;

    // Sat: prefer 'sat' (Seoul Metro new data), fall back to 'sun' (Korail/Incheon), then 'week'
    // Sun: prefer 'sun', fall back to 'week'
    // Weekday: 'week'
    const times = dow === 6
      ? (dayData['sat'] ?? dayData['sun'] ?? dayData['week'])
      : dow === 0
        ? (dayData['sun'] ?? dayData['week'])
        : dayData['week'];
    if (!times) continue;

    // Find dest from schedule index
    const idxEntry = schedIdx[key];
    const schedDayKey = dow === 6 ? 'sat' : dow === 0 ? 'sun' : 'week';
    const weekData = idxEntry?.[schedDayKey] ?? idxEntry?.['week'];

    for (const [dirTag, trainTimes] of Object.entries(times)) {
      if (!trainTimes || trainTimes.length === 0) continue;

      const dest = weekData?.[dirTag]?.dest ?? '';
      const updnLine = dirTag === '1' ? '상행' : '하행';

      // Find next 3 trains from current time
      let found = 0;
      for (const t of trainTimes) {
        const [th, tm] = t.split(':').map(Number);
        // Normalize train time: h<4 treated as post-midnight (e.g. "00:30" → 1470, "24:30" → 1470)
        const trainMin = th < 4 ? (th + 24) * 60 + tm : th * 60 + tm;
        const waitMin = trainMin - nowMin;

        // Skip past trains; show trains within 90 min
        if (waitMin < 0 || waitMin > 90) continue;
        const waitSec = waitMin * 60;

        results.push({
          lineName:    line,
          subwayId:    '',
          updnLine,
          trainLineNm: dest ? `${dest}행` : updnLine,
          statnNm:     stnName,
          arvlMsg2:    waitMin === 0 ? '곧 도착' : `${waitMin}분 후`,
          arvlMsg3:    '',
          arvlCd:      '99',
          bstatnNm:    dest,
          barvlDt:     String(waitSec),
          btrainNo:    '',
          isScheduled: true,
        });
        found++;
        if (found >= 3) break;
      }
    }
  }

  return results
    .sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt))
    .slice(0, 8);
};

// transfer-info: 번들 제외, 첫 사용 시 fetch 후 모듈 캐시
let _transferDataCache: any[] | null = null;
async function getTransferData(): Promise<any[]> {
  if (_transferDataCache) return _transferDataCache;
  try {
    const res = await fetch('/metro/data/transfer-info.json');
    _transferDataCache = res.ok ? await res.json() : [];
  } catch {
    _transferDataCache = [];
  }
  return _transferDataCache!;
}

const LINE_ID_MAP: { [key: string]: string } = {
    "1": "1001", "2": "1002", "3": "1003", "4": "1004", "5": "1005",
    "6": "1006", "7": "1007", "8": "1008", "9": "1009",
    "1호선": "1001", "2호선": "1002", "3호선": "1003", "4호선": "1004", "5호선": "1005",
    "6호선": "1006", "7호선": "1007", "8호선": "1008", "9호선": "1009",
    "경의중앙": "1063", "경춘": "1067", "수인분당": "1075", "신분당": "1077", "공항철도": "1065", "GTX-A": "1032"
};

export interface TrainPosition {
    subwayId: string;
    subwayNm: string;
    statnId: string;
    statnNm: string;
    trainNo: string;
    lastRecptnDt: string;
    updnLine: string;
    directAt: string;
    trainSttus: string; 
    lstnyNm: string;
    arrivalNm: string;
    arvlCd: string;
}

export interface SubwayAlert {
    title: string;
    content: string;
    date: string;
}

export const parseSeoulDate = (dateStr: string): number => {
    if (!dateStr) return Date.now();
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getTime();
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
        return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`).getTime();
    }
    return Date.now();
};

export const fetchWithFallbacks = async (targetUrl: string) => {
    // 1. Direct Fetch (로컬 개발 환경에서만 성공, 프로덕션은 CORS로 차단됨)
    try {
        const directRes = await fetch(targetUrl, { signal: AbortSignal.timeout(1000) });
        if (directRes.ok) return await directRes.json();
    } catch (e) {}

    // 2. Proxy Fetching
    const salt = Math.random().toString(36).substring(7);
    const targetWithSalt = targetUrl.includes('?') ? `${targetUrl}&_s=${salt}` : `${targetUrl}?_s=${salt}`;
    
    // HTTP 강제로 서울 OpenAPI 리다이렉트 문제 방지
    const urlHttp = targetWithSalt.replace('https://swopenapi.seoul.go.kr', 'http://swopenapi.seoul.go.kr');
    const encodedUrl = encodeURIComponent(urlHttp);

    const isFirebase = process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'firebase';
    const base = isFirebase ? '' : '/metro';

    const fetchFromProxy = async (proxyUrl: string, isWrapped: boolean = false) => {
        const res = await fetch(proxyUrl, { 
            signal: AbortSignal.timeout(3000),  // 3초로 단축
            headers: { 'Accept': 'application/json' }
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        let data: any;
        if (isWrapped) {
            const wrapper = await res.json();
            if (!wrapper.contents) throw new Error('contents empty');
            data = typeof wrapper.contents === 'string' ? JSON.parse(wrapper.contents) : wrapper.contents;
        } else {
            const rawText = await res.text();
            try { data = JSON.parse(rawText); }
            catch (e) { throw new Error('non-JSON response'); }
        }

        if (data?.realtimePositionList || data?.realtimeArrivalList || 
            data?.RESULT?.CODE === "INFO-000" || data?.errorMessage?.code === "INFO-000" ||
            data?.errorMessage?.status === 200) {
            return data;
        }
        throw new Error('invalid data structure');
    };

    // 로컬 Next.js 리라이트 프록시 우선 시도 (가장 빠름, 서버사이드라 CORS 없음)
    const localProxyPath = urlHttp.replace('http://swopenapi.seoul.go.kr/api/subway/', '');
    const localProxyUrl = `${base}/api/proxy/subway/${localProxyPath}`;
    
    try {
        const data = await fetchFromProxy(localProxyUrl);
        return data;
    } catch (e) {}

    // 외부 프록시 병렬 시도 (Promise.any로 첫 성공 결과 사용)
    const externalProxies = [
        { url: `https://corsproxy.io/?${encodedUrl}`, wrapped: false },
        { url: `https://api.allorigins.win/raw?url=${encodedUrl}`, wrapped: false },
        { url: `https://api.allorigins.win/get?url=${encodedUrl}`, wrapped: true },
    ];

    try {
        return await Promise.any(externalProxies.map(p => fetchFromProxy(p.url, p.wrapped)));
    } catch (e) {
        throw new Error(`Realtime data unavailable (all proxies failed)`);
    }
};

/**
 * Fallback: Get train positions by analyzing station arrival data
 * Useful when the main position API is blocked.
 */
export const getSubwayPositionsFromArrivals = async (lineName: string): Promise<TrainPosition[]> => {
    // This is a high-level fallback that could be implemented to poll 
    // key stations and estimate train positions. 
    // For now, we focus on making the primary API work.
    return [];
};

export const fetchStationArrivals = async (stationName: string): Promise<StationArrival[]> => {
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    const fetchUniqueArrivals = async (name: string): Promise<StationArrival[]> => {
        const baseUrl = `https://swopenapi.seoul.go.kr/api/subway`;
        const primaryUrl = `${baseUrl}/${apiKey}/json/realtimeStationArrival/1/50/${encodeURIComponent(name)}`;
        
        try {
            let json = await fetchWithFallbacks(primaryUrl);
            if (json?.status === 500 && json?.code === "ERROR-338") {
                const fallbackUrl = `${baseUrl}/sample/json/realtimeStationArrival/1/10/${encodeURIComponent(name)}`;
                json = await fetchWithFallbacks(fallbackUrl);
            }

            const rawList: any[] = json?.realtimeArrivalList || [];
            const trainMap = new Map<string, StationArrival>();
            
            rawList.forEach(item => {
                const isReliableNo = item.btrainNo && item.btrainNo !== "0000";
                const trainId = isReliableNo 
                    ? `${item.subwayId}-${item.btrainNo}` 
                    : `${item.subwayId}-${item.updnLine}-${item.trainLineNm}-${item.arvlMsg2}`;
                
                const arrival: StationArrival = {
                    lineName: item.subwayNm || "",
                    subwayId: item.subwayId || "",
                    updnLine: item.updnLine || "",
                    trainLineNm: item.trainLineNm || "",
                    statnNm: item.statnNm || "",
                    arvlMsg2: item.arvlMsg2 || "",
                    arvlMsg3: item.arvlMsg3 || "",
                    arvlCd: item.arvlCd || "",
                    bstatnNm: item.bstatnNm || "",
                    barvlDt: item.barvlDt || "9999",
                    btrainNo: item.btrainNo || ""
                };

                const existing = trainMap.get(trainId);
                if (!existing || parseInt(arrival.barvlDt) < parseInt(existing.barvlDt)) {
                    trainMap.set(trainId, arrival);
                }
            });
            return Array.from(trainMap.values());
        } catch (e) {
            return [];
        }
    };

    const cleanName = stationName.replace(/역+$/, '');
    const variants = [stationName, cleanName];
    if (cleanName === "서울") variants.unshift("서울역");
    if (cleanName === "남부터미널") variants.push("남부터미널(예술의전당)");
    if (cleanName === "교대") variants.push("교대(법원.검찰청)");
    if (cleanName === "독립문") variants.push("독립문역"); // Just in case
    if (cleanName === "쌍용") variants.push("쌍용(나사렛대)");
    if (cleanName === "신촌" && !stationName.includes("경의중앙선")) variants.push("신촌(지하)");

    const uniqueVariants = Array.from(new Set(variants));
    
    try {
        let allArrivals: StationArrival[] = [];
        const variantResults = await Promise.all(uniqueVariants.map(v => fetchUniqueArrivals(v).catch(() => [])));
        const seenTrains = new Set<string>();
        variantResults.forEach(data => {
            data.forEach(arrival => {
                const key = `${arrival.subwayId || arrival.lineName}-${arrival.updnLine}-${arrival.btrainNo || arrival.trainLineNm}`;
                if (!seenTrains.has(key)) {
                    allArrivals.push(arrival);
                    seenTrains.add(key);
                }
            });
        });

        // 📅 FETCH SCHEDULED FALLBACK FROM DB
        const scheduled = await getScheduledArrivalsFromDB(cleanName);
        
        // Merge them
        const merged = mergeLiveAndScheduled(allArrivals, scheduled);

        const upArrivals: StationArrival[] = [];
        const downArrivals: StationArrival[] = [];

        merged.forEach(arrival => {
            const isUp = arrival.updnLine.includes("상행") || arrival.updnLine.includes("내선") || arrival.updnLine.includes("상선");
            if (isUp) upArrivals.push(arrival);
            else downArrivals.push(arrival);
        });

        const sortAndLimit = (list: StationArrival[]) => {
            return list
                .sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt))
                .slice(0, 3);
        };

        return [...sortAndLimit(upArrivals), ...sortAndLimit(downArrivals)];
    } catch (err) {
        const scheduled = await getScheduledArrivalsFromDB(cleanName);
        return scheduled.slice(0, 6);
    }
};

/**
 * Queries IndexedDB for upcoming scheduled trains
 */
export const getScheduledArrivalsFromDB = async (stationName: string): Promise<StationArrival[]> => {
    try {
        const cleanName = stationName.replace(/역+$/, '').trim();
        const now = new Date();
        const hour = now.getHours();
        const min = now.getMinutes();
        const currentTimeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
        
        // Determine day type
        const day = now.getDay();
        const dayType: "week" | "sat" | "sun" = (day === 0) ? 'sun' : (day === 6) ? 'sat' : 'week';

        // Fetch all timetables for this station
        const allMeta = await db.timetables.where('stationName').equals(cleanName).toArray();
        if (allMeta.length === 0) return [];

        const filtered = allMeta.filter(t => t.dayType === dayType && t.departureTime > currentTimeStr);
        
        return filtered.map(item => {
            const [h, m, s] = item.departureTime.split(':').map(Number);
            const schedDate = new Date();
            schedDate.setHours(h, m, s);
            const diffSeconds = Math.max(0, Math.floor((schedDate.getTime() - now.getTime()) / 1000));
            
            return convertTimetableToArrival(item, diffSeconds);
        }).sort((a, b) => parseInt(a.barvlDt) - parseInt(b.barvlDt));
    } catch (e) {
        return [];
    }
};

/**
 * Converts a DB TimetableEntry into a StationArrival object for UI consistency
 */
export const convertTimetableToArrival = (entry: TimetableEntry, waitTimeSeconds: number): StationArrival => {
    return {
        lineName: entry.line,
        subwayId: "", 
        updnLine: (entry.direction === 'up' || entry.direction === 'inner') ? '상행' : '하행',
        trainLineNm: `${entry.destination}행`,
        statnNm: entry.stationName,
        arvlMsg2: waitTimeSeconds < 60 ? "곧 도착" : `${Math.floor(waitTimeSeconds / 60)}분 후`,
        arvlMsg3: "",
        arvlCd: "99",
        bstatnNm: entry.destination,
        barvlDt: waitTimeSeconds.toString(),
        btrainNo: entry.trainNo,
        isScheduled: true
    };
};

/**
 * Merges live API data with scheduled DB data to ensure no "정보 없음" states.
 */
const isUpDirection = (updnLine: string) =>
    updnLine.includes('상행') || updnLine.includes('내선') || updnLine.includes('상선');

export const mergeLiveAndScheduled = (live: StationArrival[], scheduled: StationArrival[]): StationArrival[] => {
    const upLive   = live.filter(l => isUpDirection(l.updnLine));
    const downLive = live.filter(l => !isUpDirection(l.updnLine));

    const upSched   = scheduled.filter(s => isUpDirection(s.updnLine));
    const downSched = scheduled.filter(s => !isUpDirection(s.updnLine));

    const mergeSide = (lSide: StationArrival[], sSide: StationArrival[]) => {
        const side = [...lSide];
        
        // Ensure we have exactly 3 (or as many as possible)
        sSide.forEach(s => {
            if (side.length < 3) {
                // Check if this scheduled train is significantly later than the last live train
                const lastLiveDt = side.length > 0 ? parseInt(side[side.length - 1].barvlDt) : -1;
                // Reduce gap to 30s so we don't accidentally skip valid upcoming trains
                if (parseInt(s.barvlDt) > lastLiveDt + 30) { 
                    side.push(s);
                }
            }
        });
        
        // Final trim and sort
        return side.sort((a,b) => parseInt(a.barvlDt) - parseInt(b.barvlDt)).slice(0, 3);
    };

    return [...mergeSide(upLive, upSched), ...mergeSide(downLive, downSched)];
};

export const fetchTrainCongestion = async (subwayNm: string, trainNo: string) => {
    let normalizedNm = subwayNm.trim();
    if (!normalizedNm.endsWith('호선') && !normalizedNm.endsWith('선')) {
        if (!isNaN(Number(normalizedNm))) {
            normalizedNm = normalizedNm + '호선';
        } else {
            normalizedNm = normalizedNm + '선';
        }
    }

    const lineMap: { [key: string]: string } = {
        "1호선": "1001", "2호선": "1002", "3호선": "1003", "4호선": "1004", "5호선": "1005",
        "6호선": "1006", "7호선": "1007", "8호선": "1008", "9호선": "1009",
        "경의중앙선": "1063", "경춘선": "1067", "수인분당선": "1075", "신분당선": "1077"
    };
    
    const subwayId = lineMap[normalizedNm];
    if (!subwayId) return null;

    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";

    const url = `https://swopenapi.seoul.go.kr/api/subway/${apiKey}/json/realtimeTrainCongestion/0/5/${subwayId}/${trainNo}`;
    
    try {
        const json = await fetchWithFallbacks(url);
        const isSuccess = json?.status === 200 || json?.errorMessage?.status === 200 || json?.RESULT?.CODE === "INFO-000";
        if (isSuccess) {
            return json?.realtimeTrainCongestionList?.[0] || null;
        }
        return null;
    } catch (err) {
        return null;
    }
};

export const fetchTransferPlatform = async (stationName: string, fromLine: string, toLine: string) => {
    if (!stationName) return null;
    const cleanStation = normStation(stationName);
    const cleanFromLine = normalizeLineName(fromLine);
    const cleanToLine = normalizeLineName(toLine);

    try {
        const stored = await db.getTransferInfo(cleanStation, cleanFromLine, cleanToLine);
        if (stored) return stored.platform;
        if (stationName !== cleanStation) {
            const storedOrig = await db.getTransferInfo(normStation(stationName), cleanFromLine, cleanToLine);
            if (storedOrig) return storedOrig.platform;
        }
    } catch (e) {}

    const transferData = await getTransferData();
    const staticStation = transferData.find((s: any) =>
        s.stationName === cleanStation || s.stationName === normStation(stationName)
    );
    if (staticStation) {
        const staticMatch = staticStation.transfers.find((t: any) => 
            normalizeLineName(t.from) === cleanFromLine && normalizeLineName(t.to) === cleanToLine
        );
        if (staticMatch) return staticMatch.platform;
    }

    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = "sample";
    
    const tryFetch = async (queryName: string) => {
        const url = `https://openapi.seoul.go.kr:443/${apiKey}/json/CardSubwayTransferPos/1/50/${encodeURIComponent(queryName)}`;
        try {
            const json = await fetchWithFallbacks(url);
            const list = json?.CardSubwayTransferPos?.row || [];
            const match = list.find((item: any) => {
                const apiFrom = normalizeLineName(item.LINE_NUM);
                const apiTo = normalizeLineName(item.TRNSIT_LINE_NM);
                return (apiFrom === cleanFromLine && apiTo === cleanToLine);
            });
            if (match) {
                const platform = match.TRNSIT_POS || match.PLATFORM_INFO || match.TRNSIT_PLATFORM_NO;
                if (platform) {
                    db.saveTransferInfo({
                        stationName: cleanStation,
                        fromLine: cleanFromLine,
                        toLine: cleanToLine,
                        platform: String(platform)
                    }).catch(() => {});
                    return String(platform);
                }
            }
        } catch (e) {
            return null;
        }
        return null;
    };

    let result = await tryFetch(cleanStation);
    if (result) return result;
    if (stationName !== cleanStation) {
        result = await tryFetch(normStation(stationName));
        if (result) return result;
    }
    return null;
};

export const fetchTrainPositions = async (lineName: string): Promise<TrainPosition[]> => {
    // 🛡️ API Key Fallback Logic (User provided approved keys)
    const USER_APPROVED_KEYS = [
        "634179436a7079773730786f4d5445",  // 지하철인증키 (2026/03/30) ✅
        "53517344677079773531694a786f6a",  // 지하철인증키 (2026/03/27) ✅
        "434f7275707079773537687a507658",  // 지하철인증키 (2026/03/27) ✅
    ];
    
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_API_KEY;
    if (!apiKey || apiKey.length < 10) apiKey = USER_APPROVED_KEYS[0];

    const tryFetchWithKeys = async () => {
        const keysToTry = [apiKey, ...USER_APPROVED_KEYS, "sample"];
        for (const key of keysToTry) {
            if (!key) continue;
            const url = API_ENDPOINTS.SUBWAY_POSITION(key, lineName);
            try {
                const json = await fetchWithFallbacks(url);
                if (json?.realtimePositionList) return json;
            } catch (e) {}
        }
        return null;
    };

    try {
        const json = await tryFetchWithKeys();
        return (json?.realtimePositionList || []).map((item: any) => ({
            subwayId: item.subwayId,
            subwayNm: item.subwayNm,
            statnId: item.statnId,
            statnNm: item.statnNm,
            trainNo: item.trainNo,
            lastRecptnDt: item.lastRecptnDt,
            updnLine: item.updnLine,
            directAt: item.directAt,
            trainSttus: item.trainSttus || "99",
            lstnyNm: item.lstnyNm || item.statnTnm || "",  // realtimePosition에서는 statnTnm
            statnTnm: item.statnTnm || "",                 // 종착역명 (realtimePosition API 전용)
            arrivalNm: item.arrivalNm,
            arvlCd: item.arvlCd
        }));
    } catch (err) {
        return [];
    }
};

export const fetchSubwayAlerts = async (): Promise<SubwayAlert[]> => {
    let apiKey = process.env.NEXT_PUBLIC_SEOUL_OPEN_DATA_KEY || "sample";
    const url = API_ENDPOINTS.SUBWAY_ALERTS(apiKey);
    try {
        const json = await fetchWithFallbacks(url);
        return (json?.CardSubwayAlertInfo?.row || []).map((item: any) => ({
            title: item.TITLE,
            content: item.CONTENT,
            date: item.REG_DATE
        }));
    } catch (err) {
        return [];
    }
};
