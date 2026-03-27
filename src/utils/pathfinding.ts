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

export interface PathResult {
    path: string[]; // List of station names
    totalWeight: number;
    transferCount: number;
}

/**
 * Calculates the shortest path between a sequence of station names (Start, Waypoints, End).
 */
export const findShortestPath = (points: string[]): PathResult | null => {
    if (points.length < 2) return null;

    const graph = buildGraph();
    let finalPath: string[] = [points[0]];
    let totalWeight = 0;
    let totalTransferCount = 0;

    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i+1];

        if (start === end) continue;

        const segment = dijkstra(start, end, graph);
        if (!segment) return null; // Unreachable segment

        // Skip the first station of the next segment (duplicated from previous end)
        finalPath = [...finalPath, ...segment.path.slice(1)];
        totalWeight += segment.totalWeight;
        totalTransferCount += segment.transferCount;
    }

    return { 
        path: finalPath, 
        totalWeight, 
        transferCount: totalTransferCount 
    };
};

/**
 * Standard Dijkstra for a single pair.
 */
function dijkstra(startName: string, endName: string, graph: Map<string, GraphNode>): PathResult | null {
    const pq: { nodeId: string; weight: number; path: string[]; lines: string[] }[] = [];
    const distances = new Map<string, number>();

    pq.push({ nodeId: startName, weight: 0, path: [startName], lines: [] });
    distances.set(startName, 0);

    while (pq.length > 0) {
        pq.sort((a, b) => a.weight - b.weight);
        const { nodeId, weight, path, lines } = pq.shift()!;

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
