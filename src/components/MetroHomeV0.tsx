"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Accessibility,
  ArrowRight,
  BusFront,
  ChevronDown,
  LocateFixed,
  MapPin,
  RefreshCw,
  TrainFront,
  Toilet,
  Umbrella,
  UsersRound,
} from "lucide-react";
import { useSmartCommute } from "@/hooks/useSmartCommute";
import { useNearbyWeather } from "@/hooks/useNearbyWeather";
import { getStationCivicAmenity } from "@/data/civic-mobility-extras";
import { civicInfrastructureService, type CivicStationData } from "@/services/CivicInfrastructureService";

const MapLibreBackground = dynamic(() => import("./MapLibreBackground"), { ssr: false });

type Props = {
  mapProps: Record<string, unknown>;
  onLocate?: () => void;
  onRefresh?: () => void;
};

/**
 * LDS/Taste 기준의 첫 코드 네이티브 홈 셸.
 * 기존 실시간 지도 컴포넌트를 그대로 사용하고, 정보 sheet만 새 IA로 교체한다.
 */
export default function MetroHomeV0({ mapProps, onLocate, onRefresh }: Props) {
  const [compact, setCompact] = useState(false);
  const [mode, setMode] = useState<"fast" | "calm" | "accessible">("fast");
  const [startInput, setStartInput] = useState("현재 위치");
  const [destinationInput, setDestinationInput] = useState("");
  const smart = useSmartCommute();
  const weather = useNearbyWeather((mapProps.userLocation as [number, number] | null) ?? null);
  const nearestStation = mapProps.nearestStation as { name?: string; lines?: string[] } | null;
  const nearestBusStop = mapProps.nearestBusStop as { name?: string; routes?: string[] } | null;
  const nearestWC = mapProps.nearestWC as { name?: string; accessible?: boolean; openTime?: string } | null;
  const stationArrivals = Array.isArray(mapProps.stationArrivals) ? mapProps.stationArrivals as any[] : [];
  const firstArrival = stationArrivals[0];
  const nearbyStationName = nearestStation?.name || firstArrival?.statnNm || "가까운 지하철";
  const nearbyStationLine = nearestStation?.lines?.[0] || firstArrival?.lineName || "실시간 도착";
  const nearbyBusName = nearestBusStop?.routes?.[0] || "버스";
  const requestedDestination = typeof mapProps.endStation === "string" ? mapProps.endStation : null;
  const civicStationName = nearestStation?.name || requestedDestination || firstArrival?.statnNm || nearbyStationName;
  const civicAmenity = getStationCivicAmenity(civicStationName);
  const [civicMaster, setCivicMaster] = useState<CivicStationData | null>(null);
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
  const transferName = segments.length > 1 ? lastSegment?.stations?.[0] : null;
  const transferCivicAmenity = getStationCivicAmenity(transferName || civicStationName);
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

  // The legacy full-screen map shell locks the document scroll globally.
  // v0 is a map-first, vertically scrollable sheet, so opt this route into
  // document scrolling without changing the classic map experience.
  useEffect(() => {
    document.documentElement.classList.add("metro-v0-scroll");
    document.body.classList.add("metro-v0-scroll");
    return () => {
      document.documentElement.classList.remove("metro-v0-scroll");
      document.body.classList.remove("metro-v0-scroll");
    };
  }, []);

  useEffect(() => {
    if (typeof mapProps.startStation === "string" && mapProps.startStation) setStartInput(mapProps.startStation);
    if (typeof mapProps.endStation === "string" && mapProps.endStation) setDestinationInput(mapProps.endStation);
  }, [mapProps.startStation, mapProps.endStation]);

  useEffect(() => {
    let active = true;
    civicInfrastructureService.load().then(() => {
      if (active) setCivicMaster(civicInfrastructureService.getSync(civicStationName));
    });
    return () => { active = false; };
  }, [civicStationName]);

  return (
    <main className="metro-v0" aria-label="MetroLive 주변 이동 홈">
      <a className="skip-link" href="#metro-v0-sheet">경로 설정으로 건너뛰기</a>
      <div className={`metro-v0-map ${compact ? "is-compact" : ""}`}>
        <MapLibreBackground {...mapProps as any} isDarkMode={false} />
        <div className="metro-v0-map-wash" aria-hidden="true" />
        <header className="metro-v0-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="live-dot" />
              <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em', color: '#0284c7' }}>LET&apos;S METRO · 대중교통 &amp; 시민인프라</span>
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.03em' }}>지금 어디로 갈까요?</h1>
          </div>
          <div className="metro-v0-header-actions">
            <a href="https://pyw31337.github.io/lets/" className="icon-button" aria-label="렛츠 마스터 허브" title="렛츠 마스터 허브" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'inherit' }}>허브</span>
            </a>
            <button type="button" className="icon-button" aria-label="현재 위치" onClick={onLocate}><LocateFixed size={18} /></button>
            <button type="button" className="icon-button" aria-label="새로고침" onClick={onRefresh}><RefreshCw size={17} /></button>
          </div>
        </header>
        <div className="metro-v0-map-status" role="status">
          <span className="status-dot" /> 실시간 데이터 · 30초 전
        </div>
        <button className="metro-v0-recenter" type="button" onClick={onLocate}>
          <LocateFixed size={16} /> 내 위치
        </button>
      </div>

      <section className="metro-v0-sheet" id="metro-v0-sheet">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-intro">
          <div>
            <p className="section-kicker">NEARBY MOBILITY</p>
            <h2>내 주변 이동</h2>
          </div>
          <button type="button" className="text-button">전체 보기 <ArrowRight size={15} /></button>
        </div>

        <article className="primary-mobility-card">
          <div className="primary-mobility-copy">
            <p className="section-kicker">BEST OPTION FOR NOW</p>
            <h3>{hasRoute ? "지금 경로가 준비됐어요" : "어디로 갈지 빠르게 정해보세요"}</h3>
            <p>{hasRoute ? `${originName}에서 ${destinationName}까지 ${totalMinutes ? `${totalMinutes}분` : "실시간 계산 중"}` : "현재 위치와 최근 검색을 바탕으로 다음 이동을 추천해드려요."}<br />혼잡도·무장애·도보 이동까지 함께 비교합니다.</p>
            <button type="button" onClick={() => document.getElementById("metro-route-entry")?.scrollIntoView({ behavior: "smooth", block: "center" })}>{hasRoute ? "경로 자세히 보기" : "출발지·도착지 선택"} <ArrowRight size={15} /></button>
          </div>
          <img src={`${basePath}/metro-live/transit-isometric.png`} alt="입체적인 지하철과 승강장 아이콘" />
        </article>

        {smart.start && smart.destination ? (
          <button type="button" className="smart-route-resume" onClick={() => resumeRoute(smart.start!, smart.destination!)}><span>최근 경로</span><b>{smart.start} → {smart.destination}</b><ArrowRight size={15} /></button>
        ) : smart.recentPlaces.length >= 2 ? (
          <button type="button" className="smart-route-resume" onClick={() => resumeRoute(smart.recentPlaces[0], smart.recentPlaces[1])}><span>최근 검색으로 빠르게 시작</span><b>{smart.recentPlaces[0]} → {smart.recentPlaces[1]}</b><ArrowRight size={15} /></button>
        ) : null}

        <div className="route-entry" id="metro-route-entry" aria-label="경로 설정">
          <div className="route-line" aria-hidden="true"><span /><span /></div>
          <label className="route-field"><span className="field-label">출발</span><input list="metro-stations" value={startInput} onChange={(e) => setStartInput(e.target.value)} aria-label="출발지" /><ChevronDown size={16} /></label>
          <label className="route-field"><span className="field-label">도착</span><input list="metro-stations" className={!destinationInput ? "placeholder" : ""} value={destinationInput} onChange={(e) => setDestinationInput(e.target.value)} placeholder="어디로 갈까요?" aria-label="도착지" /><button type="button" className="route-submit" onClick={() => destinationInput.trim() && resumeRoute(startInput.trim() || "현재 위치", destinationInput.trim())}>검색</button></label>
          <datalist id="metro-stations">{stationOptions.map((station: any) => <option key={`${station.name}-${station.id || station.stationCd || ""}`} value={station.name} />)}</datalist>
        </div>

        <div className="mode-cards" role="tablist" aria-label="경로 기준">
          {[
            ["fast", "빠른길", fastMinutes ? `약 ${fastMinutes}분` : "경로 선택", "빠른 이동", "route-fast.png"],
            ["calm", "덜 붐비는 길", transferMinutes ? `약 ${transferMinutes}분` : "비교 준비", "혼잡도 낮음", "route-calm.png"],
            ["accessible", "무장애길", "시설 확인", "엘리베이터·램프", "route-accessible.png"],
          ].map(([value, label, time, sublabel, image]) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} className={`mode-card ${mode === value ? "is-active" : ""}`} onClick={() => setMode(value as typeof mode)}>
              <img src={`${basePath}/metro-live/${image}`} alt="" aria-hidden="true" /><span className="mode-card-copy"><span>{label}</span><strong>{time}</strong><small>{sublabel}</small></span>
            </button>
          ))}
        </div>

        <div className="route-diagram" aria-label="실제 경로 노선도">
          <div className="route-strip-head"><span>{hasRoute ? "현재 경로" : "노선도 미리보기"}</span><small>{hasRoute ? `${segments.length - 1}회 환승 · ${totalMinutes ?? "—"}분` : "출발·도착을 선택하면 표시됩니다"}</small></div>
          {hasRoute ? segments.map((segment: any, index: number) => {
            const stations = Array.isArray(segment.stations) ? segment.stations : [];
            const lineName = String(segment.line || "지하철");
            const isLast = index === segments.length - 1;
            return <div key={`${lineName}-${index}`}>
              <div className="route-diagram-row"><span className={`line-badge ${index % 2 ? "line-green" : "line-blue"}`}>{lineName.replace("호선", "")}</span><div className={`route-rail ${index % 2 ? "rail-green" : "rail-blue"}`}><i /><i /></div><div className="route-stations"><b>{stations[0] || "출발"}</b><span>{isLast ? destinationName : (stations[stations.length - 1] || "이동 중")}</span></div></div>
              {!isLast && <div className="route-transfer"><span>환승</span><b>다음 구간 연결</b>{transferCivicAmenity?.fastTransfer?.[index] && <em>{transferCivicAmenity.fastTransfer[index].carNumber}번 칸 · {transferCivicAmenity.fastTransfer[index].transferTimeMin}분</em>}</div>}
            </div>;
          }) : <div className="route-empty"><TrainFront size={18} /><span>출발지와 도착지를 선택하면<br />실제 노선·환승·도보 구간을 그려드려요.</span></div>}
          <div className="route-strip-foot"><span><TrainFront size={13} /> {hasRoute ? "실시간 경로" : "경로 대기 중"}</span><span>{hasRoute ? "역·환승 정보 포함" : "빠른길 · 덜 붐비는 길 · 무장애길"}</span></div>
        </div>

        <div className="nearby-heading"><h3>현재 위치 주변 대중교통 &amp; 시민 편의</h3><span>내 위치 기준 · 반경 1km</span></div>
        <div className="nearby-list">
          <article className="nearby-item"><span className="nearby-item-icon blue"><TrainFront size={17} /></span><div><b>{nearestStation?.name || "가까운 지하철역"}</b><small>{nearestStation?.lines?.slice(0, 2).join(" · ") || "역 정보를 찾는 중"}</small></div><strong>도착정보</strong></article>
          <article className="nearby-item"><span className="nearby-item-icon orange"><BusFront size={17} /></span><div><b>{nearestBusStop?.name || "가까운 버스정류장"}</b><small>{nearestBusStop?.routes?.slice(0, 3).join(" · ") || "시내·광역 버스 환승 연계"}</small></div><strong>환승연계</strong></article>
          <article className="nearby-item"><span className="nearby-item-icon mint"><Toilet size={17} /></span><div><div style={{ display: "flex", alignItems: "center", gap: "6px" }}><b>{nearestWC?.name || "역사 공공화장실"}</b><span style={{ fontSize: "10px", fontWeight: 800, padding: "1px 6px", borderRadius: "4px", background: "#ecfdf5", color: "#059669" }}>개찰구 밖 (대합실)</span></div><small>{nearestWC ? `${nearestWC.accessible ? "무장애 · " : ""}${nearestWC.openTime || "첫차~막차 개방"}` : "승차권 태그 없이 이용 가능"}</small></div><strong>위치안내</strong></article>
        </div>

        {civicAmenity && <article className="civic-station-card" aria-label={`${civicAmenity.stationName} 시민 편의 정보`}>
          <div className="civic-card-head"><div><p className="section-kicker">STATION CIVIC LAYER</p><h3>{civicAmenity.stationName}에서 바로 쓸 수 있는 정보</h3></div><span className="civic-live">시설 안내</span></div>
          <p className="civic-location">{civicAmenity.toilet.locationDesc}</p>
          <div className="civic-badges"><span className="civic-badge out">개찰구 밖 · 카드 태그 없이</span><span className="civic-badge in">개찰구 안 · 승강장 이용</span>{civicAmenity.toilet.accessible && <span className="civic-badge neutral">무장애 화장실</span>}</div>
          <div className="civic-meta-grid">
            <div><small>빠른 환승</small><b>{civicAmenity.fastTransfer?.[0] ? `${civicAmenity.fastTransfer[0].carNumber}번 칸` : "정보 준비 중"}</b><span>{civicAmenity.fastTransfer?.[0]?.targetLine || "환승 구간"}</span></div>
            <div><small>심야 연계</small><b>{civicAmenity.nightBus?.join(" · ") || "운행 정보 준비 중"}</b><span>올빼미 버스</span></div>
            <div><small>따릉이</small><b>{civicAmenity.bikeRacks ? `${civicAmenity.bikeRacks.availableBikes}대` : "확인 중"}</b><span>{civicAmenity.bikeRacks ? `${civicAmenity.bikeRacks.exitNumber}번 출구` : "가까운 대여소"}</span></div>
            {civicAmenity.dryWalkBuildings && civicAmenity.dryWalkBuildings.length > 0 && (
              <div><small>☔ 비 안맞는 길</small><b>{civicAmenity.dryWalkBuildings[0]}</b><span>지하 직결 통로</span></div>
            )}
          </div>
          {civicMaster && <p className="civic-extra"><b>무장애 동선</b> {civicMaster.elevators.filter((e) => e.status === "NORMAL").slice(0, 2).map((e) => `${e.exit_number}번 출구 엘리베이터`).join(" · ") || "운영 정보 확인 필요"}<br /><b>환승주차</b> {civicMaster.park_and_ride.name} · {civicMaster.park_and_ride.transit_discount_pct}% 감면 안내</p>}
        </article>}

        <div className="widget-grid">
          <article className="info-widget transit-widget">
            <div className="widget-topline"><span className="widget-icon blue"><TrainFront size={16} /></span><span>가까운 지하철</span><span className="fresh">실시간</span></div>
            <strong className="widget-value">{nearbyStationName} <small>{nearbyStationLine}</small></strong>
            <p>{firstArrival?.trainLineNm || firstArrival?.arvlMsg3 || "도착정보를 불러오는 중"} <b>{firstArrival?.arvlMsg2 || "—"}</b></p>
          </article>
          <article className="info-widget transit-widget">
            <div className="widget-topline"><span className="widget-icon orange"><BusFront size={16} /></span><span>가까운 버스</span><span className="fresh">1분 전</span></div>
            <img className="widget-object bus-object" src={`${basePath}/metro-live/bus-isometric.png`} alt="입체적인 버스정류장 아이콘" />
            <strong className="widget-value">{nearbyBusName} <small>{nearestBusStop ? "가까운 정류장" : "정류장 탐색 중"}</small></strong>
            <p>{nearestBusStop?.name || "내 위치 주변 버스"} <b>노선보기</b></p>
          </article>
          <article className="info-widget condition-widget">
            <div className="widget-topline"><span className="widget-icon mint"><UsersRound size={16} /></span><span>현재 혼잡도</span></div>
            <strong className="widget-value">보통 <small>42%</small></strong>
            <div className="meter"><span style={{ width: "42%" }} /></div>
            <p>평소보다 8% 여유</p>
          </article>
          <article className="info-widget condition-widget">
            <div className="widget-topline"><span className="widget-icon yellow"><Umbrella size={16} /></span><span>강남역 날씨</span></div>
            <strong className="widget-value">{weather.temperature == null ? "날씨" : `${weather.temperature}°`} <small>{weather.label}</small></strong>
            <p>{weather.wind == null ? "현재 위치 기준 실시간 예보" : `바람 ${weather.wind}km/h · 현재 위치 기준`}</p>
          </article>
        </div>

        <div className="utility-row">
          <button type="button" onClick={() => document.querySelector(".civic-station-card")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Toilet size={17} /><span><b>공공화장실 (개찰구 안/밖)</b><small>{civicAmenity ? civicAmenity.toilet.locationDesc : "승차권 태그 없이 이용 가능한 화장실"}</small></span><ArrowRight size={15} /></button>
          <button type="button"><Accessibility size={17} /><span><b>무장애 시설 &amp; 따릉이</b><small>엘리베이터 출구 및 자전거 대여소</small></span><ArrowRight size={15} /></button>
        </div>
        <p className="data-note"><MapPin size={13} /> 서울 열린데이터광장 · 서울교통공사 · 국토교통부 · 마지막 동기화 10:42</p>
      </section>
      <nav className="metro-v0-bottom-nav" aria-label="주요 메뉴">
        <button className="is-active" type="button"><MapPin size={18} /><span>주변</span></button>
        <button type="button"><TrainFront size={18} /><span>도착</span></button>
        <button type="button"><UsersRound size={18} /><span>혼잡</span></button>
        <button type="button"><Toilet size={18} /><span>시설</span></button>
      </nav>
    </main>
  );
}
