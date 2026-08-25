// ============================================================================
// Operadores — lista, cadastro/edição e perfil individual
// ============================================================================
import {
  getAll, get, put, del, uid, audit,
  lancamentosDoOperador, agregar,
  STATUS_OPERADOR,
} from '../store.js';
import { usuarioAtual, podeFazer } from '../auth.js';
import { secao, tabela, esc, modal, lerForm, options, toast, confirmar, kpi } from '../ui.js';
import { fmt, dataBR, classeStatus } from '../format.js';
import { irPara } from '../router.js';

// ---------- LISTA -----------------------------------------------------------
export async function renderLista() {
  const u = usuarioAtual();
  const operadores = (await getAll('operadores')).sort((a, b) => a.nome.localeCompare(b.nome));
  const cols = [
    { h: 'Nome', get: (o) => `<a href="#/operador/${o.id}" class="link-forte">${esc(o.nome)}</a>` },
    { h: 'Função', get: (o) => esc(o.funcao || '—') },
    { h: 'Matrícula', get: (o) => esc(o.matricula || '—') },
    { h: 'Status', get: (o) => `<span class="${classeStatus(o.status)}">${esc(o.status)}</span>` },
    { h: '', cls: 'acoes-col', get: (o) => `
        <button class="btn-icon" data-edit="${o.id}" title="Editar">✏️</button>
        ${podeFazer(u, 'excluir') ? `<button class="btn-icon" data-del="${o.id}" title="Excluir">🗑️</button>` : ''}` },
  ];
  const html = `
    <div class="page-head">
      <div><h1>Operadores</h1><p class="sub">${operadores.length} operador(es) cadastrado(s)</p></div>
      ${podeFazer(u, 'cadastrar') ? '<button class="btn btn--primary" id="btn-novo-op">+ Novo operador</button>' : ''}
    </div>
    ${secao('Operadores', tabela(cols, operadores, { vazio: 'Nenhum operador cadastrado.' }))}
  `;
  return { html, montar: (root) => {
    const b = root.querySelector('#btn-novo-op');
    if (b) b.onclick = () => abrirForm();
    root.querySelectorAll('[data-edit]').forEach((x) => x.onclick = () => abrirForm(x.dataset.edit));
    root.querySelectorAll('[data-del]').forEach((x) => x.onclick = () => excluir(x.dataset.del));
  }};
}

async function abrirForm(id) {
  const u = usuarioAtual();
  if (!podeFazer(u, id ? 'editar' : 'cadastrar')) return toast('Sem permissão.', 'erro');
  const o = id ? await get('operadores', id) : {};
  const ok = await modal({
    titulo: id ? `Editar ${o.nome}` : 'Novo operador',
    corpoHTML: `
      <form class="form-grid">
        <label class="col-full">Nome *<input name="nome" required value="${esc(o.nome || '')}"></label>
        <label>Função<input name="funcao" value="${esc(o.funcao || '')}" placeholder="Operador"></label>
        <label>Matrícula<input name="matricula" value="${esc(o.matricula || '')}"></label>
        <label>Status *<select name="status" required>${options(STATUS_OPERADOR.map((s) => ({ id: s, nome: s })), o.status || 'Ativo')}</select></label>
        <label class="col-full">Observações<textarea name="observacoes" rows="2">${esc(o.observacoes || '')}</textarea></label>
      </form>`,
    onMount: (ov) => setTimeout(() => ov.querySelector('[name=nome]')?.focus(), 50),
  });
  if (!ok) return;
  const d = lerForm(document.querySelector('.modal form'));
  const obj = {
    id: o.id || uid(), nome: d.nome.trim(), funcao: d.funcao.trim(),
    matricula: d.matricula.trim(), status: d.status, observacoes: d.observacoes || '',
    created_at: o.created_at || new Date().toISOString(),
  };
  await put('operadores', obj);
  await audit(id ? 'editar' : 'criar', 'operadores', obj.nome, u?.nome);
  toast('Operador salvo.', 'ok');
  irPara('#/operadores');
  location.reload();
}

async function excluir(id) {
  const o = await get('operadores', id);
  if (!(await confirmar('Excluir operador', `Confirma excluir ${o.nome}? O histórico de lançamentos não é apagado.`, 'Excluir'))) return;
  await del('operadores', id);
  await audit('excluir', 'operadores', o.nome, usuarioAtual()?.nome);
  toast('Operador excluído.', 'ok');
  location.reload();
}

// ---------- PERFIL DO OPERADOR ---------------------------------------------
export async function renderPerfil({ id }) {
  const o = await get('operadores', id);
  if (!o) return '<div class="erro-box">Operador não encontrado.</div>';

  const lancs = await lancamentosDoOperador(id);
  const equipamentos = await getAll('equipamentos');
  const mapaEq = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
  const tot = agregar(lancs);
  const dias = new Set(lancs.map((l) => l.data)).size;

  // Equipamentos utilizados + período.
  const usoPorEquip = {};
  for (const l of lancs) {
    const cod = mapaEq[l.equipamento_id]?.codigo || '—';
    usoPorEquip[cod] = usoPorEquip[cod] || { datas: [], horas: 0, ton: 0, litros: 0 };
    usoPorEquip[cod].datas.push(l.data);
    usoPorEquip[cod].horas += l.horas;
    usoPorEquip[cod].ton += l.toneladas;
    usoPorEquip[cod].litros += l.litros;
  }
  const equipUsados = Object.entries(usoPorEquip).map(([cod, v]) => {
    const ds = v.datas.sort();
    return { cod, de: ds[0], ate: ds[ds.length - 1], ...v };
  }).sort((a, b) => b.horas - a.horas);

  const cards = [
    kpi({ label: 'Dias trabalhados', valor: dias, icon: '📅' }),
    kpi({ label: 'Horas trabalhadas', valor: fmt.n1(tot.horas), icon: '⏱️' }),
    kpi({ label: 'Diesel consumido', valor: fmt.litros(tot.litros), icon: '⛽' }),
    kpi({ label: 'Produção', valor: fmt.ton(tot.toneladas), icon: '📦' }),
    kpi({ label: 'L/h médio', valor: fmt.n2(tot.lh), icon: '⚡' }),
    kpi({ label: 'L/Ton médio', valor: fmt.n3(tot.lton), icon: '⚡' }),
    kpi({ label: 'Equipamentos usados', valor: equipUsados.length, icon: '🚛' }),
  ].join('');

  const equipHTML = equipUsados.length ? `<div class="chips">${equipUsados.map((x) =>
    `<div class="chip-eq"><strong>${esc(x.cod)}</strong><span>${dataBR(x.de)} → ${dataBR(x.ate)}</span><span class="muted">${fmt.n1(x.horas)} h · ${fmt.n1(x.ton)} t</span></div>`
  ).join('')}</div>` : '<p class="muted">Nenhum equipamento operado ainda.</p>';

  const cols = [
    { h: 'Data', get: (l) => dataBR(l.data) },
    { h: 'Equipamento', get: (l) => `<a href="#/equipamento/${l.equipamento_id}" class="link-forte">${esc(mapaEq[l.equipamento_id]?.codigo || '—')}</a>` },
    { h: 'Horas', cls: 'num', get: (l) => fmt.n1(l.horas) },
    { h: 'Diesel', cls: 'num', get: (l) => fmt.int(l.litros) },
    { h: 'Toneladas', cls: 'num', get: (l) => fmt.n1(l.toneladas) },
    { h: 'L/h', cls: 'num', get: (l) => fmt.n2(l.lh) },
    { h: 'L/Ton', cls: 'num', get: (l) => fmt.n3(l.lton) },
  ];

  // Ranking do operador (produtividade + eficiência, não só consumo absoluto).
  const rank = `
    <div class="rank-cards">
      <div class="rank-card"><span>Produtividade (t/h)</span><strong>${tot.horas > 0 ? fmt.n2(tot.toneladas / tot.horas) : '—'}</strong></div>
      <div class="rank-card"><span>Eficiência (L/Ton)</span><strong>${fmt.n3(tot.lton)}</strong></div>
      <div class="rank-card"><span>Consumo horário (L/h)</span><strong>${fmt.n2(tot.lh)}</strong></div>
      <div class="rank-card"><span>Produção total</span><strong>${fmt.n1(tot.toneladas)} t</strong></div>
    </div>
    <p class="nota">A classificação considera produtividade e eficiência em conjunto — não apenas o menor consumo absoluto.</p>`;

  const html = `
    <div class="page-head">
      <div>
        <a href="#/operadores" class="voltar">← Operadores</a>
        <h1>${esc(o.nome)} <span class="${classeStatus(o.status)}">${esc(o.status)}</span></h1>
        <p class="sub">${esc(o.funcao || '—')} ${o.matricula ? '· Matrícula ' + esc(o.matricula) : ''}</p>
      </div>
    </div>
    <div class="kpi-grid">${cards}</div>
    ${secao('Desempenho', rank)}
    ${secao('Equipamentos utilizados', equipHTML)}
    ${secao('Histórico do operador', tabela(cols, lancs, { vazio: 'Sem lançamentos.' }))}
  `;
  return html;
}
