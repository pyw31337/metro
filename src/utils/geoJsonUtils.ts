import { SUBWAY_LINES, Station, SubwayLine } from "@/data/subway-lines";
import { WCItem } from "@/components/WCLayer";
import { BusStop } from "@/components/BusStopLayer";

export const convertSubwayToGeoJSON = () => {
  const lineFeatures: any[] = [];
  const stationFeatures: any[] = [];
  const stationMap = new Map<string, any>();

  SUBWAY_LINES.forEach((line: SubwayLine) => {
    // 1. LineString Feature
    const coordinates = line.stations.map(s => [s.lng, s.lat]);
    lineFeatures.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
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
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
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
    lines: { type: "FeatureCollection", features: lineFeatures },
    stations: { type: "FeatureCollection", features: stationFeatures }
  };
};

export const convertBusStopsToGeoJSON = (stops: BusStop[]) => {
  return {
    type: "FeatureCollection",
    features: stops.map(s => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
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

export const convertWCToGeoJSON = (items: WCItem[]) => {
  return {
    type: "FeatureCollection",
    features: items.map(item => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [item.lng, item.lat] },
      properties: {
        ...item,
        type: "wc"
      }
    }))
  };
};
