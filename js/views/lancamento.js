// ============================================================================
// Lançamento Diário — tela principal de operação
// Campos automáticos (Horas, L/h, L/Ton) são somente leitura.
// ============================================================================
import {
  getAll, get, salvarLancamento, validarLancamento, calcularLancamento,
  lancamentosPorData, del, num,
} from '../store.js';
import { usuarioAtual, podeFazer } from '../auth.js';
import { secao, esc, options, toast, tabela, confirmar } from '../ui.js';
import { fmt, hoje, dataBR } from '../format.js';

export async function render() {
  const u = usuarioAtual();
  if (!podeFazer(u, 'lancar')) return '<div class="erro-box">Seu perfil não tem permissão para lançar dados.</div>';

  const equipamentos = (await getAll('equipamentos')).filter((e) => e.status !== 'Inativo')
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const operadores = (await getAll('operadores')).filter((o) => o.status === 'Ativo')
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const optEquip = '<option value="">Selecione…</option>' +
    options(equipamentos, '', (e) => ({ v: e.id, t: `${e.codigo} — ${e.tipo}` }));
  const optOper = '<option value="">Selecione…</option>' +
    options(operadores, '', (o) => ({ v: o.id, t: `${o.nome}${o.matricula ? ' (' + o.matricula + ')' : ''}` }));

  const form = `
    <form id="form-lanc" class="form-lanc">
      <div class="form-lanc__grid">
        <label>Data *<input type="date" name="data" required value="${hoje()}"></label>
        <label>Equipamento *<select name="equipamento_id" required>${optEquip}</select></label>
        <label>Operador *<select name="operador_id" required>${optOper}</select></label>

        <label>Horímetro inicial *<input type="number" step="0.1" min="0" name="horimetro_inicial" required inputmode="decimal"></label>
        <label>Horímetro final *<input type="number" step="0.1" min="0" name="horimetro_final" required inputmode="decimal"></label>
        <label class="campo-auto">Horas (automático)<input type="text" name="horas" readonly tabindex="-1" value="0,0"></label>

        <label>Diesel / Litros *<input type="number" step="0.1" min="0" name="litros" required inputmode="decimal"></label>
        <label>Toneladas produzidas<input type="number" step="0.1" min="0" name="toneladas" inputmode="decimal" value="0"></label>
        <label>KM final (opcional)<input type="number" step="1" min="0" name="km_final" inputmode="numeric"></label>

        <label class="campo-auto">L/h (automático)<input type="text" name="lh" readonly tabindex="-1" value="0,00"></label>
        <label class="campo-auto">L/Ton (automático)<input type="text" name="lton" readonly tabindex="-1" value="0,000"></label>
        <label class="col-full">Observações<textarea name="obs" rows="2"></textarea></label>
      </div>

      <div id="lanc-alertas"></div>
      <div class="form-lanc__acoes">
        <button type="button" class="btn btn--ghost" id="btn-limpar">Limpar</button>
        <button type="submit" class="btn btn--primary btn--grande">💾 Salvar lançamento</button>
      </div>
    </form>`;

  const dataInicial = hoje();

  const html = `
    <div class="page-head">
      <div><h1>Lançamento Diário</h1><p class="sub">Lance uma vez — o sistema calcula e atualiza tudo automaticamente.</p></div>
    </div>
    ${secao('Novo lançamento', form)}
    <div id="lanc-do-dia">${await tabelaDoDia(dataInicial)}</div>
  `;

  return { html, montar };
}

async function tabelaDoDia(data) {
  const lancs = await lancamentosPorData(data);
  const equipamentos = await getAll('equipamentos');
  const operadores = await getAll('operadores');
  const mapaE = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
  const mapaO = Object.fromEntries(operadores.map((o) => [o.id, o]));
  const u = usuarioAtual();
  const cols = [
    { h: 'Equipamento', get: (l) => esc(mapaE[l.equipamento_id]?.codigo || '—') },
    { h: 'Operador', get: (l) => esc(mapaO[l.operador_id]?.nome || '—') },
    { h: 'Horas', cls: 'num', get: (l) => fmt.n1(l.horas) },
    { h: 'Diesel', cls: 'num', get: (l) => fmt.int(l.litros) },
    { h: 'Ton', cls: 'num', get: (l) => fmt.n1(l.toneladas) },
    { h: 'L/h', cls: 'num', get: (l) => fmt.n2(l.lh) },
    { h: 'L/Ton', cls: 'num', get: (l) => fmt.n3(l.lton) },
    { h: '', cls: 'acoes-col', get: (l) => podeFazer(u, 'excluir')
        ? `<button class="btn-icon" data-del-lanc="${l.id}" title="Excluir">🗑️</button>` : '' },
  ];
  return secao(`Lançamentos de ${dataBR(data)}`, tabela(cols, lancs, { vazio: 'Nenhum lançamento nesta data ainda.' }));
}

function montar(root) {
  const form = root.querySelector('#form-lanc');
  const $ = (n) => form.querySelector(`[name="${n}"]`);
  const alertasBox = root.querySelector('#lanc-alertas');

  function recalc() {
    const hi = num($('horimetro_inicial').value);
    const hf = num($('horimetro_final').value);
    const litros = num($('litros').value);
    const ton = num($('toneladas').value);
    const horas = Math.max(hf - hi, 0);
    $('horas').value = fmt.n1(horas) + (hf < hi ? ' ⚠️' : '');
    $('lh').value = horas > 0 ? fmt.n2(litros / horas) : '0,00';
    $('lton').value = ton > 0 ? fmt.n3(litros / ton) : '0,000';
  }

  ['horimetro_inicial', 'horimetro_final', 'litros', 'toneladas'].forEach((n) =>
    $(n).addEventListener('input', recalc));

  // Ao escolher equipamento, sugere horímetro inicial = horímetro atual.
  $('equipamento_id').addEventListener('change', async () => {
    const eq = $('equipamento_id').value ? await get('equipamentos', $('equipamento_id').value) : null;
    if (eq && !$('horimetro_inicial').value) {
      $('horimetro_inicial').value = eq.horimetro_atual || '';
      recalc();
    }
    validarAoVivo();
  });

  async function validarAoVivo() {
    const dados = coletar();
    if (!dados.equipamento_id) { alertasBox.innerHTML = ''; return; }
    const { erros, alertas } = await validarLancamento(dados);
    renderAvisos(erros, alertas);
  }

  function renderAvisos(erros, alertas) {
    let h = '';
    if (erros.length) h += `<div class="aviso aviso--erro"><strong>Corrija antes de salvar:</strong><ul>${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    if (alertas.length) h += `<div class="aviso aviso--warn"><strong>Atenção:</strong><ul>${alertas.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
    alertasBox.innerHTML = h;
  }

  function coletar() {
    return {
      data: $('data').value,
      equipamento_id: $('equipamento_id').value,
      operador_id: $('operador_id').value,
      horimetro_inicial: $('horimetro_inicial').value,
      horimetro_final: $('horimetro_final').value,
      litros: $('litros').value,
      toneladas: $('toneladas').value || 0,
      km_final: $('km_final').value,
      obs: $('obs').value,
    };
  }

  ['horimetro_final', 'litros', 'toneladas'].forEach((n) => $(n).addEventListener('change', validarAoVivo));

  root.querySelector('#btn-limpar').onclick = () => {
    form.reset();
    $('data').value = hoje();
    recalc();
    alertasBox.innerHTML = '';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = coletar();
    const { erros, alertas } = await validarLancamento(dados);
    if (erros.length) { renderAvisos(erros, []); toast('Corrija os erros destacados.', 'erro'); return; }
    if (alertas.length) {
      const ok = await confirmar('Confirmar lançamento',
        'Há avisos:\n\n• ' + alertas.join('\n• ') + '\n\nDeseja salvar mesmo assim?', 'Salvar assim mesmo');
      if (!ok) return;
    }
    await salvarLancamento(dados, usuarioAtual()?.nome);
    toast('Lançamento salvo. Resumos e históricos atualizados.', 'ok');
    const dataAtual = $('data').value;
    form.reset();
    $('data').value = dataAtual;
    recalc();
    alertasBox.innerHTML = '';
    // Atualiza tabela do dia.
    root.querySelector('#lanc-do-dia').innerHTML = await tabelaDoDia(dataAtual);
    ligarExclusao(root);
  });

  ligarExclusao(root);
  recalc();
}

function ligarExclusao(root) {
  root.querySelectorAll('[data-del-lanc]').forEach((b) => b.onclick = async () => {
    if (!(await confirmar('Excluir lançamento', 'Confirma excluir este lançamento? Os resumos serão recalculados.', 'Excluir'))) return;
    await del('lancamentos', b.dataset.delLanc);
    toast('Lançamento excluído.', 'ok');
    const data = root.querySelector('[name="data"]').value;
    root.querySelector('#lanc-do-dia').innerHTML = await tabelaDoDia(data);
    ligarExclusao(root);
  });
}
