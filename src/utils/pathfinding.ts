import { SUBWAY_LINES, Station } from "@/data/subway-lines";

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

export type PathStrategy = "time" | "transfer" | "distance";

export interface PathResult {
    path: string[]; // List of station names
    totalWeight: number;
    transferCount: number;
    strategy: PathStrategy;
}

/**
 * Calculates paths between a sequence of station names (Start, Waypoints, End) using a specific strategy.
 */
export const findPathWithStrategy = (points: string[], strategy: PathStrategy): PathResult | null => {
    if (points.length < 2) return null;

    const graph = buildGraph();
    let finalPath: string[] = [points[0]];
    let totalWeight = 0;
    let totalTransferCount = 0;

    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i+1];

        if (start === end) continue;

        const segment = dijkstra(start, end, graph, strategy);
        if (!segment) return null; 

        finalPath = [...finalPath, ...segment.path.slice(1)];
        totalWeight += segment.totalWeight;
        totalTransferCount += segment.transferCount;
    }

    return { 
        path: finalPath, 
        totalWeight, 
        transferCount: totalTransferCount,
        strategy
    };
};

/**
 * Enhanced Dijkstra supporting strategies.
 */
function dijkstra(
    startName: string, 
    endName: string, 
    graph: Map<string, GraphNode>, 
    strategy: PathStrategy
): Omit<PathResult, "strategy"> | null {
    const pq: { nodeId: string; weight: number; path: string[]; lastLine: string | null; transfers: number }[] = [];
    const minWeights = new Map<string, number>();

    pq.push({ nodeId: startName, weight: 0, path: [startName], lastLine: null, transfers: 0 });

    while (pq.length > 0) {
        pq.sort((a, b) => a.weight - b.weight);
        const { nodeId, weight, path, lastLine, transfers } = pq.shift()!;

        if (nodeId === endName) {
            return { path, totalWeight: weight, transferCount: transfers };
        }

        // Standard Dijkstra weight check
        if (weight > (minWeights.get(nodeId) ?? Infinity)) continue;
        minWeights.set(nodeId, weight);

        const node = graph.get(nodeId);
        if (!node) continue;

        for (const conn of node.connections) {
            let edgeWeight = conn.weight;
            let isTransfer = lastLine !== null && lastLine !== conn.lineId;
            let currentTransfers = transfers + (isTransfer ? 1 : 0);

            // Apply Strategy Logic
            if (strategy === "transfer") {
                if (isTransfer) edgeWeight += 1000; // High penalty for transfers
            } else if (strategy === "distance") {
                edgeWeight = 1; // All hops equal 1
            } else {
                // "time" - default 2 min/station
                edgeWeight = 2;
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
