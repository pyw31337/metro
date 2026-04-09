import { create } from 'zustand';
import { Station, BusStop, WCItem } from '@/types/metro';

interface MapStore {
  // 지도 상태
  center: [number, number]; // [lat, lng]
  activeLine: string | null;
  // 사용자 위치
  userLocation: [number, number] | null;
  hasInitialLocation: boolean;
  isLocating: boolean;
  locatingTimer: number;
  // 가장 가까운 시설
  nearestStation: Station | null;
  nearestBusStop: BusStop | null;
  nearestWC: WCItem | null;
  // 지도 경계 (지역별 버스정류장 로딩용)
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;

  // 액션
  setCenter: (c: [number, number]) => void;
  setActiveLine: (line: string | null) => void;
  toggleActiveLine: (line: string) => void;
  setUserLocation: (loc: [number, number] | null) => void;
  setHasInitialLocation: (v: boolean) => void;
  setIsLocating: (v: boolean) => void;
  setLocatingTimer: (t: number) => void;
  setNearestStation: (s: Station | null) => void;
  setNearestBusStop: (s: BusStop | null) => void;
  setNearestWC: (w: WCItem | null) => void;
  setBounds: (b: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null) => void;
}

export const useMapStore = create<MapStore>((set, get) => ({
  center: [37.5546, 126.9706],
  activeLine: null,
  userLocation: null,
  hasInitialLocation: false,
  isLocating: false,
  locatingTimer: 0,
  nearestStation: null,
  nearestBusStop: null,
  nearestWC: null,
  bounds: null,

  setCenter: (c) => set({ center: c }),
  setActiveLine: (line) => set({ activeLine: line }),
  toggleActiveLine: (line) => set(state => ({
    activeLine: state.activeLine === line ? null : line
  })),
  setUserLocation: (loc) => set({ userLocation: loc }),
  setHasInitialLocation: (v) => set({ hasInitialLocation: v }),
  setIsLocating: (v) => set({ isLocating: v }),
  setLocatingTimer: (t) => set({ locatingTimer: t }),
  setNearestStation: (s) => set({ nearestStation: s }),
  setNearestBusStop: (s) => set({ nearestBusStop: s }),
  setNearestWC: (w) => set({ nearestWC: w }),
  setBounds: (b) => set({ bounds: b }),
}));
