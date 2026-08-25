// ============================================================================
// ui.js — Helpers de DOM e componentes reutilizáveis (card, tabela, modal,
//         toast, badge, empty state)
// ============================================================================

// Cria elemento a partir de HTML string.
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Escapa texto para inserção segura em HTML.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Card de KPI para dashboards e resumos.
export function kpi({ label, valor, sub, icon, tom }) {
  return `
    <div class="kpi ${tom ? 'kpi--' + tom : ''}">
      <div class="kpi__icon">${icon || ''}</div>
      <div class="kpi__body">
        <div class="kpi__valor">${valor}</div>
        <div class="kpi__label">${esc(label)}</div>
        ${sub ? `<div class="kpi__sub">${sub}</div>` : ''}
      </div>
    </div>`;
}

// Bloco de seção com título.
export function secao(titulo, conteudoHTML, acoesHTML = '') {
  return `
    <section class="card">
      <div class="card__head">
        <h2>${esc(titulo)}</h2>
        <div class="card__acoes">${acoesHTML}</div>
      </div>
      <div class="card__body">${conteudoHTML}</div>
    </section>`;
}

// Tabela responsiva. cols: [{h, get, cls}], rows: array de objetos.
export function tabela(cols, rows, opts = {}) {
  if (!rows.length) return vazio(opts.vazio || 'Nenhum registro encontrado.');
  const thead = cols.map((c) => `<th class="${c.cls || ''}">${esc(c.h)}</th>`).join('');
  const tbody = rows.map((r) => {
    const tds = cols.map((c) => `<td class="${c.cls || ''}" data-label="${esc(c.h)}">${c.get(r)}</td>`).join('');
    return `<tr ${opts.rowAttr ? opts.rowAttr(r) : ''}>${tds}</tr>`;
  }).join('');
  return `<div class="tabela-wrap"><table class="tabela"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

// Estado vazio.
export function vazio(msg) {
  return `<div class="vazio">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 17v-6M15 17v-4M3 3h18v18H3z"/></svg>
    <p>${esc(msg)}</p>
  </div>`;
}

// Toast de notificação.
let toastTimer;
export function toast(msg, tipo = 'ok') {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('<div id="toast" class="toast"></div>');
    document.body.appendChild(box);
  }
  box.className = `toast toast--${tipo} toast--show`;
  box.innerHTML = esc(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('toast--show'), 3800);
}

// Modal genérico. Retorna promise resolvida com true (confirmar) / false.
export function modal({ titulo, corpoHTML, okLabel = 'Salvar', cancelLabel = 'Cancelar', largo = false, onMount, semOk = false }) {
  return new Promise((resolve) => {
    const overlay = el(`
      <div class="modal-overlay">
        <div class="modal ${largo ? 'modal--largo' : ''}" role="dialog" aria-modal="true">
          <div class="modal__head"><h3>${esc(titulo)}</h3><button class="modal__x" aria-label="Fechar">✕</button></div>
          <div class="modal__body">${corpoHTML}</div>
          <div class="modal__foot">
            <button class="btn btn--ghost" data-act="cancel">${esc(cancelLabel)}</button>
            ${semOk ? '' : `<button class="btn btn--primary" data-act="ok">${esc(okLabel)}</button>`}
          </div>
        </div>
      </div>`);
    document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');
    const fechar = (val) => { overlay.remove(); document.body.classList.remove('no-scroll'); resolve(val); };
    overlay.querySelector('.modal__x').onclick = () => fechar(false);
    overlay.querySelector('[data-act="cancel"]').onclick = () => fechar(false);
    const okBtn = overlay.querySelector('[data-act="ok"]');
    if (okBtn) okBtn.onclick = () => {
      const form = overlay.querySelector('form');
      if (form && !form.reportValidity()) return;
      fechar(true);
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(false); });
    if (onMount) onMount(overlay, fechar);
  });
}

// Confirmação de exclusão (regra: sempre confirmar antes de excluir).
export async function confirmar(titulo, mensagem, okLabel = 'Confirmar') {
  return modal({
    titulo,
    corpoHTML: `<p class="confirm-msg">${esc(mensagem)}</p>`,
    okLabel, cancelLabel: 'Cancelar',
  });
}

// Monta <option>s.
export function options(itens, valorAtual, mapa = (i) => ({ v: i.id, t: i.nome || i.codigo })) {
  return itens.map((i) => {
    const { v, t } = mapa(i);
    return `<option value="${esc(v)}" ${String(v) === String(valorAtual) ? 'selected' : ''}>${esc(t)}</option>`;
  }).join('');
}

// Lê valores de um form em objeto.
export function lerForm(form) {
  const dados = {};
  new FormData(form).forEach((v, k) => { dados[k] = v; });
  return dados;
}
