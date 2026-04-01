import { db } from "@/services/db";
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
    cost: number;
    weight: number;
    lastLine: string | null;
    transfers: number;
    parent: DijkstraState | null;
    lineUsed: string | null;
}

function reconstructPath(state: DijkstraState) {
    const path: string[] = [];
    const weights: number[] = [];
    const linePath: string[] = [];
    let current: DijkstraState | null = state;
    
    while (current) {
        path.push(current.nodeId);
        weights.push(current.weight);
        if (current.lineUsed) linePath.push(current.lineUsed);
        current = current.parent;
    }
    
    path.reverse();
    weights.reverse();
    linePath.reverse();
    
    return { path, weights, linePath };
}
interface PathResult {
    path: string[];
    totalWeight: number;
    transferCount: number;
    weights: number[];
    transfers: any[];
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

class MinHeap<T> {
    private heap: { priority: number; value: T }[] = [];

    push(value: T, priority: number) {
        this.heap.push({ priority, value });
        this.bubbleUp();
    }

    pop(): T | undefined {
        if (this.size() === 0) return undefined;
        if (this.size() === 1) return this.heap.pop()?.value;

        const top = this.heap[0].value;
        this.heap[0] = this.heap.pop()!;
        this.bubbleDown();
        return top;
    }

    size() {
        return this.heap.length;
    }

    private bubbleUp() {
        let index = this.heap.length - 1;
        while (index > 0) {
            let parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[parentIndex].priority <= this.heap[index].priority) break;
            [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
            index = parentIndex;
        }
    }

    private bubbleDown() {
        let index = 0;
        const length = this.heap.length;
        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let swapIndex = null;

            if (leftChildIndex < length) {
                if (this.heap[leftChildIndex].priority < this.heap[index].priority) {
                    swapIndex = leftChildIndex;
                }
            }

            if (rightChildIndex < length) {
                if (
                    (swapIndex === null && this.heap[rightChildIndex].priority < this.heap[index].priority) ||
                    (swapIndex !== null && this.heap[rightChildIndex].priority < this.heap[leftChildIndex].priority)
                ) {
                    swapIndex = rightChildIndex;
                }
            }

            if (swapIndex === null) break;
            [this.heap[index], this.heap[swapIndex]] = [this.heap[swapIndex], this.heap[index]];
            index = swapIndex;
        }
    }
}

type PathStrategy = "time" | "transfer";

function dijkstra(
    startName: string, 
    endName: string, 
    graph: Map<string, GraphNode>, 
    strategy: PathStrategy
): (PathResult & { linePath: string[] }) | null {
    const heap = new MinHeap<DijkstraState>();
    const minCosts = new Map<string, number>();

    heap.push({ 
        nodeId: startName, 
        cost: 0, 
        weight: 0, 
        lastLine: null, 
        transfers: 0, 
        parent: null,
        lineUsed: null
    }, 0);

    while (heap.size() > 0) {
        const state = heap.pop()!;
        const { nodeId, cost, weight, lastLine, transfers } = state;

        if (nodeId === endName) {
            const { path, weights, linePath } = reconstructPath(state);
            return { path, totalWeight: weight, weights, transferCount: transfers, linePath, transfers: [] };
        }

        const currentMin = minCosts.get(nodeId) ?? Infinity;
        if (cost > currentMin) continue;
        minCosts.set(nodeId, cost);

        const node = graph.get(nodeId);
        if (!node) continue;

        for (const conn of node.connections) {
            const isTransfer = lastLine !== null && lastLine !== conn.lineId;
            
            let edgeCost = 2; 
            let edgeWeight = 2; 

            if (isTransfer) {
                edgeCost += (strategy === "transfer") ? 1000 : 5;
                edgeWeight += 5; 
            }

            const newCost = cost + edgeCost;
            const newWeight = weight + edgeWeight;
            const targetMin = minCosts.get(conn.nodeId) ?? Infinity;
            
            if (newCost < targetMin) {
                heap.push({
                    nodeId: conn.nodeId,
                    cost: newCost,
                    weight: newWeight,
                    lastLine: conn.lineId,
                    transfers: transfers + (isTransfer ? 1 : 0),
                    parent: state,
                    lineUsed: conn.lineId
                }, newCost);
            }
        }
    }
    return null;
}

let cachedGraph: Map<string, GraphNode> | null = null;

self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    switch (type) {
        case "FIND_PATH": {
            const { points } = payload;
            if (!cachedGraph) {
                console.log('🏗️ Building subway graph specifically for pathfinding...');
                cachedGraph = buildGraph();
            }
            const graph = cachedGraph;
            const strategies: PathStrategy[] = ["time", "transfer"];
            const results: Record<string, any> = {};

            for (const strategy of strategies) {
                let finalPath: string[] = [points[0]];
                let finalWeights: number[] = [0];
                let finalLinePath: string[] = [];
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
                    finalLinePath = [...finalLinePath, ...res.linePath];
                    totalWeight += res.totalWeight;
                    totalTransferCount += res.transferCount;
                }
                
                if (!failed) {
                    // Enrich transfer metadata
                    const pathTransfers = [];
                    for (let i = 1; i < finalLinePath.length; i++) {
                        const fromLine = finalLinePath[i-1];
                        const toLine = finalLinePath[i];
                        if (fromLine !== toLine) {
                            const stationName = finalPath[i];
                            const tInfo = await db.getTransferInfo(stationName, fromLine, toLine);
                            let fastStr = null;
                            if (tInfo && (tInfo.fastCar || tInfo.fastDoor)) {
                                fastStr = [tInfo.fastCar, tInfo.fastDoor].filter(Boolean).join('-');
                            }
                            
                            pathTransfers.push({
                                stationName,
                                fromLine,
                                toLine,
                                fastTransfer: fastStr
                            });
                        }
                    }

                    results[strategy] = { 
                        path: finalPath, 
                        totalWeight, 
                        weights: finalWeights,
                        transferCount: totalTransferCount,
                        transfers: pathTransfers,
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
