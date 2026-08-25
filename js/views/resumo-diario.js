// ============================================================================
// Resumo Diário — visão operacional automática por data
// ============================================================================
import { getAll, lancamentosPorData, agregar, byIndex } from '../store.js';
import { kpi, secao, tabela, esc } from '../ui.js';
import { fmt, hoje, dataBR } from '../format.js';

export async function render(params, dataSel) {
  const data = dataSel || hoje();
  const lancs = await lancamentosPorData(data);
  const equipamentos = await getAll('equipamentos');
  const operadores = await getAll('operadores');
  const mapaE = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
  const mapaO = Object.fromEntries(operadores.map((o) => [o.id, o]));
  const manut = await byIndex('manutencoes', 'data', data);
  const tot = agregar(lancs);

  const equipsTrabalhando = new Set(lancs.map((l) => l.equipamento_id)).size;
  const opsTrabalhando = new Set(lancs.map((l) => l.operador_id)).size;

  const cards = [
    kpi({ label: 'Equipamentos trabalhando', valor: equipsTrabalhando, icon: '🚛' }),
    kpi({ label: 'Operadores', valor: opsTrabalhando, icon: '👷' }),
    kpi({ label: 'Horas trabalhadas', valor: fmt.n1(tot.horas), icon: '⏱️' }),
    kpi({ label: 'Diesel consumido', valor: fmt.litros(tot.litros), icon: '⛽' }),
    kpi({ label: 'Produção total', valor: fmt.ton(tot.toneladas), icon: '📦' }),
    kpi({ label: 'L/h médio', valor: fmt.n2(tot.lh), icon: '⚡' }),
    kpi({ label: 'L/Ton médio', valor: fmt.n3(tot.lton), icon: '⚡' }),
    kpi({ label: 'Manutenções do dia', valor: manut.length, icon: '🔧' }),
  ].join('');

  const cols = [
    { h: 'Equipamento', get: (l) => esc(mapaE[l.equipamento_id]?.codigo || '—') },
    { h: 'Operador', get: (l) => esc(mapaO[l.operador_id]?.nome || '—') },
    { h: 'Horas', cls: 'num', get: (l) => fmt.n1(l.horas) },
    { h: 'Diesel', cls: 'num', get: (l) => fmt.int(l.litros) },
    { h: 'L/h', cls: 'num', get: (l) => fmt.n2(l.lh) },
    { h: 'Toneladas', cls: 'num', get: (l) => fmt.n1(l.toneladas) },
    { h: 'L/Ton', cls: 'num', get: (l) => fmt.n3(l.lton) },
  ];

  // Destaques (somente equipamentos com base comparável).
  const porEquip = {};
  for (const l of lancs) {
    const cod = mapaE[l.equipamento_id]?.codigo || '—';
    porEquip[cod] = porEquip[cod] || { horas: 0, litros: 0, ton: 0 };
    porEquip[cod].horas += l.horas; porEquip[cod].litros += l.litros; porEquip[cod].ton += l.toneladas;
  }
  const arr = Object.entries(porEquip).map(([cod, v]) => ({ cod, ...v }));
  const melhorEf = arr.filter((x) => x.ton > 0).sort((a, b) => (a.litros / a.ton) - (b.litros / b.ton))[0];
  const maiorProd = arr.filter((x) => x.ton > 0).sort((a, b) => b.ton - a.ton)[0];
  const menorLh = arr.filter((x) => x.horas >= 2 && x.litros > 0).sort((a, b) => (a.litros / a.horas) - (b.litros / b.horas))[0];

  const destaque = (titulo, item, valor) => `
    <div class="destaque">
      <span class="destaque__t">${esc(titulo)}</span>
      ${item ? `<strong>${esc(item.cod)}</strong><span class="destaque__v">${valor}</span>` : '<span class="muted">Sem dados</span>'}
    </div>`;

  const html = `
    <div class="page-head">
      <div><h1>Resumo Diário</h1><p class="sub">Visão operacional automática</p></div>
      <label class="seletor-data">Data <input type="date" id="sel-data" value="${data}"></label>
    </div>
    <div class="kpi-grid">${cards}</div>
    ${secao('Destaques do dia', `<div class="destaques-grid">
      ${destaque('Melhor eficiência (L/Ton)', melhorEf, melhorEf ? fmt.n3(melhorEf.litros / melhorEf.ton) + ' L/t' : '')}
      ${destaque('Maior produção', maiorProd, maiorProd ? fmt.n1(maiorProd.ton) + ' t' : '')}
      ${destaque('Menor consumo horário (L/h)', menorLh, menorLh ? fmt.n2(menorLh.litros / menorLh.horas) + ' L/h' : '')}
    </div>`)}
    ${secao('Detalhamento por equipamento', tabela(cols, lancs, { vazio: 'Nenhum lançamento nesta data.' }))}
  `;

  return { html, montar: (root) => {
    root.querySelector('#sel-data').addEventListener('change', async (e) => {
      const nova = await render(null, e.target.value);
      root.innerHTML = nova.html;
      nova.montar(root);
    });
  }};
}
