// sw.js — Minimal Service Worker für PWA-Installierbarkeit
// Strategie: Network-first, Cache als Offline-Fallback für App-Shell.
// API-Calls (/api/*) werden nie gecacht.

const CACHE = 'sys-shell-v5'
const SHELL = ['/', '/gate', '/session', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // API und externe Requests: immer Netzwerk, kein Cache
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return

  e.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return res
      })
      .catch(() => caches.match(request))
  )
})
