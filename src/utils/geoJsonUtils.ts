import { SUBWAY_LINES, Station, SubwayLine } from "@/data/subway-lines";
import { WCItem } from "@/components/WCLayer";
import { BusStop } from "@/components/BusStopLayer";

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: any[];
}

interface FeatureProperties {
    type: string;
    [key: string]: any;
}

interface GeoJsonFeature {
    type: "Feature";
    geometry: {
        type: "Point" | "LineString";
        coordinates: number[] | number[][];
    };
    properties: FeatureProperties;
}

export const convertSubwayToGeoJSON = (): { lines: GeoJsonFeatureCollection, stations: GeoJsonFeatureCollection } => {
  const lineFeatures: any[] = [];
  const stationFeatures: any[] = [];
  const stationMap = new Map<string, any>();

  SUBWAY_LINES.forEach((line: SubwayLine) => {
    // 1. LineString Feature
    const coordinates = line.stations.map(s => [s.lng, s.lat]);
    lineFeatures.push({
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates },
      properties: {
        id: line.id,
        name: line.name,
        color: line.color
      }
    });

    // 2. Point Features (Stations)
    line.stations.forEach((s: Station) => {
      if (stationMap.has(s.name)) {
        const existing = stationMap.get(s.name);
        if (!existing.properties.lines.includes(line.name)) {
            existing.properties.lines.push(line.name);
            existing.properties.lineColors.push(line.color);
        }
      } else {
        const feature = {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
          properties: {
            name: s.name,
            lines: [...s.lines],
            lineColors: [line.color],
            type: "subway"
          }
        };
        stationMap.set(s.name, feature);
        stationFeatures.push(feature);
      }
    });
  });

  return {
    lines: { type: "FeatureCollection" as const, features: lineFeatures },
    stations: { type: "FeatureCollection" as const, features: stationFeatures }
  };
};

export const convertBusStopsToGeoJSON = (stops: BusStop[]): GeoJsonFeatureCollection => {
  return {
    type: "FeatureCollection" as const,
    features: stops.map(s => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        region: s.region,
        routes: s.routes,
        type: "bus"
      }
    }))
  };
};

export const convertWCToGeoJSON = (items: WCItem[]): GeoJsonFeatureCollection => {
  return {
    type: "FeatureCollection" as const,
    features: items.map(item => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [item.lng, item.lat] },
      properties: {
        ...item,
        type: "wc"
      }
    }))
  };
};

export const convertTrainsToGeoJSON = (trains: any[]): GeoJsonFeatureCollection => {
  return {
    type: "FeatureCollection" as const,
    features: trains.map(t => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [t.lng, t.lat] },
      properties: {
        ...t,
        type: "train"
      }
    }))
  };
};
