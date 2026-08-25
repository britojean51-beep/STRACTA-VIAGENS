// ============================================================================
// Equipamentos — lista, cadastro/edição e perfil com histórico
// ============================================================================
import {
  getAll, get, put, del, uid, audit,
  lancamentosDoEquipamento, manutencoesDoEquipamento, agregar,
  byIndex, statusPreventiva,
  TIPOS_EQUIPAMENTO, STATUS_EQUIPAMENTO,
} from '../store.js';
import { usuarioAtual, podeFazer } from '../auth.js';
import { secao, tabela, esc, modal, lerForm, options, toast, confirmar, kpi } from '../ui.js';
import { fmt, dataBR, classeStatus } from '../format.js';
import { irPara } from '../router.js';

// ---------- LISTA -----------------------------------------------------------
export async function renderLista() {
  const u = usuarioAtual();
  const equipamentos = (await getAll('equipamentos')).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const podeCadastrar = podeFazer(u, 'cadastrar');

  const cols = [
    { h: 'Código', get: (e) => `<a href="#/equipamento/${e.id}" class="link-forte">${esc(e.codigo)}</a>` },
    { h: 'Tipo', get: (e) => esc(e.tipo) },
    { h: 'Modelo', get: (e) => esc(`${e.marca} ${e.modelo}`) },
    { h: 'Ano', get: (e) => esc(e.ano || '—') },
    { h: 'Horímetro', cls: 'num', get: (e) => fmt.n1(e.horimetro_atual) + ' h' },
    { h: 'KM', cls: 'num', get: (e) => (e.km_atual ? fmt.km(e.km_atual) : '—') },
    { h: 'Status', get: (e) => `<span class="${classeStatus(e.status)}">${esc(e.status)}</span>` },
    { h: '', cls: 'acoes-col', get: (e) => `
        <button class="btn-icon" data-edit="${e.id}" title="Editar">✏️</button>
        ${podeFazer(u, 'excluir') ? `<button class="btn-icon" data-del="${e.id}" title="Excluir">🗑️</button>` : ''}` },
  ];

  const html = `
    <div class="page-head">
      <div><h1>Frota — Equipamentos</h1><p class="sub">${equipamentos.length} equipamento(s) cadastrado(s)</p></div>
      ${podeCadastrar ? '<button class="btn btn--primary" id="btn-novo-equip">+ Novo equipamento</button>' : ''}
    </div>
    ${secao('Equipamentos', tabela(cols, equipamentos, { vazio: 'Nenhum equipamento cadastrado ainda.' }))}
  `;

  return { html, montar: (root) => {
    const btnNovo = root.querySelector('#btn-novo-equip');
    if (btnNovo) btnNovo.onclick = () => abrirForm();
    root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => abrirForm(b.dataset.edit));
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => excluir(b.dataset.del));
  }};
}

async function abrirForm(id) {
  const u = usuarioAtual();
  if (!podeFazer(u, id ? 'editar' : 'cadastrar')) return toast('Sem permissão para esta ação.', 'erro');
  const e = id ? await get('equipamentos', id) : {};
  const ok = await modal({
    titulo: id ? `Editar ${e.codigo}` : 'Novo equipamento',
    okLabel: 'Salvar',
    corpoHTML: `
      <form class="form-grid">
        <label>Código *<input name="codigo" required value="${esc(e.codigo || '')}" placeholder="CB-14"></label>
        <label>Tipo *<select name="tipo" required>${options(TIPOS_EQUIPAMENTO.map((t) => ({ id: t, nome: t })), e.tipo)}</select></label>
        <label>Marca<input name="marca" value="${esc(e.marca || '')}"></label>
        <label>Modelo<input name="modelo" value="${esc(e.modelo || '')}"></label>
        <label>Ano<input name="ano" type="number" min="1950" max="2100" value="${esc(e.ano || '')}"></label>
        <label>Status *<select name="status" required>${options(STATUS_EQUIPAMENTO.map((s) => ({ id: s, nome: s })), e.status || 'Operando')}</select></label>
        <label>Horímetro atual<input name="horimetro_atual" type="number" step="0.1" min="0" value="${esc(e.horimetro_atual || 0)}"></label>
        <label>KM atual<input name="km_atual" type="number" step="1" min="0" value="${esc(e.km_atual || 0)}"></label>
        <label>Data de entrada na frota<input name="data_entrada" type="date" value="${esc(e.data_entrada || '')}"></label>
        <label class="col-full">Observações<textarea name="observacoes" rows="2">${esc(e.observacoes || '')}</textarea></label>
      </form>`,
    onMount: (overlay) => { setTimeout(() => overlay.querySelector('[name=codigo]')?.focus(), 50); },
  });
  if (!ok) return;
  const form = document.querySelector('.modal form');
  const d = lerForm(form);
  const obj = {
    id: e.id || uid(),
    codigo: d.codigo.trim(),
    tipo: d.tipo, marca: d.marca.trim(), modelo: d.modelo.trim(),
    ano: d.ano ? Number(d.ano) : null, status: d.status,
    horimetro_atual: Number(d.horimetro_atual) || 0,
    km_atual: Number(d.km_atual) || 0,
    data_entrada: d.data_entrada || '', observacoes: d.observacoes || '',
    created_at: e.created_at || new Date().toISOString(),
  };
  // Código único.
  const existentes = await byIndex('equipamentos', 'codigo', obj.codigo);
  if (existentes.some((x) => x.id !== obj.id)) return toast('Já existe um equipamento com este código.', 'erro');
  await put('equipamentos', obj);
  await audit(id ? 'editar' : 'criar', 'equipamentos', obj.codigo, u?.nome);
  toast('Equipamento salvo.', 'ok');
  irPara('#/equipamentos');
  location.reload();
}

async function excluir(id) {
  const e = await get('equipamentos', id);
  const lancs = await lancamentosDoEquipamento(id);
  const msg = lancs.length
    ? `${e.codigo} possui ${lancs.length} lançamento(s) no histórico. Excluir o equipamento NÃO remove o histórico, mas ele ficará órfão. Deseja continuar?`
    : `Confirma excluir o equipamento ${e.codigo}?`;
  if (!(await confirmar('Excluir equipamento', msg, 'Excluir'))) return;
  await del('equipamentos', id);
  await audit('excluir', 'equipamentos', e.codigo, usuarioAtual()?.nome);
  toast('Equipamento excluído.', 'ok');
  location.reload();
}

// ---------- PERFIL DO EQUIPAMENTO ------------------------------------------
export async function renderPerfil({ id }) {
  const e = await get('equipamentos', id);
  if (!e) return '<div class="erro-box">Equipamento não encontrado.</div>';

  const lancs = await lancamentosDoEquipamento(id);
  const manuts = await manutencoesDoEquipamento(id);
  const operadores = await getAll('operadores');
  const mapaOp = Object.fromEntries(operadores.map((o) => [o.id, o]));
  const tot = agregar(lancs);
  const operadoresUsados = [...new Set(lancs.map((l) => l.operador_id))];

  // Planos de preventiva.
  const planos = await byIndex('planos', 'equipamento_id', id);

  const cards = [
    kpi({ label: 'Total de horas', valor: fmt.n1(tot.horas), icon: '⏱️' }),
    kpi({ label: 'Diesel consumido', valor: fmt.litros(tot.litros), icon: '⛽' }),
    kpi({ label: 'Produção total', valor: fmt.ton(tot.toneladas), icon: '📦' }),
    kpi({ label: 'L/h médio', valor: fmt.n2(tot.lh), icon: '⚡' }),
    kpi({ label: 'L/Ton médio', valor: fmt.n3(tot.lton), icon: '⚡' }),
    kpi({ label: 'Operadores', valor: operadoresUsados.length, icon: '👷' }),
    kpi({ label: 'Manutenções', valor: manuts.length, icon: '🔧' }),
  ].join('');

  const colsHist = [
    { h: 'Data', get: (l) => dataBR(l.data) },
    { h: 'Operador', get: (l) => esc(mapaOp[l.operador_id]?.nome || '—') },
    { h: 'Horím. Inicial', cls: 'num', get: (l) => fmt.n1(l.horimetro_inicial) },
    { h: 'Horím. Final', cls: 'num', get: (l) => fmt.n1(l.horimetro_final) },
    { h: 'Horas', cls: 'num', get: (l) => fmt.n1(l.horas) },
    { h: 'Diesel', cls: 'num', get: (l) => fmt.int(l.litros) },
    { h: 'Toneladas', cls: 'num', get: (l) => fmt.n1(l.toneladas) },
    { h: 'L/h', cls: 'num', get: (l) => fmt.n2(l.lh) },
    { h: 'L/Ton', cls: 'num', get: (l) => fmt.n3(l.lton) },
  ];

  const colsManut = [
    { h: 'Data', get: (m) => dataBR(m.data) },
    { h: 'Horímetro', cls: 'num', get: (m) => fmt.n1(m.horimetro) },
    { h: 'KM', cls: 'num', get: (m) => (m.km ? fmt.int(m.km) : '—') },
    { h: 'Tipo', get: (m) => `<span class="tag">${esc(m.tipo)}</span>` },
    { h: 'Serviço', get: (m) => esc(m.servico) },
    { h: 'Peças', get: (m) => esc(m.pecas || '—') },
    { h: 'Responsável', get: (m) => esc(m.responsavel || '—') },
  ];

  const preventivaHTML = planos.length ? planos.map((p) => {
    const st = statusPreventiva(p, e);
    const cor = st.estado === 'vencido' ? 'danger' : st.estado === 'proximo' ? 'warn' : 'ok';
    const emoji = st.estado === 'vencido' ? '🔴' : st.estado === 'proximo' ? '🟡' : '🟢';
    const det = st.detalhe.map((d) => `${d.unidade}: faltam ${fmt.n1(d.restante)} (próx. ${d.proximo})`).join(' · ');
    return `<div class="prev-item prev-item--${cor}"><span>${emoji} <strong>${esc(p.nome)}</strong></span><span class="muted">${esc(det)}</span></div>`;
  }).join('') : '<p class="muted">Nenhum plano de preventiva cadastrado.</p>';

  const html = `
    <div class="page-head">
      <div>
        <a href="#/equipamentos" class="voltar">← Frota</a>
        <h1>${esc(e.codigo)} <span class="${classeStatus(e.status)}">${esc(e.status)}</span></h1>
        <p class="sub">${esc(e.tipo)} · ${esc(e.marca)} ${esc(e.modelo)} ${e.ano ? '· ' + e.ano : ''}</p>
      </div>
      <div class="head-atual">
        <div><span class="muted">Horímetro atual</span><strong>${fmt.n1(e.horimetro_atual)} h</strong></div>
        <div><span class="muted">KM atual</span><strong>${e.km_atual ? fmt.int(e.km_atual) : '—'}</strong></div>
      </div>
    </div>

    <div class="kpi-grid">${cards}</div>

    ${secao('Manutenção preventiva', preventivaHTML)}
    ${secao('Histórico operacional', tabela(colsHist, lancs, { vazio: 'Sem lançamentos para este equipamento.' }))}
    ${secao('Histórico de manutenção', tabela(colsManut, manuts, { vazio: 'Sem manutenções registradas.' }))}
  `;
  return html;
}
