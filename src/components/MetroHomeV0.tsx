"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Accessibility,
  ArrowRight,
  BusFront,
  ChevronDown,
  Clock3,
  LocateFixed,
  MapPin,
  RefreshCw,
  Sparkles,
  TrainFront,
  Toilet,
  Umbrella,
  UsersRound,
} from "lucide-react";
import { useSmartCommute } from "@/hooks/useSmartCommute";

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
  const smart = useSmartCommute();
  const nearestStation = mapProps.nearestStation as { name?: string; lines?: string[] } | null;
  const nearestBusStop = mapProps.nearestBusStop as { name?: string; routes?: string[] } | null;
  const nearestWC = mapProps.nearestWC as { name?: string; accessible?: boolean; openTime?: string } | null;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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

        <article className="primary-mobility-card">
          <div className="primary-mobility-copy">
            <p className="section-kicker">BEST OPTION FOR NOW</p>
            <h3>지금은 지하철이 가장 편해요</h3>
            <p>현재 위치에서 강남역까지 <b>32분</b><br />혼잡도는 평소보다 8% 낮아요.</p>
            <button type="button">경로 자세히 보기 <ArrowRight size={15} /></button>
          </div>
          <img src={`${basePath}/metro-live/transit-isometric.png`} alt="입체적인 지하철과 승강장 아이콘" />
        </article>

        <section className="smart-context-card" aria-label="시간대 맞춤 이동 정보">
          <div className="smart-context-icon"><Sparkles size={18} /></div>
          <div className="smart-context-copy"><p>{smart.contextLabel}</p><h3>{smart.contextTitle}</h3><span>{smart.contextBody}</span></div>
          <div className="smart-context-time"><Clock3 size={14} /> {new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</div>
        </section>

        {smart.start && smart.destination ? (
          <button type="button" className="smart-route-resume" onClick={() => { (mapProps.onSetStart as ((v: string) => void) | undefined)?.(smart.start!); (mapProps.onSetEnd as ((v: string) => void) | undefined)?.(smart.destination!); }}><span>최근 경로</span><b>{smart.start} → {smart.destination}</b><ArrowRight size={15} /></button>
        ) : smart.recentPlaces.length >= 2 ? (
          <button type="button" className="smart-route-resume" onClick={() => { (mapProps.onSetStart as ((v: string) => void) | undefined)?.(smart.recentPlaces[0]); (mapProps.onSetEnd as ((v: string) => void) | undefined)?.(smart.recentPlaces[1]); }}><span>최근 검색으로 빠르게 시작</span><b>{smart.recentPlaces[0]} → {smart.recentPlaces[1]}</b><ArrowRight size={15} /></button>
        ) : null}

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

        <div className="route-diagram" aria-label="추천 노선 미리보기">
          <div className="route-strip-head"><span>추천 노선</span><small>환승 1회 · 32분</small></div>
          <div className="route-diagram-row"><span className="line-badge line-blue">2</span><div className="route-rail rail-blue"><i /><i /></div><div className="route-stations"><b>현재 위치</b><span>강남역</span></div></div>
          <div className="route-transfer"><span>환승</span><b>도보 4분</b></div>
          <div className="route-diagram-row"><span className="line-badge line-green">신분당</span><div className="route-rail rail-green"><i /><i /></div><div className="route-stations"><b>강남역</b><span>판교역</span></div></div>
          <div className="route-strip-foot"><span><TrainFront size={13} /> 다음 열차 3분</span><span>혼잡도 보통</span><span>무장애 이동 가능</span></div>
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
            <img className="widget-object bus-object" src={`${basePath}/metro-live/bus-isometric.png`} alt="입체적인 버스정류장 아이콘" />
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
