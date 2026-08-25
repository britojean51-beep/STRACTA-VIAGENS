// ============================================================================
// sw.js — Service Worker (PWA offline-first)
// Estratégia: cache-first para os arquivos do app; dados ficam no IndexedDB.
// ============================================================================
const CACHE = 'stracta-frota-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './assets/icon.svg',
  './js/main.js',
  './js/store.js',
  './js/auth.js',
  './js/router.js',
  './js/ui.js',
  './js/format.js',
  './js/charts.js',
  './js/views/dashboard.js',
  './js/views/equipamentos.js',
  './js/views/operadores.js',
  './js/views/lancamento.js',
  './js/views/resumo-diario.js',
  './js/views/resumo-mensal.js',
  './js/views/manutencoes.js',
  './js/views/relatorios.js',
  './js/views/busca.js',
  './js/views/usuarios.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Cacheia respostas do próprio app dinamicamente.
        if (res.ok && new URL(req.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
