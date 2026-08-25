// ============================================================================
// Dashboard Operacional
// ============================================================================
import { getAll, lancamentosPorData, agregar, calcularLancamento, byIndex } from '../store.js';
import { kpi, secao, esc } from '../ui.js';
import { fmt, hoje, dataBR } from '../format.js';
import { barras, colunas } from '../charts.js';

const ICO = {
  op: '🚛', mnt: '🔧', par: '⏸️', hr: '⏱️', diesel: '⛽', prod: '📦', ef: '⚡',
};

export async function render() {
  const equipamentos = await getAll('equipamentos');
  const operadores = await getAll('operadores');
  const data = hoje();
  const lancsHoje = await lancamentosPorData(data);
  const manutHoje = (await byIndex('manutencoes', 'data', data));

  const operando = equipamentos.filter((e) => e.status === 'Operando').length;
  const emManut = equipamentos.filter((e) => e.status === 'Manutenção').length;
  const parados = equipamentos.filter((e) => e.status === 'Parado').length;
  const tot = agregar(lancsHoje);

  const mapaEquip = Object.fromEntries(equipamentos.map((e) => [e.id, e]));

  // Produção e consumo por equipamento (hoje).
  const porEquip = {};
  for (const l of lancsHoje) {
    const e = mapaEquip[l.equipamento_id];
    if (!e) continue;
    porEquip[e.codigo] = porEquip[e.codigo] || { horas: 0, litros: 0, ton: 0 };
    porEquip[e.codigo].horas += l.horas;
    porEquip[e.codigo].litros += l.litros;
    porEquip[e.codigo].ton += l.toneladas;
  }
  const codigos = Object.keys(porEquip);
  const gProd = codigos.map((c) => ({ label: c, valor: porEquip[c].ton })).sort((a, b) => b.valor - a.valor);
  const gDiesel = codigos.map((c) => ({ label: c, valor: porEquip[c].litros })).sort((a, b) => b.valor - a.valor);

  // Rankings de eficiência (somente com horas/ton suficientes).
  const comHoras = codigos.map((c) => ({ c, ...porEquip[c] }));
  const rankLh = comHoras.filter((x) => x.horas >= 2 && x.litros > 0)
    .map((x) => ({ label: x.c, valor: x.horas > 0 ? x.litros / x.horas : 0 }))
    .sort((a, b) => a.valor - b.valor).slice(0, 5);
  const rankLton = comHoras.filter((x) => x.ton > 0)
    .map((x) => ({ label: x.c, valor: x.litros / x.ton }))
    .sort((a, b) => a.valor - b.valor).slice(0, 5);
  const rankProd = gProd.filter((x) => x.valor > 0).slice(0, 5);

  const cards = [
    kpi({ label: 'Equipamentos operando', valor: operando, icon: ICO.op, tom: 'ok' }),
    kpi({ label: 'Em manutenção', valor: emManut, icon: ICO.mnt, tom: 'warn' }),
    kpi({ label: 'Parados', valor: parados, icon: ICO.par, tom: 'muted' }),
    kpi({ label: 'Horas trabalhadas (dia)', valor: fmt.n1(tot.horas), icon: ICO.hr }),
    kpi({ label: 'Diesel consumido (dia)', valor: fmt.litros(tot.litros), icon: ICO.diesel }),
    kpi({ label: 'Produção do dia', valor: fmt.ton(tot.toneladas), icon: ICO.prod }),
    kpi({ label: 'L/h médio', valor: fmt.n2(tot.lh), icon: ICO.ef }),
    kpi({ label: 'L/Ton médio', valor: fmt.n3(tot.lton), icon: ICO.ef }),
    kpi({ label: 'Manutenções do dia', valor: manutHoje.length, icon: ICO.mnt }),
  ].join('');

  const rankHTML = (titulo, dados, unidade, formato) => `
    <div class="rank-col">
      <h4>${esc(titulo)}</h4>
      ${dados.length ? barras(dados, { unidade, formato }) : '<p class="muted">Sem dados suficientes hoje.</p>'}
    </div>`;

  const html = `
    <div class="page-head">
      <div>
        <h1>Dashboard Operacional</h1>
        <p class="sub">Visão do dia — ${dataBR(data)}</p>
      </div>
      <a class="btn btn--primary" href="#/lancamento">+ Lançamento diário</a>
    </div>

    <div class="kpi-grid">${cards}</div>

    <div class="grid-2">
      ${secao('Produção por equipamento (t)', gProd.length ? colunas(gProd, { formato: (v) => fmt.n1(v) }) : '<p class="muted">Nenhuma produção lançada hoje.</p>')}
      ${secao('Consumo de diesel por equipamento (L)', gDiesel.length ? colunas(gDiesel, { formato: (v) => fmt.int(v) }) : '<p class="muted">Nenhum consumo lançado hoje.</p>')}
    </div>

    ${secao('Eficiência — rankings do dia', `
      <div class="rank-grid">
        ${rankHTML('Menor L/h (menor consumo horário)', rankLh, 'L/h', (v) => fmt.n2(v))}
        ${rankHTML('Menor L/Ton (maior eficiência)', rankLton, 'L/t', (v) => fmt.n3(v))}
        ${rankHTML('Maior produção', rankProd, 't', (v) => fmt.n1(v))}
      </div>
    `)}
  `;
  return html;
}
