const OFFLINE_CACHE = 'jio-offline-v1';
self.addEventListener('install', event => { event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.addAll(['/offline.html','/logo.png']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('jio-offline-') && key !== OFFLINE_CACHE).map(key => caches.delete(key)))),self.clients.claim()])); });
// Never cache API responses, customer pages, payment state or authenticated HTML.
self.addEventListener('fetch', event => { if (event.request.method === 'GET' && event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html'))); });
