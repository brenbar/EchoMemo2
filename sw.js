// sw.js - EchoMemo bridge cleaner (migration release)
// Purpose: remove old caches + unregister old SW so the new app can take over.

self.addEventListener('install', (event) => {
  // Activate this SW immediately (don’t wait for all tabs to close).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      // 1) Delete ALL caches for this origin (aggressive on purpose for migration)
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    } catch (e) {
      // Best effort
    }

    try {
      // 2) Take control briefly so we can refresh clients
      await self.clients.claim();
    } catch (e) {
      // Best effort
    }

    try {
      // 3) Unregister this service worker so the origin becomes uncontrolled
      await self.registration.unregister();
    } catch (e) {
      // Best effort
    }

    try {
      // 4) Reload any open windows under our scope so they come back without SW control
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      await Promise.all(
        clientList.map((client) => {
          const url = new URL(client.url);
          url.searchParams.set('sw_nuked', '1');
          url.searchParams.set('t', String(Date.now()));
          return client.navigate(url.toString());
        }),
      );
    } catch (e) {
      // Best effort
    }
  })());
});

// During migration: never serve from cache.
// This prevents stale cached HTML from bricking the new deployment.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});