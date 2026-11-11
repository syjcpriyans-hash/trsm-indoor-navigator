// Minimal offline cache: static assets cache-first, pages network-first.
const CACHE = "trsm-nav-v1";
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const isStatic = /\/_next\/static\/|\.(png|svg|woff2?|webmanifest)$/.test(req.url);
  if (isStatic) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r))));
  } else {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req)));
  }
});
