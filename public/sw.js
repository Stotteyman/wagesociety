// sw.js — deliberately a self-uninstaller, not a service worker.
//
// The Express site that used to live on this domain registered a caching service
// worker. A registration survives the site it came from: every returning visitor still
// had it installed and intercepting requests, serving a cached app shell built for
// paths the SPA no longer has. That is almost certainly why sign-in failed
// intermittently with pkce_code_verifier_not_found — if the OAuth callback document
// came from that cache, the current JS never ran, so the PKCE verifier in local
// storage was never read.
//
// Deleting this file would NOT fix it: a browser keeps the last worker it installed
// successfully, and only replaces it when this URL returns different content. So the
// file has to stay and actively remove itself.
//
// The SPA does not register a service worker at all. Once this has run for a visitor,
// nothing here runs again. Do not reintroduce caching without a versioning story —
// caching an SPA shell is how you ship a bundle nobody can update.

self.addEventListener('install', () => {
  // Take over from the old worker immediately rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop everything the previous worker cached, including the stale app shell.
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));

    // Unregister, so this stops being consulted at all.
    await self.registration.unregister();

    // Reload open tabs so they leave the cached document behind and fetch the real site.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch { /* a tab we cannot steer is fine */ }
    }
  })());
});

// No fetch handler on purpose: while this worker is alive it must not intercept
// anything, least of all an auth callback.
