"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Accessibility, ArrowRight, Info, LocateFixed, MapPin, RefreshCw, Search, Toilet } from "lucide-react";
import { getStationCivicAmenity, StationAmenity } from "@/data/civic-mobility-extras";

const MapLibreBackground = dynamic(() => import("./MapLibreBackground"), { ssr: false });
type Props = { mapProps: Record<string, unknown>; onLocate?: () => void; onRefresh?: () => void };

export default function MetroHomeV0({ mapProps, onLocate, onRefresh }: Props) {
  const [selectedStation, setSelectedStation] = useState("강남");
  const [startInput, setStartInput] = useState("현재 위치");
  const [destinationInput, setDestinationInput] = useState("");
  const QUICK_HUBS = ["강남", "여의도", "서울역", "홍대입구", "고속터미널", "잠실", "판교", "광화문"];
  const stationOptions = Array.isArray(mapProps.stations) ? (mapProps.stations as any[]).slice(0, 400) : [];
  const nearestStation = mapProps.nearestStation as { name?: string; lines?: string[] } | null;
  const stationArrivals = Array.isArray(mapProps.stationArrivals) ? (mapProps.stationArrivals as any[]) : [];
  const congestion = mapProps.congestion as { congestionLevel?: string; ppltnMax?: number; ppltnMin?: number; msg?: string } | null;
  const crowdingPercent = congestion?.ppltnMax && congestion?.ppltnMin
    ? Math.max(8, Math.min(96, Math.round((congestion.ppltnMax / (congestion.ppltnMax + congestion.ppltnMin)) * 100)))
    : 62;
  const crowdingLabel = congestion?.congestionLevel || "보통";
  const delayMessage = typeof mapProps.delayReason === "string" ? mapProps.delayReason : "현재 지연 없음";
  const pathResult = mapProps.pathResult as { totalWeight?: number; segments?: any[] } | null;
  const routeSummary = pathResult?.segments?.length ? `${Math.round(Number(pathResult.totalWeight || 0))}분 · ${pathResult.segments.length - 1}회 환승` : null;
  const nearbyStationName = nearestStation?.name || stationArrivals[0]?.statnNm || "강남역";
  const nearbyStationLine = nearestStation?.lines?.[0] || stationArrivals[0]?.lineName || "2호선";
  const currentFocalStation = selectedStation || nearbyStationName;
  const amenity: StationAmenity | null = getStationCivicAmenity(currentFocalStation) || getStationCivicAmenity("강남");
  const facilities = mapProps.stationFacilities as { elevator?: any[]; restroom?: any[]; escalator?: any[] } | null;
  const apiIssue = mapProps.apiIssue as string | null;
  const elevatorCount = facilities?.elevator?.length || 0;
  const restroomLabel = amenity?.toilet ? `${amenity.toilet.inGate ? "개찰구 안" : ""}${amenity.toilet.inGate && amenity.toilet.outGate ? "·" : ""}${amenity.toilet.outGate ? "밖" : ""}` : "확인 중";

  useEffect(() => {
    if (typeof mapProps.startStation === "string" && mapProps.startStation) setStartInput(mapProps.startStation);
    if (typeof mapProps.endStation === "string" && mapProps.endStation) setDestinationInput(mapProps.endStation);
  }, [mapProps.startStation, mapProps.endStation]);

  const resumeRoute = (start: string, destination: string) => {
    setStartInput(start); setDestinationInput(destination);
    (mapProps.onSetStart as ((v: string) => void) | undefined)?.(start);
    (mapProps.onSetEnd as ((v: string) => void) | undefined)?.(destination);
    (mapProps.onSearch as ((s: string, e: string) => void) | undefined)?.(start, destination);
  };

  return (
    <main className="metro-v0 metro-command-center" aria-label="Let's Metro 실시간 지도">
      <a className="skip-link" href="#metro-v0-inspector">정보 패널로 건너뛰기</a>
      <header className="metro-command-header">
        <div className="metro-wordmark"><span className="live-dot" /><strong>Let&apos;s Metro</strong><span>서울 교통 인텔리전스</span></div>
        <div className="metro-header-search" role="search"><Search size={17} /><input value={destinationInput} onChange={(e) => setDestinationInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && destinationInput.trim() && resumeRoute(startInput.trim() || "현재 위치", destinationInput.trim())} placeholder="역·노선·장소 검색" aria-label="역·노선·장소 검색" /></div>
        <div className="metro-header-actions"><button type="button" className="header-icon-button" aria-label="현재 위치" onClick={onLocate}><LocateFixed size={17} /></button><button type="button" className="header-icon-button" aria-label="새로고침" onClick={onRefresh}><RefreshCw size={16} /></button></div>
      </header>
      <div className="metro-command-layout">
        <section className="metro-command-map" aria-label="실시간 수도권 지도">
          <MapLibreBackground {...mapProps as any} isDarkMode={false} />
          <div className="metro-v0-map-wash" aria-hidden="true" />
          <div className="map-focus-tools"><button type="button" aria-label="확대" onClick={() => (mapProps.onZoomIn as (() => void) | undefined)?.()}>+</button><button type="button" aria-label="축소" onClick={() => (mapProps.onZoomOut as (() => void) | undefined)?.()}>−</button><button type="button" aria-label="내 위치" onClick={onLocate}><LocateFixed size={16} /></button></div>
          <div className="map-live-status" role="status"><span className="status-dot" /> 실시간 운행</div>
          <div className="map-legend"><span><i className="legend-line blue" /> 지하철</span><span><i className="legend-line cyan" /> 버스 흐름</span><span><i className="legend-dot" /> 선택 역</span></div>
          <div className="map-station-shortcuts" aria-label="주요 역"><span>주요 역</span>{QUICK_HUBS.map((hub) => <button key={hub} type="button" className={currentFocalStation === hub ? "is-active" : ""} onClick={() => { setSelectedStation(hub); setDestinationInput(`${hub}역`); }}>{hub}</button>)}</div>
        </section>
        <aside className="metro-command-inspector" id="metro-v0-inspector" aria-label={`${currentFocalStation} 실시간 정보`}>
          <div className="inspector-heading"><div><span className="line-marker" /><span className="inspector-line">{nearbyStationLine}</span><h1>{amenity?.stationName || nearbyStationName}</h1></div><span className="inspector-status"><i /> 정상 운영</span></div>
          <section className="inspector-section inspector-crowding"><div className="section-label">혼잡도 <button type="button" className="info-tooltip" title="최근 실시간 데이터 기준" aria-label="혼잡도 정보"><Info size={14} /></button></div><div className="crowding-value">{crowdingPercent}% <span><i /> {crowdingLabel}</span></div><div className="crowding-rule"><span style={{ width: `${crowdingPercent}%` }} /></div></section>
          <section className="inspector-section"><div className="section-label">열차 도착</div><div className="arrival-list">{(stationArrivals.length ? stationArrivals.slice(0, 3) : [{ trainLineNm: nearbyStationLine, arvlMsg2: "약 2분 후" }, { trainLineNm: nearbyStationLine, arvlMsg2: "약 6분 후" }]).map((arrival: any, idx: number) => <div className="arrival-row" key={`${arrival.trainLineNm || nearbyStationLine}-${idx}`}><span className={`arrival-dot ${idx === 2 ? "warning" : ""}`} /><strong>{arrival.trainLineNm || nearbyStationLine}</strong><span>{arrival.arvlMsg2 || arrival.arvlMsg3 || "도착 정보 확인 중"}</span></div>)}</div></section>
          <section className="inspector-section"><div className="section-label">운행 상태</div><div className={`delay-row ${delayMessage === "현재 지연 없음" ? "is-normal" : ""}`}><span className="delay-dot" /> {apiIssue ? "실시간 API 확인 필요" : delayMessage}</div></section>
          <section className="inspector-section inspector-facilities"><div className="section-label">편의시설</div><div className="facility-row"><Accessibility size={17} /><span>엘리베이터</span><strong>{elevatorCount ? `${elevatorCount}대` : "확인 중"}</strong></div><div className="facility-row"><Toilet size={17} /><span>화장실</span><strong>{restroomLabel}</strong></div><div className="facility-row"><MapPin size={17} /><span>가까운 출구</span><strong>{amenity?.toilet?.out_gate_desc ? amenity.toilet.out_gate_desc.split(" ")[0] : "지도에서 선택"}</strong></div></section>
          <section className="inspector-section inspector-route"><div className="section-label">경로 검색</div><div className="route-inline"><input list="metro-stations" value={startInput} onChange={(e) => setStartInput(e.target.value)} placeholder="출발" aria-label="출발" /><ArrowRight size={16} /><input list="metro-stations" value={destinationInput} onChange={(e) => setDestinationInput(e.target.value)} placeholder="도착" aria-label="도착" /><button type="button" onClick={() => destinationInput.trim() && resumeRoute(startInput.trim() || "현재 위치", destinationInput.trim())}>검색</button></div>{routeSummary && <div className="route-summary"><strong>{routeSummary}</strong><span>현재 선택 경로</span></div>}<datalist id="metro-stations">{stationOptions.map((station: any) => <option key={`${station.name}-${station.id || station.stationCd || ""}`} value={station.name} />)}</datalist></section>
        </aside>
      </div>
    </main>
  );
}
