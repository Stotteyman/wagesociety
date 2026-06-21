// sw.js — WAGE Society Service Worker
// App shell caching + network-first for API + offline fallback

const CACHE_NAME = 'wage-v1';
const OFFLINE_URL = '/offline';

// Assets to precache (app shell)
const PRECACHE_ASSETS = [
  '/',
  '/css/theme.css',
  '/css/pages.css',
  '/manifest.json',
  '/images/icon-192.svg',
  '/images/icon-512.svg',
  '/images/apple-touch-icon.svg',
];

// ── Install: precache app shell ───────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_ASSETS).catch(function(err) {
        console.warn('[SW] Precache failed (non-fatal):', err.message);
        // Continue even if some assets fail
        return Promise.resolve();
      });
    })
  );
  // Activate immediately (skipWaiting helps avoid stale caches on update)
  self.skipWaiting();
});

// ── Activate: clean up old caches ──────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      // Take control of all clients immediately
      self.clients.claim();
    })
  );
});

// ── Fetch: network-first for API/pages, cache-first for assets ───────────────
self.addEventListener('fetch', function(event) {
  const url = event.request.url;
  const method = event.request.method;

  // Only handle GET requests
  if (method !== 'GET') return;

  // Skip non-http(s) requests
  if (!url.startsWith('http')) return;

  // Skip cross-origin requests (CDN fonts, external images, etc.)
  // But allow our own R2-hosted images
  const parsedUrl = new URL(url);
  const isOurs = parsedUrl.hostname === self.location.hostname ||
                 parsedUrl.hostname.endsWith('.r2.dev');

  // For non-ours, use stale-while-revalidate (let browser cache handle it)
  if (!isOurs) {
    // Don't intercept external resources — let the browser handle caching
    return;
  }

  // API requests → network-first with offline fallback
  if (url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(function() {
          // Return JSON error for API failures
          return new Response(
            JSON.stringify({ error: 'You are offline. Reconnect to access WAGE Society.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Static assets (CSS, JS, images, fonts) → cache-first
  const isStatic = /\/(css\/|js\/|images\/|fonts\/|icon-|\/sw\/|manifest)/.test(url);
  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          // Cache successful responses
          if (response.ok) {
            var responseClone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Page requests (HTML) → network-first, fall back to offline page
  if (url.indexOf('.') === -1 || url.endsWith('/')) {
    // It's a page route
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          // Cache the page for offline
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(function() {
          // Offline — try cached page or offline fallback
          return caches.match(event.request).then(function(cached) {
            if (cached) return cached;
            return caches.match(OFFLINE_URL).then(function(offlinePage) {
              if (offlinePage) return offlinePage;
              // Ultimate fallback: return a basic offline HTML
              return new Response(
                '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline — WAGE Society</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f1115;color:#fafafa;font-family:system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center}.icon{width:64px;height:64px;margin-bottom:1.5rem;opacity:0.5}h1{font-size:1.75rem;font-weight:800;margin-bottom:0.75rem;color:#ff6600}p{color:#a1a1aa;max-width:360px;line-height:1.6;margin-bottom:2rem}a{display:inline-block;background:#ff6600;color:#fff;padding:0.75rem 1.5rem;border-radius:10px;text-decoration:none;font-weight:700}</style></head><body><div class="icon">📡</div><h1>You are offline</h1><p>Reconnect to access WAGE Society. Check your connection and try again.</p><a href="/">Try Again</a></body></html>',
                { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              );
            });
          });
        })
    );
    return;
  }
});