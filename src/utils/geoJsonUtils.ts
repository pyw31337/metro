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

export const convertPathToGeoJSON = (path: string[], startTime: number = Date.now()): { 
    pathLines: GeoJsonFeatureCollection, 
    routeStations: GeoJsonFeatureCollection 
} => {
    const lineFeatures: any[] = [];
    const stationFeatures: any[] = [];
    const allStations = getAllStations();
    let cumulativeWeight = 0;

    for (let i = 0; i < path.length; i++) {
        const sName = path[i];
        const s = allStations.find(st => st.name === sName);
        if (!s) continue;

        // Arrival time for this station (2 mins per hop for consistency)
        const arrivalDate = new Date(startTime + cumulativeWeight * 60 * 1000); 
        const arrivalTimeStr = `${arrivalDate.getHours().toString().padStart(2, '0')}:${arrivalDate.getMinutes().toString().padStart(2, '0')}`;

        // Transfer Logic: Only show platform info at actual points where the route changes lines
        let isActualTransfer = false;
        let routeColor = "#3b82f6";
        
        if (i > 0 && i < path.length - 1) {
            const prevName = path[i-1];
            const nextName = path[i+1];
            const prevS = allStations.find(st => st.name === prevName);
            const nextS = allStations.find(st => st.name === nextName);
            
            if (prevS && nextS) {
                // Lines that could have been used to get here
                const incomingLines = s.lines.filter(l => prevS.lines.includes(l));
                // Lines that will be used to go forward
                const outgoingLines = s.lines.filter(l => nextS.lines.includes(l));
                
                // If there's no single line that handles both incoming and outgoing, it's a transfer
                const overlappingLines = incomingLines.filter(l => outgoingLines.includes(l));
                if (overlappingLines.length === 0 && incomingLines.length > 0 && outgoingLines.length > 0) {
                    isActualTransfer = true;
                }
                
                // Set route color based on the outgoing segment
                if (outgoingLines.length > 0) {
                    const line = SUBWAY_LINES.find(l => l.name === outgoingLines[0]);
                    if (line) routeColor = line.color;
                }
            }
        } else if (i === 0 && path.length > 1) {
            // Start station: color based on first segment
            const nextName = path[1];
            const nextS = allStations.find(st => st.name === nextName);
            if (nextS) {
                const commonLines = s.lines.filter(l => nextS.lines.includes(l));
                if (commonLines.length > 0) {
                    const line = SUBWAY_LINES.find(l => l.name === commonLines[0]);
                    if (line) routeColor = line.color;
                }
            }
        }

        const platform = isActualTransfer ? `${Math.floor(Math.random() * 8) + 1}-${Math.floor(Math.random() * 4) + 1}` : "";

        stationFeatures.push({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
            properties: {
                name: s.name,
                isRouteStation: true,
                routeColor: routeColor,
                arrivalTime: arrivalTimeStr,
                platformInfo: platform,
                type: "route_station"
            }
        });

        if (i < path.length - 1) {
            const nextName = path[i+1];
            const nextS = allStations.find(st => st.name === nextName);
            if (nextS) {
                // Add weighted segment
                lineFeatures.push({
                    type: "Feature" as const,
                    geometry: {
                        type: "LineString" as const,
                        coordinates: [[s.lng, s.lat], [nextS.lng, nextS.lat]]
                    },
                    properties: {
                        type: "path_segment",
                        color: routeColor
                    }
                });
                cumulativeWeight += 2; // Increment cumulative weight for next station
            }
        }
    }

    return {
        pathLines: { type: "FeatureCollection" as const, features: lineFeatures },
        routeStations: { type: "FeatureCollection" as const, features: stationFeatures }
    };
};
