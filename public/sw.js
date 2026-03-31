const CACHE_NAME = 'metrum-v1.0.0';
const STATIC_CACHE = 'metrum-static-v1';
const IMAGE_CACHE = 'metrum-images-v1';
const API_CACHE = 'metrum-api-v1';

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== IMAGE_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests: Network First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, clonedResponse));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Images: Cache First
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          const clonedResponse = response.clone();
          caches.open(IMAGE_CACHE).then((cache) => cache.put(request, clonedResponse));
          return response;
        });
      })
    );
    return;
  }

  // Other requests: Network First with offline fallback
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
      .catch(() => caches.match('/offline.html'))
  );
});
