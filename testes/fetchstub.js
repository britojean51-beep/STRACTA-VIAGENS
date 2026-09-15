/* Intercepta o envio para a planilha e guarda o que seria mandado,
   para o teste conferir o payload sem precisar do Google. */
window.__ENVIOS__ = [];
window.__TODOS__ = [];
(function () {
  const real = window.fetch;
  window.fetch = function (url, opts) {
    const u = String(url);
    if (u.includes("script.google.com")) {
      try { var b = JSON.parse(opts.body); window.__ENVIOS__.push(b); window.__TODOS__.push(b); }
      catch (e) { window.__ENVIOS__.push({ erro: String(e) }); }
      return Promise.resolve({ ok: true, status: 200, type: "opaque" });
    }
    return real.apply(this, arguments);
  };
})();
