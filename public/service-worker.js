const CACHE_NAME = 'low-bridge-alert-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
];

// Install Event - Cache assets individually so failure in one doesn't break the entire SW installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching assets individually...');
      return Promise.allSettled(
        ASSETS.map((url) =>
          fetch(url)
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
              throw new Error(`Status ${response.status} for ${url}`);
            })
            .catch((err) => {
              console.warn(`[Service Worker] Failed to cache: ${url}`, err);
            })
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Helper for generating custom offline response
function getOfflineHTMLResponse() {
  return new Response(
    '<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>Low Bridge Alert - Offline</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background-color:#0f172a;color:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box;text-align:center;}h1{font-size:24px;margin-bottom:8px;color:#f87171;}p{font-size:14px;color:#94a3b8;margin-bottom:24px;max-width:400px;line-height:1.5;}button{background-color:#ef4444;color:#ffffff;border:none;padding:12px 24px;border-radius:9999px;font-weight:700;font-size:14px;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 6px -1px rgba(239,68,68,0.2);}button:hover{background-color:#dc2626;}</style></head><body><h1 id="offline-title">Sem ligação à Internet</h1><p id="offline-desc">Esta página não pôde ser carregada porque o telemóvel está sem rede e o recurso não está no cache offline.</p><button id="btn-retry" onclick="window.location.reload()">Tentar Novamente</button></body></html>',
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 503,
      statusText: 'Service Unavailable'
    }
  );
}

// Fetch Event
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and local assets
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);

  // Network-First for index.html and root page to ensure users always get the latest code when online.
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.json') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((error) => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If completely offline and not in cache, and it's HTML request, return styled page.
            if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
              return getOfflineHTMLResponse();
            }
            throw error; // Re-throw network error for non-HTML to let browser handle it cleanly
          });
        })
    );
    return;
  }

  // Stale-While-Revalidate for other assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh in background to update cache
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {
          // Ignore network errors in background update
        });
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((error) => {
        // Offline fallback
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/').then((rootResponse) => {
            if (rootResponse) return rootResponse;
            return getOfflineHTMLResponse();
          });
        }
        throw error; // Propagate the error correctly so it doesn't fail with a TypeError
      });
    })
  );
});
