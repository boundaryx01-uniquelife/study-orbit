const CACHE = 'study-orbit-shell-v073';
const SHELL = ['/', '/index.html', '/orbit.css?v=0.7.2', '/orbit-archive.css?v=0.7.2', '/orbit.js?v=0.7.2', '/orbit-progress.js?v=0.7.3', '/orbit-archive.js?v=0.7.2', '/pwa.js?v=0.7.2', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('study-orbit-shell-') && k !== CACHE).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Only the public app shell is cached. Auth, config and learning data stay online.
  if (request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.pathname + url.search)) return;
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
