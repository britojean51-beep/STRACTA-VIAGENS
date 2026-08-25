// ============================================================================
// Busca geral — consulta toda a vida operacional da frota
// ============================================================================
import { getAll, calcularLancamento } from '../store.js';
import { secao, esc, tabela } from '../ui.js';
import { fmt, dataBR } from '../format.js';

export async function render() {
  const html = `
    <div class="page-head">
      <div><h1>Histórico completo</h1><p class="sub">Pesquise equipamentos, operadores, lançamentos, produção e manutenção</p></div>
    </div>
    ${secao('Pesquisa', `<div class="filtros">
      <label class="col-full">Termo <input type="search" id="q" placeholder="Ex.: CB-14, Jean, óleo, 2026-08-25…" autocomplete="off"></label>
      <label>De <input type="date" id="q-de"></label>
      <label>Até <input type="date" id="q-ate"></label>
      <label>Tipo <select id="q-tipo">
        <option value="">Tudo</option>
        <option value="lanc">Lançamentos / Produção / Abastecimento</option>
        <option value="manut">Manutenção</option>
        <option value="equip">Equipamentos</option>
        <option value="oper">Operadores</option>
      </select></label>
    </div>`)}
    <div id="q-result"></div>
  `;
  return { html, montar };
}

async function montar(root) {
  const [equipamentos, operadores, lancamentos, manutencoes] = await Promise.all([
    getAll('equipamentos'), getAll('operadores'), getAll('lancamentos'), getAll('manutencoes'),
  ]);
  const mapaE = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
  const mapaO = Object.fromEntries(operadores.map((o) => [o.id, o]));
  const out = root.querySelector('#q-result');

  function buscar() {
    const q = root.querySelector('#q').value.trim().toLowerCase();
    const de = root.querySelector('#q-de').value;
    const ate = root.querySelector('#q-ate').value;
    const tipo = root.querySelector('#q-tipo').value;
    const dtOk = (d) => (!de || d >= de) && (!ate || d <= ate);
    const bate = (txt) => !q || String(txt).toLowerCase().includes(q);

    let blocos = '';

    if (!tipo || tipo === 'equip') {
      const res = equipamentos.filter((e) => bate(`${e.codigo} ${e.tipo} ${e.marca} ${e.modelo} ${e.status}`));
      if (res.length) blocos += secao(`Equipamentos (${res.length})`, tabela([
        { h: 'Código', get: (e) => `<a href="#/equipamento/${e.id}" class="link-forte">${esc(e.codigo)}</a>` },
        { h: 'Tipo', get: (e) => esc(e.tipo) },
        { h: 'Modelo', get: (e) => esc(`${e.marca} ${e.modelo}`) },
        { h: 'Status', get: (e) => esc(e.status) },
      ], res));
    }
    if (!tipo || tipo === 'oper') {
      const res = operadores.filter((o) => bate(`${o.nome} ${o.funcao} ${o.matricula}`));
      if (res.length) blocos += secao(`Operadores (${res.length})`, tabela([
        { h: 'Nome', get: (o) => `<a href="#/operador/${o.id}" class="link-forte">${esc(o.nome)}</a>` },
        { h: 'Função', get: (o) => esc(o.funcao || '—') },
        { h: 'Matrícula', get: (o) => esc(o.matricula || '—') },
      ], res));
    }
    if (!tipo || tipo === 'lanc') {
      const res = lancamentos.map(calcularLancamento).filter((l) => dtOk(l.data) &&
        bate(`${l.data} ${mapaE[l.equipamento_id]?.codigo} ${mapaO[l.operador_id]?.nome}`))
        .sort((a, b) => (a.data < b.data ? 1 : -1));
      if (res.length) blocos += secao(`Lançamentos (${res.length})`, tabela([
        { h: 'Data', get: (l) => dataBR(l.data) },
        { h: 'Equipamento', get: (l) => esc(mapaE[l.equipamento_id]?.codigo || '—') },
        { h: 'Operador', get: (l) => esc(mapaO[l.operador_id]?.nome || '—') },
        { h: 'Horas', cls: 'num', get: (l) => fmt.n1(l.horas) },
        { h: 'Diesel', cls: 'num', get: (l) => fmt.int(l.litros) },
        { h: 'Ton', cls: 'num', get: (l) => fmt.n1(l.toneladas) },
        { h: 'L/h', cls: 'num', get: (l) => fmt.n2(l.lh) },
      ], res.slice(0, 200)));
    }
    if (!tipo || tipo === 'manut') {
      const res = manutencoes.filter((m) => dtOk(m.data) &&
        bate(`${m.data} ${mapaE[m.equipamento_id]?.codigo} ${m.tipo} ${m.servico} ${m.pecas} ${m.responsavel}`))
        .sort((a, b) => (a.data < b.data ? 1 : -1));
      if (res.length) blocos += secao(`Manutenções (${res.length})`, tabela([
        { h: 'Data', get: (m) => dataBR(m.data) },
        { h: 'Equipamento', get: (m) => esc(mapaE[m.equipamento_id]?.codigo || '—') },
        { h: 'Tipo', get: (m) => esc(m.tipo) },
        { h: 'Serviço', get: (m) => esc(m.servico) },
        { h: 'Responsável', get: (m) => esc(m.responsavel || '—') },
      ], res.slice(0, 200)));
    }

    out.innerHTML = blocos || '<div class="vazio"><p>Nenhum resultado. Ajuste o termo ou os filtros.</p></div>';
  }

  let t;
  root.querySelector('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscar, 200); });
  ['#q-de', '#q-ate', '#q-tipo'].forEach((s) => root.querySelector(s).addEventListener('change', buscar));
  buscar();
}
