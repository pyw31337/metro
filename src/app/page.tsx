"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";

import type { Station as SubwayStation } from "@/data/subway-lines";
import { BusStop, Station, WCItem, PathResult } from "@/types/metro";

import { useDataWorker }      from "@/hooks/useDataWorker";
import { useArrivalInfo }     from "@/hooks/useArrivalInfo";
import { normalizeStationName } from "@/utils/stationUtils";
import { setMapCenter }         from "@/utils/mapCenter";
import { findBusPath }         from "@/utils/busRouting";
import { hapticSuccess, hapticError } from "@/utils/haptic";
import { db }                  from "@/services/db";

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
import DirectionCompass  from "@/components/ui/DirectionCompass";

// Module-level cache so the 3MB routes JSON is only fetched once per session
let busRoutesCache: any[] | null = null;
const getBusRoutes = async () => {
  if (busRoutesCache) return busRoutesCache;
  const res = await fetch('/metro/data/master-bus-routes.json');
  busRoutesCache = await res.json();
  return busRoutesCache!;
};

// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const { findPath, findNearestStation, sortWCs } = useDataWorker();
  const mapRef = useRef<any>(null);
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

  // ── 온라인/오프라인 상태 ──
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline  = () => setIsOffline(false);
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

  // ── 도착 정보 훅 ──
  const arrivalInfo = useArrivalInfo(subway.selectedStationName);

  // ─────────────────────────────────────────────────────────────────────────
  // 초기 데이터 로드
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // 도착지는 매 세션마다 비워 — 사용자가 직접 지정하도록
    routeActions.setEndStation(null);

    (async () => {
      await db.initializeData();
      const [allBusStops, allWCs] = await Promise.all([
        db.busStops.toArray() as Promise<BusStop[]>,
        db.wc.toArray()       as Promise<WCItem[]>,
      ]);
      subway.setBusStops(allBusStops);
      subway.setWcItems(allWCs);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // GPS 위치 추적 (최초 1회 → 이후 30초 주기)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    let timerInterval: NodeJS.Timeout;

    const updateLocation = () => {
      if (!initLocRef.current) {
        mapSt.setIsLocating(true);
        mapSt.setLocatingTimer(10);
        timerInterval = setInterval(() => {
          mapSt.setLocatingTimer(Math.max(0, useMapStore.getState().locatingTimer - 1));
        }, 1000);
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          mapSt.setUserLocation([latitude, longitude]);

          if (!initLocRef.current) {
            initLocRef.current = true;
            mapSt.setIsLocating(false);
            clearInterval(timerInterval);

            mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 13, duration: 2000 });
            mapSt.setHasInitialLocation(true);

            if (stations.length > 0) {
              const nearest: any = await findNearestStation(latitude, longitude, stations);
              if (nearest?.name && !route.startStation) {
                route.setStartStation(`내 위치 : ${nearest.name} (내 위치)`);
              }
            }
          }
        },
        (_err) => {
          // 최초 시도 실패 시에도 initLocRef를 true로 — "위치 찾는 중" UI가 반복되지 않도록
          if (!initLocRef.current) {
            initLocRef.current = true;
            mapSt.setIsLocating(false);
            clearInterval(timerInterval);
          }
        },
        // PC는 GPS 없음 → enableHighAccuracy:false(네트워크 위치)로 빠르게, 캐시 허용
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 }
      );
    };

    updateLocation();
    // 배터리 절약: 탭 숨겨지면 폴링 안 함
    const LOCATION_INTERVAL_MS = 30_000;
    const mainInterval = setInterval(() => {
      if (!document.hidden) updateLocation();
    }, LOCATION_INTERVAL_MS);

    return () => {
      clearInterval(mainInterval);
      clearInterval(timerInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations]);

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

    // 버스정류장 선형 탐색 (최적화: squared Euclidean)
    if (subway.busStops.length > 0) {
      let min = Infinity, found: BusStop | null = null;
      for (const s of subway.busStops) {
        const d = (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
        if (d < min) { min = d; found = s; }
      }
      mapSt.setNearestBusStop(found);
    }

    if (subway.wcItems.length > 0) {
      let min = Infinity, found: WCItem | null = null;
      for (const s of subway.wcItems) {
        const d = (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
        if (d < min) { min = d; found = s; }
      }
      mapSt.setNearestWC(found);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSt.userLocation, stations]);

  // 화장실 탭 전환 시 거리 정렬 + 내 위치로 지도 이동
  useEffect(() => {
    if (ui.activeTab === 'wc' && mapSt.userLocation) {
      // 내 위치 중심으로 지도 이동 (zoom 15)
      mapRef.current?.flyTo({
        center: [mapSt.userLocation[1], mapSt.userLocation[0]],
        zoom: 15,
        duration: 800,
      });
      if (subway.wcItems.length > 0) {
        sortWCs(subway.wcItems, mapSt.userLocation[0], mapSt.userLocation[1]).then(sorted => {
          subway.setNearestWCs(sorted as WCItem[]);
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.activeTab, mapSt.userLocation, subway.wcItems]);

  // isDarkMode → <html class="dark"> 동기화
  useEffect(() => {
    document.documentElement.classList.toggle('dark', ui.isDarkMode);
  }, [ui.isDarkMode]);

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
      mapRef.current.flyTo({ center: [loc[1], loc[0]], zoom: 15, duration: 1500 });
    } else if (navigator.geolocation && mapRef.current) {
      navigator.geolocation.getCurrentPosition(pos => {
        mapSt.setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        mapRef.current.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15, duration: 1500 });
      });
    }
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

      const path = await MetropolitanBusService.fetchRoutePath(cityCode, resolvedId);
      if (path) {
        useSubwayStore.getState().setRoutePathData(path);
        const coord = path.features[0]?.geometry?.coordinates[0];
        if (coord) mapRef.current?.flyTo({ center: coord, zoom: 13, duration: 2000 });
      }
    } catch {}
  }, []);

  const handleBoundsChange = useCallback(async (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => {
    const activeTab = useUIStore.getState().activeTab;
    if (activeTab !== 'bus' && activeTab !== 'subway+bus') return;
    const count = await db.busStops
      .where('lat').between(bounds.minLat, bounds.maxLat)
      .and(s => s.lng >= bounds.minLng && s.lng <= bounds.maxLng)
      .limit(1).count();
    // 정적 데이터(master-bus-stops.json)로 이미 전체 정류장 로드됨 — 동적 fetch 불필요
    void count;
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

  const handleMapReady = useCallback((m: any) => { mapRef.current = m; }, []);

  const handleToggleShowAll = useCallback(() => {
    const s = useRouteStore.getState();
    s.setShowAllRouteBubbles(!s.showAllRouteBubbles);
  }, []);

  const handleTabChange = useCallback((tab: any) => useUIStore.getState().setActiveTab(tab), []);

  const handleSearch = useCallback((start: string, end: string) => {
    calculatePath(start, useRouteStore.getState().waypoints, end, true);
  }, [calculatePath]);

  // ─────────────────────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="relative w-full h-[100dvh] overflow-hidden bg-white dark:bg-black font-sans">

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
        />
      </div>

      {/* 하단 패널 */}
      <UnifiedBottomPanel
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
      />

      {/* 지도 컨트롤 */}
      <div className="fixed top-6 right-6 z-[2001] flex flex-col gap-4 items-center">
        <MapControls
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
          onLocate={handleLocate}
          onWeatherToggle={ui.toggleWeather}
          isDarkMode={ui.isDarkMode}
          onDarkModeToggle={ui.toggleDarkMode}
        />
      </div>

      {/* 날씨 팝업 */}
      {ui.weatherOpen && (
        <WeatherPopup onClose={() => ui.setWeatherOpen(false)} />
      )}

      {/* 오프라인 알림 배지 */}
      {isOffline && (
        <div className="animate-popup fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-full bg-zinc-900/90 dark:bg-white/90 text-white dark:text-zinc-900 text-[11px] font-black backdrop-blur-xl border border-white/10 dark:border-black/10 shadow-lg pointer-events-none">
          오프라인 · 캐시 데이터 사용 중
        </div>
      )}

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
