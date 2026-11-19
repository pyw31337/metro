"use client";

import { useEffect, useState } from "react";

type SavedPlace = { name?: string; type?: string };
type SmartCommute = {
  start: string | null;
  destination: string | null;
  recentPlaces: string[];
  savedPlaces: string[];
  contextLabel: string;
  contextTitle: string;
  contextBody: string;
};

const empty: SmartCommute = {
  start: null, destination: null, recentPlaces: [], savedPlaces: [],
  contextLabel: "NOW · PERSONALIZED",
  contextTitle: "지금 필요한 이동 정보를 준비했어요",
  contextBody: "최근 검색과 현재 시간대를 바탕으로 다음 이동을 빠르게 시작할 수 있어요.",
};

function readJson(key: string): any {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/\s*\((내 위치|출발|도착|경유)\)/g, "").replace(/^내 위치\s*:\s*/, "").trim() || null;
}

function buildSmartCommute(): SmartCommute {
  const hour = new Date().getHours();
  const routeState = readJson("metro-route")?.state ?? {};
  const history = (readJson("metro-search-history") || []) as SavedPlace[];
  const favorites = (readJson("metro-favorites") || []) as SavedPlace[];
  const recentPlaces = history.map(x => cleanName(x.name)).filter(Boolean) as string[];
  const savedPlaces = favorites.map(x => cleanName(x.name)).filter(Boolean) as string[];
  const start = cleanName(routeState.startStation);
  const destination = cleanName(routeState.endStation);

  if (hour >= 6 && hour < 10) return {
    start, destination, recentPlaces, savedPlaces,
    contextLabel: "MORNING · 출근시간",
    contextTitle: "혼잡도를 먼저 보고 출발하세요",
    contextBody: "평소보다 붐비는 구간과 빠른길을 비교해 가장 편한 출발 시점을 알려드려요.",
  };
  if (hour >= 17 && hour < 22) return {
    start, destination, recentPlaces, savedPlaces,
    contextLabel: "EVENING · 귀가시간",
    contextTitle: "덜 붐비는 귀갓길을 준비했어요",
    contextBody: "환승 횟수보다 혼잡도와 막차 여유를 함께 확인할 시간이에요.",
  };
  if (hour >= 22 || hour < 6) return {
    start, destination, recentPlaces, savedPlaces,
    contextLabel: "LATE · 막차 전",
    contextTitle: "막차와 안전한 출구를 먼저 확인하세요",
    contextBody: "남은 막차 시간, 무장애 출구, 가까운 화장실 정보를 우선 보여드려요.",
  };
  return {
    start, destination, recentPlaces, savedPlaces,
    contextLabel: empty.contextLabel,
    contextTitle: empty.contextTitle,
    contextBody: empty.contextBody,
  };
}

export function useSmartCommute(): SmartCommute {
  const [smart, setSmart] = useState<SmartCommute>(empty);
  useEffect(() => {
    const update = () => setSmart(buildSmartCommute());
    update();
    window.addEventListener("storage", update);
    const timer = window.setInterval(update, 60_000);
    return () => { window.removeEventListener("storage", update); window.clearInterval(timer); };
  }, []);
  return smart;
}

