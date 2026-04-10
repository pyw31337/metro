import { SUBWAY_LINES, Station as SubwayStation, SubwayLine, getStationByName } from "@/data/subway-lines";
import { WCItem, BusStop, PathResult, WCFilters } from "@/types/metro";

// Module-level O(1) line-name→color lookup
const LINE_COLOR_MAP = new Map<string, string>(SUBWAY_LINES.map(l => [l.name, l.color]));

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: any[];
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
    line.stations.forEach((s: any) => {
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
            lines: [...(s.lines || [])],
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
        rank: (s.routes && s.routes.length > 3 ? 0 : s.routes && s.routes.length > 1 ? 1 : 2),
        type: "bus"
      }
    }))
  };
};

export const convertWCToGeoJSON = (items: WCItem[], filters?: WCFilters): GeoJsonFeatureCollection => {
  const filtered = filters ? items.filter(item => {
    if (filters.accessible && !item.accessible) return false;
    if (filters.diapers && !item.diapers) return false;
    if (filters.emergencyBell && !item.emergencyBell) return false;
    return true;
  }) : items;

  return {
    type: "FeatureCollection" as const,
    features: filtered.map(item => ({
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

export const convertBusPositionsToGeoJSON = (buses: any[]): GeoJsonFeatureCollection => {
  return {
    type: "FeatureCollection" as const,
    features: buses.map(b => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [b.lng, b.lat] },
      properties: {
        ...b,
        type: "bus_realtime"
      }
    }))
  };
};

export const convertPathToGeoJSON = (pathResult: PathResult | null, startTime: number = Date.now()): { 
    lines: GeoJsonFeatureCollection, 
    stations: GeoJsonFeatureCollection 
} => {
    if (!pathResult) return { lines: { type: "FeatureCollection", features: [] }, stations: { type: "FeatureCollection", features: [] } };
    
    const path = pathResult.path;
    const weights = pathResult.weights;
    const lineFeatures: any[] = [];
    const stationFeatures: any[] = [];

    for (let i = 0; i < path.length; i++) {
        const sName = path[i];
        const s = getStationByName(sName);
        if (!s) continue;

        const cumulativeWeight = weights[i] || 0;

        const arrivalDate = new Date(startTime + cumulativeWeight * 60 * 1000);
        const arrivalTimeStr = `${arrivalDate.getHours().toString().padStart(2, '0')}:${arrivalDate.getMinutes().toString().padStart(2, '0')}`;

        let isActualTransfer = false;
        // bubbleColor = 역 마커/버블에 표시할 색 (현재 타고 있는 노선 = 진입 노선)
        // segmentColor = 이 역에서 다음 역까지 그릴 선 색 (이 역 이후 탑승할 노선)
        let bubbleColor = "#3b82f6";
        let segmentColor = "#3b82f6";
        let transferDetails: { fromLine: string; toLine: string } | null = null;

        if (i > 0 && i < path.length - 1) {
            const prevName = path[i-1];
            const nextName = path[i+1];
            const prevS = getStationByName(prevName);
            const nextS = getStationByName(nextName);

            if (prevS && nextS) {
                const incomingLines = s.lines.filter(l => prevS.lines.includes(l));
                const outgoingLines = s.lines.filter(l => nextS.lines.includes(l));
                const overlappingLines = incomingLines.filter(l => outgoingLines.includes(l));
                if (overlappingLines.length === 0 && incomingLines.length > 0 && outgoingLines.length > 0) {
                    isActualTransfer = true;
                }

                // 버블: 진입 노선 색 (현재 타고 있는 노선)
                if (incomingLines.length > 0) {
                    const color = LINE_COLOR_MAP.get(incomingLines[0]);
                    if (color) bubbleColor = color;
                }
                // 세그먼트: 출발 노선 색 (이 역 이후 탑승할 노선)
                if (outgoingLines.length > 0) {
                    const color = LINE_COLOR_MAP.get(outgoingLines[0]);
                    if (color) segmentColor = color;
                } else {
                    segmentColor = bubbleColor;
                }

                if (isActualTransfer) {
                    transferDetails = {
                        fromLine: incomingLines[0] || s.lines[0],
                        toLine: outgoingLines[0] || s.lines[0],
                    };
                }
            }
        } else if (i === 0 && path.length > 1) {
            const nextName = path[1];
            const nextS = getStationByName(nextName);
            if (nextS) {
                const commonLines = s.lines.filter(l => nextS.lines.includes(l));
                if (commonLines.length > 0) {
                    const color = LINE_COLOR_MAP.get(commonLines[0]);
                    if (color) { bubbleColor = color; segmentColor = color; }
                }
            }
        } else if (i === path.length - 1 && i > 0) {
            // 종착역: 직전 역과 공통 노선 색
            const prevName = path[i-1];
            const prevS = getStationByName(prevName);
            if (prevS) {
                const incomingLines = s.lines.filter(l => prevS.lines.includes(l));
                if (incomingLines.length > 0) {
                    const color = LINE_COLOR_MAP.get(incomingLines[0]);
                    if (color) bubbleColor = color;
                }
            }
        }

        const platform = transferDetails ? "정보 확인" : "";

        stationFeatures.push({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
            properties: {
                name: s.name,
                isRouteStation: true,
                routeColor: bubbleColor,
                arrivalTime: arrivalTimeStr,
                arrivalTimeWeight: cumulativeWeight,
                platformInfo: platform,
                fromLine: transferDetails?.fromLine || "",
                toLine: transferDetails?.toLine || "",
                type: "route_station"
            }
        });

        if (i < path.length - 1) {
            const nextName = path[i+1];
            const nextS = getStationByName(nextName);
            if (nextS) {
                lineFeatures.push({
                    type: "Feature" as const,
                    geometry: {
                        type: "LineString" as const,
                        coordinates: [[s.lng, s.lat], [nextS.lng, nextS.lat]]
                    },
                    properties: {
                        type: "path_segment",
                        color: segmentColor
                    }
                });
            }
        }
    }

    return {
        lines: { type: "FeatureCollection" as const, features: lineFeatures },
        stations: { type: "FeatureCollection" as const, features: stationFeatures }
    };
};

export const convertRouteStationsToGeoJSON = (stations: any[]): GeoJsonFeatureCollection => {
    if (!stations || stations.length < 2) return { type: "FeatureCollection", features: [] };
    
    // We assume the stations have lat/lng? 
    // Wait, the master-route-stations.json only has id/name/order.
    // The master-bus-stops.json has the coordinates.
    // In a real app, we'd need to join them.
    // For now, I'll assume the caller provides stations with coordinates.
    const coordinates = stations
        .filter(s => s.lat && s.lng)
        .map(s => [s.lng, s.lat]);

    return {
        type: "FeatureCollection" as const,
        features: [
            {
                type: "Feature" as const,
                geometry: { type: "LineString" as const, coordinates },
                properties: { type: "bus_route_polyline" }
            }
        ]
    };
};
