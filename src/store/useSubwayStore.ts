import { create } from 'zustand';
import { StationArrival, WCItem, BusStop } from '@/types/metro';

interface SubwayStore {
  // 역 선택 / 도착 정보
  selectedStationName: string | null;
  stationArrivals: StationArrival[];
  arrivalLoading: boolean;
  arrivalLastUpdated: number | null; // Date.now() timestamp

  // 화장실
  selectedWC: WCItem | null;
  wcItems: WCItem[];
  nearestWCs: WCItem[];

  // 버스
  busStops: BusStop[];
  selectedBusStop: BusStop | null;
  selectedBusRoute: string | null;
  routePathData: any | null;

  // 액션
  setSelectedStationName: (name: string | null) => void;
  setStationArrivals: (arrivals: StationArrival[]) => void;
  setArrivalLoading: (v: boolean) => void;
  setArrivalLastUpdated: (t: number | null) => void;

  setSelectedWC: (wc: WCItem | null) => void;
  setWcItems: (items: WCItem[]) => void;
  setNearestWCs: (items: WCItem[]) => void;

  setBusStops: (stops: BusStop[]) => void;
  setSelectedBusStop: (stop: BusStop | null) => void;
  setSelectedBusRoute: (route: string | null) => void;
  setRoutePathData: (data: any | null) => void;

  clearStationSelection: () => void;
}

export const useSubwayStore = create<SubwayStore>((set) => ({
  selectedStationName: null,
  stationArrivals: [],
  arrivalLoading: false,
  arrivalLastUpdated: null,

  selectedWC: null,
  wcItems: [],
  nearestWCs: [],

  busStops: [],
  selectedBusStop: null,
  selectedBusRoute: null,
  routePathData: null,

  setSelectedStationName: (name) => set({ selectedStationName: name }),
  setStationArrivals: (arrivals) => set({ stationArrivals: arrivals }),
  setArrivalLoading: (v) => set({ arrivalLoading: v }),
  setArrivalLastUpdated: (t) => set({ arrivalLastUpdated: t }),

  setSelectedWC: (wc) => set({ selectedWC: wc }),
  setWcItems: (items) => set({ wcItems: items }),
  setNearestWCs: (items) => set({ nearestWCs: items }),

  setBusStops: (stops) => set({ busStops: stops }),
  setSelectedBusStop: (stop) => set({
    selectedBusStop: stop,
    selectedBusRoute: null,
    routePathData: null,
  }),
  setSelectedBusRoute: (route) => set({ selectedBusRoute: route }),
  setRoutePathData: (data) => set({ routePathData: data }),

  clearStationSelection: () => set({
    selectedStationName: null,
    stationArrivals: [],
    arrivalLastUpdated: null,
  }),
}));
