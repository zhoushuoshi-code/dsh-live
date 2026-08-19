const CACHE = 'dsh-live-shell-v1'
const SHELL = ['/pair', '/mobile/main.js', '/src/crypto/protocol.js', '/src/crypto/base64url.js', '/src/transport/wire.js', '/styles.css', '/manifest.webmanifest', '/icon.svg']
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))) })
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))) })
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})
