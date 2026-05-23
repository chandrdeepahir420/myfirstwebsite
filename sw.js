// sw.js - Service Worker for Caching
const CACHE_NAME = 'teledrive-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
});

self.addEventListener('fetch', (e) => {
  // Sirf files aur preview images ko cache karein
  if (e.request.url.includes('/download/') || e.request.url.includes('api.telegram.org')) {
    e.respondWith(
      caches.match(e.request).then((response) => {
        return response || fetch(e.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
  } else {
    e.respondWith(fetch(e.request));
  }
});
