/* Checklist · Service Worker
   "Rede primeiro": com internet sempre baixa a versão nova; sem sinal usa a
   última cópia. O escopo é só /checklist/ — o app de frota tem o dele. */
const CACHE = "ck-v47";
// envio em segundo plano: checklist feito sem sinal sai sozinho quando a internet volta
importScripts("./js/firebase-config.js", "./js/envio.js");
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/midia.js",
  "./js/dados.js",
  "./js/app.js",
  "./js/pdf.js",
  "./js/envio.js",
  "./js/vendor/jspdf-4.2.1.umd.min.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
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

/* Toque na notificação ("problema resolvido"): leva ao checklist. App aberto:
   foca e avisa a tela; fechado: abre já no checklist. */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const id = (e.notification.data || {}).abrir;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
    const c = lista.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ abrir: id }); return c.focus(); }
    return self.clients.openWindow("./" + (id ? "?abrir=" + encodeURIComponent(id) : ""));
  }));
});

/* A internet voltou (o Android avisa mesmo com o app fechado): envia o que ficou
   na saída do aparelho. Com o app aberto na tela, quem envia é o próprio app. */
async function enviarFila(forcar) {
  if (!forcar) {
    const abertos = await self.clients.matchAll({ type: "window" });
    if (abertos.some(c => c.visibilityState === "visible")) return;
  }
  const r = await enviarEmSegundoPlano();
  if (r.checklists.length && self.registration.showNotification && self.Notification && Notification.permission === "granted") {
    const nomes = r.checklists.map(x => (x.dados && x.dados.equipamento && x.dados.equipamento.prefixo) || "equipamento").join(", ");
    await self.registration.showNotification(r.checklists.length > 1 ? "Checklists enviados" : "Checklist enviado", {
      body: nomes + (r.fotos ? " · " + r.fotos + " foto(s)" : "") + " — a gestão já recebeu.",
      icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", tag: "ck-enviado"
    }).catch(() => {});
  }
  if (r.falhou) throw new Error("tentar de novo");   // o Android tenta outra vez mais tarde
}
self.addEventListener("sync", e => { if (e.tag === "ck-enviar") e.waitUntil(enviarFila(false)); });
self.addEventListener("message", e => {
  if (e.data && e.data.tipo === "ck-enviar") e.waitUntil(enviarFila(!!e.data.forcar).catch(() => {}));
});
