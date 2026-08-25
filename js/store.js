// ============================================================================
// store.js — Camada de dados (banco relacional sobre IndexedDB)
// Tabelas: equipamentos, operadores, lancamentos, manutencoes, planos,
//          usuarios, auditoria
// ----------------------------------------------------------------------------
// Regra central do sistema: o LANÇAMENTO DIÁRIO é a fonte da verdade dos dados
// operacionais. Resumos, históricos e indicadores são SEMPRE calculados a
// partir dos lançamentos e das manutenções — nunca duplicados.
// ============================================================================

const DB_NAME = 'stracta_frota';
const DB_VERSION = 1;

const STORES = {
  equipamentos: { keyPath: 'id', indexes: [['codigo', 'codigo', { unique: true }], ['status', 'status']] },
  operadores:   { keyPath: 'id', indexes: [['matricula', 'matricula', { unique: false }], ['status', 'status']] },
  lancamentos:  { keyPath: 'id', indexes: [['data', 'data'], ['equipamento_id', 'equipamento_id'], ['operador_id', 'operador_id']] },
  manutencoes:  { keyPath: 'id', indexes: [['data', 'data'], ['equipamento_id', 'equipamento_id'], ['tipo', 'tipo']] },
  planos:       { keyPath: 'id', indexes: [['equipamento_id', 'equipamento_id']] },
  usuarios:     { keyPath: 'id', indexes: [['email', 'email', { unique: true }]] },
  auditoria:    { keyPath: 'id', indexes: [['data', 'data'], ['entidade', 'entidade']] },
};

let _db = null;

export const uid = () =>
  (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const os = db.createObjectStore(name, { keyPath: cfg.keyPath });
          (cfg.indexes || []).forEach(([idxName, kp, opt]) => os.createIndex(idxName, kp, opt || {}));
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function initDB() {
  if (_db) return _db;
  _db = await openDB();
  return _db;
}

function tx(store, mode = 'readonly') {
  return _db.transaction(store, mode).objectStore(store);
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// -------- CRUD genérico -----------------------------------------------------
export async function getAll(store) {
  return reqToPromise(tx(store).getAll());
}
export async function get(store, id) {
  return reqToPromise(tx(store).get(id));
}
export async function put(store, obj) {
  await reqToPromise(tx(store, 'readwrite').put(obj));
  return obj;
}
export async function del(store, id) {
  return reqToPromise(tx(store, 'readwrite').delete(id));
}
export async function byIndex(store, indexName, value) {
  const idx = tx(store).index(indexName);
  return reqToPromise(idx.getAll(value));
}

// -------- Auditoria (rastreabilidade de quem criou/alterou) -----------------
export async function audit(acao, entidade, ref, usuario) {
  const reg = {
    id: uid(),
    data: new Date().toISOString(),
    acao,          // 'criar' | 'editar' | 'excluir'
    entidade,      // nome da tabela
    ref,           // id do registro / descrição
    usuario: usuario || 'sistema',
  };
  await put('auditoria', reg);
  return reg;
}

// ============================================================================
// MOTOR DE CÁLCULO — derivações de um único lançamento
// ============================================================================
export function calcularLancamento(l) {
  const hi = num(l.horimetro_inicial);
  const hf = num(l.horimetro_final);
  const litros = num(l.litros);
  const ton = num(l.toneladas);
  const horas = round(hf - hi, 2);
  const lh = horas > 0 ? round(litros / horas, 2) : 0;
  const lton = ton > 0 ? round(litros / ton, 3) : 0;
  return { ...l, horas, lh, lton };
}

// Agrega uma lista de lançamentos em totais e médias ponderadas corretas.
// Importante: L/h médio = Σlitros / Σhoras (não a média das médias).
export function agregar(lancamentos) {
  const t = { horas: 0, litros: 0, toneladas: 0, registros: lancamentos.length };
  for (const l of lancamentos) {
    t.horas += num(l.horas);
    t.litros += num(l.litros);
    t.toneladas += num(l.toneladas);
  }
  t.horas = round(t.horas, 2);
  t.litros = round(t.litros, 2);
  t.toneladas = round(t.toneladas, 2);
  t.lh = t.horas > 0 ? round(t.litros / t.horas, 2) : 0;
  t.lton = t.toneladas > 0 ? round(t.litros / t.toneladas, 3) : 0;
  return t;
}

export const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
export const round = (v, d = 2) => {
  const p = Math.pow(10, d);
  return Math.round((Number(v) + Number.EPSILON) * p) / p;
};

// ============================================================================
// VALIDAÇÃO DE LANÇAMENTO
// Retorna { erros: [], alertas: [] }. Erros bloqueiam; alertas apenas avisam.
// ============================================================================
export async function validarLancamento(l, opts = {}) {
  const erros = [];
  const alertas = [];
  const hi = num(l.horimetro_inicial);
  const hf = num(l.horimetro_final);
  const litros = num(l.litros);
  const ton = num(l.toneladas);

  const equip = l.equipamento_id ? await get('equipamentos', l.equipamento_id) : null;
  const oper = l.operador_id ? await get('operadores', l.operador_id) : null;

  if (!l.data) erros.push('Informe a data do lançamento.');
  if (!equip) erros.push('Selecione um equipamento válido (cadastrado).');
  if (!oper) erros.push('Selecione um operador válido (cadastrado).');
  if (hf < hi) erros.push('Horímetro final não pode ser menor que o inicial.');
  if (hi < 0 || hf < 0) erros.push('Horímetro não pode ser negativo.');
  if (litros < 0) erros.push('Litros de diesel não podem ser negativos.');
  if (ton < 0) erros.push('Toneladas produzidas não podem ser negativas.');

  // Controle de horímetro: novo registro não pode ter horímetro inicial menor
  // que o último horímetro conhecido do equipamento (sem autorização admin).
  if (equip) {
    const ultimo = num(equip.horimetro_atual);
    if (ultimo > 0 && hi < ultimo && !opts.autorizarRegressao) {
      erros.push(
        `Horímetro inicial (${hi}) é menor que o último registrado para ${equip.codigo} (${ultimo}). ` +
        `Requer autorização administrativa.`
      );
    }
    // Alerta: equipamento marcado em manutenção sendo lançado como operando.
    if (equip.status === 'Manutenção') {
      alertas.push(`${equip.codigo} está marcado como EM MANUTENÇÃO. Confirme se realmente operou.`);
    }
    if (equip.status === 'Inativo') {
      alertas.push(`${equip.codigo} está marcado como INATIVO.`);
    }

    // Alertas estatísticos com base no histórico do equipamento.
    const hist = (await byIndex('lancamentos', 'equipamento_id', equip.id)).map(calcularLancamento);
    if (hist.length >= 3) {
      const stats = statsDe(hist);
      const horas = round(hf - hi, 2);
      const lh = horas > 0 ? litros / horas : 0;

      if (stats.horimetroMax && hi > stats.horimetroMax * 1.2 && stats.horimetroMax > 0) {
        alertas.push('Horímetro muito acima do último registro histórico. Verifique se digitou corretamente.');
      }
      if (lh > 0 && stats.lhMedia > 0 && (lh > stats.lhMedia * 1.5 || lh < stats.lhMedia * 0.5)) {
        alertas.push(`Consumo (${round(lh,2)} L/h) fora do padrão histórico (~${round(stats.lhMedia,2)} L/h).`);
      }
      if (ton > 0 && stats.tonMedia > 0 && (ton > stats.tonMedia * 1.8 || ton < stats.tonMedia * 0.3)) {
        alertas.push(`Produção (${ton} t) muito diferente da média histórica (~${round(stats.tonMedia,1)} t).`);
      }
    }
  }

  return { erros, alertas };
}

function statsDe(lancs) {
  const s = { lhMedia: 0, tonMedia: 0, horimetroMax: 0 };
  if (!lancs.length) return s;
  let somaLh = 0, nLh = 0, somaTon = 0, nTon = 0;
  for (const l of lancs) {
    if (l.horas > 0) { somaLh += l.litros / l.horas; nLh++; }
    if (l.toneladas > 0) { somaTon += l.toneladas; nTon++; }
    s.horimetroMax = Math.max(s.horimetroMax, num(l.horimetro_final));
  }
  s.lhMedia = nLh ? somaLh / nLh : 0;
  s.tonMedia = nTon ? somaTon / nTon : 0;
  return s;
}

// ============================================================================
// PERSISTÊNCIA DE LANÇAMENTO (recalcula derivados e atualiza horímetro/KM)
// ============================================================================
export async function salvarLancamento(dados, usuario) {
  const l = calcularLancamento({
    id: dados.id || uid(),
    data: dados.data,
    equipamento_id: dados.equipamento_id,
    operador_id: dados.operador_id,
    horimetro_inicial: num(dados.horimetro_inicial),
    horimetro_final: num(dados.horimetro_final),
    litros: num(dados.litros),
    toneladas: num(dados.toneladas),
    km_final: dados.km_final != null && dados.km_final !== '' ? num(dados.km_final) : null,
    obs: dados.obs || '',
    created_at: dados.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    autor: dados.autor || usuario || 'sistema',
  });
  await put('lancamentos', l);

  // Atualiza automaticamente último horímetro / KM do equipamento.
  const equip = await get('equipamentos', l.equipamento_id);
  if (equip) {
    if (num(l.horimetro_final) >= num(equip.horimetro_atual)) equip.horimetro_atual = num(l.horimetro_final);
    if (l.km_final != null && num(l.km_final) >= num(equip.km_atual)) equip.km_atual = num(l.km_final);
    await put('equipamentos', equip);
  }
  await audit(dados.id ? 'editar' : 'criar', 'lancamentos', l.id, usuario);
  return l;
}

// ============================================================================
// PERSISTÊNCIA DE MANUTENÇÃO (atualiza horímetro/KM se maior)
// ============================================================================
export async function salvarManutencao(dados, usuario) {
  const m = {
    id: dados.id || uid(),
    data: dados.data,
    equipamento_id: dados.equipamento_id,
    responsavel: dados.responsavel || '',
    horimetro: num(dados.horimetro),
    km: num(dados.km),
    tipo: dados.tipo,
    servico: dados.servico || '',
    pecas: dados.pecas || '',
    observacao: dados.observacao || '',
    proxima_data: dados.proxima_data || '',
    proxima_horimetro: dados.proxima_horimetro ? num(dados.proxima_horimetro) : null,
    proxima_km: dados.proxima_km ? num(dados.proxima_km) : null,
    created_at: dados.created_at || new Date().toISOString(),
    autor: dados.autor || usuario || 'sistema',
  };
  await put('manutencoes', m);
  const equip = await get('equipamentos', m.equipamento_id);
  if (equip) {
    if (m.horimetro > num(equip.horimetro_atual)) equip.horimetro_atual = m.horimetro;
    if (m.km > num(equip.km_atual)) equip.km_atual = m.km;
    await put('equipamentos', equip);
  }
  await audit(dados.id ? 'editar' : 'criar', 'manutencoes', m.id, usuario);
  return m;
}

// ============================================================================
// CONSULTAS DE ALTO NÍVEL usadas pelas telas
// ============================================================================
export async function lancamentosPorData(data) {
  return (await byIndex('lancamentos', 'data', data)).map(calcularLancamento);
}
export async function lancamentosDoEquipamento(equipId) {
  return (await byIndex('lancamentos', 'equipamento_id', equipId))
    .map(calcularLancamento).sort((a, b) => (a.data < b.data ? 1 : -1));
}
export async function lancamentosDoOperador(operId) {
  return (await byIndex('lancamentos', 'operador_id', operId))
    .map(calcularLancamento).sort((a, b) => (a.data < b.data ? 1 : -1));
}
export async function manutencoesDoEquipamento(equipId) {
  return (await byIndex('manutencoes', 'equipamento_id', equipId))
    .sort((a, b) => (a.data < b.data ? 1 : -1));
}

// Situação de manutenção preventiva de um equipamento -> status semáforo.
export function statusPreventiva(plano, equip) {
  // Retorna { estado: 'ok'|'proximo'|'vencido', detalhe, faltam }
  const res = { estado: 'ok', detalhe: [], faltam: null };
  const hAtual = num(equip.horimetro_atual);
  const kmAtual = num(equip.km_atual);
  let pior = 0; // 0 ok, 1 proximo, 2 vencido

  const avaliar = (atual, base, periodo, limiarProx, unidade) => {
    if (!periodo || periodo <= 0) return;
    const proximo = num(base) + num(periodo);
    const restante = proximo - atual;
    let estado = 0;
    if (restante <= 0) estado = 2;
    else if (restante <= limiarProx) estado = 1;
    pior = Math.max(pior, estado);
    res.detalhe.push({ unidade, restante: round(restante, 1), proximo: round(proximo, 1), estado });
  };

  if (plano.periodo_horimetro) {
    avaliar(hAtual, plano.base_horimetro ?? hAtual, plano.periodo_horimetro, plano.periodo_horimetro * 0.1 + 10, 'h');
  }
  if (plano.periodo_km) {
    avaliar(kmAtual, plano.base_km ?? kmAtual, plano.periodo_km, plano.periodo_km * 0.1 + 100, 'km');
  }
  if (plano.periodo_dias && plano.base_data) {
    const base = new Date(plano.base_data);
    const proximo = new Date(base.getTime() + plano.periodo_dias * 86400000);
    const restanteDias = Math.round((proximo - new Date()) / 86400000);
    let estado = 0;
    if (restanteDias <= 0) estado = 2; else if (restanteDias <= 7) estado = 1;
    pior = Math.max(pior, estado);
    res.detalhe.push({ unidade: 'dias', restante: restanteDias, proximo: proximo.toISOString().slice(0,10), estado });
  }
  res.estado = pior === 2 ? 'vencido' : pior === 1 ? 'proximo' : 'ok';
  return res;
}

// ============================================================================
// DADOS DE EXEMPLO (seed) — carregados apenas na primeira execução
// ============================================================================
export async function seedIfEmpty() {
  const equipamentos = await getAll('equipamentos');
  if (equipamentos.length > 0) return false;

  const eq = (codigo, tipo, marca, modelo, ano, hor, km, status = 'Operando') => ({
    id: uid(), codigo, tipo, marca, modelo, ano, status,
    horimetro_atual: hor, km_atual: km,
    data_entrada: '2024-01-10', observacoes: '',
    created_at: new Date().toISOString(),
  });

  const equipsSeed = [
    eq('CB-14', 'Caminhão Basculante', 'Mercedes-Benz', 'Axor 3131', 2019, 14780, 221600),
    eq('CB-11', 'Caminhão Basculante', 'Volvo', 'FMX 500', 2020, 9820, 154300),
    eq('CB-10', 'Caminhão Basculante', 'Scania', 'P360', 2018, 18240, 289110),
    eq('PC-02', 'Pá Carregadeira', 'Caterpillar', '924K', 2021, 6120, 0),
    eq('ESC-01', 'Escavadeira Hidráulica', 'Komatsu', 'PC200', 2017, 12450, 0, 'Manutenção'),
    eq('MTN-01', 'Motoniveladora', 'Caterpillar', '120K', 2016, 15600, 0, 'Parado'),
  ];
  for (const e of equipsSeed) await put('equipamentos', e);

  const op = (nome, funcao, matricula, status = 'Ativo') => ({
    id: uid(), nome, funcao, matricula, status, observacoes: '',
    created_at: new Date().toISOString(),
  });
  const opsSeed = [
    op('Jean Brito', 'Operador Sênior', '0142'),
    op('Carlos Souza', 'Operador', '0158'),
    op('Marcos Lima', 'Operador', '0176'),
    op('Paulo Henrique', 'Operador', '0190'),
  ];
  for (const o of opsSeed) await put('operadores', o);

  // Alguns lançamentos de exemplo nos últimos dias.
  const hoje = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const cenarios = [
    { e: 0, o: 0, hi: 14760, hf: 14780, litros: 240, ton: 320, dias: 0 },
    { e: 1, o: 1, hi: 9800,  hf: 9820,  litros: 210, ton: 300, dias: 0 },
    { e: 2, o: 2, hi: 18220, hf: 18240, litros: 265, ton: 290, dias: 0 },
    { e: 3, o: 3, hi: 6100,  hf: 6120,  litros: 180, ton: 0,   dias: 0 },
    { e: 0, o: 0, hi: 14740, hf: 14760, litros: 235, ton: 310, dias: 1 },
    { e: 1, o: 1, hi: 9780,  hf: 9800,  litros: 205, ton: 295, dias: 1 },
    { e: 2, o: 1, hi: 18200, hf: 18220, litros: 270, ton: 285, dias: 1 },
    { e: 0, o: 2, hi: 14720, hf: 14740, litros: 238, ton: 305, dias: 2 },
    { e: 1, o: 0, hi: 9760,  hf: 9780,  litros: 200, ton: 298, dias: 2 },
  ];
  for (const c of cenarios) {
    const d = new Date(hoje.getTime() - c.dias * 86400000);
    const l = calcularLancamento({
      id: uid(), data: iso(d),
      equipamento_id: equipsSeed[c.e].id, operador_id: opsSeed[c.o].id,
      horimetro_inicial: c.hi, horimetro_final: c.hf,
      litros: c.litros, toneladas: c.ton, km_final: null,
      created_at: new Date().toISOString(), autor: 'seed',
    });
    await put('lancamentos', l);
  }

  // Manutenções de exemplo.
  await put('manutencoes', {
    id: uid(), data: iso(hoje), equipamento_id: equipsSeed[0].id,
    responsavel: 'Jean Brito', horimetro: 14793, km: 221662,
    tipo: 'Preventiva', servico: 'Troca de óleo e filtros',
    pecas: 'Óleo 15W40, filtro de óleo, filtro de combustível',
    observacao: 'Revisão de 15.000h', proxima_horimetro: 15293, proxima_km: null, proxima_data: '',
    created_at: new Date().toISOString(), autor: 'seed',
  });
  await put('manutencoes', {
    id: uid(), data: iso(new Date(hoje.getTime() - 20 * 86400000)), equipamento_id: equipsSeed[4].id,
    responsavel: 'Marcos Lima', horimetro: 12450, km: 0,
    tipo: 'Corretiva', servico: 'Reparo do sistema hidráulico',
    pecas: 'Mangueira hidráulica, vedação', observacao: 'Vazamento identificado',
    proxima_horimetro: null, proxima_km: null, proxima_data: '', created_at: new Date().toISOString(), autor: 'seed',
  });

  // Planos de preventiva.
  await put('planos', {
    id: uid(), equipamento_id: equipsSeed[0].id, nome: 'Troca de óleo do motor',
    periodo_horimetro: 500, base_horimetro: 14293, periodo_km: null, base_km: null,
    periodo_dias: null, base_data: null,
  });
  await put('planos', {
    id: uid(), equipamento_id: equipsSeed[1].id, nome: 'Troca de filtros',
    periodo_horimetro: 250, base_horimetro: 9700, periodo_km: null, base_km: null,
    periodo_dias: null, base_data: null,
  });

  return true;
}

// Constantes de domínio (usadas nos formulários)
export const TIPOS_EQUIPAMENTO = [
  'Caminhão Basculante', 'Caminhão Pipa', 'Pá Carregadeira', 'Motoniveladora',
  'Escavadeira Hidráulica', 'Trator', 'Comboio', 'Outros',
];
export const STATUS_EQUIPAMENTO = ['Operando', 'Manutenção', 'Parado', 'Inativo'];
export const STATUS_OPERADOR = ['Ativo', 'Afastado', 'Inativo'];
export const TIPOS_MANUTENCAO = [
  'Preventiva', 'Corretiva', 'Inspeção', 'Lubrificação', 'Pneus', 'Freios',
  'Motor', 'Transmissão', 'Elétrica', 'Hidráulica', 'Outros',
];
export const PERFIS = ['Administrador', 'Gestor', 'Operador', 'Visualização'];
