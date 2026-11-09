// CAMZRO · funciona sem internet no set. Depois da primeira abertura (que passa pelo gate), a página e os arquivos do
// app ficam guardados neste aparelho; sem rede, abrem daqui. Com rede, sempre a versão nova primeiro (rede, depois
// cópia). A API nunca é guardada. Trocou um arquivo do app, suba VERSAO.
const VERSAO = 'camzro-v1'
const APP = ['/', '/app/app.css', '/app/app.js', '/app/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSAO)
      .then((c) => c.addAll(APP))
      .catch(() => {}),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return
  const guardar = u.pathname === '/' || u.pathname.startsWith('/app/') || u.pathname.startsWith('/fontes/')
  if (!guardar) return
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        // só guarda o app de verdade (a página neutra também responde 200: não pode tomar o lugar do app)
        if (r.ok && !(u.pathname === '/' && r.headers.get('x-camzro') !== 'app')) {
          const copia = r.clone()
          caches.open(VERSAO).then((c) => c.put(e.request, copia))
        }
        return r
      })
      .catch(() => caches.match(e.request).then((r) => r || Response.error())),
  )
})
