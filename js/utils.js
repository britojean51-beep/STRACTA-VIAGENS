/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — utils.js
   Funções utilitárias compartilhadas por todos os módulos.
   ══════════════════════════════════════════════════════════ */

function gerarId(prefixo = 'id') {
  return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function agoraISO() {
  return new Date().toISOString();
}

function todayKey(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function diaKeyParaISO(diaKey) {
  // 'dd-mm-yyyy' -> 'yyyy-mm-dd'
  const [dd, mm, yyyy] = (diaKey || '').split('-');
  return dd && mm && yyyy ? `${yyyy}-${mm}-${dd}` : '';
}

function fmtDataBR(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch (e) { return iso; }
}

function fmtHoraBR(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso; }
}

function fmtDataHoraBR(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch (e) { return iso; }
}

function fmtDuracao(ms) {
  if (ms == null || ms < 0) return '--:--';
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return h > 0
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function showToast(msg, cor = 'var(--green)', duracao = 2600) {
  let el = qs('#toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    document.body.appendChild(el);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.borderLeftColor = cor;
  t.textContent = msg;
  el.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, duracao);
}

function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function estaOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

window.gerarId = gerarId;
window.agoraISO = agoraISO;
window.todayKey = todayKey;
window.diaKeyParaISO = diaKeyParaISO;
window.fmtDataBR = fmtDataBR;
window.fmtHoraBR = fmtHoraBR;
window.fmtDataHoraBR = fmtDataHoraBR;
window.fmtDuracao = fmtDuracao;
window.qs = qs;
window.qsa = qsa;
window.showToast = showToast;
window.debounce = debounce;
window.estaOnline = estaOnline;
