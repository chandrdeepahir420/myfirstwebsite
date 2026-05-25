// sw.js - Service Worker Update (API Bypass)
const CACHE_NAME = 'teledrive-v2'; // Changed version to force refresh

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // 🚨 CRITICAL FIX: Database APIs aur Downloads ko hamesha network se aane do
  // Inhe kabhi cache nahi karna chahiye warna deleted files dikhti rahengi
  if (url.includes('/download/') || url.includes('/files') || url.includes('/folders') || url.includes('/trash')) {
    return e.respondWith(fetch(e.request));
  }

  // Baaki static files (HTML, CSS, JS) aur Telegram Thumbnails ke liye caching
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request).then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          // Sirf GET requests ko cache karein
          if (e.request.method === 'GET') {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    })
  );
});

// ⭐ NAYA LOGIC: Purane cache ko delete karne ke liye
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Old cache deleted:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});
