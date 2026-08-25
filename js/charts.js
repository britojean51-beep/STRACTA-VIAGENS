// ============================================================================
// charts.js — Gráficos SVG próprios (sem dependências externas / offline)
// Barras horizontais, colunas e linha. Herdam cores do tema via currentColor
// e variáveis CSS.
// ============================================================================
import { esc } from './ui.js';

const PALETA = ['#2563eb', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0d9488', '#db2777'];

// Gráfico de barras horizontais. dados: [{ label, valor }]
export function barras(dados, { unidade = '', formato = (v) => v } = {}) {
  if (!dados.length) return '<div class="grafico-vazio">Sem dados</div>';
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return `<div class="g-barras">${dados.map((d, i) => {
    const pct = Math.max((d.valor / max) * 100, d.valor > 0 ? 4 : 0);
    return `
      <div class="g-barras__linha">
        <span class="g-barras__label" title="${esc(d.label)}">${esc(d.label)}</span>
        <span class="g-barras__track"><span class="g-barras__fill" style="width:${pct}%;background:${PALETA[i % PALETA.length]}"></span></span>
        <span class="g-barras__valor">${formato(d.valor)}${unidade ? ' ' + unidade : ''}</span>
      </div>`;
  }).join('')}</div>`;
}

// Gráfico de colunas (SVG). dados: [{ label, valor }]
export function colunas(dados, { formato = (v) => v, altura = 200 } = {}) {
  if (!dados.length) return '<div class="grafico-vazio">Sem dados</div>';
  const W = Math.max(dados.length * 56, 280), H = altura, pad = 28, base = H - 24;
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const bw = (W - pad * 2) / dados.length * 0.6;
  const step = (W - pad * 2) / dados.length;
  const barras = dados.map((d, i) => {
    const h = (d.valor / max) * (base - 16);
    const x = pad + step * i + (step - bw) / 2;
    const y = base - h;
    return `
      <rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${PALETA[i % PALETA.length]}"></rect>
      <text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" class="g-svg__val">${formato(d.valor)}</text>
      <text x="${x + bw / 2}" y="${base + 15}" text-anchor="middle" class="g-svg__lbl">${esc(String(d.label).slice(0, 8))}</text>`;
  }).join('');
  return `<div class="g-svg-wrap"><svg viewBox="0 0 ${W} ${H}" class="g-svg" preserveAspectRatio="xMidYMid meet">
    <line x1="${pad}" y1="${base}" x2="${W - pad}" y2="${base}" class="g-svg__axis"></line>${barras}
  </svg></div>`;
}

// Gráfico de linha (evolução). series: [{ nome, cor, pontos: [{x label, y valor}] }]
export function linha(labels, series, { formato = (v) => v, altura = 220 } = {}) {
  if (!labels.length) return '<div class="grafico-vazio">Sem dados</div>';
  const W = Math.max(labels.length * 60, 320), H = altura, padL = 40, padR = 16, padT = 16, base = H - 28;
  const todosY = series.flatMap((s) => s.pontos.map((p) => p.y));
  const max = Math.max(...todosY, 1);
  const stepX = (W - padL - padR) / Math.max(labels.length - 1, 1);
  const px = (i) => padL + stepX * i;
  const py = (v) => base - (v / max) * (base - padT);

  const linhas = series.map((s, si) => {
    const cor = s.cor || PALETA[si % PALETA.length];
    const d = s.pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i)} ${py(p.y)}`).join(' ');
    const pts = s.pontos.map((p, i) => `<circle cx="${px(i)}" cy="${py(p.y)}" r="3" fill="${cor}"></circle>`).join('');
    return `<path d="${d}" fill="none" stroke="${cor}" stroke-width="2.5"></path>${pts}`;
  }).join('');

  const eixoX = labels.map((l, i) =>
    `<text x="${px(i)}" y="${base + 16}" text-anchor="middle" class="g-svg__lbl">${esc(String(l).slice(0, 6))}</text>`).join('');

  const grid = [0, 0.5, 1].map((f) =>
    `<line x1="${padL}" y1="${py(max * f)}" x2="${W - padR}" y2="${py(max * f)}" class="g-svg__grid"></line>
     <text x="4" y="${py(max * f) + 4}" class="g-svg__lbl">${formato(Math.round(max * f))}</text>`).join('');

  const legenda = series.length > 1
    ? `<div class="g-legenda">${series.map((s, si) =>
        `<span><i style="background:${s.cor || PALETA[si % PALETA.length]}"></i>${esc(s.nome)}</span>`).join('')}</div>`
    : '';

  return `<div class="g-svg-wrap"><svg viewBox="0 0 ${W} ${H}" class="g-svg" preserveAspectRatio="xMidYMid meet">
    ${grid}${linhas}${eixoX}
  </svg></div>${legenda}`;
}

export { PALETA };
