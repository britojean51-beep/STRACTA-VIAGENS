// ============================================================================
// Relatórios — exportação (CSV / Excel / PDF) e imagem para WhatsApp
// ============================================================================
import { getAll, calcularLancamento, agregar, lancamentosPorData, byIndex } from '../store.js';
import { secao, esc, toast } from '../ui.js';
import { fmt, hoje, dataBR, mesAno } from '../format.js';
import { usuarioAtual } from '../auth.js';

const EMPRESA = 'STRACTA VIAGENS';

export async function render() {
  const html = `
    <div class="page-head">
      <div><h1>Relatórios</h1><p class="sub">Exportação e compartilhamento</p></div>
    </div>
    ${secao('Período', `<div class="filtros">
      <label>De <input type="date" id="rel-de" value="${primeiroDiaMes()}"></label>
      <label>Até <input type="date" id="rel-ate" value="${hoje()}"></label>
      <label>Equipamento <select id="rel-equip"><option value="">Todos</option></select></label>
      <label>Operador <select id="rel-oper"><option value="">Todos</option></select></label>
    </div>`)}
    ${secao('Relatórios operacionais', `
      <div class="rel-grid">
        <button class="rel-btn" data-rel="operacional">📋 Lançamentos operacionais</button>
        <button class="rel-btn" data-rel="equipamento">🚛 Consolidado por equipamento</button>
        <button class="rel-btn" data-rel="operador">👷 Consolidado por operador</button>
        <button class="rel-btn" data-rel="manutencao">🔧 Manutenções</button>
      </div>
      <p class="nota">Escolha um relatório e depois exporte em CSV, Excel ou PDF.</p>
      <div class="rel-export" id="rel-export" hidden>
        <span id="rel-titulo"></span>
        <div class="rel-export__btns">
          <button class="btn btn--ghost" id="exp-csv">⬇️ CSV</button>
          <button class="btn btn--ghost" id="exp-xls">⬇️ Excel</button>
          <button class="btn btn--ghost" id="exp-pdf">🖨️ PDF</button>
        </div>
      </div>
      <div id="rel-preview" class="rel-preview"></div>
    `)}
    ${secao('Resumo diário para WhatsApp', `
      <div class="filtros">
        <label>Data do resumo <input type="date" id="wpp-data" value="${hoje()}"></label>
        <button class="btn btn--primary" id="btn-wpp">🖼️ Gerar imagem</button>
      </div>
      <p class="nota">Gera uma imagem vertical, pronta para enviar no WhatsApp, com o resumo operacional do dia.</p>
      <div id="wpp-saida" class="wpp-saida"></div>
    `)}
  `;

  return { html, montar };
}

function primeiroDiaMes() { return new Date().toISOString().slice(0, 7) + '-01'; }

async function montar(root) {
  const equipamentos = (await getAll('equipamentos')).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const operadores = (await getAll('operadores')).sort((a, b) => a.nome.localeCompare(b.nome));
  root.querySelector('#rel-equip').innerHTML = '<option value="">Todos</option>' +
    equipamentos.map((e) => `<option value="${e.id}">${esc(e.codigo)}</option>`).join('');
  root.querySelector('#rel-oper').innerHTML = '<option value="">Todos</option>' +
    operadores.map((o) => `<option value="${o.id}">${esc(o.nome)}</option>`).join('');

  const mapaE = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
  const mapaO = Object.fromEntries(operadores.map((o) => [o.id, o]));
  let atual = null; // { titulo, cols, rows }

  async function dadosFiltrados() {
    const de = root.querySelector('#rel-de').value;
    const ate = root.querySelector('#rel-ate').value;
    const eq = root.querySelector('#rel-equip').value;
    const op = root.querySelector('#rel-oper').value;
    let lancs = (await getAll('lancamentos')).map(calcularLancamento)
      .filter((l) => l.data >= de && l.data <= ate);
    if (eq) lancs = lancs.filter((l) => l.equipamento_id === eq);
    if (op) lancs = lancs.filter((l) => l.operador_id === op);
    return { lancs, de, ate, eq, op };
  }

  async function gerar(tipo) {
    const { lancs, de, ate } = await dadosFiltrados();
    const periodo = `${dataBR(de)} a ${dataBR(ate)}`;
    if (tipo === 'operacional') {
      atual = {
        titulo: `Lançamentos operacionais — ${periodo}`,
        cols: ['Data', 'Equipamento', 'Operador', 'H.Inicial', 'H.Final', 'Horas', 'Diesel', 'Toneladas', 'L/h', 'L/Ton'],
        rows: lancs.sort((a, b) => (a.data < b.data ? 1 : -1)).map((l) => [
          dataBR(l.data), mapaE[l.equipamento_id]?.codigo || '—', mapaO[l.operador_id]?.nome || '—',
          l.horimetro_inicial, l.horimetro_final, l.horas, l.litros, l.toneladas, l.lh, l.lton,
        ]),
      };
    } else if (tipo === 'equipamento') {
      const por = agrupar(lancs, (l) => mapaE[l.equipamento_id]?.codigo || '—');
      atual = {
        titulo: `Consolidado por equipamento — ${periodo}`,
        cols: ['Equipamento', 'Horas', 'Diesel', 'Toneladas', 'L/h', 'L/Ton'],
        rows: por.map((r) => [r.chave, r.horas, r.litros, r.toneladas, r.lh, r.lton]),
      };
    } else if (tipo === 'operador') {
      const por = agrupar(lancs, (l) => mapaO[l.operador_id]?.nome || '—');
      atual = {
        titulo: `Consolidado por operador — ${periodo}`,
        cols: ['Operador', 'Horas', 'Diesel', 'Toneladas', 'L/h', 'L/Ton'],
        rows: por.map((r) => [r.chave, r.horas, r.litros, r.toneladas, r.lh, r.lton]),
      };
    } else if (tipo === 'manutencao') {
      const eq = root.querySelector('#rel-equip').value;
      let manuts = (await getAll('manutencoes')).filter((m) => m.data >= de && m.data <= ate);
      if (eq) manuts = manuts.filter((m) => m.equipamento_id === eq);
      atual = {
        titulo: `Manutenções — ${periodo}`,
        cols: ['Data', 'Equipamento', 'Tipo', 'Serviço', 'Horímetro', 'KM', 'Responsável'],
        rows: manuts.sort((a, b) => (a.data < b.data ? 1 : -1)).map((m) => [
          dataBR(m.data), mapaE[m.equipamento_id]?.codigo || '—', m.tipo, m.servico, m.horimetro, m.km, m.responsavel || '—',
        ]),
      };
    }
    renderPreview();
  }

  function renderPreview() {
    root.querySelector('#rel-export').hidden = false;
    root.querySelector('#rel-titulo').textContent = atual.titulo;
    const thead = atual.cols.map((c) => `<th>${esc(c)}</th>`).join('');
    const tbody = atual.rows.length
      ? atual.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(formatCelula(c))}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${atual.cols.length}" class="muted" style="text-align:center">Sem dados no período.</td></tr>`;
    root.querySelector('#rel-preview').innerHTML =
      `<div class="tabela-wrap"><table class="tabela tabela--compacta"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
  }

  root.querySelectorAll('[data-rel]').forEach((b) => b.onclick = () => {
    root.querySelectorAll('[data-rel]').forEach((x) => x.classList.remove('rel-btn--ativo'));
    b.classList.add('rel-btn--ativo');
    gerar(b.dataset.rel);
  });

  root.querySelector('#exp-csv').onclick = () => { if (atual) exportarCSV(atual); };
  root.querySelector('#exp-xls').onclick = () => { if (atual) exportarExcel(atual); };
  root.querySelector('#exp-pdf').onclick = () => { if (atual) exportarPDF(atual); };

  root.querySelector('#btn-wpp').onclick = async () => {
    const data = root.querySelector('#wpp-data').value;
    await gerarImagemWhatsapp(data, root.querySelector('#wpp-saida'), mapaE, mapaO);
  };
}

function agrupar(lancs, chaveFn) {
  const map = {};
  for (const l of lancs) {
    const k = chaveFn(l);
    map[k] = map[k] || [];
    map[k].push(l);
  }
  return Object.entries(map).map(([chave, arr]) => {
    const t = agregar(arr);
    return { chave, horas: t.horas, litros: t.litros, toneladas: t.toneladas, lh: t.lh, lton: t.lton };
  }).sort((a, b) => b.horas - a.horas);
}

function formatCelula(v) {
  if (typeof v === 'number') return fmt.n2(v).replace(/,00$/, '');
  return v;
}

// ---------- Exportações -----------------------------------------------------
function baixar(nome, conteudo, tipoMime) {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Arquivo gerado.', 'ok');
}

function exportarCSV({ titulo, cols, rows }) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [cols.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))];
  baixar(nomeArquivo(titulo, 'csv'), '﻿' + linhas.join('\r\n'), 'text/csv;charset=utf-8');
}

function exportarExcel({ titulo, cols, rows }) {
  // Excel abre HTML com extensão .xls preservando a tabela.
  const th = cols.map((c) => `<th style="background:#1f2a44;color:#fff;padding:6px">${escHtml(c)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #ccc;padding:4px">${escHtml(formatCelula(c))}</td>`).join('')}</tr>`).join('');
  const html = `<html><head><meta charset="utf-8"></head><body>
    <h3>${escHtml(titulo)}</h3><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></body></html>`;
  baixar(nomeArquivo(titulo, 'xls'), html, 'application/vnd.ms-excel');
}

function exportarPDF({ titulo, cols, rows }) {
  // Abre janela de impressão -> "Salvar como PDF".
  const th = cols.map((c) => `<th>${escHtml(c)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${escHtml(formatCelula(c))}</td>`).join('')}</tr>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><meta charset="utf-8"><title>${escHtml(titulo)}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#1f2937}
      h1{font-size:18px;color:#1f2a44;margin:0 0 4px} .sub{color:#6b7280;font-size:12px;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;font-size:12px} th{background:#1f2a44;color:#fff;padding:6px;text-align:left}
      td{border:1px solid #d1d5db;padding:5px} tr:nth-child(even) td{background:#f3f4f6}
      .rodape{margin-top:16px;color:#9ca3af;font-size:11px}
    </style></head><body>
    <h1>${EMPRESA} — Gestão de Frota</h1><p class="sub">${escHtml(titulo)}</p>
    <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
    <p class="rodape">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
    <script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}

function escHtml(s) { return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function nomeArquivo(titulo, ext) {
  return titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.' + ext;
}

// ---------- Imagem para WhatsApp (Canvas) -----------------------------------
async function gerarImagemWhatsapp(data, saidaEl, mapaE, mapaO) {
  const lancs = await lancamentosPorData(data);
  const manut = await byIndex('manutencoes', 'data', data);
  const tot = agregar(lancs);
  const equipsTrab = new Set(lancs.map((l) => l.equipamento_id)).size;
  const opsTrab = new Set(lancs.map((l) => l.operador_id)).size;

  const W = 720;
  const linhas = lancs.map((l) => ({
    cod: mapaE[l.equipamento_id]?.codigo || '—',
    op: (mapaO[l.operador_id]?.nome || '—').split(' ')[0],
    horas: l.horas, litros: l.litros, ton: l.toneladas, lh: l.lh, lton: l.lton,
  }));
  const H = 520 + Math.max(linhas.length, 1) * 40 + 70;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // Fundo
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#12203c'); grad.addColorStop(1, '#1f2a44');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  // Cabeçalho
  ctx.fillStyle = '#22d3ee';
  ctx.font = 'bold 34px Arial'; ctx.fillText(EMPRESA, 40, 62);
  ctx.fillStyle = '#cbd5e1'; ctx.font = '20px Arial';
  ctx.fillText('Resumo Operacional de Frota', 40, 92);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 24px Arial';
  ctx.fillText('📅 ' + dataBR(data), 40, 132);
  ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.moveTo(40, 152); ctx.lineTo(W - 40, 152); ctx.stroke();

  // KPIs em grade 2 colunas
  const kpis = [
    ['Equipamentos', equipsTrab], ['Operadores', opsTrab],
    ['Horas', fmt.n1(tot.horas) + ' h'], ['Diesel', fmt.int(tot.litros) + ' L'],
    ['Produção', fmt.n1(tot.toneladas) + ' t'], ['L/h médio', fmt.n2(tot.lh)],
    ['L/Ton médio', fmt.n3(tot.lton)], ['Manutenções', manut.length],
  ];
  let ky = 180;
  for (let i = 0; i < kpis.length; i += 2) {
    for (let j = 0; j < 2; j++) {
      const k = kpis[i + j]; if (!k) continue;
      const x = 40 + j * 330;
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      roundRect(ctx, x, ky, 310, 54, 10); ctx.fill();
      ctx.fillStyle = '#93c5fd'; ctx.font = '15px Arial'; ctx.fillText(k[0], x + 16, ky + 22);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial'; ctx.fillText(String(k[1]), x + 16, ky + 46);
    }
    ky += 66;
  }

  // Tabela por equipamento
  ky += 22;
  ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 18px Arial';
  ctx.fillText('Detalhamento por equipamento', 40, ky); ky += 24;
  ctx.font = 'bold 14px Arial'; ctx.fillStyle = '#94a3b8';
  const colsX = [40, 150, 250, 350, 460, 560];
  ['Equip.', 'Operador', 'Horas', 'Diesel', 'Ton', 'L/Ton'].forEach((h, i) => ctx.fillText(h, colsX[i], ky));
  ky += 8;
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.moveTo(40, ky); ctx.lineTo(W - 40, ky); ctx.stroke();
  ky += 24;
  ctx.font = '15px Arial';
  if (!linhas.length) {
    ctx.fillStyle = '#94a3b8'; ctx.fillText('Nenhum lançamento nesta data.', 40, ky); ky += 30;
  }
  for (const r of linhas) {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(r.cod, colsX[0], ky);
    ctx.fillText(r.op, colsX[1], ky);
    ctx.fillText(fmt.n1(r.horas), colsX[2], ky);
    ctx.fillText(fmt.int(r.litros), colsX[3], ky);
    ctx.fillText(fmt.n1(r.ton), colsX[4], ky);
    ctx.fillText(fmt.n3(r.lton), colsX[5], ky);
    ky += 40;
  }

  // Rodapé
  ctx.fillStyle = '#64748b'; ctx.font = '13px Arial';
  ctx.fillText('Gerado por Sistema de Gestão de Frota · ' + new Date().toLocaleString('pt-BR'), 40, H - 24);

  const url = cv.toDataURL('image/png');
  saidaEl.innerHTML = `
    <img src="${url}" alt="Resumo do dia" class="wpp-img">
    <div class="rel-export__btns">
      <a class="btn btn--primary" href="${url}" download="resumo-frota-${data}.png">⬇️ Baixar imagem</a>
    </div>
    <p class="nota">Toque e segure a imagem (celular) para compartilhar direto no WhatsApp, ou use "Baixar".</p>`;
  toast('Imagem gerada.', 'ok');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
