// sw.js - Fetch Event Listener Update
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // STRICT BYPASS: Agar URL mein /download/ ya Telegram ka naam hai, toh Service Worker kuch nahi karega
  if (url.includes('/download/') || url.includes('api.telegram.org')) {
    return e.respondWith(fetch(e.request)); 
  }

  // Baaki ki normal website assets ke liye caching logic
  if (url.includes('/files') || url.includes('/folders')) {
    e.respondWith(
      caches.match(e.request).then((response) => {
        return response || fetch(e.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            // Sirf safe GET requests ko cache karein jo badi files na hon
            if (e.request.method === 'GET' && !url.includes('/download/')) {
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
