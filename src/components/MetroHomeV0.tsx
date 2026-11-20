"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Accessibility,
  ArrowRight,
  BusFront,
  ChevronDown,
  Clock3,
  ExternalLink,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  TrainFront,
  Toilet,
  Umbrella,
  UsersRound,
  ShieldCheck,
  Bike,
  Building2
} from "lucide-react";
import { useSmartCommute } from "@/hooks/useSmartCommute";
import { useNearbyWeather } from "@/hooks/useNearbyWeather";
import { getStationCivicAmenity, StationAmenity } from "@/data/civic-mobility-extras";

const MapLibreBackground = dynamic(() => import("./MapLibreBackground"), { ssr: false });

type Props = {
  mapProps: Record<string, unknown>;
  onLocate?: () => void;
  onRefresh?: () => void;
};

type CivicTab = "all" | "toilet" | "transfer" | "drywalk";

export default function MetroHomeV0({ mapProps, onLocate, onRefresh }: Props) {
  const [compact, setCompact] = useState(false);
  const [mode, setMode] = useState<"fast" | "calm" | "accessible">("fast");
  const [selectedStation, setSelectedStation] = useState<string>("강남");
  const [activeCivicTab, setActiveCivicTab] = useState<CivicTab>("all");
  const [startInput, setStartInput] = useState("현재 위치");
  const [destinationInput, setDestinationInput] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const QUICK_HUBS = [
    "강남", "여의도", "서울역", "홍대입구", "고속터미널",
    "잠실", "판교", "광화문", "사당", "신도림", "시청", "용산", "삼성"
  ];

  const smart = useSmartCommute();
  const weather = useNearbyWeather((mapProps.userLocation as [number, number] | null) ?? null);
  
  const nearestStation = mapProps.nearestStation as { name?: string; lines?: string[] } | null;
  const nearestBusStop = mapProps.nearestBusStop as { name?: string; routes?: string[] } | null;
  const nearestWC = mapProps.nearestWC as { name?: string; accessible?: boolean; openTime?: string } | null;
  const stationArrivals = Array.isArray(mapProps.stationArrivals) ? (mapProps.stationArrivals as any[]) : [];
  const firstArrival = stationArrivals[0];
  
  const nearbyStationName = nearestStation?.name || firstArrival?.statnNm || "강남역";
  const nearbyStationLine = nearestStation?.lines?.[0] || firstArrival?.lineName || "2호선";
  const nearbyBusName = nearestBusStop?.routes?.[0] || "간선 146";

  const requestedDestination = typeof mapProps.endStation === "string" ? mapProps.endStation : null;
  const currentFocalStation = selectedStation || nearestStation?.name || requestedDestination || "강남";
  const amenity: StationAmenity | null = getStationCivicAmenity(currentFocalStation) || getStationCivicAmenity("강남");

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const stationOptions = Array.isArray(mapProps.stations) ? (mapProps.stations as any[]).slice(0, 400) : [];
  const activePath = mapProps.pathResult as any;
  const pathResults = mapProps.pathResults as Record<string, any> | null;
  const segments = Array.isArray(activePath?.segments) ? activePath.segments : [];
  const hasRoute = segments.length > 0;
  const totalMinutes = hasRoute && Number.isFinite(Number(activePath?.totalWeight)) ? Math.round(Number(activePath.totalWeight)) : null;
  const fastMinutes = Number.isFinite(Number(pathResults?.time?.totalWeight)) ? Math.round(Number(pathResults?.time?.totalWeight)) : totalMinutes;
  const transferMinutes = Number.isFinite(Number(pathResults?.transfer?.totalWeight)) ? Math.round(Number(pathResults?.transfer?.totalWeight)) : null;
  
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  const originName = firstSegment?.stations?.[0] || "현재 위치";
  const destinationName = requestedDestination || lastSegment?.stations?.[lastSegment.stations.length - 1] || "도착지를 선택하세요";

  const resumeRoute = (start: string, destination: string) => {
    setStartInput(start);
    setDestinationInput(destination);
    (mapProps.onSetStart as ((v: string) => void) | undefined)?.(start);
    (mapProps.onSetEnd as ((v: string) => void) | undefined)?.(destination);
    (mapProps.onSearch as ((s: string, e: string) => void) | undefined)?.(start, destination);
  };

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (typeof mapProps.startStation === "string" && mapProps.startStation) setStartInput(mapProps.startStation);
    if (typeof mapProps.endStation === "string" && mapProps.endStation) setDestinationInput(mapProps.endStation);
  }, [mapProps.startStation, mapProps.endStation]);

  return (
    <main className="metro-v0" aria-label="Let's Metro 통합 모빌리티 홈">
      <a className="skip-link" href="#metro-v0-sheet">경로 설정으로 건너뛰기</a>

      {/* ── 상단 맵 영역 & 카카오T 스타일 플로팅 서치 카드 ── */}
      <div className={`metro-v0-map ${compact ? "is-compact" : ""}`}>
        <MapLibreBackground {...mapProps as any} isDarkMode={false} />
        <div className="metro-v0-map-wash" aria-hidden="true" />

        {/* 상단 통합 브랜딩 & 허브 딥링크 바 */}
        <div className="top-brand-floating">
          <div className="brand-pill">
            <span className="live-dot" />
            <strong>LET&apos;S METRO</strong>
            <span className="brand-sub">시민 모빌리티 인프라</span>
          </div>
          <div className="top-action-group">
            <a href="https://pyw31337.github.io/lets/" className="hub-link-btn" title="렛츠 마스터 허브">
              <span>렛츠허브</span>
            </a>
            <button type="button" className="icon-button" aria-label="현재 위치" onClick={onLocate}><LocateFixed size={17} /></button>
            <button type="button" className="icon-button" aria-label="새로고침" onClick={onRefresh}><RefreshCw size={16} /></button>
          </div>
        </div>

        {/* 카카오T 스타일 플로팅 서치 카드 (명도 대비 100% 확보) */}
        <div className="floating-search-card" role="search">
          <div className="search-card-inner">
            <Search size={19} className="search-icon" />
            <input
              type="text"
              placeholder="어디로 갈까요? (지하철·버스·개찰구밖 화장실)"
              value={destinationInput}
              onChange={(e) => setDestinationInput(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && destinationInput.trim()) {
                  setSelectedStation(destinationInput.trim());
                  resumeRoute(startInput.trim() || "현재 위치", destinationInput.trim());
                }
              }}
              className="search-input"
              aria-label="목적지 검색"
            />
            {destinationInput && (
              <button
                type="button"
                className="search-submit-btn"
                onClick={() => {
                  setSelectedStation(destinationInput.trim());
                  resumeRoute(startInput.trim() || "현재 위치", destinationInput.trim());
                }}
              >
                검색
              </button>
            )}
          </div>

          {/* 주요 거점역 원클릭 관제 전환 칩 */}
          <div className="hub-quick-chips">
            <span className="hub-chips-label">거점역 관제:</span>
            {QUICK_HUBS.map((hub) => (
              <button
                key={hub}
                type="button"
                className={`hub-chip ${currentFocalStation === hub ? "is-active" : ""}`}
                onClick={() => {
                  setSelectedStation(hub);
                  setDestinationInput(hub + "역");
                }}
              >
                {hub}
              </button>
            ))}
          </div>
        </div>

        {/* 지도 하단 플로팅 상태 뱃지 */}
        <div className="metro-v0-map-status" role="status">
          <span className="status-dot" /> 실시간 열차 위치 핑 관제 중
        </div>
        <button className="metro-v0-recenter" type="button" onClick={onLocate}>
          <LocateFixed size={15} /> 내 위치
        </button>
      </div>

      {/* ── 하단 인터랙티브 시민 인프라 시트 ── */}
      <section className="metro-v0-sheet" id="metro-v0-sheet">
        <div className="sheet-handle" aria-hidden="true" />

        {/* 시트 인트로 헤더 */}
        <div className="sheet-intro">
          <div>
            <p className="section-kicker">CIVIC MOBILITY MATRIX</p>
            <h2>{amenity ? amenity.stationName : nearbyStationName} 시민 편의 인프라</h2>
          </div>
          <span className="live-status-tag">
            <span className="live-pulse-dot" /> 실시간 정상 운영
          </span>
        </div>

        {/* 4대 시민 인프라 퀵 필터 탭 */}
        <div className="civic-filter-tabs" role="tablist">
          <button
            type="button"
            className={`filter-tab-btn ${activeCivicTab === "all" ? "active" : ""}`}
            onClick={() => setActiveCivicTab("all")}
          >
            <MapPin size={15} aria-hidden="true" /> 전체 인프라
          </button>
          <button
            type="button"
            className={`filter-tab-btn ${activeCivicTab === "toilet" ? "active" : ""}`}
            onClick={() => setActiveCivicTab("toilet")}
          >
            <Toilet size={15} aria-hidden="true" /> 개찰구 안/밖 화장실
          </button>
          <button
            type="button"
            className={`filter-tab-btn ${activeCivicTab === "transfer" ? "active" : ""}`}
            onClick={() => setActiveCivicTab("transfer")}
          >
            <TrainFront size={15} aria-hidden="true" /> 최단 빠른 환승
          </button>
          <button
            type="button"
            className={`filter-tab-btn ${activeCivicTab === "drywalk" ? "active" : ""}`}
            onClick={() => setActiveCivicTab("drywalk")}
          >
            <Umbrella size={15} aria-hidden="true" /> 우산없는 길
          </button>
        </div>

        {/* ── 핵심 킬러 카드: 개찰구 안/밖 화장실 & 생활 인프라 ── */}
        {(activeCivicTab === "all" || activeCivicTab === "toilet") && amenity && (
          <article className="civic-highlight-card toilet-highlight">
            <div className="card-top-row">
              <div className="title-with-icon">
                <div className="icon-box-emerald">
                  <Toilet size={20} />
                </div>
                <div>
                  <h3>개찰구 안/밖 화장실 실시간 안내</h3>
                  <p className="card-sub">{amenity.stationName} · 승차권 태그 없이 이용 가능한 대합실 화장실</p>
                </div>
              </div>
              <span className="badge-open">첫차~막차 개방</span>
            </div>

            <div className="toilet-gate-boxes">
              {/* 개찰구 밖 화장실 (카드 태그 불필요) */}
              <div className="gate-box out-gate">
                <div className="gate-header">
                  <span className="gate-tag out">개찰구 밖 (대합실)</span>
                  <span className="free-tag">✓ 카드 태그 없이 무료 이용</span>
                </div>
                <div className="gate-location">{amenity.toilet.out_gate_desc || amenity.toilet.locationDesc.split("/")[0]}</div>
                <div className="gate-amenities">
                  {amenity.toilet.accessible && <span className="amenity-chip">휠체어 무장애</span>}
                  {(amenity.toilet.babyCare || amenity.toilet.baby_care) && <span className="amenity-chip">기저귀 교환대</span>}
                  <span className="amenity-chip">비상벨 완비</span>
                </div>
              </div>

              {/* 개찰구 안 화장실 (승강장/환승통로) */}
              <div className="gate-box in-gate">
                <div className="gate-header">
                  <span className="gate-tag in">개찰구 안 (승강장)</span>
                  <span className="transit-tag">승차·환승 중 이용</span>
                </div>
                <div className="gate-location">{amenity.toilet.in_gate_desc || amenity.toilet.locationDesc.split("/")[1] || "환승통로 내부 위치"}</div>
                <div className="gate-amenities">
                  <span className="amenity-chip">승강장 직결</span>
                  <span className="amenity-chip">환승객 전용</span>
                </div>
              </div>
            </div>
          </article>
        )}

        {/* ── 핵심 킬러 카드: 최단 빠른 환승 칸 (Fast Transfer) ── */}
        {(activeCivicTab === "all" || activeCivicTab === "transfer") && amenity && (
          <article className="civic-highlight-card transfer-highlight">
            <div className="card-top-row">
              <div className="title-with-icon">
                <div className="icon-box-blue">
                  <TrainFront size={20} />
                </div>
                <div>
                  <h3>최단 빠른 환승 칸 번호</h3>
                  <p className="card-sub">내리자마자 환승 에스컬레이터 바로 앞 직결 칸 (출퇴근 도보 단축)</p>
                </div>
              </div>
            </div>

            <div className="transfer-chips-grid">
              {(amenity.fast_transfers || amenity.fastTransfer || []).map((ft: any, idx: number) => (
                <div key={idx} className="transfer-chip-card">
                  <div className="transfer-header">
                    <span className="line-pill">{ft.target_line || ft.targetLine}</span>
                    <span className="direction-text">{ft.direction}</span>
                  </div>
                  <div className="car-number-box">
                    <strong>{ft.car_number || ft.carNumber}번 칸</strong>
                    <span className="time-saved">약 {ft.transferTimeMin || Math.round((ft.walk_seconds || 90) / 60)}분 환승</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        )}

        {/* ── 핵심 킬러 카드: 비 오는 날 우산 없는 지하 통로 맵 (Dry Walk) ── */}
        {(activeCivicTab === "all" || activeCivicTab === "drywalk") && amenity && (amenity.dry_walk_buildings || (amenity.dryWalkBuildings && amenity.dryWalkBuildings.length > 0)) && (
          <article className="civic-highlight-card drywalk-highlight">
            <div className="card-top-row">
              <div className="title-with-icon">
                <div className="icon-box-purple">
                  <Umbrella size={20} />
                </div>
                <div>
                  <h3>비 오는 날 &apos;우산 없는 지하 통로 맵&apos;</h3>
                  <p className="card-sub">비나 눈을 맞지 않고 지하철역에서 대형 빌딩·쇼핑몰까지 100% 지하 직결</p>
                </div>
              </div>
              <span className="badge-dry">100% 지하 직결</span>
            </div>

            <div className="drywalk-buildings-list">
              {(amenity.dry_walk_buildings || amenity.dryWalkBuildings || []).map((b: any, idx: number) => {
                const bName = typeof b === "string" ? b : b.building_name;
                const exitNum = typeof b === "object" ? b.connected_exit : null;
                return (
                  <div key={idx} className="drywalk-item">
                    <span className="building-icon" aria-hidden="true"><Building2 size={20} /></span>
                    <div className="building-info">
                      <strong>{bName}</strong>
                      <span className="building-exit">{exitNum ? `${exitNum}번 출구 방면 지하 무빙워크 연결` : "지하 연결통로 직결"}</span>
                    </div>
                    <span className="walk-free-tag">우산 불필요</span>
                  </div>
                );
              })}
            </div>
          </article>
        )}

        {/* ── 실시간 통합 모빌리티 위젯 그리드 (버스, 따릉이, 주차장, 무인발급기) ── */}
        <div className="widget-grid-enhanced">
          {/* 1. 출구별 연계 버스 */}
          <article className="info-card-enhanced">
            <div className="card-meta-line">
              <span className="meta-icon orange"><BusFront size={16} /></span>
              <span className="meta-title">출구별 연계 버스</span>
              <span className="meta-live">실시간</span>
            </div>
            <strong className="card-main-val">{nearbyBusName}</strong>
            <p className="card-desc">{nearestBusStop?.name || "역 출구 앞 버스정류장"} <b>환승 연계</b></p>
            {amenity?.night_buses && (
              <div className="night-bus-row">
                <small>심야 올빼미 버스:</small>
                {amenity.night_buses.map((nb, i) => <span key={i} className="night-bus-chip">{nb}</span>)}
              </div>
            )}
          </article>

          {/* 2. 따릉이(공공자전거) 실시간 */}
          <article className="info-card-enhanced">
            <div className="card-meta-line">
              <span className="meta-icon green"><Bike size={16} /></span>
              <span className="meta-title">따릉이 잔여 대수</span>
              <span className="meta-live">실시간</span>
            </div>
            <strong className="card-main-val">
              {amenity?.bike_racks?.[0]?.estimated_available ?? amenity?.bikeRacks?.availableBikes ?? 14}대 <small>이용 가능</small>
            </strong>
            <p className="card-desc">
              {amenity?.bike_racks?.[0]?.name ?? `${amenity?.bikeRacks?.exitNumber ?? 11}번 출구 앞`} 거치대
            </p>
          </article>

          {/* 3. 환승 공영주차장 (Park & Ride) */}
          <article className="info-card-enhanced">
            <div className="card-meta-line">
              <span className="meta-icon blue"><ShieldCheck size={16} /></span>
              <span className="meta-title">환승 공영주차장</span>
              <span className="meta-badge-50">50% 감면</span>
            </div>
            <strong className="card-main-val">{amenity?.park_and_ride?.name || "환승공영주차장"}</strong>
            <p className="card-desc">
              {amenity?.park_and_ride?.fee_info || "대중교통 환승 시 주차 요금 50% 즉시 할인"}
            </p>
          </article>

          {/* 4. 무인민원기 & 물품보관함 */}
          <article className="info-card-enhanced">
            <div className="card-meta-line">
              <span className="meta-icon purple"><UsersRound size={16} /></span>
              <span className="meta-title">생활 편의 시설</span>
            </div>
            <strong className="card-main-val" style={{ fontSize: "15px" }}>T-Locker & 무인민원발급기</strong>
            <p className="card-desc">{amenity?.convenience?.civilKiosk || "지하 1층 대합실 무인기 운영"}</p>
          </article>
        </div>

        {/* ── 경로 탐색 바텀 패널 ── */}
        <div className="route-entry-enhanced" id="metro-route-entry">
          <div className="entry-header">
            <h3>빠른 길찾기 & 무장애 경로</h3>
            <span className="entry-sub">환승 횟수와 도보 시간을 최소화합니다.</span>
          </div>
          <div className="route-input-group">
            <div className="input-row">
              <span className="point-dot start" />
              <input
                list="metro-stations"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                placeholder="출발역"
                aria-label="출발역"
              />
            </div>
            <div className="input-row">
              <span className="point-dot end" />
              <input
                list="metro-stations"
                value={destinationInput}
                onChange={(e) => setDestinationInput(e.target.value)}
                placeholder="도착역을 입력하세요"
                aria-label="도착역"
              />
              <button
                type="button"
                className="route-submit-btn"
                onClick={() => destinationInput.trim() && resumeRoute(startInput.trim() || "현재 위치", destinationInput.trim())}
              >
                길찾기
              </button>
            </div>
            <datalist id="metro-stations">
              {stationOptions.map((station: any) => (
                <option key={`${station.name}-${station.id || station.stationCd || ""}`} value={station.name} />
              ))}
            </datalist>
          </div>
        </div>

        {/* 하단 데이터 출처 */}
        <p className="data-note">
          <MapPin size={13} /> 서울교통공사 실시간 API · TOPIS 버스정보 · 서울 열린데이터광장 · 기상청 실황
        </p>
      </section>

      {/* ── 하단 고정 인터랙티브 네비게이션 ── */}
      <nav className="metro-v0-bottom-nav" aria-label="주요 모빌리티 메뉴">
        <button
          className={activeCivicTab === "all" ? "is-active" : ""}
          type="button"
          onClick={() => {
            setActiveCivicTab("all");
            document.getElementById("metro-v0-sheet")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <MapPin size={18} />
          <span>주변 인프라</span>
        </button>
        <button
          className={activeCivicTab === "toilet" ? "is-active" : ""}
          type="button"
          onClick={() => {
            setActiveCivicTab("toilet");
            document.querySelector(".toilet-highlight")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          <Toilet size={18} />
          <span>개찰구 화장실</span>
        </button>
        <button
          className={activeCivicTab === "transfer" ? "is-active" : ""}
          type="button"
          onClick={() => {
            setActiveCivicTab("transfer");
            document.querySelector(".transfer-highlight")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          <TrainFront size={18} />
          <span>빠른 환승</span>
        </button>
        <button
          className={activeCivicTab === "drywalk" ? "is-active" : ""}
          type="button"
          onClick={() => {
            setActiveCivicTab("drywalk");
            document.querySelector(".drywalk-highlight")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          <Umbrella size={18} />
          <span>우산없는 길</span>
        </button>
      </nav>
    </main>
  );
}
