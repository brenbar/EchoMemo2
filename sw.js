// sw.js - EchoMemo Stable Bridge
const CACHE_NAME = 'migration-v1';

self.addEventListener('install', (event) => {
  // Force the new SW to take over, but don't delete everything yet
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(names.map((name) => caches.delete(name)));
    }).then(() => {
      // Claim clients so we can manage their fetches immediately
      return self.clients.claim();
    })
  );
});

// STABLE PASS-THROUGH
// This is the most important part. It stops the "bricking" by 
// ensuring the browser always goes to the network.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // If network fails, only then try cache as a last resort
      return caches.match(event.request);
    })
  );
});