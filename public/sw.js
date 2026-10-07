// Service worker de XR Running Coach.
// - Navegación: red primero (siempre la versión más nueva), con copia de reserva sin conexión.
// - /assets/ e /icons/: caché primero (los archivos llevan hash en el nombre).
// - NUNCA toca peticiones a otros orígenes (Supabase, fuentes): datos siempre en vivo.
const VERSION = 'xr-v4-1'
const SHELL = VERSION + '-shell'
const STATIC = VERSION + '-static'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./'))
    )
    return
  }

  if (/\/(assets|icons)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(STATIC).then((c) => c.put(req, copy))
            }
            return res
          })
      )
    )
  }
})
