"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Bath, Bus, ChevronRight, LocateFixed, MapPin, Route, Train, X } from "lucide-react";

import type { ActiveTab, Station } from "@/types/metro";
import { useRealtimeCoverage } from "@/hooks/useRealtimeCoverage";
import { useRealtimeHealth } from "@/hooks/useRealtimeHealth";
import { hapticLight } from "@/utils/haptic";
import { getRealtimeCoverageTone } from "@/utils/realtimeCoverage";

const STORAGE_KEY = "metro-service-overview-collapsed";

const TAB_META: Record<ActiveTab, {
  eyebrow: string;
  title: string;
  description: string;
  accentClass: string;
}> = {
  subway: {
    eyebrow: "Metro Route",
    title: "지하철 길찾기부터 막차 확인까지",
    description: "출발과 도착을 입력하면 최단시간과 최소환승을 함께 비교하고, 이어서 실시간 도착 정보까지 볼 수 있어요.",
    accentClass: "from-blue-500/18 via-white/90 to-sky-100/70 dark:from-blue-500/18 dark:via-zinc-900/90 dark:to-sky-950/30",
  },
  bus: {
    eyebrow: "Surface Bus",
    title: "버스 경로를 정류장 기준으로 더 선명하게",
    description: "주변 정류장과 노선 경로를 함께 보여줘서, 선택한 버스가 어디를 지나가는지 지도 위에서 바로 파악할 수 있어요.",
    accentClass: "from-emerald-500/18 via-white/90 to-emerald-100/70 dark:from-emerald-500/18 dark:via-zinc-900/90 dark:to-emerald-950/30",
  },
  "subway+bus": {
    eyebrow: "Transit Mix",
    title: "지하철과 버스를 한 화면에서 비교",
    description: "혼합 경로를 염두에 두고 역, 정류장, 실시간 상태를 함께 훑어볼 수 있는 모드예요.",
    accentClass: "from-cyan-500/18 via-white/90 to-blue-100/70 dark:from-cyan-500/18 dark:via-zinc-900/90 dark:to-blue-950/30",
  },
  wc: {
    eyebrow: "Station Comfort",
    title: "역 화장실과 편의시설을 빠르게 찾기",
    description: "역 내부 우선으로 화장실을 보여주고, 장애인·기저귀대·비상벨 필터까지 함께 적용할 수 있어요.",
    accentClass: "from-indigo-500/18 via-white/90 to-violet-100/70 dark:from-indigo-500/18 dark:via-zinc-900/90 dark:to-violet-950/30",
  },
};

const LINE_COLORS: Record<string, string> = {
  "1호선": "#0052A4",
  "2호선": "#00A84D",
  "3호선": "#EF7C1C",
  "4호선": "#00A5DE",
  "5호선": "#996CAC",
  "6호선": "#CD7C2F",
  "7호선": "#747F00",
  "8호선": "#E6186C",
  "9호선": "#BDB092",
  "수인분당선": "#F5A200",
  "신분당선": "#D4003B",
  "경의중앙선": "#77C4A3",
  "공항철도": "#0090D2",
  "경춘선": "#0C8E72",
  "신림선": "#6789CA",
  "우이신설선": "#B0B0B0",
  "인천1호선": "#7CA8D5",
  "인천2호선": "#ED8B00",
};

interface ServiceOverviewCardProps {
  activeTab: ActiveTab;
  isOffline: boolean;
  simStatus: string;
  nearestStation: Station | null;
  isLocating: boolean;
  onSwitchTab: (tab: ActiveTab) => void;
  onUseCurrentLocation: () => void;
  onOpenNearestStation: (name: string) => void;
}

export default memo(function ServiceOverviewCard({
  activeTab,
  isOffline,
  simStatus,
  nearestStation,
  isLocating,
  onSwitchTab,
  onUseCurrentLocation,
  onOpenNearestStation,
}: ServiceOverviewCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const realtimeCoverage = useRealtimeCoverage();
  const realtimeHealth = useRealtimeHealth();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) {
        setCollapsed(window.matchMedia("(max-width: 640px)").matches);
        return;
      }
      setCollapsed(saved === "1");
    } catch {}
  }, []);

  const meta = TAB_META[activeTab] ?? TAB_META.subway;

  const statusLabel = useMemo(() => {
    if (isOffline) return "오프라인 캐시 모드";
    if (activeTab === "subway" || activeTab === "subway+bus") {
      return "실시간 조회 아이콘만";
    }
    if (simStatus === "live") return "실시간 데이터 우선";
    if (simStatus === "mixed") return "실시간+보정 혼합";
    if (simStatus === "starting") return "실시간 연결 중";
    return "시뮬레이션 보조 모드";
  }, [activeTab, isOffline, simStatus]);

  const realtimeLabel = useMemo(() => {
    if (isOffline) return "오프라인 상태";
    return realtimeHealth.label;
  }, [isOffline, realtimeHealth.label]);

  const realtimeBadgeClass = useMemo(() => {
    if (isOffline || realtimeHealth.status === "offline") {
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    }
    if (realtimeHealth.status === "proxy") {
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    }
    if (realtimeHealth.status === "fallback") {
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    }
    return "bg-zinc-900/8 text-zinc-600 dark:bg-white/10 dark:text-zinc-200";
  }, [isOffline, realtimeHealth.status]);

  const strongestCoverage = useMemo(() => {
    if (realtimeCoverage.liveLines > 0) return getRealtimeCoverageTone("live");
    return {
      shortLabel: "숨김",
      badgeClass: "bg-zinc-900/10 text-zinc-600 dark:bg-white/10 dark:text-zinc-300",
      dotClass: "bg-zinc-400",
    };
  }, [realtimeCoverage.liveLines]);

  const showCoverageSummary =
    (activeTab === "subway" || activeTab === "subway+bus") && realtimeCoverage.totalLines > 0;
  const supportGroups = useMemo(() => {
    const values = Object.values(realtimeCoverage.lines).sort((a, b) => a.lineName.localeCompare(b.lineName, "ko"));
    return {
      live: values.filter((line) => line.state === "live"),
      hidden: values.filter((line) => line.state !== "live"),
    };
  }, [realtimeCoverage.lines]);
  const highlightedLines = supportGroups.live.slice(0, 4);

  const setCollapsedState = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {}
  };

  const quickTabs = [
    { id: "subway" as const, label: "지하철", icon: Train },
    { id: "bus" as const, label: "버스", icon: Bus },
    { id: "wc" as const, label: "화장실", icon: Bath },
  ];

  if (collapsed) {
    return (
      <button
        onClick={() => {
          hapticLight();
          setCollapsedState(false);
        }}
        className="glass-premium flex items-center gap-2 rounded-full px-3 py-2 text-left"
        aria-label="Metro Live 안내 열기"
      >
        <div className={`h-2 w-2 rounded-full ${isOffline ? "bg-amber-500" : simStatus === "live" ? "bg-emerald-500" : simStatus === "mixed" ? "bg-cyan-500" : "bg-zinc-400"}`} />
        <span className="text-[11px] font-black text-zinc-900 dark:text-white">Metro Live KR</span>
      </button>
    );
  }

  return (
    <div className={`glass-premium w-[min(92vw,360px)] rounded-[28px] bg-gradient-to-br ${meta.accentClass} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white dark:bg-white dark:text-zinc-900">
              Metro Live KR
            </span>
            <span className="rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-black text-zinc-600 shadow-sm dark:bg-white/10 dark:text-zinc-200">
              {statusLabel}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black shadow-sm ${realtimeBadgeClass}`}>
              {realtimeLabel}
            </span>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
            {meta.eyebrow}
          </p>
          <h1 className="mt-1 text-[18px] font-black leading-snug text-zinc-950 dark:text-white">
            {meta.title}
          </h1>
          <p className="mt-1.5 text-[12px] font-bold leading-5 text-zinc-600 dark:text-zinc-300">
            {meta.description}
          </p>
        </div>
        <button
          onClick={() => {
            hapticLight();
            setCollapsedState(true);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-zinc-500 transition hover:bg-white dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
          aria-label="안내 접기"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 rounded-2xl border border-white/60 bg-white/72 p-3 shadow-sm dark:border-white/8 dark:bg-zinc-900/55">
        <button
          onClick={() => {
            hapticLight();
            setDetailsOpen((prev) => !prev);
          }}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={detailsOpen}
          aria-label="자세히 보기 열기 또는 닫기"
        >
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
              자세히 보기
            </div>
            <p className="mt-1 text-[12px] font-bold leading-5 text-zinc-600 dark:text-zinc-300">
              위치 기반 시작{showCoverageSummary ? " · 실시간 지도 상태" : ""}를 함께 묶어뒀어요.
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-zinc-500 transition dark:bg-white/10 dark:text-zinc-300">
            <ChevronRight
              size={16}
              className={`transition-transform duration-200 ${detailsOpen ? "rotate-90" : ""}`}
            />
          </div>
        </button>

        {detailsOpen && (
          <div className="mt-3 space-y-3">
            <div className="rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm dark:border-white/8 dark:bg-zinc-900/55">
              {nearestStation ? (
                <button
                  onClick={() => {
                    hapticLight();
                    onOpenNearestStation(nearestStation.name);
                  }}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    <MapPin size={11} className="text-blue-500" />
                    가까운 역
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[16px] font-black text-zinc-950 dark:text-white">{nearestStation.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {nearestStation.lines.slice(0, 3).map((line) => (
                        <span
                          key={line}
                          className="rounded-full px-2 py-0.5 text-[10px] font-black text-white"
                          style={{ backgroundColor: LINE_COLORS[line] ?? "#888888" }}
                        >
                          {line.replace("호선", "").replace("선", "").slice(0, 3)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    <span>도착 정보와 역 주변 정보를 바로 확인할 수 있어요</span>
                    <ChevronRight size={12} />
                  </div>
                </button>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    <LocateFixed size={11} className="text-blue-500" />
                    위치 기반 시작
                  </div>
                  <p className="mt-2 text-[12px] font-bold leading-5 text-zinc-600 dark:text-zinc-300">
                    {isLocating ? "현재 위치를 확인하는 중이에요. 연결되면 가까운 역과 화장실을 바로 추천해드릴게요." : "현재 위치를 켜면 가까운 역, 주변 정류장, 근처 화장실을 더 빠르게 추천해드려요."}
                  </p>
                </div>
              )}
            </div>

            {showCoverageSummary && (
              <div className="rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm dark:border-white/8 dark:bg-zinc-900/55">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                      실시간 지도 상태
                    </div>
                    <p className="mt-1 text-[12px] font-bold leading-5 text-zinc-600 dark:text-zinc-300">
                      전체 노선 {realtimeCoverage.totalLines}개 중 실시간 조회로 잡힌 열차 아이콘만 지도에 남겨두고 있어요.
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black shadow-sm ${strongestCoverage.badgeClass}`}>
                    {strongestCoverage.shortLabel}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-emerald-500/10 px-2.5 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">LIVE</div>
                    <div className="mt-1 text-[18px] font-black text-zinc-950 dark:text-white">{realtimeCoverage.liveLines}</div>
                    <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">위치 API</div>
                  </div>
                  <div className="rounded-2xl bg-zinc-900/6 px-2.5 py-2 dark:bg-white/5">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-300">숨김</div>
                    <div className="mt-1 text-[18px] font-black text-zinc-950 dark:text-white">{realtimeCoverage.totalLines - realtimeCoverage.liveLines}</div>
                    <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">아이콘 미표시</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 px-2.5 py-2 dark:bg-white/8">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-300">총합</div>
                    <div className="mt-1 text-[18px] font-black text-zinc-950 dark:text-white">{realtimeCoverage.totalLines}</div>
                    <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">집계 노선</div>
                  </div>
                </div>

                {realtimeCoverage.liveLines === 0 && (
                  <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold leading-5 text-amber-700 dark:text-amber-300">
                    지금은 실시간 조회로 잡힌 열차가 없어 아이콘이 비어 보일 수 있어요. 보이는 열차만 믿고 가볍게 확인하는 용도로 맞춰둔 상태입니다.
                  </div>
                )}

                {highlightedLines.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                      현재 상위 노선
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {highlightedLines.map((line) => {
                        const tone = getRealtimeCoverageTone(line.state);
                        return (
                          <span
                            key={line.lineName}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${tone.badgeClass}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${tone.dotClass}`} />
                            {line.lineName}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    노선별 지원 상태
                  </div>
                  <p className="mt-1 text-[11px] font-bold leading-5 text-zinc-500 dark:text-zinc-400">
                    LIVE만 정확한 현재 위치이고, 나머지 노선은 지금 아이콘을 숨기고 있습니다.
                  </p>
                  <div className="mt-2 space-y-2">
                    {supportGroups.live.length > 0 && (
                      <div className="rounded-2xl bg-emerald-500/8 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">정확 실시간 가능</div>
                          <div className="text-[10px] font-black text-zinc-500 dark:text-zinc-400">{supportGroups.live.length}개 노선</div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {supportGroups.live.map((line) => {
                            const tone = getRealtimeCoverageTone(line.state);
                            return (
                              <span
                                key={line.lineName}
                                title={line.freshness}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${tone.badgeClass}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${tone.dotClass}`} />
                                {line.lineName}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {supportGroups.hidden.length > 0 && (
                      <div className="rounded-2xl bg-zinc-900/6 px-3 py-2 dark:bg-white/5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-300">현재 아이콘 숨김</div>
                          <div className="text-[10px] font-black text-zinc-500 dark:text-zinc-400">{supportGroups.hidden.length}개 노선</div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {supportGroups.hidden.map((line) => {
                            return (
                              <span
                                key={line.lineName}
                                title={line.freshness}
                                className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 text-[10px] font-black text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                                {line.lineName}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                  <span className={`h-2 w-2 rounded-full ${strongestCoverage.dotClass}`} />
                  {realtimeHealth.status === "fallback"
                    ? "지금은 외부 백업 경로 기준으로 실시간 지도를 구성하고 있어요."
                    : realtimeHealth.status === "proxy"
                      ? "내부 프록시 경로가 살아 있어 조금 더 안정적인 실시간 흐름으로 동작 중이에요."
                      : "실시간 경로 상태를 점검하면서 지도를 갱신하고 있어요."}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => {
            hapticLight();
            onUseCurrentLocation();
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-3.5 py-3 text-[12px] font-black text-white transition hover:opacity-95 dark:bg-white dark:text-zinc-900"
        >
          <Route size={14} />
          내 위치에서 시작
        </button>
        {quickTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              hapticLight();
              onSwitchTab(id);
            }}
            className={`flex items-center gap-2 rounded-2xl px-3.5 py-3 text-[12px] font-black transition ${
              activeTab === id
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-white/80 text-zinc-700 hover:bg-white dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
});
