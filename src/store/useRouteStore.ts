import { create } from 'zustand';
import { PathResult, WCFilters } from '@/types/metro';

export type PathStrategy = 'time' | 'transfer';
export type ValidationError = 'source' | 'dest' | 'no_route' | null;

interface RouteStore {
  // 경로 결과
  pathResults: Record<string, PathResult> | null;
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
  setSelectedStrategy: (s: PathStrategy) => void;
  setStartStation: (s: string | null) => void;
  setEndStation: (s: string | null) => void;
  setWaypoints: (w: string[]) => void;
  addWaypoint: (w: string) => void;
  removeWaypoint: (index: number) => void;
  setIsCalculating: (v: boolean) => void;
  setValidationError: (e: ValidationError) => void;
  setShowAllRouteBubbles: (v: boolean) => void;
  reset: () => void;

  // computed (인라인 getter)
  getActivePath: () => PathResult | null;
}

export const useRouteStore = create<RouteStore>((set, get) => ({
  pathResults: null,
  selectedStrategy: 'time',
  startStation: null,
  endStation: null,
  waypoints: [],
  isCalculating: false,
  validationError: null,
  showAllRouteBubbles: false,

  setPathResults: (r) => set({ pathResults: r }),
  setSelectedStrategy: (s) => set({ selectedStrategy: s }),
  setStartStation: (s) => set({ startStation: s }),
  setEndStation: (s) => set({ endStation: s }),
  setWaypoints: (w) => set({ waypoints: w }),
  addWaypoint: (w) => set(state => ({ waypoints: [...state.waypoints, w] })),
  removeWaypoint: (index) => set(state => ({ waypoints: state.waypoints.filter((_, i) => i !== index) })),
  setIsCalculating: (v) => set({ isCalculating: v }),
  setValidationError: (e) => set({ validationError: e }),
  setShowAllRouteBubbles: (v) => set({ showAllRouteBubbles: v }),

  reset: () => set({
    pathResults: null,
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
}));
