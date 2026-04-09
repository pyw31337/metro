"use client";

import { useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence } from "framer-motion";

import { SUBWAY_LINES, Station as SubwayStation } from "@/data/subway-lines";
import { BusStop, Station, WCItem, PathResult } from "@/types/metro";

import { useDataWorker }      from "@/hooks/useDataWorker";
import { useArrivalInfo }     from "@/hooks/useArrivalInfo";
import { normalizeStationName } from "@/utils/stationUtils";
import { findBusPath }         from "@/utils/busRouting";
import { getCityCodeByCoords } from "@/utils/regionUtils";
import { db }                  from "@/services/db";
import { DataIngestionService } from "@/services/dataIngestion";

import { useRouteStore }  from "@/store/useRouteStore";
import { useMapStore }    from "@/store/useMapStore";
import { useUIStore }     from "@/store/useUIStore";
import { useSubwayStore } from "@/store/useSubwayStore";

// ── dynamic imports ──
const MapLibreBackground = dynamic(() => import("@/components/MapLibreBackground"),  { ssr: false });
const UnifiedBottomPanel = dynamic(() => import("@/components/UnifiedBottomPanel"),  { ssr: false });
const MapControls        = dynamic(() => import("@/components/MapControls"),         { ssr: false });
const WeatherPopup       = dynamic(() => import("@/components/WeatherPopup"),        { ssr: false });
import DirectionCompass  from "@/components/ui/DirectionCompass";

// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const { findPath, findNearestStation, sortWCs } = useDataWorker();
  const mapRef = useRef<any>(null);
  const initLocRef = useRef(false);

  // ── stores ──
  const route   = useRouteStore();
  const mapSt   = useMapStore();
  const ui      = useUIStore();
  const subway  = useSubwayStore();

  // ── 모든 역 목록 (고유) ──
  const stations = useMemo(() => {
    const seen = new Map<string, SubwayStation>();
    SUBWAY_LINES.forEach(line => line.stations.forEach(s => { if (!seen.has(s.name)) seen.set(s.name, s); }));
    return Array.from(seen.values());
  }, []);

  // ── activePath computed ──
  const activePath = route.getActivePath();

  // ── 도착 정보 훅 ──
  const arrivalInfo = useArrivalInfo(subway.selectedStationName);

  // ─────────────────────────────────────────────────────────────────────────
  // 초기 데이터 로드
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
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

            // 최초 위치 → 지도 이동 (직접 호출, 배치 렌더 우회)
            mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 15, duration: 2000 });
            mapSt.setHasInitialLocation(true);


            // 가장 가까운 역을 출발역으로
            if (stations.length > 0) {
              const nearest: any = await findNearestStation(latitude, longitude, stations);
              if (nearest?.name && !route.startStation) {
                route.setStartStation(`내 위치 : ${nearest.name} (내 위치)`);
              }
            }
          }
        },
        (err) => {
          if (!initLocRef.current) {
            mapSt.setIsLocating(false);
            clearInterval(timerInterval);
          }
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
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

  // 화장실 탭 전환 시 거리 정렬
  useEffect(() => {
    if (ui.activeTab === 'wc' && mapSt.userLocation && subway.wcItems.length > 0) {
      sortWCs(subway.wcItems, mapSt.userLocation[0], mapSt.userLocation[1]).then(sorted => {
        subway.setNearestWCs(sorted as WCItem[]);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.activeTab, mapSt.userLocation, subway.wcItems]);

  // isDarkMode → <html class="dark"> 동기화
  useEffect(() => {
    document.documentElement.classList.toggle('dark', ui.isDarkMode);
  }, [ui.isDarkMode]);

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
    end: string | null
  ) => {
    if (!start || !end) { route.setPathResults(null); return; }
    route.setIsCalculating(true);
    route.setValidationError(null);

    // 버스 경로
    if (ui.activeTab === 'bus') {
      const res = findBusPath(start, end, subway.busStops);
      route.setBusPathResult(res);
      if (!res) route.setValidationError('no_route');
      route.setIsCalculating(false);
      return;
    }

    // 지하철 경로 — bus result 초기화
    route.setBusPathResult(null);
    const normalize = normalizeStationName;
    const points = [normalize(start), ...waypoints.map(normalize).filter(Boolean), normalize(end)];

    try {
      const res = await findPath(points) as Record<string, PathResult>;
      route.setIsCalculating(false);
      if (res?.time && res?.transfer) {
        route.setPathResults({ time: res.time, transfer: res.transfer });
      } else {
        route.setPathResults(null);
        route.setValidationError('no_route');
      }
    } catch {
      route.setPathResults(null);
      route.setValidationError('no_route');
      route.setIsCalculating(false);
    }
  }, [ui.activeTab, subway.busStops, findPath, route]);

  // start/end/waypoints 바뀔 때마다 자동 탐색
  useEffect(() => {
    calculatePath(route.startStation, route.waypoints, route.endStation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.startStation, route.waypoints, route.endStation]);

  // 길찾기 활성화 시 activeLine 해제
  useEffect(() => {
    if (activePath && mapSt.activeLine) mapSt.setActiveLine(null);
  }, [activePath, mapSt.activeLine]);

  // 경로 결과 나오면 지도 자동 fitBounds
  useEffect(() => {
    if (!activePath?.path?.length || !mapRef.current) return;
    const coords: [number, number][] = [];
    for (const name of activePath.path) {
      const s = stations.find(st => st.name === name);
      if (s?.lat && s?.lng) coords.push([s.lng, s.lat]);
    }
    if (coords.length < 2) return;
    const minLng = Math.min(...coords.map(c => c[0]));
    const maxLng = Math.max(...coords.map(c => c[0]));
    const minLat = Math.min(...coords.map(c => c[1]));
    const maxLat = Math.max(...coords.map(c => c[1]));
    mapRef.current.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
      padding: { top: 80, bottom: 220, left: 40, right: 40 },
      duration: 1200,
      maxZoom: 14
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  // ─────────────────────────────────────────────────────────────────────────
  // 이벤트 핸들러
  // ─────────────────────────────────────────────────────────────────────────
  const handleStationClick = useCallback((name: string, latlng?: [number, number]) => {
    subway.setSelectedStationName(normalizeStationName(name));
    subway.setSelectedBusStop(null);
    subway.setSelectedWC(null);
    if (latlng) mapSt.setCenter([latlng[0], latlng[1]]);
  }, [subway, mapSt]);

  const handleBusStopClick = useCallback((stop: BusStop, coords?: [number, number]) => {
    subway.setSelectedBusStop(stop);
    subway.setSelectedStationName(null);
    subway.setSelectedWC(null);
    if (coords) mapSt.setCenter([coords[1], coords[0]]);
  }, [subway, mapSt]);

  const handleReset = useCallback(() => {
    route.reset();
    subway.clearStationSelection();
    subway.setSelectedWC(null);
    subway.setSelectedBusStop(null);
  }, [route, subway]);

  const handleLocate = useCallback(() => {
    const loc = mapSt.userLocation;
    if (loc && mapRef.current) {
      mapRef.current.flyTo({ center: [loc[1], loc[0]], zoom: 15, duration: 1500 });
    } else if (navigator.geolocation && mapRef.current) {
      navigator.geolocation.getCurrentPosition(pos => {
        mapSt.setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        mapRef.current.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15, duration: 1500 });
      });
    }
  }, [mapSt]);

  const handleLocateStation = useCallback(async (type: 'source' | 'dest') => {
    if (mapSt.isLocating) return;
    mapSt.setIsLocating(true);
    mapSt.setLocatingTimer(5);
    const interval = setInterval(() => {
      mapSt.setLocatingTimer(Math.max(0, useMapStore.getState().locatingTimer - 1));
    }, 1000);
    const cleanup = () => { clearInterval(interval); mapSt.setIsLocating(false); mapSt.setLocatingTimer(0); };

    const doNearest = async (lat: number, lng: number) => {
      const nearest: any = await findNearestStation(lat, lng, stations);
      if (nearest?.name) {
        const val = `내 위치 : ${nearest.name} (내 위치)`;
        if (type === 'source') route.setStartStation(val);
        else route.setEndStation(val);
      }
      cleanup();
    };

    if (mapSt.userLocation) {
      await doNearest(mapSt.userLocation[0], mapSt.userLocation[1]);
    } else {
      navigator.geolocation.getCurrentPosition(
        async pos => {
          mapSt.setUserLocation([pos.coords.latitude, pos.coords.longitude]);
          await doNearest(pos.coords.latitude, pos.coords.longitude);
        },
        () => cleanup(),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
      );
    }
  }, [mapSt, route, findNearestStation, stations]);

  const handleSelectBusRoute = useCallback(async (routeNo: string, cityCode?: string) => {
    if (!cityCode) return;
    try {
      const res = await fetch('/data/master-bus-routes.json');
      const routes = await res.json();
      const route_ = routes.find((r: any) => r.no === routeNo && r.cityCode === cityCode);
      if (route_) {
        const { MetropolitanBusService } = await import('@/services/busApi');
        const path = await MetropolitanBusService.fetchRoutePath(cityCode, route_.id);
        if (path) {
          subway.setRoutePathData(path);
          const coord = path.features[0]?.geometry?.coordinates[0];
          if (coord) mapRef.current?.flyTo({ center: coord, zoom: 13, duration: 2000 });
        }
      }
    } catch {}
  }, [subway]);

  const handleBoundsChange = useCallback(async (bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }) => {
    if (ui.activeTab !== 'bus' && ui.activeTab !== 'subway+bus') return;
    const count = await db.busStops
      .where('lat').between(bounds.minLat, bounds.maxLat)
      .and(s => s.lng >= bounds.minLng && s.lng <= bounds.maxLng)
      .limit(1).count();
    if (count === 0) {
      const lat = (bounds.minLat + bounds.maxLat) / 2;
      const lng = (bounds.minLng + bounds.maxLng) / 2;
      const cityCode = getCityCodeByCoords(lat, lng);
      if (cityCode) {
        await DataIngestionService.fetchRegionalBusStops(cityCode);
        const all = await db.busStops.toArray() as BusStop[];
        subway.setBusStops(all);
      }
    }
  }, [ui.activeTab, subway]);

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
          onCenterChange={(lat, lng) => mapSt.setCenter([lat, lng])}
          onBoundsChange={handleBoundsChange}
          stations={stations}
          activeLine={mapSt.activeLine}
          onActiveLineChange={(line) => line ? mapSt.toggleActiveLine(line) : mapSt.setActiveLine(null)}
          onMapReady={(m) => { mapRef.current = m; }}
          pathResult={activePath}
          userLocation={mapSt.userLocation}
          nearestStation={mapSt.nearestStation}
          nearestBusStop={mapSt.nearestBusStop}
          nearestWC={mapSt.nearestWC}
          timeDisplayMode={ui.timeDisplayMode}
          onToggleTimeDisplay={ui.toggleTimeDisplayMode}
          showAllRouteBubbles={route.showAllRouteBubbles}
          onToggleShowAll={() => route.setShowAllRouteBubbles(!route.showAllRouteBubbles)}
          onSelectBusRoute={handleSelectBusRoute}
        />
      </div>

      {/* 하단 패널 */}
      <UnifiedBottomPanel
        activeTab={ui.activeTab}
        onTabChange={(tab: any) => ui.setActiveTab(tab)}
        onSearch={(start, end) => calculatePath(start, route.waypoints, end)}
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
        onToggleShowAll={() => route.setShowAllRouteBubbles(!route.showAllRouteBubbles)}
        selectedStationName={subway.selectedStationName}
        stationArrivals={arrivalInfo.arrivals}
        schedules={arrivalInfo.schedules}
        onSelectStation={subway.setSelectedStationName}
        activeLine={mapSt.activeLine}
        onActiveLineChange={(line) => line ? mapSt.toggleActiveLine(line) : mapSt.setActiveLine(null)}
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
      <AnimatePresence>
        {ui.weatherOpen && (
          <WeatherPopup
            lat={mapSt.center[0]}
            lng={mapSt.center[1]}
            isDarkMode={ui.isDarkMode}
            onClose={() => ui.setWeatherOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 화장실 나침반 */}
      <AnimatePresence>
        {ui.activeTab === 'wc' && subway.selectedWC && mapSt.userLocation && (
          <DirectionCompass
            key={subway.selectedWC.id}
            userLocation={mapSt.userLocation}
            targetLocation={[subway.selectedWC.lat, subway.selectedWC.lng]}
            targetName={subway.selectedWC.name}
            onClose={() => subway.setSelectedWC(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
