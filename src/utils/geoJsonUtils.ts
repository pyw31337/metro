import { SUBWAY_LINES, Station, SubwayLine, getAllStations } from "@/data/subway-lines";
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

export const convertPathToGeoJSON = (path: string[]): GeoJsonFeatureCollection => {
    const features: any[] = [];
    const allStations = getAllStations();

    for (let i = 0; i < path.length - 1; i++) {
        const s1Name = path[i];
        const s2Name = path[i+1];
        const s1 = allStations.find(s => s.name === s1Name);
        const s2 = allStations.find(s => s.name === s2Name);

        if (s1 && s2) {
            // Find common line to get color
            const commonLines = s1.lines.filter(l => s2.lines.includes(l));
            let color = "#3b82f6"; // Default fallback
            if (commonLines.length > 0) {
                const line = SUBWAY_LINES.find(l => l.name === commonLines[0]);
                if (line) color = line.color;
            }

            features.push({
                type: "Feature" as const,
                geometry: {
                    type: "LineString" as const,
                    coordinates: [[s1.lng, s1.lat], [s2.lng, s2.lat]]
                },
                properties: {
                    type: "path_segment",
                    color: color
                }
            });
        }
    }

    return {
        type: "FeatureCollection" as const,
        features: features
    };
};
