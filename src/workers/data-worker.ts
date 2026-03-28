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

type PathStrategy = "time" | "transfer" | "distance";

function dijkstra(
    startName: string, 
    endName: string, 
    graph: Map<string, GraphNode>, 
    strategy: PathStrategy
): PathResult | null {
    const pq: { nodeId: string; weight: number; path: string[]; lastLine: string | null; transfers: number }[] = [];
    const minWeights = new Map<string, number>();

    pq.push({ nodeId: startName, weight: 0, path: [startName], lastLine: null, transfers: 0 });

    while (pq.length > 0) {
        pq.sort((a, b) => a.weight - b.weight);
        const current = pq.shift()!;
        const { nodeId, weight, path, lastLine, transfers } = current;

        if (nodeId === endName) {
            return { path, totalWeight: weight, transferCount: transfers };
        }

        if (weight > (minWeights.get(nodeId) ?? Infinity)) continue;
        minWeights.set(nodeId, weight);

        const node = graph.get(nodeId);
        if (!node) continue;

        for (const conn of node.connections) {
            let edgeWeight = conn.weight;
            let isTransfer = lastLine !== null && lastLine !== conn.lineId;
            let currentTransfers = transfers + (isTransfer ? 1 : 0);

            if (strategy === "transfer") {
                if (isTransfer) edgeWeight += 1000;
            } else if (strategy === "distance") {
                edgeWeight = 1;
            } else {
                edgeWeight = 2; // Time
            }

            const newWeight = weight + edgeWeight;
            pq.push({
                nodeId: conn.nodeId,
                weight: newWeight,
                path: [...path, conn.nodeId],
                lastLine: conn.lineId,
                transfers: currentTransfers
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
            const strategies: PathStrategy[] = ["time", "transfer", "distance"];
            const results: Record<string, any> = {};

            for (const strategy of strategies) {
                let finalPath: string[] = [points[0]];
                let totalWeight = 0;
                let totalTransferCount = 0;
                let failed = false;

                for (let i = 0; i < points.length - 1; i++) {
                    const res = dijkstra(points[i], points[i+1], graph, strategy);
                    if (!res) {
                        failed = true;
                        break;
                    }
                    finalPath = [...finalPath, ...res.path.slice(1)];
                    totalWeight += res.totalWeight;
                    totalTransferCount += res.transferCount;
                }
                
                if (!failed) {
                    results[strategy] = { 
                        path: finalPath, 
                        totalWeight, 
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
