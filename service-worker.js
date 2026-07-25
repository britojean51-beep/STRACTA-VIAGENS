/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — service-worker.js
   Cacheia o "app shell" para funcionamento 100% offline.
   Estratégia: cache-first para os arquivos do app, com
   atualização em segundo plano quando há conexão.
   ══════════════════════════════════════════════════════════ */

const CACHE_VERSION = 'stracta-viagens-v30-home-menu';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/utils.js',
  './js/db.js',
  './js/config-padrao.js',
  './js/version.js',
  './js/firebase-sync.js',
  './js/sync.js',
  './js/geo.js',
  './js/log.js',
  './js/auth.js',
  './js/permissoes.js',
  './js/equipamentos.js',
  './js/motorista.js',
  './js/operacao.js',
  './js/checklist.js',
  './js/viagens.js',
  './js/abastecimento.js',
  './js/lubrificacao.js',
  './js/dashboard.js',
  './js/pdf-lite.js',
  './js/relatorio.js',
  './js/relatorio-excel.js',
  './js/diagnostico.js',
  './js/rastreamento.js',
  './js/mapa.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== CACHE_VERSION).map((c) => caches.delete(c)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nunca intercepta chamadas de sincronização (Google Sheets/API externa) —
  // essas devem ir direto para a rede, e falhar normalmente se offline.
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const redeFetch = fetch(req).then((resp) => {
        if (resp && resp.ok && req.url.startsWith(self.location.origin)) {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return resp;
      }).catch(() => cached);

      // cache-first: responde rápido do cache, mas atualiza em segundo plano
      return cached || redeFetch;
    })
  );
});
