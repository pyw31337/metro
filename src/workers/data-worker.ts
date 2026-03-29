// data-worker.ts
import { SUBWAY_LINES, Station, SubwayLine } from "@/data/subway-lines";

interface GraphConnection {
    nodeId: string;
    weight: number;
    lineId: string;
}

interface GraphNode {
    id: string;
    connections: GraphConnection[];
}

interface DijkstraState {
    nodeId: string;
    weight: number;
    path: string[];
    lines: string[];
}

interface PathResult {
    path: string[];
    totalWeight: number;
    transferCount: number;
    weights: number[];
}

// Simplified Dijkstra for Worker
function buildGraph(): Map<string, GraphNode> {
    const graph = new Map<string, GraphNode>();
    SUBWAY_LINES.forEach((line: SubwayLine) => {
        const stations = line.stations;
        for (let i = 0; i < stations.length; i++) {
            const current = stations[i];
            if (!graph.has(current.name)) {
                graph.set(current.name, { id: current.name, connections: [] });
            }
            const currentNode = graph.get(current.name)!;
            if (i < stations.length - 1) {
                const next = stations[i + 1];
                if (!graph.has(next.name)) {
                    graph.set(next.name, { id: next.name, connections: [] });
                }
                const nextNode = graph.get(next.name)!;
                currentNode.connections.push({ nodeId: next.name, weight: 2, lineId: line.id });
                nextNode.connections.push({ nodeId: current.name, weight: 2, lineId: line.id });
            }
        }
    });
    return graph;
}

type PathStrategy = "time" | "transfer";

function dijkstra(
    startName: string, 
    endName: string, 
    graph: Map<string, GraphNode>, 
    strategy: PathStrategy
): PathResult | null {
    // Priority queue uses 'cost' for Dijkstra, but we track 'weight' for actual time
    const pq: { nodeId: string; cost: number; weight: number; path: string[]; weights: number[]; lastLine: string | null; transfers: number }[] = [];
    const minCosts = new Map<string, number>();

    pq.push({ nodeId: startName, cost: 0, weight: 0, path: [startName], weights: [0], lastLine: null, transfers: 0 });

    while (pq.length > 0) {
        pq.sort((a, b) => a.cost - b.cost);
        const { nodeId, cost, weight, path, weights: weightPath, lastLine, transfers } = pq.shift()!;

        if (nodeId === endName) {
            return { path, totalWeight: weight, weights: weightPath, transferCount: transfers };
        }

        if (cost > (minCosts.get(nodeId) ?? Infinity)) continue;
        minCosts.set(nodeId, cost);

        const node = graph.get(nodeId);
        if (!node) continue;

        for (const conn of node.connections) {
            const isTransfer = lastLine !== null && lastLine !== conn.lineId;
            
            let edgeCost = 2; // Default 2 mins hop
            let edgeWeight = 2; // Actual time hop

            if (isTransfer) {
                // For Dijkstra cost optimization
                if (strategy === "transfer") {
                    edgeCost += 1000; // Massively penalize transfers in the algorithm
                } else {
                    edgeCost += 5; // standard time penalty
                }
                edgeWeight += 5; // Add 5 mins physical transfer time
            }

            const newCost = cost + edgeCost;
            const newWeight = weight + edgeWeight;
            
            pq.push({
                nodeId: conn.nodeId,
                cost: newCost,
                weight: newWeight,
                path: [...path, conn.nodeId],
                weights: [...weightPath, newWeight],
                lastLine: conn.lineId,
                transfers: transfers + (isTransfer ? 1 : 0)
            });
        }
    }
    return null;
}

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    switch (type) {
        case "FIND_PATH": {
            const { points } = payload;
            const graph = buildGraph();
            const strategies: PathStrategy[] = ["time", "transfer"];
            const results: Record<string, any> = {};

            for (const strategy of strategies) {
                let finalPath: string[] = [points[0]];
                let finalWeights: number[] = [0];
                let totalWeight = 0;
                let totalTransferCount = 0;
                let failed = false;

                for (let i = 0; i < points.length - 1; i++) {
                    const res = dijkstra(points[i], points[i+1], graph, strategy);
                    if (!res) {
                        failed = true;
                        break;
                    }
                    
                    const segmentPath = res.path.slice(1);
                    const startWeight = totalWeight;
                    const segmentWeights = res.weights.slice(1).map(w => w + startWeight);

                    finalPath = [...finalPath, ...segmentPath];
                    finalWeights = [...finalWeights, ...segmentWeights];
                    totalWeight += res.totalWeight;
                    totalTransferCount += res.transferCount;
                }
                
                if (!failed) {
                    results[strategy] = { 
                        path: finalPath, 
                        totalWeight, 
                        weights: finalWeights,
                        transferCount: totalTransferCount,
                        strategy 
                    };
                }
            }
            
            self.postMessage({ type: "PATH_RESULT", payload: results });
            break;
        }

        case "FIND_NEAREST_STATION": {
            const { lat, lng, stations } = payload;
            let nearestName = "";
            let minDist = Infinity;
            let nearestLine = "";
            
            stations.forEach((s: Station) => {
                const d = Math.sqrt(Math.pow(s.lat - lat, 2) + Math.pow(s.lng - lng, 2));
                if (d < minDist) {
                    minDist = d;
                    nearestName = s.name;
                    nearestLine = s.lines ? s.lines[0] : "";
                }
            });
            self.postMessage({ type: "NEAREST_STATION_RESULT", payload: { name: nearestName, line: nearestLine } });
            break;
        }

        case "SORT_WC": {
            const { items, userLat, userLng } = payload;
            const sorted = [...items].sort((a: any, b: any) => {
                const distA = Math.sqrt(Math.pow(a.lat - userLat, 2) + Math.pow(a.lng - userLng, 2));
                const distB = Math.sqrt(Math.pow(b.lat - userLat, 2) + Math.pow(b.lng - userLng, 2));
                return distA - distB;
            }).slice(0, 3);
            self.postMessage({ type: "SORTED_WC_RESULT", payload: sorted });
            break;
        }
    }
};
