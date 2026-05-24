// sw.js - Service Worker Update
const CACHE_NAME = 'teledrive-v1';

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // 🚨 CRITICAL FIX: Agar URL mein '/download/' word hai, toh network request ko bina 
  // chede direct server par jaane do. Service Worker isme koi caching ya intercept nahi karega.
  if (url.includes('/download/')) {
    return e.respondWith(fetch(e.request));
  }

  // Baaki saari normal files (HTML, CSS, JS, API Calls) ke liye caching logic
  if (url.includes('/files') || url.includes('/folders') || url.includes('api.telegram.org')) {
    e.respondWith(
      caches.match(e.request).then((response) => {
        return response || fetch(e.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            // POST requests ya download requests ko cache na karein
            if (e.request.method === 'GET') {
              cache.put(e.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
  } else {
    e.respondWith(fetch(e.request));
  }
});
