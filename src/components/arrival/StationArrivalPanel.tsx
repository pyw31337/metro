"use client";

/**
 * 메인 화면: "내 역" 도착 안내.
 * 역을 고르면 노선·방향별로 다음 열차 2대를 보여 준다.
 *  - 실시간(보정): 서울시가 보낸 남은 시간에서 데이터가 만들어진 뒤 흐른 시간을 뺀 값
 *  - 추정: 남은 시간이 제공되지 않아 정거장 수로 계산한 값 (앞에 "약")
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAllStations } from '@/data/subway-lines';
import { normStation } from '@/data/stationRegistry';
import { buildBoard, fetchBoard, formatEta, lineColor, BoardGroup, BoardTrain, RawArrival } from '@/services/stationBoard';

const FAV_KEY = 'metro-arrival-favorites';
const RECENT_KEY = 'metro-arrival-recent';
const REFRESH_MS = 20_000;

function loadList(key: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; }
  catch { return []; }
}
function saveList(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* 저장 불가 (사파리 개인정보 모드 등) */ }
}

interface StationOption { name: string; lines: string[] }

function useStationIndex(): StationOption[] {
  return useMemo(() => {
    const map = new Map<string, StationOption>();
    for (const s of getAllStations()) {
      const name = normStation(s.name);
      const cur = map.get(name);
      if (cur) cur.lines = Array.from(new Set([...cur.lines, ...s.lines]));
      else map.set(name, { name, lines: [...s.lines] });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, []);
}

type LoadState = 'idle' | 'loading' | 'ok' | 'no-data' | 'quota' | 'invalid-key' | 'error';

export default function StationArrivalPanel({
  nearestStationName,
  onShowMap,
}: {
  nearestStationName?: string | null;
  onShowMap: (stationName: string | null) => void;
}) {
  const stations = useStationIndex();
  const [query, setQuery] = useState('');
  const [station, setStation] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [raw, setRaw] = useState<RawArrival[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // 저장된 즐겨찾기/최근 역 복원 → 첫 화면은 즐겨찾기 첫 역
  useEffect(() => {
    const fav = loadList(FAV_KEY), rec = loadList(RECENT_KEY);
    setFavorites(fav);
    setRecent(rec);
    const fromUrl = new URLSearchParams(window.location.search).get('station');
    const first = fromUrl || fav[0] || rec[0] || null;
    if (first) setStation(normStation(first));
  }, []);

  const select = useCallback((name: string) => {
    const n = normStation(name);
    setStation(n);
    setQuery('');
    setRecent(prev => {
      const next = [n, ...prev.filter(x => x !== n)].slice(0, 8);
      saveList(RECENT_KEY, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((name: string) => {
    setFavorites(prev => {
      const next = prev.includes(name) ? prev.filter(x => x !== name) : [name, ...prev].slice(0, 12);
      saveList(FAV_KEY, next);
      return next;
    });
  }, []);

  // 도착 정보 불러오기: 화면이 보일 때만 20초마다
  const load = useCallback(async (name: string, quiet = false) => {
    if (!quiet) setState('loading');
    const res = await fetchBoard(name);
    if (res.kind !== 'ok' && quiet) {
      // 자동 갱신이 일시적으로 실패하면 기존 정보를 유지한다 (표시된 "n초 전 기준"이 계속 늘어남)
      setRefreshFailed(true);
      return;
    }
    setRefreshFailed(false);
    setRaw(res.raw);
    setFetchedAt(res.fetchedAt);
    setState(res.kind);
  }, []);

  useEffect(() => {
    if (!station) return;
    setRaw([]);
    load(station);
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => load(station, true), REFRESH_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => {
      if (document.visibilityState === 'visible') { load(station, true); start(); } else stop();
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [station, load]);

  // 남은 시간 카운트다운
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const board = useMemo(() => buildBoard(raw, now), [raw, now]);
  const stationInfo = stations.find(s => s.name === station);

  const results = useMemo(() => {
    const q = normStation(query.trim());
    if (!q) return [];
    return stations.filter(s => s.name.includes(q)).sort((a, b) => Number(!a.name.startsWith(q)) - Number(!b.name.startsWith(q))).slice(0, 8);
  }, [query, stations]);

  const shortcuts = useMemo(() => {
    const list: { name: string; tag: string }[] = [];
    const push = (name: string, tag: string) => { if (name && !list.some(x => x.name === name)) list.push({ name, tag }); };
    favorites.forEach(f => push(f, '즐겨찾기'));
    if (nearestStationName) push(normStation(nearestStationName), '가까운 역');
    recent.forEach(r => push(r, '최근'));
    return list.slice(0, 10);
  }, [favorites, recent, nearestStationName]);

  const isFav = station ? favorites.includes(station) : false;

  return (
    <section
      aria-label="역 도착 안내"
      className="absolute inset-0 z-[2400] overflow-y-auto bg-[var(--background)] text-[var(--foreground)]"
    >
      <div className="mx-auto w-full max-w-[640px] px-4 pb-28 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.75rem))]">
        {/* 검색 */}
        <div className="relative">
          <label htmlFor="arrival-search" className="sr-only">역 이름으로 찾기</label>
          <input
            id="arrival-search"
            ref={inputRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="역 이름 검색 (예: 강남)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && results[0]) select(results[0].name); }}
            className="h-12 w-full rounded-2xl border border-zinc-900/[0.08] bg-white px-4 text-[16px] shadow-[0_1px_2px_rgba(24,24,27,0.04)] outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:border-white/[0.08] dark:bg-zinc-900 dark:focus-visible:ring-white/30"
            aria-controls="arrival-search-results"
          />
          {results.length > 0 && (
            <ul id="arrival-search-results" role="listbox" aria-label="검색 결과" className="absolute left-0 right-0 top-[52px] z-10 overflow-hidden rounded-2xl border border-zinc-900/[0.08] bg-white shadow-[0_12px_32px_-12px_rgba(24,24,27,0.25)] dark:border-white/[0.08] dark:bg-zinc-900">
              {results.map(r => (
                <li key={r.name} role="option" aria-selected={false}>
                  <button type="button" onClick={() => select(r.name)} className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 focus-visible:bg-zinc-100 focus-visible:outline-none dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800">
                    <span className="text-[15px] font-medium">{r.name}</span>
                    <LineDots lines={r.lines} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 즐겨찾기 · 가까운 역 · 최근 */}
        {shortcuts.length > 0 && (
          <nav aria-label="빠른 선택" className="-mx-4 mt-3 overflow-x-auto px-4">
            <ul className="flex gap-2">
              {shortcuts.map(s => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => select(s.name)}
                    aria-pressed={station === s.name}
                    className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:focus-visible:ring-white/30 ${station === s.name ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900' : 'border-zinc-900/[0.08] bg-white text-zinc-700 dark:border-white/[0.08] dark:bg-zinc-900 dark:text-zinc-200'}`}
                  >
                    {s.name}
                    <span className={`text-[11px] ${station === s.name ? 'opacity-70' : 'text-zinc-400'}`}>{s.tag}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* 선택한 역 */}
        {!station ? (
          <div className="mt-16 text-center">
            <p className="text-[17px] font-semibold tracking-tight">어느 역에서 타세요?</p>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-500">역을 검색하면 노선·방향별로 다음 열차 두 대가<br />몇 분 뒤에 오는지 알려 드려요.</p>
            {nearestStationName && (
              <button type="button" onClick={() => select(nearestStationName)} className="mt-6 inline-flex h-11 items-center rounded-full bg-zinc-900 px-5 text-[14px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-900">
                가까운 역 {normStation(nearestStationName)} 보기
              </button>
            )}
          </div>
        ) : (
          <>
            <header className="mt-6 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[28px] font-bold leading-tight tracking-tight">{station}</h2>
                <div className="mt-1.5 flex items-center gap-2">
                  {stationInfo && <LineDots lines={stationInfo.lines} />}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => toggleFavorite(station)}
                  aria-pressed={isFav}
                  aria-label={isFav ? `${station} 즐겨찾기 해제` : `${station} 즐겨찾기`}
                  className="grid h-11 w-11 place-items-center rounded-full border border-zinc-900/[0.08] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:border-white/[0.08] dark:bg-zinc-900"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={isFav ? 'fill-amber-400 stroke-amber-500' : 'fill-none stroke-zinc-500'} strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => load(station)}
                  aria-label="도착 정보 새로고침"
                  className="grid h-11 w-11 place-items-center rounded-full border border-zinc-900/[0.08] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:border-white/[0.08] dark:bg-zinc-900"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={`fill-none stroke-zinc-500 ${state === 'loading' ? 'animate-spin' : ''}`} strokeWidth="1.8" strokeLinecap="round"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" /></svg>
                </button>
              </div>
            </header>

            <Legend fetchedAt={fetchedAt} now={now} />
            {refreshFailed && <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">자동 갱신에 실패해 마지막으로 받은 정보를 보여 주는 중이에요.</p>}

            <div aria-live="polite" aria-busy={state === 'loading'} className="mt-4 space-y-3">
              {state === 'loading' && board.length === 0 && <SkeletonCards />}
              {state === 'no-data' && <Notice title="실시간 도착 정보가 없어요" body="서울시 실시간 API는 서울 시내 구간 역 위주로 제공돼요. 지금 운행 중인 열차가 없거나 이 역이 제공 대상이 아닐 수 있어요." />}
              {state === 'quota' && <Notice tone="danger" title="오늘 실시간 API 호출 한도를 넘었어요" body="자정이 지나면 다시 볼 수 있어요." />}
              {state === 'invalid-key' && <Notice tone="danger" title="실시간 API 키 문제로 불러오지 못했어요" />}
              {state === 'error' && <Notice tone="warn" title="실시간 서버에 연결하지 못했어요" body="잠시 뒤 자동으로 다시 시도해요." />}
              {state === 'ok' && board.length === 0 && <Notice title="곧 도착할 열차 정보가 없어요" body="받은 기록이 모두 출발했거나 10분 넘게 갱신되지 않았어요." />}
              {board.map(g => <DirectionCard key={g.key} group={g} />)}
            </div>

            <button
              type="button"
              onClick={() => onShowMap(station)}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-900/[0.08] bg-white text-[14px] font-medium text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:border-white/[0.08] dark:bg-zinc-900 dark:text-zinc-200"
            >
              지도에서 열차 위치 보기
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function LineDots({ lines }: { lines: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {lines.slice(0, 5).map(l => (
        <span key={l} className="inline-flex h-5 items-center rounded-full px-1.5 text-[11px] font-semibold text-white" style={{ background: lineColor(l) }}>
          {l.replace('호선', '')}
        </span>
      ))}
    </span>
  );
}

function Legend({ fetchedAt, now }: { fetchedAt: number | null; now: number }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />실시간(보정)</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full border border-zinc-400" aria-hidden="true" />약 = 추정</span>
      {fetchedAt && <span className="tabular-nums">· {Math.max(0, Math.round((now - fetchedAt) / 1000))}초 전 조회 · 20초마다 갱신</span>}
    </p>
  );
}

function DirectionCard({ group }: { group: BoardGroup }) {
  const dir = group.heading || group.updnLine;
  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-900/[0.06] bg-white shadow-[0_1px_2px_rgba(24,24,27,0.04)] dark:border-white/[0.06] dark:bg-zinc-900">
      <h3 className="flex items-center gap-2 border-b border-zinc-900/[0.05] px-4 py-2.5 text-[13px] font-semibold dark:border-white/[0.05]">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: group.color }} aria-hidden="true" />
        <span>{group.lineName}</span>
        <span className="font-normal text-zinc-500">{dir}{group.updnLine && group.heading ? ` · ${group.updnLine}` : ''}</span>
      </h3>
      <ol className="divide-y divide-zinc-900/[0.05] dark:divide-white/[0.05]">
        {group.trains.map((t, i) => <TrainRow key={`${t.trainNo}-${i}`} t={t} order={i} />)}
      </ol>
    </article>
  );
}

function TrainRow({ t, order }: { t: BoardTrain; order: number }) {
  const eta = formatEta(t);
  const estimated = t.etaKind === 'estimated';
  const where = t.etaKind === 'at-station'
    ? t.statusText
    : [t.stopsAway !== null ? `${t.stopsAway}정거장 전` : null, t.location ? `${t.location}` : null].filter(Boolean).join(' · ');
  const srEta = estimated ? `${eta}, 추정` : t.etaKind === 'reported' ? `${eta}, 실시간` : eta;
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px] font-semibold">
          <span className="truncate">{t.dest}행</span>
          {t.express && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">급행</span>}
          {t.lastTrain && <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">막차</span>}
          <span className="sr-only">{order === 0 ? '이번 열차' : '다음 열차'}</span>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-zinc-500">{where || '위치 정보 없음'}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[20px] font-bold tabular-nums leading-tight tracking-tight ${estimated ? 'text-zinc-500 dark:text-zinc-400' : ''}`} aria-label={srEta}>
          {!estimated && t.etaKind === 'reported' && <span className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-1 rounded-full bg-emerald-500 align-middle" aria-hidden="true" />}
          {eta}
        </p>
        <p className={`mt-0.5 text-[11px] tabular-nums ${t.stale ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}`}>
          {t.ageSec !== null ? `${t.ageSec}초 전 기준` : '기준 시각 없음'}{t.stale ? ' · 오래됨' : ''}
        </p>
      </div>
    </li>
  );
}

function Notice({ title, body, tone = 'neutral' }: { title: string; body?: string; tone?: 'neutral' | 'warn' | 'danger' }) {
  const color = tone === 'danger' ? 'text-rose-700 dark:text-rose-300' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : '';
  return (
    <div className="rounded-2xl border border-dashed border-zinc-900/[0.12] px-4 py-5 dark:border-white/[0.12]">
      <p className={`text-[15px] font-semibold ${color}`}>{title}</p>
      {body && <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">{body}</p>}
    </div>
  );
}

function SkeletonCards() {
  return (
    <>
      {[0, 1].map(i => (
        <div key={i} className="h-[132px] animate-pulse rounded-2xl bg-zinc-900/[0.04] dark:bg-white/[0.05]" aria-hidden="true" />
      ))}
      <span className="sr-only">도착 정보를 불러오는 중</span>
    </>
  );
}
