const CACHE = 'infinite-code-v1';
const URLS = [
  '/infinite-code-/',
  '/infinite-code-/index.html',
  '/infinite-code-/script.js',
  '/infinite-code-/style.css',
  '/infinite-code-/manifest.json',
  '/infinite-code-/icon-192.svg',
  '/infinite-code-/icon-512.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => { if (k !== CACHE) return caches.delete(k); }))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/infinite-code-/index.html')))
  );
});
