/* Mede o contraste de todo texto visível contra o fundo real atrás dele.
   Devolve os textos abaixo do mínimo. Uso: await page.evaluate(CONTRASTE, 4.5) */
module.exports = `(minimo) => {
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const rgb = s => { const m = String(s).match(/(\\d+(?:\\.\\d+)?)/g); return m ? m.slice(0, 3).map(Number) : null; };
  const opaco = s => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return false;
    const p = m[1].split(','); return p.length < 4 || parseFloat(p[3]) > 0.55; };
  const fundoDe = el => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (opaco(cs.backgroundColor)) return rgb(cs.backgroundColor);
    }
    return rgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
  };
  const ruins = [];
  document.querySelectorAll('body *').forEach(el => {
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!txt || el.closest('.visor, .mini-midia')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    if (el.closest('.toast') && !el.closest('.toast.mostra')) return;
    const c = rgb(cs.color), f = fundoDe(el);
    if (!c || !f) return;
    let o = 1; for (let n = el; n && n !== document.body; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    const cor = c.map((v, i) => v * o + f[i] * (1 - o));   // texto apagado (opacity) conta como mais claro
    const l1 = lum(cor), l2 = lum(f);
    const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (razao < minimo) ruins.push(txt.slice(0, 30) + ' (' + razao.toFixed(2) + ':1)');
  });
  return ruins;
}`;
