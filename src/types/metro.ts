export type ActiveTab = "subway" | "bus" | "subway+bus" | "wc";

export interface StationCode {
    id?: number;
    name: string;
    line: string;
    stationCd: string;
}

export interface StationArrival {
    lineName: string;
    subwayId: string;
    updnLine: string;
    trainLineNm: string;
    statnNm: string;
    arvlMsg2: string;
    arvlMsg3: string;
    arvlCd: string;
    bstatnNm?: string;
    barvlDt: string;
    btrainNo: string;
    isScheduled?: boolean;
}

export interface Station {
  id?: number;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
  around_stations: string[];
  stationCd?: string;
  lineNum?: string;
  frCode?: string;
  address?: string;
  tel?: string;
  parkingCount?: number;
  hasNursingRoom?: boolean;
}

export interface BusStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  routes: string[];
  cityCode?: string;
}

export interface WCItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  accessible: boolean;
  diapers?: boolean;
  emergencyBell?: boolean;
  address?: string;
  station?: string;
  line?: string;
  isInsideGate?: boolean;
  location?: string;
  femaleStalls?: number;
  maleStalls?: number;
  maleUrinals?: number;
  openTime?: string;
}

export interface Facility {
    id: string;
    stationName: string;
    line: string;
    category: "elevator" | "lift" | "locker" | "bicycle" | "parking" | "nursing" | "toilet";
    locationDesc: string;
    isInsideGate: boolean;
    lat?: number;
    lng?: number;
    details?: string;
}

export interface OperationalData {
    fromStation: string;
    toStation: string;
    line: string;
    distance: number; // meters
    duration: number; // seconds
}

export interface TimetableEntry {
    stationName: string;
    line: string;
    dayType: "week" | "sat" | "sun";
    direction: "up" | "down" | "inner" | "outer";
    arrivalTime: string;
    departureTime: string;
    trainNo: string;
    destination: string;
    destStation?: string;
}

export interface StationMetric {
    stationName: string;
    line: string;
    hour: number;
    avgUsage: number;
    rank?: number;
}

export interface RouteSegment {
    line: string;
    direction: '0' | '1';
    stations: string[];
}

export interface PathResult {
    path: string[];
    totalWeight: number;
    weights: number[];
    transferCount: number;
    strategy: "time" | "transfer";
    fare: number;
    transfers: any[];
    linePath?: string[];
    segments?: RouteSegment[];
}

export interface WCFilters {
    accessible: boolean;
    diapers: boolean;
    emergencyBell: boolean;
}

export interface TransferInfo {
  id?: number;
  stationName: string;
  fromLine: string;
  toLine: string;
  platform: string;
  fastCar?: string;
  fastDoor?: string;
  transferDistance?: number;
}

export interface StationExit {
  id?: number;
  stationName: string;
  exitNo: string;
  lat: number;
  lng: number;
  landmarks: string[];
}

export interface ParkingLot {
  id?: number;
  name: string;
  stationName: string;
  address: string;
  capacity: number;
  feeInfo: string;
  location: [number, number];
}
