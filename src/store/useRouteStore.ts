import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PathResult, WCFilters } from '@/types/metro';
import type { BusPathResult } from '@/utils/busRouting';

export type PathStrategy = 'time' | 'transfer';
export type ValidationError = 'source' | 'dest' | 'no_route' | null;

interface RouteStore {
  // 경로 결과
  pathResults: Record<string, PathResult> | null;
  busPathResult: BusPathResult | null;
  selectedStrategy: PathStrategy;
  // 입력값
  startStation: string | null;
  endStation: string | null;
  waypoints: string[];
  // 상태
  isCalculating: boolean;
  validationError: ValidationError;
  showAllRouteBubbles: boolean;

  // 액션
  setPathResults: (r: Record<string, PathResult> | null) => void;
  setBusPathResult: (r: BusPathResult | null) => void;
  setSelectedStrategy: (s: PathStrategy) => void;
  setStartStation: (s: string | null) => void;
  setEndStation: (s: string | null) => void;
  setWaypoints: (w: string[]) => void;
  addWaypoint: (w: string) => void;
  removeWaypoint: (index: number) => void;
  moveWaypoint: (from: number, to: number) => void;
  setIsCalculating: (v: boolean) => void;
  setValidationError: (e: ValidationError) => void;
  setShowAllRouteBubbles: (v: boolean) => void;
  reset: () => void;

  // computed (인라인 getter)
  getActivePath: () => PathResult | null;
}

export const useRouteStore = create<RouteStore>()(persist((set, get) => ({
  pathResults: null,
  busPathResult: null,
  selectedStrategy: 'time',
  startStation: null,
  endStation: null,
  waypoints: [],
  isCalculating: false,
  validationError: null,
  showAllRouteBubbles: false,

  setPathResults: (r) => set({ pathResults: r }),
  setBusPathResult: (r) => set({ busPathResult: r }),
  setSelectedStrategy: (s) => set({ selectedStrategy: s }),
  setStartStation: (s) => set({ startStation: s }),
  setEndStation: (s) => set({ endStation: s }),
  setWaypoints: (w) => set({ waypoints: w }),
  addWaypoint: (w) => set(state => ({ waypoints: [...state.waypoints, w] })),
  removeWaypoint: (index) => set(state => ({ waypoints: state.waypoints.filter((_, i) => i !== index) })),
  moveWaypoint: (from, to) => set(state => {
    const wps = [...state.waypoints];
    const [item] = wps.splice(from, 1);
    wps.splice(to, 0, item);
    return { waypoints: wps };
  }),
  setIsCalculating: (v) => set({ isCalculating: v }),
  setValidationError: (e) => set({ validationError: e }),
  setShowAllRouteBubbles: (v) => set({ showAllRouteBubbles: v }),

  reset: () => set({
    pathResults: null,
    busPathResult: null,
    startStation: null,
    endStation: null,
    waypoints: [],
    validationError: null,
    showAllRouteBubbles: false,
  }),

  getActivePath: () => {
    const { pathResults, selectedStrategy } = get();
    if (!pathResults) return null;
    return pathResults[selectedStrategy] ?? Object.values(pathResults)[0] ?? null;
  },
}), {
  name: 'metro-route',
  // Only persist user input — not transient calculation state
  partialize: (s) => ({
    startStation: s.startStation,
    endStation: s.endStation,
    selectedStrategy: s.selectedStrategy,
  }),
}));
