import { SUBWAY_LINES, Station } from "@/data/subway-lines";
import { resolveGraphNode } from "./stationUtils";

// Interface for graph node
interface GraphNode {
    id: string; // Station name (unique enough? assuming unique names or formatted)
    connections: { nodeId: string; weight: number; lineId: string }[];
}

// Helper to build graph from subway lines
export const buildGraph = (): Map<string, GraphNode> => {
    const graph = new Map<string, GraphNode>();

    // Helper to get or create node
    const getOrCreateNode = (name: string): GraphNode => {
        if (!graph.has(name)) {
            graph.set(name, { id: name, connections: [] });
        }
        return graph.get(name)!;
    };

    SUBWAY_LINES.forEach((line) => {
        const stations = line.stations;
        for (let i = 0; i < stations.length; i++) {
            const current = stations[i];
            const currentNode = getOrCreateNode(current.name);

            // Connect to next station
            if (i < stations.length - 1) {
                const next = stations[i + 1];
                const nextNode = getOrCreateNode(next.name);

                // Add edge (undirected)
                // Weight is roughly 2 minutes per station for now
                // Ideally use actual distance, but simple graph is fine.
                currentNode.connections.push({ nodeId: next.name, weight: 2, lineId: line.id });
                nextNode.connections.push({ nodeId: current.name, weight: 2, lineId: line.id });
            }
        }
    });

    return graph;
};

export type PathStrategy = "time" | "transfer";

export interface PathTransfer {
    stationName: string;
    fromLine: string;
    toLine: string;
    fastTransfer?: string; // e.g., "2-4"
}

export interface RouteSegment {
    line: string;
    direction: '0' | '1'; // 0: Up/Inner, 1: Down/Outer
    stations: string[];
}

export interface PathResult {
    path: string[]; // List of station names
    totalWeight: number; // Actual time in minutes
    weights: number[]; // Cumulative physical time at each station in the path
    transferCount: number;
    strategy: PathStrategy;
    fare: number;
    transfers: PathTransfer[];
    segments?: RouteSegment[]; // Added for directional filtering
}

/**
 * Calculates paths between a sequence of station names (Start, Waypoints, End) using a specific strategy.
 */
export const findPathWithStrategy = (points: string[], strategy: PathStrategy): PathResult | null => {
    if (points.length < 2) return null;

    const graph = buildGraph();
    const graphKeys = Array.from(graph.keys());
    
    // Helper to resolve varied names (e.g. "양평 (5)", "양평 5", "양평 5호선" -> "양평(5호선)")
    const resolveName = (name: string): string => resolveGraphNode(name, graphKeys);

    let finalPath: string[] = [resolveName(points[0])];
    let finalWeights: number[] = [0];
    let totalWeight = 0;
    let totalTransferCount = 0;

    for (let i = 0; i < points.length - 1; i++) {
        const start = resolveName(points[i]);
        const end = resolveName(points[i+1]);

        if (start === end) continue;

        const segment = dijkstra(start, end, graph, strategy);
        if (!segment) return null; 

        // Append path and adjust weights relative to the current total
        const segmentPath = segment.path.slice(1);
        const startWeight = totalWeight;
        const segmentWeights = segment.weights.slice(1).map(w => w + startWeight);

        finalPath = [...finalPath, ...segmentPath];
        finalWeights = [...finalWeights, ...segmentWeights];
        totalWeight += segment.totalWeight;
        totalTransferCount += segment.transferCount;
    }

    // Calculate distance-based fare (approx 1.2km per station)
    const distanceKm = finalPath.length * 1.2;
    let fare = 1400;
    if (distanceKm > 10) {
        const extraDist = Math.min(distanceKm - 10, 40);
        fare += Math.ceil(extraDist / 5) * 100;
        if (distanceKm > 50) {
            fare += Math.ceil((distanceKm - 50) / 8) * 100;
        }
    }

    return { 
        path: finalPath, 
        totalWeight, 
        weights: finalWeights,
        transferCount: totalTransferCount,
        strategy,
        fare,
        transfers: calculateTransfers(finalPath),
        segments: buildSegments(finalPath)
    };
};

function buildSegments(path: string[]): RouteSegment[] {
    const segments: RouteSegment[] = [];
    if (path.length < 2) return segments;

    let currentLine: string | null = null;
    let currentStations: string[] = [path[0]];

    for (let i = 0; i < path.length - 1; i++) {
        const line = findLineBetween(path[i], path[i+1]);
        if (line === null) continue;

        if (!currentLine) {
            currentLine = line;
        }

        if (line === currentLine) {
            currentStations.push(path[i+1]);
        } else {
            segments.push(createSegment(currentLine, currentStations));
            currentLine = line;
            currentStations = [path[i], path[i+1]];
        }
    }
    if (currentLine) {
        segments.push(createSegment(currentLine, currentStations));
    }
    return segments;
}

function createSegment(lineName: string, stations: string[]): RouteSegment {
    const line = SUBWAY_LINES.find(l => l.name === lineName);
    let direction: '0' | '1' = '1';
    if (line && stations.length >= 2) {
        const idx1 = line.stations.findIndex(s => s.name === stations[0] || s.name === stations[0] + '역');
        const idx2 = line.stations.findIndex(s => s.name === stations[stations.length - 1] || s.name === stations[stations.length - 1] + '역');
        direction = (idx2 > idx1) ? '1' : '0';
    }
    return { line: lineName, direction, stations };
}

function calculateTransfers(path: string[]): PathTransfer[] {
    const transfers: PathTransfer[] = [];
    if (path.length < 3) return transfers;

    for (let i = 1; i < path.length - 1; i++) {
        const station = path[i];
        const prevStation = path[i-1];
        const nextStation = path[i+1];

        const lineBefore = findLineBetween(prevStation, station);
        const lineAfter = findLineBetween(station, nextStation);

        if (lineBefore && lineAfter && lineBefore !== lineAfter) {
            transfers.push({
                stationName: station,
                fromLine: lineBefore,
                toLine: lineAfter,
                fastTransfer: "2-4" 
            });
        }
    }
    return transfers;
}

function findLineBetween(s1: string, s2: string): string | null {
    for (const line of SUBWAY_LINES) {
        const idx1 = line.stations.findIndex(s => s.name === s1);
        const idx2 = line.stations.findIndex(s => s.name === s2);
        if (idx1 !== -1 && idx2 !== -1 && Math.abs(idx1 - idx2) === 1) {
            return line.name;
        }
    }
    return null;
}

/**
 * Enhanced Dijkstra supporting strategies.
 */
function dijkstra(
    startName: string, 
    endName: string, 
    graph: Map<string, GraphNode>, 
    strategy: PathStrategy
): Omit<PathResult, "strategy"> | null {
    // Priority queue uses 'cost' for Dijkstra, but we track 'weight' for actual time
    const pq: { nodeId: string; cost: number; weight: number; path: string[]; weights: number[]; lastLine: string | null; transfers: number; linePath: string[] }[] = [];
    const minCosts = new Map<string, number>();

    pq.push({ nodeId: startName, cost: 0, weight: 0, path: [startName], weights: [0], lastLine: null, transfers: 0, linePath: [] });

    while (pq.length > 0) {
        pq.sort((a, b) => a.cost - b.cost);
        const { nodeId, cost, weight, path, weights: weightPath, lastLine, transfers } = pq.shift()!;

        if (nodeId === endName) {
            return { path, totalWeight: weight, weights: weightPath, transferCount: transfers, fare: 0, transfers: [] };
        }

        if (cost > (minCosts.get(nodeId) ?? Infinity)) continue;
        minCosts.set(nodeId, cost);

        const node = graph.get(nodeId);
        if (!node) continue;

        for (const conn of node.connections) {
            const isTransfer = lastLine !== null && lastLine !== conn.lineId;
            
            let edgeCost = 2.5;
            let edgeWeight = 2.5;

            if (isTransfer) {
                if (strategy === "transfer") {
                    edgeCost += 2000;
                } else {
                    edgeCost += 10;
                }
                edgeWeight += 10;
            }

            const newCost = cost + edgeCost;
            const newWeight = weight + edgeWeight;
            
            pq.push({
                nodeId: conn.nodeId,
                cost: newCost,
                weight: newWeight,
                path: [...path, conn.nodeId],
                weights: [...weightPath, newWeight],
                linePath: [...(pq.find(item => item.nodeId === nodeId)?.linePath || []), conn.lineId], // Track lines
                lastLine: conn.lineId,
                transfers: transfers + (isTransfer ? 1 : 0)
            });
        }
    }

    return null;
}
