// ============================================================================
// Resumo Mensal — totais, médias e evolução diária
// ============================================================================
import { getAll, calcularLancamento, agregar } from '../store.js';
import { kpi, secao, tabela, esc, options } from '../ui.js';
import { fmt, dataBR } from '../format.js';
import { barras, linha } from '../charts.js';

function mesAtual() { return new Date().toISOString().slice(0, 7); }

export async function render(params, filtros) {
  const mes = (filtros && filtros.mes) || mesAtual();
  const equipFiltro = (filtros && filtros.equip) || '';
  const operFiltro = (filtros && filtros.oper) || '';

  const equipamentos = await getAll('equipamentos');
  const operadores = await getAll('operadores');
  const mapaE = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
  const mapaO = Object.fromEntries(operadores.map((o) => [o.id, o]));

  let lancs = (await getAll('lancamentos')).map(calcularLancamento)
    .filter((l) => l.data.slice(0, 7) === mes);
  if (equipFiltro) lancs = lancs.filter((l) => l.equipamento_id === equipFiltro);
  if (operFiltro) lancs = lancs.filter((l) => l.operador_id === operFiltro);

  const tot = agregar(lancs);

  const cards = [
    kpi({ label: 'Horas totais', valor: fmt.n1(tot.horas), icon: '⏱️' }),
    kpi({ label: 'Diesel total', valor: fmt.litros(tot.litros), icon: '⛽' }),
    kpi({ label: 'Produção total', valor: fmt.ton(tot.toneladas), icon: '📦' }),
    kpi({ label: 'L/h geral', valor: fmt.n2(tot.lh), icon: '⚡' }),
    kpi({ label: 'L/Ton geral', valor: fmt.n3(tot.lton), icon: '⚡' }),
    kpi({ label: 'Lançamentos', valor: tot.registros, icon: '📝' }),
  ].join('');

  // Por equipamento.
  const porEquip = {};
  for (const l of lancs) {
    const cod = mapaE[l.equipamento_id]?.codigo || '—';
    porEquip[cod] = porEquip[cod] || { horas: 0, litros: 0, ton: 0 };
    porEquip[cod].horas += l.horas; porEquip[cod].litros += l.litros; porEquip[cod].ton += l.toneladas;
  }
  const linhasEquip = Object.entries(porEquip).map(([cod, v]) => ({
    cod, horas: v.horas, litros: v.litros, ton: v.ton,
    lh: v.horas > 0 ? v.litros / v.horas : 0, lton: v.ton > 0 ? v.litros / v.ton : 0,
  })).sort((a, b) => b.horas - a.horas);

  const colsEquip = [
    { h: 'Equipamento', get: (r) => esc(r.cod) },
    { h: 'Horas', cls: 'num', get: (r) => fmt.n1(r.horas) },
    { h: 'Diesel', cls: 'num', get: (r) => fmt.int(r.litros) },
    { h: 'L/h', cls: 'num', get: (r) => fmt.n2(r.lh) },
    { h: 'Toneladas', cls: 'num', get: (r) => fmt.n1(r.ton) },
    { h: 'L/Ton', cls: 'num', get: (r) => fmt.n3(r.lton) },
  ];

  // Evolução diária.
  const porDia = {};
  for (const l of lancs) {
    porDia[l.data] = porDia[l.data] || { ton: 0, litros: 0 };
    porDia[l.data].ton += l.toneladas; porDia[l.data].litros += l.litros;
  }
  const dias = Object.keys(porDia).sort();
  const labels = dias.map((d) => d.slice(8, 10));
  const serieProd = [{ nome: 'Produção (t)', pontos: dias.map((d) => ({ y: porDia[d].ton })) }];
  const serieCons = [{ nome: 'Diesel (L)', cor: '#d97706', pontos: dias.map((d) => ({ y: porDia[d].litros })) }];

  // Gráficos de barras por equipamento.
  const gDiesel = linhasEquip.map((r) => ({ label: r.cod, valor: r.litros })).sort((a, b) => b.valor - a.valor);
  const gProd = linhasEquip.map((r) => ({ label: r.cod, valor: r.ton })).sort((a, b) => b.valor - a.valor);
  const gHoras = linhasEquip.map((r) => ({ label: r.cod, valor: r.horas })).sort((a, b) => b.valor - a.valor);

  const optEquip = '<option value="">Todos os equipamentos</option>' +
    options(equipamentos, equipFiltro, (e) => ({ v: e.id, t: e.codigo }));
  const optOper = '<option value="">Todos os operadores</option>' +
    options(operadores, operFiltro, (o) => ({ v: o.id, t: o.nome }));

  const html = `
    <div class="page-head">
      <div><h1>Resumo Mensal</h1><p class="sub">Consolidação do mês</p></div>
    </div>
    ${secao('Filtros', `<div class="filtros">
      <label>Mês <input type="month" id="f-mes" value="${mes}"></label>
      <label>Equipamento <select id="f-equip">${optEquip}</select></label>
      <label>Operador <select id="f-oper">${optOper}</select></label>
    </div>`)}
    <div class="kpi-grid">${cards}</div>
    ${secao('Por equipamento', tabela(colsEquip, linhasEquip, { vazio: 'Sem lançamentos no período.' }))}
    <div class="grid-2">
      ${secao('Diesel por equipamento (L)', gDiesel.length ? barras(gDiesel, { formato: (v) => fmt.int(v) }) : '<p class="muted">Sem dados.</p>')}
      ${secao('Produção por equipamento (t)', gProd.length ? barras(gProd, { formato: (v) => fmt.n1(v) }) : '<p class="muted">Sem dados.</p>')}
    </div>
    ${secao('Horas por equipamento', gHoras.length ? barras(gHoras, { unidade: 'h', formato: (v) => fmt.n1(v) }) : '<p class="muted">Sem dados.</p>')}
    <div class="grid-2">
      ${secao('Evolução diária da produção', dias.length ? linha(labels, serieProd, { formato: (v) => fmt.int(v) }) : '<p class="muted">Sem dados.</p>')}
      ${secao('Evolução diária do consumo', dias.length ? linha(labels, serieCons, { formato: (v) => fmt.int(v) }) : '<p class="muted">Sem dados.</p>')}
    </div>
  `;

  return { html, montar: (root) => {
    const rerender = async () => {
      const nova = await render(null, {
        mes: root.querySelector('#f-mes').value,
        equip: root.querySelector('#f-equip').value,
        oper: root.querySelector('#f-oper').value,
      });
      root.innerHTML = nova.html;
      nova.montar(root);
    };
    root.querySelector('#f-mes').addEventListener('change', rerender);
    root.querySelector('#f-equip').addEventListener('change', rerender);
    root.querySelector('#f-oper').addEventListener('change', rerender);
  }};
}
