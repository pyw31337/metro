// Metro Live Service Worker
// Caches the app shell and static assets for offline use

const CACHE_NAME = 'metro-live-v1';
const STATIC_CACHE = 'metro-static-v1';
const TILE_CACHE = 'metro-tiles-v1';

// App shell files to cache on install
const APP_SHELL = [
    '/metro/',
    '/metro/manifest.json',
    '/metro/icon-192.png',
    '/metro/icon-512.png',
    '/metro/train-icon.png',
];

// Static data files to cache (large, rarely change)
const DATA_FILES = [
    '/metro/data/master-bus-stops.json',
    '/metro/data/master-bus-routes.json',
    '/metro/data/capitalStations.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)),
            caches.open(STATIC_CACHE).then(cache =>
                Promise.allSettled(DATA_FILES.map(url =>
                    cache.add(url).catch(() => {}) // Don't fail install if data files are unavailable
                ))
            )
        ])
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME && key !== STATIC_CACHE && key !== TILE_CACHE)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Don't intercept external APIs (realtime data must be live)
    if (
        url.hostname.includes('swopenapi.seoul.go.kr') ||
        url.hostname.includes('openapi.seoul.go.kr') ||
        url.hostname.includes('apis.data.go.kr') ||
        url.hostname.includes('openapi.gg.go.kr') ||
        url.hostname.includes('open-meteo.com') ||
        url.hostname.includes('nominatim') ||
        url.hostname.includes('corsproxy.io') ||
        url.hostname.includes('allorigins.win')
    ) {
        return; // Let browser handle external requests normally
    }

    // Map tiles: cache-first with long TTL (tiles are immutable per URL)
    if (url.hostname.includes('cartocdn.com')) {
        event.respondWith(
            caches.open(TILE_CACHE).then(async cache => {
                const cached = await cache.match(event.request);
                if (cached) return cached;
                try {
                    const response = await fetch(event.request);
                    if (response.ok) cache.put(event.request, response.clone());
                    return response;
                } catch {
                    return cached || new Response('', { status: 503 });
                }
            })
        );
        return;
    }

    // Static data files: cache-first
    if (url.pathname.startsWith('/metro/data/')) {
        event.respondWith(
            caches.open(STATIC_CACHE).then(async cache => {
                const cached = await cache.match(event.request);
                if (cached) return cached;
                try {
                    const response = await fetch(event.request);
                    if (response.ok) cache.put(event.request, response.clone());
                    return response;
                } catch {
                    return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
                }
            })
        );
        return;
    }

    // App shell: stale-while-revalidate
    event.respondWith(
        caches.open(CACHE_NAME).then(async cache => {
            const cached = await cache.match(event.request);
            const networkPromise = fetch(event.request).then(response => {
                if (response.ok && event.request.method === 'GET') {
                    cache.put(event.request, response.clone());
                }
                return response;
            }).catch(() => cached);

            return cached || networkPromise;
        })
    );
});
