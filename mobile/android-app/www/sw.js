// W.A.G.E. Society — Service Worker
// Network-first strategy: always try network, fall back to cache for static assets.

const CACHE_NAME = 'wage-society-v1'

// Static assets that are safe to cache long-term (hashed filenames)
const STATIC_ASSET_PATTERN = /\/assets\/[^/]+\.(js|css|woff2?|ttf|svg|png|ico)$/

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, cross-origin, and API requests — always network
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  // Static hashed assets: cache-first (they never change)
  if (STATIC_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      })
    )
    return
  }

  // Everything else: network-first, cache as fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
