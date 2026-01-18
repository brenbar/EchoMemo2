// sw.js - Service Worker for EchoMemo
// force update: Jan 17, 2026

const CACHE_NAME = 'echomemo-cache-v1';
const urlsToCache = [
    '/',
    'index.html', // You should rename echomemo.html to index.html to cache the root
    'https://cdn.tailwindcss.com/',
    'https://unpkg.com/wavesurfer.js@7',
    'https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'EchoMemo192.png',
    'EchoMemo512.png'
];

// Install event: opens a cache and adds the core app files to it.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Fetch event: serves assets from cache first, falling back to network.
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                // Not in cache - fetch from network
                return fetch(event.request);
            })
    );
});

// Activate event: removes old caches.
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
