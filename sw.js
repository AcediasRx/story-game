// Offline cache for the game, and cross-origin isolation for static hosts
// that cannot set headers (it lets the local AI use every CPU core).
const CACHE = 'story-app-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

function isolate(res) {
  if (res.status === 0) return res;
  const headers = new Headers(res.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  // Model files are large and cached by the AI runtime itself.
  if (!same && !fonts) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Network first, so a new version shows up as soon as it is online.
      const res = await fetch(req);
      if (res.ok && !url.pathname.endsWith('.gguf')) cache.put(req, res.clone());
      return same ? isolate(res) : res;
    } catch {
      const hit = await cache.match(req);
      if (hit) return same ? isolate(hit) : hit;
      throw new Error('offline');
    }
  })());
});
