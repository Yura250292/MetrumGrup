/**
 * Metrum Group service worker — v5.4.0
 *
 * Caching strategies (mirrors the EdyshynApp PWA setup, tuned for animation perf):
 *  - HTML pages: NetworkFirst with 5s timeout, fallback to cache, 50 entries / 1 day
 *  - JS/CSS: StaleWhileRevalidate, 100 entries / 7 days
 *  - Images: CacheFirst, 200 entries / 30 days
 *  - API: NetworkFirst, 60 entries / 1 hour
 *  - Long-running API (AI/sync): bypass SW entirely (no timeout, no cache)
 *  - Other: NetworkFirst with offline fallback
 */

const VERSION = 'v5.4.0';
const STATIC_CACHE = `metrum-static-${VERSION}`;
const HTML_CACHE = `metrum-html-${VERSION}`;
const ASSET_CACHE = `metrum-assets-${VERSION}`;
const IMAGE_CACHE = `metrum-images-${VERSION}`;
const API_CACHE = `metrum-api-${VERSION}`;

const ALL_CACHES = [STATIC_CACHE, HTML_CACHE, ASSET_CACHE, IMAGE_CACHE, API_CACHE];

const STATIC_ASSETS = [
  '/offline.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json',
];

const LIMITS = {
  [HTML_CACHE]: { max: 50, maxAgeSeconds: 24 * 60 * 60 },
  [ASSET_CACHE]: { max: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
  [IMAGE_CACHE]: { max: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
  [API_CACHE]: { max: 60, maxAgeSeconds: 60 * 60 },
};

const NETWORK_TIMEOUT_MS = 5000;

// Endpoints that can take much longer than NETWORK_TIMEOUT_MS (LLM calls, heavy
// sync). The SW must not race them against a timeout — browser handles them
// natively, no caching, no Response.error() on slow networks.
const LONG_RUNNING_API_PATTERNS = [
  /\/api\/admin\/projects\/[^/]+\/sync-finance(s)?(\/|$|\?)/,
  /\/api\/admin\/projects\/[^/]+\/ai-render(\/|$|\?)/,
  /\/api\/admin\/estimates\/[^/]+\/sync-to-financing(\/|$|\?)/,
  /\/api\/admin\/ai(\/|$|\?)/,
  /\/api\/admin\/chat\/ai(\/|$|\?)/,
  /\/api\/admin\/chat\/conversations\/[^/]+\/ai-invoke(\/|$|\?)/,
];

function isLongRunningApi(pathname) {
  for (const re of LONG_RUNNING_API_PATTERNS) {
    if (re.test(pathname)) return true;
  }
  return false;
}

// ---------- Install ----------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

// ---------- Activate (purge old caches) ----------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !ALL_CACHES.includes(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------- Helpers ----------

function isExpired(response, maxAgeSeconds) {
  if (!response) return true;
  const cachedAt = response.headers.get('sw-cached-at');
  if (!cachedAt) return false;
  const age = (Date.now() - Number(cachedAt)) / 1000;
  return age > maxAgeSeconds;
}

async function withCachedAt(response) {
  if (!response || !response.ok) return response;
  try {
    const cloned = response.clone();
    const headers = new Headers(cloned.headers);
    headers.set('sw-cached-at', String(Date.now()));
    const body = await cloned.blob();
    return new Response(body, {
      status: cloned.status,
      statusText: cloned.statusText,
      headers,
    });
  } catch {
    return response;
  }
}

async function trimCache(cacheName) {
  const limit = LIMITS[cacheName];
  if (!limit) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > limit.max) {
    const toDelete = keys.length - limit.max;
    await Promise.all(keys.slice(0, toDelete).map((req) => cache.delete(req)));
  }
}

async function putWithTrim(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  const tagged = await withCachedAt(response.clone());
  await cache.put(request, tagged);
  // Fire-and-forget trim (don't block response)
  trimCache(cacheName);
}

function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('network-timeout')), ms),
  );
}

async function networkFirst(request, cacheName, timeoutMs = NETWORK_TIMEOUT_MS) {
  try {
    const response = await Promise.race([fetch(request), timeout(timeoutMs)]);
    if (response && response.ok) {
      putWithTrim(cacheName, request, response);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return (await caches.match('/offline.html')) || Response.error();
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const limit = LIMITS[cacheName];
  const cached = await caches.match(request);
  const fresh = !cached || (limit && isExpired(cached, limit.maxAgeSeconds));

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await putWithTrim(cacheName, request, response);
      }
      return response;
    })
    .catch(() => undefined);

  if (cached && !fresh) {
    // Have a fresh cache: serve immediately, refresh in background
    networkPromise.catch(() => undefined);
    return cached;
  }
  if (cached && fresh) {
    // Stale: revalidate but still serve cached if network fails
    const network = await networkPromise;
    return network || cached;
  }
  // No cache: must wait for network
  const network = await networkPromise;
  return network || Response.error();
}

async function cacheFirst(request, cacheName) {
  const limit = LIMITS[cacheName];
  const cached = await caches.match(request);
  if (cached && !(limit && isExpired(cached, limit.maxAgeSeconds))) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await putWithTrim(cacheName, request, response);
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

// ---------- Fetch ----------

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; skip CDN ranges, opaque, etc.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only (skip cross-origin to avoid breaking auth/3rd-party)
  if (url.origin !== self.location.origin) return;

  // API: NetworkFirst short cache. Long-running endpoints (AI, sync) bypass
  // the SW completely — they exceed our 4s timeout and would otherwise return
  // Response.error() before the server replies.
  if (url.pathname.startsWith('/api/')) {
    if (isLongRunningApi(url.pathname)) return;
    event.respondWith(networkFirst(request, API_CACHE, 4000));
    return;
  }

  // Images: CacheFirst, 30 day cache
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // JS/CSS/fonts: StaleWhileRevalidate (critical for smooth animations on repeat visits)
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    /\.(js|css|woff2?|ttf|otf)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  // HTML/navigation: NetworkFirst with 5s timeout, fallback to cache then offline.html
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request, HTML_CACHE, NETWORK_TIMEOUT_MS));
    return;
  }

  // Anything else: NetworkFirst with offline fallback
  event.respondWith(networkFirst(request, HTML_CACHE, NETWORK_TIMEOUT_MS));
});

// ---------- Push notifications ----------

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: { url: data.url || '/admin-v2' },
    vibrate: [100, 50, 100],
    tag: data.tag || 'metrum-' + Date.now(),
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Metrum Group', options),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin-v2';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
