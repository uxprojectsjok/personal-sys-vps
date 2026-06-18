// sw.js — Minimal Service Worker für PWA-Installierbarkeit
// Strategie: Network-first, Cache als Offline-Fallback für App-Shell.
// API-Calls (/api/*) werden nie gecacht.

const CACHE = 'sys-shell-v11'
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

self.addEventListener('push', e => {
  let data = { title: 'SYS', body: '', url: '/verbindung' }
  try { data = e.data?.json() ?? data } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag: 'sys-verify',
      renotify: true,
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/verbindung'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const match = list.find(c => c.url.includes(self.location.origin))
      if (match) return match.focus().then(c => c.navigate(url))
      return clients.openWindow(url)
    })
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
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(request))
  )
})
