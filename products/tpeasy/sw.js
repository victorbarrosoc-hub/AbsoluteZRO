// TPeasy: funciona sem internet no set. Busca a versão nova quando há rede e cai na cópia guardada quando não há.
const CACHE = "tpeasy-v22";
const FILES = [
  "/",
  "/site.css",
  "/site.js",
  "/app/",
  "/app/app.css",
  "/app/manifest.webmanifest",
  "/app/js/main.js",
  "/app/js/util.js",
  "/app/js/data.js",
  "/app/js/ui.js",
  "/app/js/settings.js",
  "/app/js/prompter.js",
  "/app/js/voice.js",
  "/app/js/sync.js",
  "/app/js/config.js",
  "/app/js/views.js",
  "/app/js/link.js",
  "/app/js/zro.js",
  "/app/js/z.js",
  "/app/js/set.js",
  "/app/js/entrada.js",
  "/app/js/pendencias.js",
  "/app/js/maestro.js",
  "/app/js/entregas.js",
  "/app/js/remote.js",
  "/app/remote.html",
  "/icons/favicon.svg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/z/anel.webp",
  "/icons/z/estrela.webp",
  "/icons/familia/absolute-zro.webp",
  "/icons/familia/sobedesce.svg",
  "/icons/familia/synquei.svg",
  "/icons/familia/maestro.svg",
  "/icons/familia/relay.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
// Rede primeiro (para pegar versões novas na hora); sem sinal ou rede lenta, usa a cópia guardada.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // /api (conta e a Z, /api/zro/ia) nunca passa pelo cache: sempre direto na rede. O painel da Z vem de
  // absolutezro.com (outra origem) e também não passa por aqui.
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      });
      if (!hit) return net;
      const slow = new Promise((r) => setTimeout(() => r(hit), 2500));
      return Promise.race([net.catch(() => hit), slow]);
    }),
  );
});
