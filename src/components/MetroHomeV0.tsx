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
  const nearestStation = mapProps.nearestStation as { name?: string; lines?: string[] } | null;
  const nearestBusStop = mapProps.nearestBusStop as { name?: string; routes?: string[] } | null;
  const nearestWC = mapProps.nearestWC as { name?: string; accessible?: boolean; openTime?: string } | null;

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="metro-v0" aria-label="MetroLive 주변 이동 홈">
      <a className="skip-link" href="#metro-v0-sheet">경로 설정으로 건너뛰기</a>
      <div className={`metro-v0-map ${compact ? "is-compact" : ""}`}>
        <MapLibreBackground {...mapProps as any} isDarkMode={false} />
        <div className="metro-v0-map-wash" aria-hidden="true" />
        <header className="metro-v0-header">
          <div>
            <p className="metro-v0-eyebrow"><span className="live-dot" /> LIVE · 수도권</p>
            <h1>지금 어디로 갈까요?</h1>
          </div>
          <div className="metro-v0-header-actions">
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

        <div className="route-entry" aria-label="경로 설정">
          <div className="route-line" aria-hidden="true"><span /><span /></div>
          <button type="button" className="route-field"><span className="field-label">출발</span><strong>현재 위치</strong><ChevronDown size={16} /></button>
          <button type="button" className="route-field"><span className="field-label">도착</span><strong className="placeholder">어디로 갈까요?</strong><ChevronDown size={16} /></button>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="경로 기준">
          {[
            ["fast", "빠른길", "약 32분"],
            ["calm", "덜 붐비는 길", "약 38분"],
            ["accessible", "무장애길", "약 41분"],
          ].map(([value, label, time]) => (
            <button key={value} type="button" role="tab" aria-selected={mode === value} className={`mode-tab ${mode === value ? "is-active" : ""}`} onClick={() => setMode(value as typeof mode)}>
              <span>{label}</span><strong>{time}</strong>
            </button>
          ))}
        </div>

        <div className="route-strip" aria-label="추천 노선 미리보기">
          <div className="route-strip-head"><span>추천 노선</span><small>환승 1회 · 32분</small></div>
          <div className="route-strip-track">
            <span className="route-stop is-start"><i /><span>현재 위치</span></span>
            <span className="route-segment blue"><b>2</b></span>
            <span className="route-stop"><i /><span>강남역</span></span>
            <span className="route-segment green"><b>신분당</b></span>
            <span className="route-stop is-end"><i /><span>판교역</span></span>
          </div>
          <div className="route-strip-foot"><span><TrainFront size={13} /> 2호선</span><span>도보 6분</span><span>다음 열차 3분</span></div>
        </div>

        <div className="nearby-heading"><h3>현재 위치 주변</h3><span>내 위치 기준 · 반경 1km</span></div>
        <div className="nearby-list">
          <article className="nearby-item"><span className="nearby-item-icon blue"><TrainFront size={17} /></span><div><b>{nearestStation?.name || "가까운 지하철역"}</b><small>{nearestStation?.lines?.slice(0, 2).join(" · ") || "역 정보를 찾는 중"}</small></div><strong>도착정보</strong></article>
          <article className="nearby-item"><span className="nearby-item-icon orange"><BusFront size={17} /></span><div><b>{nearestBusStop?.name || "가까운 버스정류장"}</b><small>{nearestBusStop?.routes?.slice(0, 3).join(" · ") || "정류장 정보를 찾는 중"}</small></div><strong>노선보기</strong></article>
          <article className="nearby-item"><span className="nearby-item-icon mint"><Toilet size={17} /></span><div><b>{nearestWC?.name || "공공화장실"}</b><small>{nearestWC ? `${nearestWC.accessible ? "무장애 · " : ""}${nearestWC.openTime || "운영시간 확인"}` : "시설 정보를 찾는 중"}</small></div><strong>길찾기</strong></article>
        </div>

        <div className="widget-grid">
          <article className="info-widget transit-widget">
            <div className="widget-topline"><span className="widget-icon blue"><TrainFront size={16} /></span><span>가까운 지하철</span><span className="fresh">2분 전</span></div>
            <strong className="widget-value">강남역 <small>2호선</small></strong>
            <p>홍대입구행 <b>3분</b> · 7분</p>
          </article>
          <article className="info-widget transit-widget">
            <div className="widget-topline"><span className="widget-icon orange"><BusFront size={16} /></span><span>가까운 버스</span><span className="fresh">1분 전</span></div>
            <strong className="widget-value">146번 <small>정류장 180m</small></strong>
            <p>상행 <b>5분</b> · 12분</p>
          </article>
          <article className="info-widget condition-widget">
            <div className="widget-topline"><span className="widget-icon mint"><UsersRound size={16} /></span><span>현재 혼잡도</span></div>
            <strong className="widget-value">보통 <small>42%</small></strong>
            <div className="meter"><span style={{ width: "42%" }} /></div>
            <p>평소보다 8% 여유</p>
          </article>
          <article className="info-widget condition-widget">
            <div className="widget-topline"><span className="widget-icon yellow"><Umbrella size={16} /></span><span>강남역 날씨</span></div>
            <strong className="widget-value">18° <small>맑음</small></strong>
            <p>강수확률 10% · 바람 약함</p>
          </article>
        </div>

        <div className="utility-row">
          <button type="button"><Toilet size={17} /><span><b>공공화장실</b><small>가장 가까운 곳 240m</small></span><ArrowRight size={15} /></button>
          <button type="button"><Accessibility size={17} /><span><b>무장애 출구</b><small>엘리베이터 출구 안내</small></span><ArrowRight size={15} /></button>
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
