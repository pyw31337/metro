"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";

import type { Station as SubwayStation } from "@/data/subway-lines";
import { BusStop, Station, WCItem, PathResult } from "@/types/metro";

import { useDataWorker }      from "@/hooks/useDataWorker";
import { useArrivalInfo }     from "@/hooks/useArrivalInfo";
import { useSimStatus, useSeoulApiIssue } from "@/hooks/useSimStatus";
import type { SimStatus } from "@/services/TransitRealtimeService";
import type { SeoulApiIssue } from "@/services/seoulApi";
import { useLastTrainWarning } from "@/hooks/useLastTrainWarning";
import { useViewportLines }   from "@/hooks/useViewportLines";
import { normalizeStationName } from "@/utils/stationUtils";
import { setMapCenter }         from "@/utils/mapCenter";
import { findBusPath }         from "@/utils/busRouting";
import { hapticSuccess, hapticError } from "@/utils/haptic";
import { db }                  from "@/services/db";
import { fetchBusTiles, fetchWCTiles, bboxAround } from "@/utils/tileLoader";

import { useRouteStore }  from "@/store/useRouteStore";
import { useMapStore }    from "@/store/useMapStore";
import { useUIStore }     from "@/store/useUIStore";
import { useSubwayStore } from "@/store/useSubwayStore";
import { useShallow }     from "zustand/shallow";

// ── dynamic imports ──
const MapLibreBackground = dynamic(() => import("@/components/MapLibreBackground"),  { ssr: false });
const UnifiedBottomPanel = dynamic(() => import("@/components/UnifiedBottomPanel"),  { ssr: false });
const MapControls        = dynamic(() => import("@/components/MapControls"),         { ssr: false });
const WeatherPopup       = dynamic(() => import("@/components/WeatherPopup"),        { ssr: false });
const StationArrivalPanel = dynamic(() => import("@/components/arrival/StationArrivalPanel"), { ssr: false });
import { getStationByName } from "@/data/subway-lines";

type MainView = 'arrival' | 'map';
const VIEW_KEY = 'metro-main-view';
import DirectionCompass  from "@/components/ui/DirectionCompass";

// Module-level cache so the 3MB routes JSON is only fetched once per session
let busRoutesCache: any[] | null = null;
const getBusRoutes = async () => {
  if (busRoutesCache) return busRoutesCache;
  const base = process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'firebase' ? '' : '/metro';
  const res = await fetch(`${base}/data/master-bus-routes.json`);
  busRoutesCache = await res.json();
  return busRoutesCache!;
};

// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const { findPath, findNearestStation, sortWCs } = useDataWorker();
  const simStatus = useSimStatus();
  const apiIssue = useSeoulApiIssue();
  const mapRef = useRef<any>(null);

  // 메인 화면: 도착 안내(기본) ↔ 지도
  const [view, setView] = useState<MainView>('arrival');
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('view');
    let saved: string | null = null;
    try { saved = localStorage.getItem(VIEW_KEY); } catch { /* ignore */ }
    const v = fromUrl || saved;
    if (v === 'map' || v === 'arrival') setView(v);
  }, []);
  const changeView = useCallback((v: MainView) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  }, []);
  // 지도가 안 보일 때는 열차 위치 폴링을 멈춰 API 호출 한도를 아낀다
  useEffect(() => {
    import("@/services/TransitRealtimeService").then(m => m.transitRealtimeService.setPaused(view !== 'map'));
  }, [view]);
  const showStationOnMap = useCallback((name: string | null) => {
    changeView('map');
    const st = name ? (getStationByName(name) ?? getStationByName(`${name}역`)) : null;
    if (st) setTimeout(() => mapRef.current?.flyTo({ center: [st.lng, st.lat], zoom: 15, duration: 900 }), 60);
  }, [changeView]);
  const initLocRef = useRef(false);

  // ── stores (selectors로 필요한 슬라이스만 구독 → 불필요한 re-render 방지) ──
  // useRouteStore
  const startStation        = useRouteStore(s => s.startStation);
  const endStation          = useRouteStore(s => s.endStation);
  const waypoints           = useRouteStore(s => s.waypoints);
  const pathResults         = useRouteStore(s => s.pathResults);
  const isCalculating       = useRouteStore(s => s.isCalculating);
  const validationError     = useRouteStore(s => s.validationError);
  const selectedStrategy    = useRouteStore(s => s.selectedStrategy);
  const showAllRouteBubbles = useRouteStore(s => s.showAllRouteBubbles);
  const busPathResult       = useRouteStore(s => s.busPathResult);
  const routeActions        = useRouteStore(useShallow(s => ({
    setStartStation:      s.setStartStation,
    setEndStation:        s.setEndStation,
    addWaypoint:          s.addWaypoint,
    setPathResults:       s.setPathResults,
    setIsCalculating:     s.setIsCalculating,
    setValidationError:   s.setValidationError,
    setSelectedStrategy:  s.setSelectedStrategy,
    setShowAllRouteBubbles: s.setShowAllRouteBubbles,
    setBusPathResult:     s.setBusPathResult,
    reset:                s.reset,
    getActivePath:        s.getActivePath,
  })));

  // useMapStore
  const userLocation      = useMapStore(s => s.userLocation);
  const activeLine        = useMapStore(s => s.activeLine);
  const nearestStation    = useMapStore(s => s.nearestStation);
  const nearestBusStop    = useMapStore(s => s.nearestBusStop);
  const nearestWC         = useMapStore(s => s.nearestWC);
  const isLocating        = useMapStore(s => s.isLocating);
  const locatingTimer     = useMapStore(s => s.locatingTimer);
  const hasInitialLocation = useMapStore(s => s.hasInitialLocation);
  const mapActions        = useMapStore(useShallow(s => ({
    setUserLocation:   s.setUserLocation,
    setActiveLine:     s.setActiveLine,
    toggleActiveLine:  s.toggleActiveLine,
    setNearestStation: s.setNearestStation,
    setNearestBusStop: s.setNearestBusStop,
    setNearestWC:      s.setNearestWC,
    setIsLocating:     s.setIsLocating,
    setLocatingTimer:  s.setLocatingTimer,
    setHasInitialLocation: s.setHasInitialLocation,
  })));

  // useUIStore
  const activeTab         = useUIStore(s => s.activeTab);
  const isDarkMode        = useUIStore(s => s.isDarkMode);
  const isHighContrast    = useUIStore(s => s.isHighContrast);
  const weatherOpen       = useUIStore(s => s.weatherOpen);
  const wcFilters         = useUIStore(s => s.wcFilters);
  const timeDisplayMode   = useUIStore(s => s.timeDisplayMode);
  const uiActions         = useUIStore(useShallow(s => ({
    setActiveTab:          s.setActiveTab,
    toggleDarkMode:        s.toggleDarkMode,
    toggleWeather:         s.toggleWeather,
    setWeatherOpen:        s.setWeatherOpen,
    toggleTimeDisplayMode: s.toggleTimeDisplayMode,
    setTimeDisplayMode:    s.setTimeDisplayMode,
  })));

  // useSubwayStore
  const selectedStationName = useSubwayStore(s => s.selectedStationName);
  const selectedBusStop     = useSubwayStore(s => s.selectedBusStop);
  const selectedWC          = useSubwayStore(s => s.selectedWC);
  const selectedBusRoute    = useSubwayStore(s => s.selectedBusRoute);
  const routePathData       = useSubwayStore(s => s.routePathData);
  const busStops            = useSubwayStore(s => s.busStops);
  const wcItems             = useSubwayStore(s => s.wcItems);
  const subwayActions       = useSubwayStore(useShallow(s => ({
    setSelectedStationName: s.setSelectedStationName,
    setSelectedBusStop:     s.setSelectedBusStop,
    setSelectedWC:          s.setSelectedWC,
    setBusStops:            s.setBusStops,
    setWcItems:             s.setWcItems,
    setNearestWCs:          s.setNearestWCs,
    clearStationSelection:  s.clearStationSelection,
    setRoutePathData:       s.setRoutePathData,
  })));

  // ── 편의 별칭 (기존 코드 최소 수정) ──
  const route   = { startStation, endStation, waypoints, pathResults, isCalculating, validationError, selectedStrategy, showAllRouteBubbles, busPathResult, ...routeActions, getActivePath: routeActions.getActivePath };
  const mapSt   = { userLocation, activeLine, nearestStation, nearestBusStop, nearestWC, isLocating, locatingTimer, hasInitialLocation, ...mapActions };
  const ui      = { activeTab, isDarkMode, weatherOpen, wcFilters, timeDisplayMode, ...uiActions };
  const subway  = { selectedStationName, selectedBusStop, selectedWC, selectedBusRoute, routePathData, busStops, wcItems, ...subwayActions };

  // ── 뷰포트 bounds (viewport-aware 폴링용) ──
  const [viewportBounds, setViewportBounds] = useState<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | null>(null);
  useViewportLines(viewportBounds);

  // ── 온라인/오프라인 상태 (초기 상태 + 이벤트 모두 반영) ──
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline  = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online',  onOnline);
    return () => { window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); };
  }, []);

  // ── 모든 역 목록 (고유) — 초기 번들에서 제외, 비동기 로드 ──
  const [stations, setStations] = useState<SubwayStation[]>([]);
  useEffect(() => {
    import('@/data/subway-lines').then(({ SUBWAY_LINES }) => {
      const seen = new Map<string, SubwayStation>();
      SUBWAY_LINES.forEach((line: any) => line.stations.forEach((s: SubwayStation) => {
        if (!seen.has(s.name)) seen.set(s.name, s);
      }));
      setStations(Array.from(seen.values()));
    });
  }, []);

  // ── activePath computed ──
  const activePath = route.getActivePath();
  const lastTrainWarning = useLastTrainWarning(activePath?.path ?? []);

  // ── 도착 정보 훅 ──
  const arrivalInfo = useArrivalInfo(subway.selectedStationName);

  // ─────────────────────────────────────────────────────────────────────────
  // 초기 데이터 로드
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // 도착지는 매 세션마다 비워 — 사용자가 직접 지정하도록
    routeActions.setEndStation(null);

    (async () => {
      await db.initializeData(); // loads stations (92KB) only
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // GPS 위치 추적 — watchPosition: 권한 허용 후 위치를 잡을 때까지 계속 시도
  // ─────────────────────────────────────────────────────────────────────────
  // stations ref: watchPosition 콜백 안에서 최신 stations를 참조하되
  // stations가 바뀔 때마다 watchPosition을 재생성하지 않기 위해 ref 사용
  const stationsRef = useRef(stations);
  useEffect(() => { stationsRef.current = stations; }, [stations]);

  useEffect(() => {
    if (!navigator.geolocation) return;

    // 최초 조회 중 UI
    mapSt.setIsLocating(true);
    mapSt.setLocatingTimer(10);
    const timerInterval = setInterval(() => {
      mapSt.setLocatingTimer(Math.max(0, useMapStore.getState().locatingTimer - 1));
    }, 1000);

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        mapSt.setUserLocation([latitude, longitude]);

        if (!initLocRef.current) {
          initLocRef.current = true;
          mapSt.setIsLocating(false);
          clearInterval(timerInterval);

          mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 15, duration: 1500 });
          mapSt.setHasInitialLocation(true);

          const stns = stationsRef.current;
          if (stns.length > 0) {
            const nearest: any = await findNearestStation(latitude, longitude, stns);
            if (nearest?.name && !route.startStation) {
              route.setStartStation(`내 위치 : ${nearest.name} (내 위치)`);
            }
          }
        }
      },
      (err) => {
        // PERMISSION_DENIED(1): 사용자가 명시적으로 거부 — 더 이상 시도 안 함
        if (err.code === 1) {
          initLocRef.current = true;
          mapSt.setIsLocating(false);
          clearInterval(timerInterval);
          return;
        }
        // POSITION_UNAVAILABLE(2) / TIMEOUT(3): watchPosition이 자동으로 계속 재시도
        // — 별도 처리 불필요
      },
      // PC: enableHighAccuracy:false → 네트워크/IP 위치 사용 (GPS 없음)
      // 모바일: 같은 설정으로도 GPS 사용됨
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timerInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // watchPosition은 마운트 시 1회만 등록

  // ─────────────────────────────────────────────────────────────────────────
  // 가장 가까운 시설 계산 (userLocation 변경 시)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loc = mapSt.userLocation;
    if (!loc) { mapSt.setNearestStation(null); mapSt.setNearestBusStop(null); mapSt.setNearestWC(null); return; }
    const [lat, lng] = loc;

    if (stations.length > 0) {
      findNearestStation(lat, lng, stations).then(n => { if (n) mapSt.setNearestStation(n as Station); });
    }

    // Fetch a small bbox (0.15°≈16km) around the user just for nearest-stop calc.
    // Do NOT push this into the display store — display is controlled by handleBoundsChange.
    const nearBbox = bboxAround(lat, lng, 0.15);
    Promise.all([fetchBusTiles(nearBbox), fetchWCTiles(nearBbox)]).then(([nearBus, nearWC]) => {
      let minB = Infinity, foundB: BusStop | null = null;
      for (const s of nearBus) {
        const d = (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
        if (d < minB) { minB = d; foundB = s; }
      }
      mapSt.setNearestBusStop(foundB);

      let minW = Infinity, foundW: WCItem | null = null;
      for (const s of nearWC) {
        const d = (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
        if (d < minW) { minW = d; foundW = s; }
      }
      mapSt.setNearestWC(foundW);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSt.userLocation, stations]);

  // 버스·화장실 탭 전환 시 내 위치로 줌인 (100m 수준)
  useEffect(() => {
    const { activeTab } = ui;
    const loc = mapSt.userLocation;
    if (!loc) return;
    const [lat, lng] = loc;
    const center: [number, number] = [lng, lat];

    if (activeTab === 'bus') {
      mapRef.current?.flyTo({ center, zoom: 17, duration: 700 });
    }

    if (activeTab === 'wc') {
      mapRef.current?.flyTo({ center, zoom: 17, duration: 700 });

      const doSort = (items: WCItem[]) =>
        sortWCs(items, lat, lng).then(sorted => subway.setNearestWCs(sorted as WCItem[]));

      const current = useSubwayStore.getState().wcItems;
      if (current.length > 0) {
        doSort(current);
      } else {
        fetchWCTiles(bboxAround(lat, lng, 0.15)).then(items => {
          useSubwayStore.getState().setWcItems(items);
          doSort(items);
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.activeTab, mapSt.userLocation]);

  // isDarkMode / isHighContrast → <html> class 동기화
  useEffect(() => {
    document.documentElement.classList.toggle('dark', ui.isDarkMode);
  }, [ui.isDarkMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', isHighContrast);
  }, [isHighContrast]);

  // PWA shortcuts via query params: ?tab=, ?from=, ?to=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['subway', 'bus', 'wc'].includes(tab)) {
      ui.setActiveTab(tab as any);
    }
    // Deep link: ?from=강남&to=홍대입구 → pre-fill route inputs
    const from = params.get('from');
    const to = params.get('to');
    if (from) route.setStartStation(from);
    if (to) route.setEndStation(to);
    // Clean the URL so it doesn't persist across navigations
    if (from || to || tab) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // validationError 5초 자동 해제
  useEffect(() => {
    if (route.validationError === 'no_route') {
      const t = setTimeout(() => route.setValidationError(null), 5000);
      return () => clearTimeout(t);
    }
  }, [route.validationError]);

  // ─────────────────────────────────────────────────────────────────────────
  // 경로 탐색
  // ─────────────────────────────────────────────────────────────────────────
  const calculatePath = useCallback(async (
    start: string | null,
    waypoints: string[],
    end: string | null,
    showError = false   // true일 때만 no_route 에러 표시 (길찾기 버튼 명시적 실행 시)
  ) => {
    const rst = useRouteStore.getState();
    if (!start || !end) { rst.setPathResults(null); return; }
    rst.setIsCalculating(true);
    rst.setValidationError(null);

    // 버스 경로
    if (useUIStore.getState().activeTab === 'bus') {
      const res = findBusPath(start, end, useSubwayStore.getState().busStops, useMapStore.getState().userLocation);
      rst.setBusPathResult(res);
      if (!res && showError) rst.setValidationError('no_route');
      rst.setIsCalculating(false);
      return;
    }

    // 지하철 경로 — bus result 초기화
    rst.setBusPathResult(null);
    const normalize = normalizeStationName;
    const points = [normalize(start), ...waypoints.map(normalize).filter(Boolean), normalize(end)];

    try {
      const res = await findPath(points) as Record<string, PathResult>;
      const rst2 = useRouteStore.getState();
      rst2.setIsCalculating(false);
      if (res?.time && res?.transfer) {
        hapticSuccess();
        rst2.setPathResults({ time: res.time, transfer: res.transfer });
      } else {
        if (showError) { hapticError(); rst2.setValidationError('no_route'); }
        rst2.setPathResults(null);
      }
    } catch {
      if (showError) hapticError();
      const rst2 = useRouteStore.getState();
      rst2.setPathResults(null);
      if (showError) rst2.setValidationError('no_route');
      rst2.setIsCalculating(false);
    }
  }, [findPath]);

  // start/end/waypoints 바뀔 때마다 자동 탐색 (에러 표시 없음 — 입력 중일 수 있음)
  useEffect(() => {
    calculatePath(route.startStation, route.waypoints, route.endStation, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.startStation, route.waypoints, route.endStation]);

  // 길찾기 활성화 시 activeLine 해제
  useEffect(() => {
    if (activePath && mapSt.activeLine) mapSt.setActiveLine(null);
  }, [activePath, mapSt.activeLine]);

  // 경로 결과 나오면 지도 자동 fitBounds
  useEffect(() => {
    if (!activePath?.path?.length || !mapRef.current) return;
    import('@/data/subway-lines').then(({ getStationByName }) => {
      const coords: [number, number][] = [];
      for (const name of activePath.path) {
        const s = getStationByName(name);
        if (s?.lat && s?.lng) coords.push([s.lng, s.lat]);
      }
      if (coords.length < 2) return;
      const minLng = Math.min(...coords.map(c => c[0]));
      const maxLng = Math.max(...coords.map(c => c[0]));
      const minLat = Math.min(...coords.map(c => c[1]));
      const maxLat = Math.max(...coords.map(c => c[1]));
      mapRef.current?.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: { top: 80, bottom: 220, left: 40, right: 40 },
        duration: 1200,
        maxZoom: 14
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  // ─────────────────────────────────────────────────────────────────────────
  // 이벤트 핸들러
  // ─────────────────────────────────────────────────────────────────────────
  const handleStationClick = useCallback((name: string, latlng?: [number, number]) => {
    const st = useSubwayStore.getState();
    st.setSelectedStationName(normalizeStationName(name));
    st.setSelectedBusStop(null);
    st.setSelectedWC(null);
    if (latlng) setMapCenter(latlng[0], latlng[1]);
  }, []);

  const handleBusStopClick = useCallback((stop: BusStop, coords?: [number, number]) => {
    const st = useSubwayStore.getState();
    st.setSelectedBusStop(stop);
    st.setSelectedStationName(null);
    st.setSelectedWC(null);
    if (coords) setMapCenter(coords[1], coords[0]);
  }, []);

  const handleReset = useCallback(() => {
    useRouteStore.getState().reset();
    const st = useSubwayStore.getState();
    st.clearStationSelection();
    st.setSelectedWC(null);
    st.setSelectedBusStop(null);
  }, []);

  const handleLocate = useCallback(() => {
    const mapSt = useMapStore.getState();
    const loc = mapSt.userLocation;
    if (loc && mapRef.current) {
      // 위치가 이미 있으면 해당 위치로 이동
      mapRef.current.flyTo({ center: [loc[1], loc[0]], zoom: 15, duration: 1500 });
    }
    // 위치가 없으면 watchPosition이 이미 백그라운드에서 조회 중 — 별도 호출 불필요
    // (중복 getCurrentPosition 호출 시 브라우저가 권한 팝업을 다시 보여줄 수 있음)
  }, []);

  const handleLocateStation = useCallback(async (type: 'source' | 'dest') => {
    const mapSt = useMapStore.getState();
    if (mapSt.isLocating) return;
    mapSt.setIsLocating(true);
    mapSt.setLocatingTimer(5);
    const interval = setInterval(() => {
      const st = useMapStore.getState();
      st.setLocatingTimer(Math.max(0, st.locatingTimer - 1));
    }, 1000);
    const cleanup = () => {
      clearInterval(interval);
      const st = useMapStore.getState();
      st.setIsLocating(false);
      st.setLocatingTimer(0);
    };

    const doNearest = async (lat: number, lng: number) => {
      const nearest: any = await findNearestStation(lat, lng, stations);
      if (nearest?.name) {
        const val = `내 위치 : ${nearest.name} (내 위치)`;
        const rst = useRouteStore.getState();
        if (type === 'source') rst.setStartStation(val);
        else rst.setEndStation(val);
      }
      cleanup();
    };

    const loc = useMapStore.getState().userLocation;
    if (loc) {
      await doNearest(loc[0], loc[1]);
    } else {
      navigator.geolocation.getCurrentPosition(
        async pos => {
          useMapStore.getState().setUserLocation([pos.coords.latitude, pos.coords.longitude]);
          await doNearest(pos.coords.latitude, pos.coords.longitude);
        },
        () => cleanup(),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
      );
    }
  }, [findNearestStation, stations]);

  const handleSelectBusRoute = useCallback(async (routeNo: string, cityCode?: string, routeId?: string) => {
    if (!cityCode) return;
    try {
      const { MetropolitanBusService } = await import('@/services/busApi');

      // Fast path: routeId provided directly from arrivals API (no master-routes lookup needed)
      let resolvedId = routeId;
      if (!resolvedId) {
        const routes = await getBusRoutes();
        const found = routes.find((r: any) => r.no === routeNo && r.cityCode === cityCode);
        resolvedId = found?.id;
      }

      if (!resolvedId) return;

      // Track for real-time bus position overlay
      useSubwayStore.getState().setSelectedBusRoute(resolvedId);

      const result = await MetropolitanBusService.buildRouteWithStops(cityCode, resolvedId);
      if (result) {
        useSubwayStore.getState().setRoutePathData(result.geoJSON);
        if (result.bounds && mapRef.current) {
          mapRef.current.fitBounds(result.bounds, {
            padding: { top: 80, bottom: 220, left: 40, right: 40 },
            duration: 2000,
            maxZoom: 14,
          });
        }
      }
    } catch {}
  }, []);

  const handleBoundsChange = useCallback(async (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => {
    setViewportBounds(bounds);
    // Always fetch tiles for the current viewport — display only what's on screen
    const [busStops, wcItems] = await Promise.all([
      fetchBusTiles(bounds),
      fetchWCTiles(bounds),
    ]);
    const st = useSubwayStore.getState();
    st.setBusStops(busStops);
    st.setWcItems(wcItems);
  }, []);

  // Stable callbacks — use getState() for Zustand actions so no subscription needed
  // (Zustand actions are always the same reference; getState() avoids re-render triggers)
  const handleCenterChange = useCallback((lat: number, lng: number) => {
    setMapCenter(lat, lng);
  }, []);

  const handleActiveLineChange = useCallback((line: string | null) => {
    const st = useMapStore.getState();
    if (line) st.toggleActiveLine(line);
    else st.setActiveLine(null);
  }, []);

  const handleMapReady = useCallback((m: any) => {
    mapRef.current = m;
    // ?debug 로 열면 점검 스크립트(헤드리스 크롬)가 지도 상태를 읽을 수 있게 노출
    if (new URLSearchParams(window.location.search).has('debug')) (window as any).__metroMap = m;
  }, []);

  const handleToggleShowAll = useCallback(() => {
    const s = useRouteStore.getState();
    s.setShowAllRouteBubbles(!s.showAllRouteBubbles);
  }, []);

  const handleClearBusRoute = useCallback(() => {
    const st = useSubwayStore.getState();
    st.setRoutePathData(null);
    st.setSelectedBusRoute(null);
  }, []);

  const handleTabChange = useCallback((tab: any) => useUIStore.getState().setActiveTab(tab), []);

  const handleSearch = useCallback((start: string, end: string) => {
    calculatePath(start, useRouteStore.getState().waypoints, end, true);
  }, [calculatePath]);

  // ─────────────────────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-[var(--background)] font-sans">
      <a href={view === 'arrival' ? '#arrival-search' : '#app-panel'} className="skip-link">{view === 'arrival' ? '역 검색으로 건너뛰기' : '경로 검색으로 건너뛰기'}</a>
      <h1 className="sr-only">Metro Live 수도권 지하철 실시간 도착 안내</h1>

      {/* 지도 */}
      <div className="absolute inset-0 z-10">
        <MapLibreBackground
          startStation={route.startStation}
          endStation={route.endStation}
          isDarkMode={ui.isDarkMode}
          wcItems={subway.wcItems}
          wcFilters={ui.wcFilters}
          busStops={subway.busStops}
          activeTab={ui.activeTab}
          selectedBusStopId={subway.selectedBusStop?.id ?? null}
          selectedBusRoute={subway.selectedBusRoute}
          routePathData={subway.routePathData}
          onWCClick={subway.setSelectedWC}
          onBusStopClick={handleBusStopClick}
          onStationClick={handleStationClick}
          selectedStationName={subway.selectedStationName}
          stationArrivals={arrivalInfo.arrivals}
          arrivalLoading={arrivalInfo.loading}
          isLiveArrival={arrivalInfo.isLive}
          onRefreshArrival={arrivalInfo.refresh}
          selectedWC={subway.selectedWC}
          selectedBusStop={subway.selectedBusStop}
          onSetStart={route.setStartStation}
          onSetEnd={route.setEndStation}
          onSetWaypoint={route.addWaypoint}
          onCenterChange={handleCenterChange}
          onBoundsChange={handleBoundsChange}
          stations={stations}
          activeLine={mapSt.activeLine}
          onActiveLineChange={handleActiveLineChange}
          onMapReady={handleMapReady}
          pathResult={activePath}
          userLocation={mapSt.userLocation}
          nearestStation={mapSt.nearestStation}
          nearestBusStop={mapSt.nearestBusStop}
          nearestWC={mapSt.nearestWC}
          timeDisplayMode={ui.timeDisplayMode}
          onToggleTimeDisplay={ui.toggleTimeDisplayMode}
          showAllRouteBubbles={route.showAllRouteBubbles}
          onToggleShowAll={handleToggleShowAll}
          onSelectBusRoute={handleSelectBusRoute}
          onClearRoute={handleClearBusRoute}
        />
      </div>

      {/* 하단 패널 (지도 화면에서만) */}
      {view === 'map' && <UnifiedBottomPanel
        activeTab={ui.activeTab}
        onTabChange={handleTabChange}
        onSearch={handleSearch}
        onReset={handleReset}
        startStation={route.startStation}
        endStation={route.endStation}
        onSetSource={route.setStartStation}
        onSetDestination={route.setEndStation}
        isDarkMode={ui.isDarkMode}
        onLocate={handleLocateStation}
        stations={stations}
        busStops={subway.busStops}
        selectedStrategy={route.selectedStrategy}
        onStrategyChange={route.setSelectedStrategy}
        pathResults={route.pathResults}
        activePath={activePath}
        timeDisplayMode={ui.timeDisplayMode}
        setTimeDisplayMode={ui.setTimeDisplayMode}
        isLocating={mapSt.isLocating}
        locatingTimer={mapSt.locatingTimer}
        isCalculating={route.isCalculating}
        validationError={route.validationError}
        busPathResult={route.busPathResult}
        showAllRouteBubbles={route.showAllRouteBubbles}
        onToggleShowAll={handleToggleShowAll}
        selectedStationName={subway.selectedStationName}
        stationArrivals={arrivalInfo.arrivals}
        schedules={arrivalInfo.schedules}
        onSelectStation={subway.setSelectedStationName}
        activeLine={mapSt.activeLine}
        onActiveLineChange={handleActiveLineChange}
        selectedBusStop={subway.selectedBusStop}
        onSelectBusRoute={handleSelectBusRoute}
      />}

      {/* 지도 컨트롤 */}
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 z-[2001] flex flex-col gap-4 items-end">
        <MapControls
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
          onLocate={handleLocate}
          onWeatherToggle={ui.toggleWeather}
          isDarkMode={ui.isDarkMode}
          onDarkModeToggle={ui.toggleDarkMode}
          isHighContrast={isHighContrast}
          onHighContrastToggle={useUIStore.getState().toggleHighContrast}
        />
      </div>

      {/* 날씨 팝업 */}
      {ui.weatherOpen && (
        <WeatherPopup onClose={() => ui.setWeatherOpen(false)} />
      )}

      {/* 상단 상태 영역: 오프라인 / 막차 / 실시간 신뢰도 */}
      <div
        className="fixed top-[calc(max(1rem,env(safe-area-inset-top))+3.25rem)] left-4 right-20 z-[2000] flex flex-col items-start gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {isOffline ? (
          <StatusPill tone="neutral" dot={false}>오프라인. 저장된 데이터로 보여주는 중</StatusPill>
        ) : (
          <RealtimeStatusPill simStatus={simStatus} apiIssue={apiIssue} />
        )}

        {lastTrainWarning && (
          <StatusPill tone="danger">
            <span className="tabular-nums">
              {lastTrainWarning.station} 막차 {lastTrainWarning.minutesLeft === 0 ? '곧 출발' : `${lastTrainWarning.minutesLeft}분 후`} ({lastTrainWarning.lastTimeStr} {lastTrainWarning.dest}행)
            </span>
          </StatusPill>
        )}
      </div>

      {/* 메인: 내 역 도착 안내 */}
      {view === 'arrival' && (
        <StationArrivalPanel
          nearestStationName={mapSt.nearestStation?.name ?? null}
          onShowMap={showStationOnMap}
        />
      )}

      {/* 화면 전환: 도착 안내 | 지도 */}
      <div className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[2500] -translate-x-1/2">
        <div role="tablist" aria-label="화면 전환" className="flex rounded-full border border-zinc-900/[0.06] bg-white/90 p-1 shadow-[0_1px_2px_rgba(24,24,27,0.06),0_6px_16px_-6px_rgba(24,24,27,0.18)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-zinc-900/90">
          {([['arrival', '도착 안내'], ['map', '지도']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => changeView(v)}
              className={`h-9 min-w-[84px] rounded-full px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:focus-visible:ring-white/30 ${view === v ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-600 dark:text-zinc-300'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 화장실 나침반 - 탭 무관하게 화장실 선택 시 표시 */}
      {subway.selectedWC && mapSt.userLocation && (
        <DirectionCompass
          key={subway.selectedWC.id}
          userLocation={mapSt.userLocation}
          targetLocation={[subway.selectedWC.lat, subway.selectedWC.lng]}
          targetName={subway.selectedWC.name}
          onClose={() => subway.setSelectedWC(null)}
        />
      )}
    </main>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 상태 표시
// ─────────────────────────────────────────────────────────────────────────────
type PillTone = 'live' | 'warn' | 'neutral' | 'danger';

const PILL_TONE: Record<PillTone, { wrap: string; dot: string }> = {
  live:    { wrap: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  warn:    { wrap: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500' },
  neutral: { wrap: 'text-zinc-600 dark:text-zinc-300',       dot: 'bg-zinc-400' },
  danger:  { wrap: 'text-rose-700 dark:text-rose-300',       dot: 'bg-rose-500' },
};

function StatusPill({ tone, dot = true, children }: { tone: PillTone; dot?: boolean; children: React.ReactNode }) {
  const t = PILL_TONE[tone];
  return (
    <div className={`animate-popup inline-flex max-w-full items-center gap-2 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-900/[0.06] dark:border-white/[0.08] px-3 py-1.5 text-[12px] font-medium leading-tight shadow-[0_1px_2px_rgba(24,24,27,0.06),0_6px_16px_-6px_rgba(24,24,27,0.18)] ${t.wrap}`}>
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </div>
  );
}

/**
 * 열차 위치가 어디서 왔는지 정직하게 보여준다.
 * API 오류(한도 초과, 키 오류, 연결 실패)는 숨기지 않고 그대로 알린다.
 */
function RealtimeStatusPill({ simStatus, apiIssue }: { simStatus: SimStatus; apiIssue: SeoulApiIssue }) {
  if (apiIssue === 'quota')       return <StatusPill tone="danger">오늘 실시간 API 호출 한도 초과</StatusPill>;
  if (apiIssue === 'invalid-key') return <StatusPill tone="danger">실시간 API 키 오류</StatusPill>;
  if (apiIssue === 'unreachable') return <StatusPill tone="warn">실시간 서버에 연결하지 못함</StatusPill>;
  if (simStatus === 'starting')   return <StatusPill tone="neutral">실시간 위치 불러오는 중</StatusPill>;
  if (apiIssue === 'sample-key')  return <StatusPill tone="warn">샘플 키 사용 중. 일부 열차만 실시간</StatusPill>;
  if (simStatus === 'live')       return <StatusPill tone="live">실시간 위치</StatusPill>;
  if (simStatus === 'mixed')      return <StatusPill tone="warn">일부 노선만 실시간</StatusPill>;
  return <StatusPill tone="neutral">실시간 열차 정보 없음</StatusPill>;
}
