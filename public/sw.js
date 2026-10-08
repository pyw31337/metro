// Metro Live Service Worker
// Caches the app shell and static assets for offline use

const CACHE_NAME = 'metro-live-v8';
const STATIC_CACHE = 'metro-static-v5';
const TILE_CACHE = 'metro-tiles-v1';
const FONT_CACHE = 'metro-fonts-v1';

// 배포 경로(GitHub Pages: '/metro', Firebase: '')를 등록 scope 에서 계산한다.
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');

// App shell files to cache on install
const APP_SHELL = [
    BASE + '/manifest.json',
    BASE + '/icon-192.png',
    BASE + '/icon-512.png',
    BASE + '/train-icon.png',
];

// Static data files to cache (large, rarely change)
const DATA_FILES = [
    BASE + '/data/master-bus-stops.json',
    BASE + '/data/master-bus-routes.json',
    BASE + '/data/capitalStations.json',
    BASE + '/data/master-toilets.json',
    BASE + '/data/station-arrivals-index.json',
    BASE + '/data/subway-schedule-index.json',
    BASE + '/data/stop-routes-11.json',
    BASE + '/data/stop-routes-23.json',
    BASE + '/data/stop-routes-gg.json',
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
        url.hostname.includes('allorigins.win') ||
        url.hostname.includes('codetabs.com') ||
        url.hostname.includes('cors.eu.org') ||
        url.hostname.includes('workers.dev')
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
    if (url.pathname.startsWith(BASE + '/data/')) {
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
    if (url.pathname.startsWith(BASE + '/_next/static/')) {
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
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === BASE + '/' || url.pathname === BASE) {
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

    // 그 밖의 외부 요청(예: 사용자 지정 실시간 프록시)은 캐시하지 않는다.
    if (url.origin !== self.location.origin) return;

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
