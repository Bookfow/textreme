// TeXTREME Service Worker — minimal for PWA installability
const CACHE_NAME = 'textreme-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Network-first strategy
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
