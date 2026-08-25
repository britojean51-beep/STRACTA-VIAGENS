// ============================================================================
// Manutenções — registro, histórico geral e planos de preventiva (semáforo)
// ============================================================================
import {
  getAll, get, put, del, uid, audit,
  salvarManutencao, statusPreventiva, byIndex,
  TIPOS_MANUTENCAO,
} from '../store.js';
import { usuarioAtual, podeFazer } from '../auth.js';
import { secao, tabela, esc, modal, lerForm, options, toast, confirmar, kpi } from '../ui.js';
import { fmt, hoje, dataBR } from '../format.js';

export async function render(params, aba) {
  const u = usuarioAtual();
  const equipamentos = (await getAll('equipamentos')).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const mapaE = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
  const manuts = (await getAll('manutencoes')).sort((a, b) => (a.data < b.data ? 1 : -1));
  const planos = await getAll('planos');

  // --- Painel de alertas de preventiva ---
  const alertas = [];
  for (const p of planos) {
    const e = mapaE[p.equipamento_id];
    if (!e) continue;
    const st = statusPreventiva(p, e);
    alertas.push({ plano: p, equip: e, st });
  }
  const vencidos = alertas.filter((a) => a.st.estado === 'vencido');
  const proximos = alertas.filter((a) => a.st.estado === 'proximo');

  const cards = [
    kpi({ label: 'Manutenções registradas', valor: manuts.length, icon: '🔧' }),
    kpi({ label: 'Preventivas vencidas', valor: vencidos.length, icon: '🔴', tom: vencidos.length ? 'danger' : '' }),
    kpi({ label: 'Próximas do limite', valor: proximos.length, icon: '🟡', tom: proximos.length ? 'warn' : '' }),
    kpi({ label: 'Planos ativos', valor: planos.length, icon: '📋' }),
  ].join('');

  const alertaHTML = alertas.length ? alertas
    .sort((a, b) => ({ vencido: 0, proximo: 1, ok: 2 }[a.st.estado] - { vencido: 0, proximo: 1, ok: 2 }[b.st.estado]))
    .map((a) => {
      const emoji = a.st.estado === 'vencido' ? '🔴' : a.st.estado === 'proximo' ? '🟡' : '🟢';
      const cor = a.st.estado === 'vencido' ? 'danger' : a.st.estado === 'proximo' ? 'warn' : 'ok';
      const det = a.st.detalhe.map((d) => `${d.unidade}: faltam ${fmt.n1(d.restante)}`).join(' · ');
      return `<div class="prev-item prev-item--${cor}">
        <span>${emoji} <a href="#/equipamento/${a.equip.id}" class="link-forte">${esc(a.equip.codigo)}</a> — ${esc(a.plano.nome)}</span>
        <span class="prev-det">${esc(det)}${podeFazer(u, 'manutencao') ? ` <button class="btn-icon" data-del-plano="${a.plano.id}" title="Excluir plano">🗑️</button>` : ''}</span>
      </div>`;
    }).join('') : '<p class="muted">Nenhum plano de preventiva cadastrado.</p>';

  const cols = [
    { h: 'Data', get: (m) => dataBR(m.data) },
    { h: 'Equipamento', get: (m) => `<a href="#/equipamento/${m.equipamento_id}" class="link-forte">${esc(mapaE[m.equipamento_id]?.codigo || '—')}</a>` },
    { h: 'Tipo', get: (m) => `<span class="tag">${esc(m.tipo)}</span>` },
    { h: 'Serviço', get: (m) => esc(m.servico) },
    { h: 'Horímetro', cls: 'num', get: (m) => fmt.n1(m.horimetro) },
    { h: 'KM', cls: 'num', get: (m) => (m.km ? fmt.int(m.km) : '—') },
    { h: 'Responsável', get: (m) => esc(m.responsavel || '—') },
    { h: '', cls: 'acoes-col', get: (m) => `
        ${podeFazer(u, 'manutencao') ? `<button class="btn-icon" data-edit-m="${m.id}" title="Editar">✏️</button>` : ''}
        ${podeFazer(u, 'excluir') ? `<button class="btn-icon" data-del-m="${m.id}" title="Excluir">🗑️</button>` : ''}` },
  ];

  const html = `
    <div class="page-head">
      <div><h1>Manutenção</h1><p class="sub">Registro, histórico e preventiva</p></div>
      <div class="head-btns">
        ${podeFazer(u, 'manutencao') ? '<button class="btn btn--ghost" id="btn-plano">+ Plano preventivo</button>' : ''}
        ${podeFazer(u, 'manutencao') ? '<button class="btn btn--primary" id="btn-nova-m">+ Nova manutenção</button>' : ''}
      </div>
    </div>
    <div class="kpi-grid">${cards}</div>
    ${secao('Controle de manutenção preventiva', alertaHTML)}
    ${secao('Histórico de manutenção', tabela(cols, manuts, { vazio: 'Nenhuma manutenção registrada.' }))}
  `;

  return { html, montar: (root) => {
    const bN = root.querySelector('#btn-nova-m');
    if (bN) bN.onclick = () => abrirFormManut(null, equipamentos);
    const bP = root.querySelector('#btn-plano');
    if (bP) bP.onclick = () => abrirFormPlano(equipamentos);
    root.querySelectorAll('[data-edit-m]').forEach((b) => b.onclick = () => abrirFormManut(b.dataset.editM, equipamentos));
    root.querySelectorAll('[data-del-m]').forEach((b) => b.onclick = () => excluirManut(b.dataset.delM));
    root.querySelectorAll('[data-del-plano]').forEach((b) => b.onclick = () => excluirPlano(b.dataset.delPlano));
  }};
}

async function abrirFormManut(id, equipamentos) {
  const u = usuarioAtual();
  const m = id ? await get('manutencoes', id) : {};
  const ok = await modal({
    titulo: id ? 'Editar manutenção' : 'Nova manutenção',
    largo: true,
    corpoHTML: `
      <form class="form-grid">
        <label>Data *<input type="date" name="data" required value="${esc(m.data || hoje())}"></label>
        <label>Equipamento *<select name="equipamento_id" required><option value="">Selecione…</option>${options(equipamentos, m.equipamento_id, (e) => ({ v: e.id, t: e.codigo }))}</select></label>
        <label>Tipo *<select name="tipo" required>${options(TIPOS_MANUTENCAO.map((t) => ({ id: t, nome: t })), m.tipo || 'Preventiva')}</select></label>
        <label>Responsável<input name="responsavel" value="${esc(m.responsavel || u?.nome || '')}"></label>
        <label>Horímetro<input type="number" step="0.1" min="0" name="horimetro" value="${esc(m.horimetro || '')}"></label>
        <label>KM<input type="number" step="1" min="0" name="km" value="${esc(m.km || '')}"></label>
        <label class="col-full">Serviço realizado *<input name="servico" required value="${esc(m.servico || '')}" placeholder="Ex.: Troca de óleo e filtros"></label>
        <label class="col-full">Peças / trocas<textarea name="pecas" rows="2">${esc(m.pecas || '')}</textarea></label>
        <label class="col-full">Observação<textarea name="observacao" rows="2">${esc(m.observacao || '')}</textarea></label>
        <label>Próxima (data)<input type="date" name="proxima_data" value="${esc(m.proxima_data || '')}"></label>
        <label>Próxima (horímetro)<input type="number" step="0.1" name="proxima_horimetro" value="${esc(m.proxima_horimetro || '')}"></label>
        <label>Próxima (KM)<input type="number" step="1" name="proxima_km" value="${esc(m.proxima_km || '')}"></label>
      </form>`,
  });
  if (!ok) return;
  const d = lerForm(document.querySelector('.modal form'));
  await salvarManutencao({ ...d, id: m.id, created_at: m.created_at }, u?.nome);
  toast('Manutenção salva.', 'ok');
  location.reload();
}

async function excluirManut(id) {
  const u = usuarioAtual();
  const m = await get('manutencoes', id);
  if (!(await confirmar('Excluir manutenção',
    `Confirma excluir a manutenção de ${dataBR(m.data)} (${m.tipo})? Históricos importantes não devem ser apagados sem necessidade.`, 'Excluir'))) return;
  await del('manutencoes', id);
  await audit('excluir', 'manutencoes', id, u?.nome);
  toast('Manutenção excluída.', 'ok');
  location.reload();
}

async function abrirFormPlano(equipamentos) {
  const u = usuarioAtual();
  const ok = await modal({
    titulo: 'Novo plano de preventiva',
    corpoHTML: `
      <form class="form-grid">
        <label class="col-full">Equipamento *<select name="equipamento_id" required><option value="">Selecione…</option>${options(equipamentos, '', (e) => ({ v: e.id, t: e.codigo }))}</select></label>
        <label class="col-full">Nome do serviço *<input name="nome" required placeholder="Ex.: Troca de óleo do motor"></label>
        <label>A cada (horímetro)<input type="number" step="1" min="0" name="periodo_horimetro" placeholder="500"></label>
        <label>Base horímetro atual<input type="number" step="1" name="base_horimetro" placeholder="opcional"></label>
        <label>A cada (KM)<input type="number" step="1" min="0" name="periodo_km" placeholder="10000"></label>
        <label>Base KM atual<input type="number" step="1" name="base_km" placeholder="opcional"></label>
        <label>A cada (dias)<input type="number" step="1" min="0" name="periodo_dias" placeholder="90"></label>
        <label>Base data<input type="date" name="base_data"></label>
      </form>
      <p class="nota">Preencha ao menos uma periodicidade (horímetro, KM ou dias). Sem base, usa-se o valor atual do equipamento.</p>`,
  });
  if (!ok) return;
  const d = lerForm(document.querySelector('.modal form'));
  const equip = await get('equipamentos', d.equipamento_id);
  const plano = {
    id: uid(), equipamento_id: d.equipamento_id, nome: d.nome.trim(),
    periodo_horimetro: d.periodo_horimetro ? Number(d.periodo_horimetro) : null,
    base_horimetro: d.base_horimetro ? Number(d.base_horimetro) : (equip ? equip.horimetro_atual : null),
    periodo_km: d.periodo_km ? Number(d.periodo_km) : null,
    base_km: d.base_km ? Number(d.base_km) : (equip ? equip.km_atual : null),
    periodo_dias: d.periodo_dias ? Number(d.periodo_dias) : null,
    base_data: d.base_data || (d.periodo_dias ? hoje() : null),
  };
  await put('planos', plano);
  await audit('criar', 'planos', plano.nome, u?.nome);
  toast('Plano de preventiva criado.', 'ok');
  location.reload();
}

async function excluirPlano(id) {
  if (!(await confirmar('Excluir plano', 'Confirma excluir este plano de preventiva?', 'Excluir'))) return;
  await del('planos', id);
  toast('Plano excluído.', 'ok');
  location.reload();
}
