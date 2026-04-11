// Metro Live Service Worker
// Caches the app shell and static assets for offline use

const CACHE_NAME = 'metro-live-v4';
const STATIC_CACHE = 'metro-static-v2';
const TILE_CACHE = 'metro-tiles-v1';

// App shell files to cache on install
const APP_SHELL = [
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
    '/metro/data/master-toilets.json',
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

    // _next/static/ chunks: cache-first (immutable — filenames include content hash)
    if (url.pathname.startsWith('/metro/_next/static/')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async cache => {
                const cached = await cache.match(event.request);
                if (cached) return cached;
                const response = await fetch(event.request);
                if (response.ok) cache.put(event.request, response.clone());
                return response;
            })
        );
        return;
    }

    // HTML pages (index, 404, etc.): network-first so deployments take effect immediately
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/metro/' || url.pathname === '/metro') {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response.ok) {
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
                }
                return response;
            }).catch(async () => {
                const cached = await caches.match(event.request);
                return cached || new Response('Offline', { status: 503 });
            })
        );
        return;
    }

    // Other app shell assets: stale-while-revalidate
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
