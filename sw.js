// SÍGUELO · Service Worker
// Estrategia:
//   - Apps Script (backend GAS): SIEMPRE red (nunca cachear datos).
//   - Documentos HTML y navegaciones: NETWORK-FIRST (así los cambios de front
//     se reflejan al recargar, sin Ctrl+Shift+R). Cae a caché solo sin conexión.
//   - Assets estáticos (íconos, manifest, css/js): cache-first (rápido).
// IMPORTANTE: subir CACHE_NAME (vN -> vN+1) en cada despliegue para forzar refresco.
const CACHE_NAME = 'siguelo-citas-v22';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // 1) Backend GAS: siempre red (nunca servir datos cacheados).
  if (url.indexOf('script.google.com') >= 0) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 2) Documentos HTML y navegaciones: NETWORK-FIRST.
  //    Detecta tanto navegación directa como cualquier .html.
  const esHTML = req.mode === 'navigate'
    || (req.destination === 'document')
    || url.endsWith('.html');
  if (esHTML) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          // Actualiza la copia en caché para uso offline.
          const copia = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copia)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // 3) Resto de assets estáticos: cache-first.
  event.respondWith(
    caches.match(req).then((resp) => resp || fetch(req))
  );
});
