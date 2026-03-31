export type ActiveTab = "subway" | "bus" | "subway+bus" | "wc";

export interface Station {
  id?: number;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
  around_stations: string[];
}

export interface BusStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  routes: string[];
}

export interface WCItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  accessible: boolean;
  diapers: boolean;
  emergencyBell: boolean;
  address?: string;
  station?: string;
  line?: string;
  isInsideGate?: boolean;
  location?: string;
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
}

export interface StationMetric {
    stationName: string;
    line: string;
    hour: number;
    avgUsage: number;
    rank?: number;
}

export interface PathResult {
    path: string[]; 
    totalWeight: number; 
    weights: number[]; 
    transferCount: number;
    strategy: "time" | "transfer";
}

export interface WCFilters {
    accessible: boolean;
    diapers: boolean;
    emergencyBell: boolean;
}
