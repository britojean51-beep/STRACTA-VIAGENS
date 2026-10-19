/* Checklist · Service Worker
   "Rede primeiro": com internet sempre baixa a versão nova; sem sinal usa a
   última cópia. O escopo é só /checklist/ — o app de frota tem o dele. */
const CACHE = "ck-v20";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/midia.js",
  "./js/dados.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./img/caminhao.jpg",
  "./img/maquina.svg"
];

const SDK = ["app", "auth", "firestore", "storage"].map(n =>
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-" + n + "-compat.js");

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    c.addAll(ASSETS),
    // o SDK entra já na instalação: na segunda abertura o celular pode estar sem sinal
    ...SDK.map(u => fetch(u, { mode: "cors" }).then(r => r.ok && c.put(u, r)).catch(() => {}))
  ])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith("ck-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // O SDK do Firebase tem versão fixa no endereço (nunca muda): guarda e usa a
  // cópia. É o que deixa o app abrir e gravar no pátio sem sinal.
  if (url.host === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
      return res;
    })));
    return;
  }
  // Storage, login e o resto de fora passam direto
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-store" })
      .then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || caches.match("./index.html")))
  );
});
