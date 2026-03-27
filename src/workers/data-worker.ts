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

function dijkstra(startName: string, endName: string, graph: Map<string, GraphNode>): PathResult | null {
    const pq: DijkstraState[] = [{ nodeId: startName, weight: 0, path: [startName], lines: [] }];
    const distances = new Map<string, number>();
    distances.set(startName, 0);

    while (pq.length > 0) {
        pq.sort((a, b) => a.weight - b.weight);
        const current = pq.shift();
        if (!current) continue;
        
        const { nodeId, weight, path, lines } = current;

        if (nodeId === endName) {
            let transfers = 0;
            for (let i = 0; i < lines.length - 1; i++) {
                if (lines[i] !== lines[i + 1]) transfers++;
            }
            return { path, totalWeight: weight, transferCount: transfers };
        }

        if (weight > (distances.get(nodeId) ?? Infinity)) continue;
        const node = graph.get(nodeId);
        if (!node) continue;

        for (const conn of node.connections) {
            const newWeight = weight + conn.weight;
            if (newWeight < (distances.get(conn.nodeId) ?? Infinity)) {
                distances.set(conn.nodeId, newWeight);
                pq.push({
                    nodeId: conn.nodeId,
                    weight: newWeight,
                    path: [...path, conn.nodeId],
                    lines: [...lines, conn.lineId]
                });
            }
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
            let finalPath: string[] = [points[0]];
            let totalWeight = 0;
            let totalTransferCount = 0;

            for (let i = 0; i < points.length - 1; i++) {
                const res = dijkstra(points[i], points[i+1], graph);
                if (!res) {
                    self.postMessage({ type: "PATH_RESULT", payload: null });
                    return;
                }
                finalPath = [...finalPath, ...res.path.slice(1)];
                totalWeight += res.totalWeight;
                totalTransferCount += res.transferCount;
            }
            self.postMessage({ type: "PATH_RESULT", payload: { path: finalPath, totalWeight, transferCount: totalTransferCount } });
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
