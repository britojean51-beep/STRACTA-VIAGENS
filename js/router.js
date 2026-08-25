// ============================================================================
// router.js — Roteador por hash (#/rota/param). Sem dependências.
// ============================================================================
const rotas = [];
let notFound = () => '<p>Página não encontrada.</p>';

// Registra rota. padrao ex.: '/equipamento/:id'
export function rota(padrao, handler) {
  const partes = padrao.split('/').filter(Boolean);
  rotas.push({ partes, handler });
}

export function setNotFound(fn) { notFound = fn; }

function casar(pathPartes) {
  for (const r of rotas) {
    if (r.partes.length !== pathPartes.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.partes.length; i++) {
      const p = r.partes[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(pathPartes[i]);
      else if (p !== pathPartes[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

export function irPara(hash) {
  if (location.hash === hash) resolver();
  else location.hash = hash;
}

let _outlet = null;
let _onResolve = null;

export function iniciarRouter(outletEl, onResolve) {
  _outlet = outletEl;
  _onResolve = onResolve;
  window.addEventListener('hashchange', resolver);
  resolver();
}

export async function resolver() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const path = hash.split('?')[0];
  const partes = path.split('/').filter(Boolean);
  const match = casar(partes);
  _outlet.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const saida = match ? await match.handler(match.params) : await notFound();
    // Handler pode retornar string OU { html, montar }.
    const html = typeof saida === 'string' ? saida : saida.html;
    _outlet.innerHTML = html;
    if (saida && typeof saida.montar === 'function') saida.montar(_outlet);
  } catch (e) {
    console.error(e);
    _outlet.innerHTML = `<div class="erro-box">Erro ao carregar a tela: ${e.message}</div>`;
  }
  if (_onResolve) _onResolve(path);
  _outlet.scrollTop = 0;
  window.scrollTo(0, 0);
}
