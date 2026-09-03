/* STRACTA · Service Worker
   Estratégia "rede primeiro, sem cache HTTP": quando há internet, sempre
   baixa a versão mais nova do servidor; offline usa a última cópia salva. */
const CACHE = "gp2t-v39";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/auth.js",
  "./js/storage.js",
  "./js/cloud.js",
  "./js/sync.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon.svg"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // deixa passar o que é de fora (SDK do Firebase, planilha): não interceptamos
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    // busca sempre no servidor, ignorando o cache HTTP do navegador
    fetch(e.request, { cache: "no-store" })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
  );
});
