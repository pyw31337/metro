/**
 * Viewport-based spatial tile loader for bus stops and WC data.
 *
 * Each tile covers 0.1° × 0.1° (≈ 11km × 8km at Seoul latitude).
 * Tiles are fetched on demand and cached in memory for the session.
 * The service worker caches fetched tiles on disk for offline use.
 */

import type { BusStop, WCItem } from '@/types/metro';

const TILE = 0.1;

// Session-level in-memory cache — never re-fetches the same tile
const _busCache = new Map<string, BusStop[]>();
const _wcCache  = new Map<string, WCItem[]>();

// Track in-flight fetches so parallel calls don't duplicate requests
const _busFetching = new Map<string, Promise<BusStop[]>>();
const _wcFetching  = new Map<string, Promise<WCItem[]>>();

function tileKeys(minLat: number, minLng: number, maxLat: number, maxLng: number): string[] {
    const keys: string[] = [];
    const r0 = Math.floor(minLat / TILE);
    const r1 = Math.floor(maxLat / TILE);
    const c0 = Math.floor(minLng / TILE);
    const c1 = Math.floor(maxLng / TILE);
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
            keys.push(`${r}_${c}`);
        }
    }
    return keys;
}

async function fetchOneTile<T>(
    key: string,
    dir: string,
    cache: Map<string, T[]>,
    inflight: Map<string, Promise<T[]>>
): Promise<T[]> {
    if (cache.has(key)) return cache.get(key)!;
    if (inflight.has(key)) return inflight.get(key)!;

    const p = fetch(`/metro/data/${dir}/${key}.json`)
        .then(r => r.ok ? r.json() as Promise<T[]> : [] as T[])
        .catch(() => [] as T[])
        .then(items => { cache.set(key, items); inflight.delete(key); return items; });

    inflight.set(key, p);
    return p;
}

export async function fetchBusTiles(
    bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }
): Promise<BusStop[]> {
    const keys = tileKeys(bounds.minLat, bounds.minLng, bounds.maxLat, bounds.maxLng);
    const results = await Promise.all(
        keys.map(k => fetchOneTile<BusStop>(k, 'bus-tiles', _busCache, _busFetching))
    );
    return results.flat();
}

export async function fetchWCTiles(
    bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }
): Promise<WCItem[]> {
    const keys = tileKeys(bounds.minLat, bounds.minLng, bounds.maxLat, bounds.maxLng);
    const results = await Promise.all(
        keys.map(k => fetchOneTile<WCItem>(k, 'wc-tiles', _wcCache, _wcFetching))
    );
    return results.flat();
}

/** Bounding box centered on a lat/lng with a given radius in degrees. */
export function bboxAround(lat: number, lng: number, radiusDeg = 0.25) {
    return {
        minLat: lat - radiusDeg,
        maxLat: lat + radiusDeg,
        minLng: lng - radiusDeg,
        maxLng: lng + radiusDeg,
    };
}
