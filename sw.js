// Offline support. Pages, code and data are served network-first (so a new release shows up on the
// next visit) and fall back to the cache when offline. Product photos and icons are cache-first.
// Only this site's own files are handled; Google sign-in/Drive and Web3Forms always go to the network.
// 'mm-dev' is replaced with the release id at image build (see Dockerfile).
const VERSION = 'mm-dev';
const SHELL = ['./', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const isAsset = /\/(images|icons)\//.test(url.pathname);
  e.respondWith(isAsset ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch {
    const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') return caches.match('index.html');
    throw new Error('offline');
  }
}
