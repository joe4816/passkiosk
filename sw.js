const CACHE = 'passkiosk-shell-v0.3.14';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './bridge.js',
  './js/app-core.js',
  './js/app-email.js',
  './js/app-pass-request.js',
  './js/app-detention-settings.js',
  './js/app-camera-utils.js',
  './manifest.webmanifest',
  './assets/passkiosk-icon.svg',
  './vendor/jsQR.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first keeps the unattended kiosk current while retaining a shell fallback.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
  );
});
