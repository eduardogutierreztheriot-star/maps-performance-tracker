/*
 * MAPS Performance Tracker — service worker.
 * - App shell precached at install → the app opens fully offline.
 * - Navigations: network-first (updates arrive on the next visit), cache fallback offline.
 * - Static assets: stale-while-revalidate.
 * Bump VERSION whenever a shipped file changes, and bump the matching `?v=` on the
 * CSS/JS URLs in index.html: versioned URLs keep a new HTML from ever running old
 * cached CSS/JS (and vice versa).
 */
const VERSION = 'v2.0.0';
const CACHE = 'maps-performance-' + VERSION;
const SHELL = [
    './',
    './index.html',
    './manifest.json',
    './assets/css/app.css?v=2.0.0',
    './assets/js/program.js?v=2.0.0',
    './assets/js/core.js?v=2.0.0',
    './assets/js/charts.js?v=2.0.0',
    './assets/js/app.js?v=2.0.0',
    './assets/icons/icon.svg',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/icons/icon-maskable-512.png',
    './assets/icons/apple-touch-icon.png',
    './assets/fonts/barlow-latin-400-normal.woff2',
    './assets/fonts/barlow-latin-500-normal.woff2',
    './assets/fonts/barlow-latin-600-normal.woff2',
    './assets/fonts/barlow-latin-700-normal.woff2',
    './assets/fonts/barlow-condensed-latin-600-normal.woff2',
    './assets/fonts/barlow-condensed-latin-700-normal.woff2',
    './assets/fonts/barlow-condensed-latin-800-normal.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k.startsWith('maps-performance-') && k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    // Only the app shell itself may refresh the cached index.html.
                    const scope = new URL(self.registration.scope).pathname;
                    const isShell = url.pathname === scope || url.pathname === scope + 'index.html';
                    if (res.ok && isShell && (res.headers.get('content-type') || '').includes('text/html')) {
                        const copy = res.clone();
                        caches.open(CACHE).then((c) => c.put('./index.html', copy));
                    }
                    return res;
                })
                .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
        );
        return;
    }

    event.respondWith(
        caches.open(CACHE).then((cache) =>
            cache.match(req).then((cached) => {
                const network = fetch(req)
                    .then((res) => {
                        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
                        return res;
                    })
                    .catch(() => cached);
                return cached || network;
            })
        )
    );
});
