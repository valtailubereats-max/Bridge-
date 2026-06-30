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

// Helper for IndexedDB database of map tile metadata
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('map-tiles-metadata', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('tiles')) {
        db.createObjectStore('tiles', { keyPath: 'url' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function recordTileAccessInSW(url) {
  try {
    const db = await openDB();
    const tx = db.transaction('tiles', 'readwrite');
    const store = tx.objectStore('tiles');
    store.put({ url, lastUsed: Date.now() });
    
    tx.oncomplete = () => {
      cleanOldTilesIfNeeded();
    };
  } catch (err) {
    // Ignore db errors in SW
  }
}

async function cleanOldTilesIfNeeded() {
  try {
    const db = await openDB();
    const tx = db.transaction('tiles', 'readonly');
    const store = tx.objectStore('tiles');
    const request = store.getAll();
    request.onsuccess = async (e) => {
      const all = e.target.result;
      const LIMIT = 2000; // Limit of tiles to keep
      if (all.length > LIMIT) {
        all.sort((a, b) => a.lastUsed - b.lastUsed);
        const toDeleteCount = all.length - LIMIT;
        const toDelete = all.slice(0, toDeleteCount);
        
        const cache = await caches.open('map-tiles-v1');
        const writeTx = db.transaction('tiles', 'readwrite');
        const writeStore = writeTx.objectStore('tiles');
        
        for (const item of toDelete) {
          try {
            await cache.delete(item.url);
            writeStore.delete(item.url);
          } catch (err) {}
        }
        console.log(`[Service Worker] Pruned ${toDeleteCount} old tiles to stay under limit of ${LIMIT}`);
      }
    };
  } catch (err) {
    // Ignore cleanup errors
  }
}

// Fetch Event
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const isTileUrl = event.request.url.includes('tile.openstreetmap.org');
  const isLocalAsset = event.request.url.startsWith(self.location.origin);

  if (!isLocalAsset && !isTileUrl) {
    return;
  }

  // Handle OSM Map Tiles (Third-party)
  if (isTileUrl) {
    const normUrl = event.request.url.replace(/(a|b|c)\.tile\.openstreetmap\.org/, 'a.tile.openstreetmap.org');
    event.respondWith(
      caches.open('map-tiles-v1').then((cache) => {
        return cache.match(normUrl).then((cachedResponse) => {
          if (cachedResponse) {
            // Record tile access in background and optionally refresh
            recordTileAccessInSW(normUrl);
            return cachedResponse;
          }

          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(normUrl, networkResponse.clone());
              recordTileAccessInSW(normUrl);
            }
            return networkResponse;
          }).catch((error) => {
            throw error;
          });
        });
      })
    );
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
