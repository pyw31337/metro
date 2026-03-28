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

export type PathStrategy = "time" | "transfer";

export interface PathResult {
    path: string[]; // List of station names
    totalWeight: number; // Actual time in minutes
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
    // Priority queue uses 'cost' for Dijkstra, but we track 'weight' for actual time
    const pq: { nodeId: string; cost: number; weight: number; path: string[]; lastLine: string | null; transfers: number }[] = [];
    const minCosts = new Map<string, number>();

    pq.push({ nodeId: startName, cost: 0, weight: 0, path: [startName], lastLine: null, transfers: 0 });

    while (pq.length > 0) {
        pq.sort((a, b) => a.cost - b.cost);
        const { nodeId, cost, weight, path, lastLine, transfers } = pq.shift()!;

        if (nodeId === endName) {
            return { path, totalWeight: weight, transferCount: transfers };
        }

        if (cost > (minCosts.get(nodeId) ?? Infinity)) continue;
        minCosts.set(nodeId, cost);

        const node = graph.get(nodeId);
        if (!node) continue;

        for (const conn of node.connections) {
            const isTransfer = lastLine !== null && lastLine !== conn.lineId;
            
            let edgeCost = 2.5; // Average 2.5 mins hop (more realistic for Seoul)
            let edgeWeight = 2.5; // Actual time hop

            if (isTransfer) {
                // For Dijkstra cost optimization
                if (strategy === "transfer") {
                    edgeCost += 1000; // Massively penalize transfers locally
                } else {
                    edgeCost += 8; // standard time penalty (walking + waiting)
                }
                edgeWeight += 8; // Add 8 mins physical transfer time
            }

            const newCost = cost + edgeCost;
            const newWeight = weight + edgeWeight;
            
            pq.push({
                nodeId: conn.nodeId,
                cost: newCost,
                weight: newWeight,
                path: [...path, conn.nodeId],
                lastLine: conn.lineId,
                transfers: transfers + (isTransfer ? 1 : 0)
            });
        }
    }

    return null;
}
