// Metro Live Service Worker
// Caches the app shell and static assets for offline use

const CACHE_NAME = 'metro-live-v9';
const STATIC_CACHE = 'metro-static-v7';
const TILE_CACHE = 'metro-tiles-v1';
const FONT_CACHE = 'metro-fonts-v1';
const APP_BASE = (() => {
    try {
        const scopePath = self.registration?.scope
            ? new URL(self.registration.scope).pathname.replace(/\/$/, '')
            : '';
        return scopePath === '/' ? '' : scopePath;
    } catch {
        return '';
    }
})();
const withBase = (path) => `${APP_BASE}${path}`;
const DATA_PREFIX = withBase('/data/');
const STATIC_PREFIX = withBase('/_next/static/');
const VERSION_FILE = withBase('/version.json');
const APP_ROOT = APP_BASE || '/';

// App shell files to cache on install
const APP_SHELL = [
    withBase('/manifest.json'),
    withBase('/icon-192.png'),
    withBase('/icon-512.png'),
    withBase('/train-icon.png'),
];

// Static data files to cache (large, rarely change)
const DATA_FILES = [
    withBase('/data/master-bus-stops.json'),
    withBase('/data/master-bus-routes.json'),
    withBase('/data/capitalStations.json'),
    withBase('/data/master-toilets.json'),
    withBase('/data/station-arrivals-index.json'),
    withBase('/data/subway-schedule-index.json'),
    withBase('/data/stop-routes-11.json'),
    withBase('/data/stop-routes-23.json'),
    withBase('/data/stop-routes-gg.json'),
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
                    .filter(key => key !== CACHE_NAME && key !== STATIC_CACHE && key !== TILE_CACHE && key !== FONT_CACHE)
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

    // Fonts (CDN): cache-first, long-lived (immutable per version pin)
    if (url.hostname.includes('cdn.jsdelivr.net')) {
        event.respondWith(
            caches.open(FONT_CACHE).then(async cache => {
                const cached = await cache.match(event.request);
                if (cached) return cached;
                try {
                    const response = await fetch(event.request);
                    if (response.ok) cache.put(event.request, response.clone());
                    return response;
                } catch {
                    return new Response('', { status: 503 });
                }
            })
        );
        return;
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
    if (url.pathname.startsWith(DATA_PREFIX)) {
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

    // Build version file: network-first so old tabs can discover fresh deployments quickly
    if (url.pathname === VERSION_FILE) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async cache => {
                try {
                    const response = await fetch(event.request, { cache: 'no-store' });
                    if (response.ok) cache.put(VERSION_FILE, response.clone());
                    return response;
                } catch {
                    const cached = await cache.match(VERSION_FILE);
                    return cached || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
                }
            })
        );
        return;
    }

    // _next/static/ chunks: network-first
    // Turbopack chunk filenames can stay stable across nearby edits, so cache-first can
    // temporarily mix a new shell with old JS. Prefer fresh network responses on deploy.
    if (url.pathname.startsWith(STATIC_PREFIX)) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async cache => {
                try {
                    const response = await fetch(event.request);
                    if (response.ok) cache.put(event.request, response.clone());
                    return response;
                } catch {
                    const cached = await cache.match(event.request);
                    return cached || new Response('', { status: 503 });
                }
            })
        );
        return;
    }

    // HTML pages (index, 404, etc.): network-first so deployments take effect immediately
    if (
        event.request.mode === 'navigate' ||
        url.pathname.endsWith('.html') ||
        url.pathname === APP_ROOT ||
        url.pathname === APP_BASE
    ) {
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
