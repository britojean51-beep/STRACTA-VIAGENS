/* ============================================================
   STRACTA · Camada de dados (localStorage)
   Todos os dados ficam salvos no próprio celular.
   ============================================================ */
const DB_KEY = "stracta_frota_v1";

const DB = {
  /* ---- Estado padrão ---- */
  _default() {
    return {
      diaAtual: null,                 // "2026-06-30"
      dias: {},                        // { "2026-06-30": { abastecimentos:[], viagens:[], manutencoes:[] } }
      equipamentos: [                  // frota inicial (editável)
        "CB-01", "CB-11", "CB-17", "CB-22",
        "PC-01", "PC-02", "RD-01", "MG-01"
      ],
      motoristas: ["Saulo", "José", "Carlos", "Antônio", "Marcos"],
      abastecedores: ["Pedro", "Luiz"],
      estado: {},                      // { "CB-17": { kmFinal, horimetroFinal } } — último acumulado
      estoqueTanque: 4250,             // litros no tanque
      status: {},                      // { "CB-17": "operando"|"parado"|"manutencao" }
      proximaRevisao: {},              // { "CB-17": 20000 } — horímetro/KM alvo da próxima revisão
      config: {                        // metas de gestão
        metaMedia: 1.0,                // km/L mínimo esperado
        metaViagens: 140,              // meta de viagens/dia da frota
        estoqueMin: 1000               // litros: alerta de estoque baixo
      }
    };
  },

  _cache: null,

  load() {
    if (this._cache) return this._cache;
    let data;
    try {
      const raw = localStorage.getItem(DB_KEY);
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      data = {};
    }
    // mescla com o padrão para dados salvos em versões antigas ganharem os campos novos
    const base = this._default();
    this._cache = Object.assign(base, data);
    this._cache.config = Object.assign(base.config, data.config || {});
    this._cache.status = data.status || {};
    this._cache.proximaRevisao = data.proximaRevisao || {};
    return this._cache;
  },

  toN(v) { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; },

  save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this._cache));
  },

  /* ---- Datas ---- */
  hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  fmtBR(iso) {
    if (!iso) return "--/--/----";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  },
  proximoDia(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  },

  /* ---- Dia ---- */
  getDia(iso) {
    const db = this.load();
    return db.dias[iso] || null;
  },
  listaDias() {
    const db = this.load();
    return Object.keys(db.dias).sort().reverse();
  },
  garantirDiaAtual() {
    const db = this.load();
    if (!db.diaAtual) {
      const hoje = this.hojeISO();
      db.diaAtual = hoje;
      if (!db.dias[hoje]) db.dias[hoje] = { abastecimentos: [], viagens: [], manutencoes: [] };
      this.save();
    }
    return db.diaAtual;
  },

  /* Fecha o dia atual e abre outro (padrão: o próximo).
     O KM/Horímetro finais viram iniciais automaticamente via ultimo(). */
  novoDia(dataAlvo) {
    const db = this.load();
    const atual = db.diaAtual || this.hojeISO();
    const proximo = dataAlvo || this.proximoDia(atual);
    if (!db.dias[proximo]) {
      db.dias[proximo] = { abastecimentos: [], viagens: [], manutencoes: [] };
    }
    db.diaAtual = proximo;
    this.save();
    return { anterior: atual, novo: proximo };
  },

  /* Resumo consolidado de um dia (reutilizado no Novo Dia, painel, etc.) */
  resumoDia(iso) {
    const d = this.getDia(iso) || { abastecimentos: [], viagens: [], manutencoes: [] };
    const toN = v => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
    let diesel = 0, km = 0, viagens = 0, horas = 0;
    const operando = new Set();
    d.abastecimentos.forEach(a => {
      diesel += toN(a.litros); km += toN(a.kmRodado); horas += toN(a.horasTrabalhadas);
      operando.add(a.equipamento);
    });
    d.viagens.forEach(v => { viagens += toN(v.quantidade); operando.add(v.equipamento); });
    const manutencao = [...new Set(d.manutencoes.map(m => m.equipamento))];
    return {
      diesel, km, viagens, horas,
      media: diesel > 0 ? km / diesel : 0,
      operando: [...operando], manutencao
    };
  },

  /* ---- Estado acumulado por equipamento (auto-preenchimento) ---- */
  ultimo(equip) {
    const db = this.load();
    return db.estado[equip] || { kmFinal: null, horimetroFinal: null };
  },
  setUltimo(equip, kmFinal, horimetroFinal) {
    const db = this.load();
    db.estado[equip] = { kmFinal, horimetroFinal };
    this.save();
  },

  /* ---- Abastecimento ---- */
  addAbastecimento(iso, reg) {
    const db = this.load();
    if (!db.dias[iso]) db.dias[iso] = { abastecimentos: [], viagens: [], manutencoes: [] };
    reg.id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    db.dias[iso].abastecimentos.push(reg);
    // atualiza acumulado
    this.setUltimo(reg.equipamento, reg.kmFinal, reg.horimetroFinal);
    // desconta estoque do tanque
    db.estoqueTanque = Math.max(0, (db.estoqueTanque || 0) - (Number(reg.litros) || 0));
    this.save();
    return reg;
  },

  /* ---- Viagens ---- */
  addViagem(iso, reg) {
    const db = this.load();
    if (!db.dias[iso]) db.dias[iso] = { abastecimentos: [], viagens: [], manutencoes: [] };
    reg.id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    db.dias[iso].viagens.push(reg);
    this.save();
    return reg;
  },

  /* ---- Manutenção ---- */
  addManutencao(iso, reg) {
    const db = this.load();
    if (!db.dias[iso]) db.dias[iso] = { abastecimentos: [], viagens: [], manutencoes: [] };
    reg.id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    db.dias[iso].manutencoes.push(reg);
    this.save();
    return reg;
  },

  /* ---- Excluir registro genérico ---- */
  excluir(iso, tipo, id) {
    const db = this.load();
    const dia = db.dias[iso];
    if (!dia || !dia[tipo]) return;
    dia[tipo] = dia[tipo].filter(r => r.id !== id);
    this.save();
  },

  /* ---- Editar abastecimento ---- */
  atualizarAbastecimento(iso, id, reg) {
    const db = this.load();
    const dia = db.dias[iso];
    if (!dia) return;
    const idx = dia.abastecimentos.findIndex(r => r.id === id);
    if (idx >= 0) {
      reg.id = id;
      dia.abastecimentos[idx] = reg;
      this.setUltimo(reg.equipamento, reg.kmFinal, reg.horimetroFinal);
      this.save();
    }
  },

  /* ---- Estoque do tanque ---- */
  setEstoque(litros) {
    const db = this.load();
    db.estoqueTanque = Number(litros) || 0;
    this.save();
  },
  addEstoque(litros) {
    const db = this.load();
    db.estoqueTanque = (db.estoqueTanque || 0) + (Number(litros) || 0);
    this.save();
  },

  /* ---- Status e revisão por equipamento ---- */
  getStatus(eq) { return this.load().status[eq] || "operando"; },
  setStatus(eq, st) { const db = this.load(); db.status[eq] = st; this.save(); },
  getProximaRevisao(eq) { const v = this.load().proximaRevisao[eq]; return v == null ? null : v; },
  setProximaRevisao(eq, valor) {
    const db = this.load();
    if (valor === "" || valor == null) delete db.proximaRevisao[eq];
    else db.proximaRevisao[eq] = this.toN(valor);
    this.save();
  },

  /* ---- Metas de gestão ---- */
  setConfig(patch) { const db = this.load(); Object.assign(db.config, patch); this.save(); },

  /* ---- Série dos últimos N dias (para gráficos/tendências) ---- */
  serie(n = 7) {
    const dias = this.listaDias().slice(0, n).reverse(); // do mais antigo ao mais novo
    return dias.map(iso => Object.assign({ iso }, this.resumoDia(iso)));
  },

  /* ---- Ficha completa de um equipamento (todos os dias) ---- */
  fichaEquipamento(eq) {
    const db = this.load();
    const dias = Object.keys(db.dias).sort();
    const abast = [], viag = [], manut = [];
    dias.forEach(iso => {
      const d = db.dias[iso];
      d.abastecimentos.filter(a => a.equipamento === eq).forEach(a => abast.push(Object.assign({ iso }, a)));
      d.viagens.filter(v => v.equipamento === eq).forEach(v => viag.push(Object.assign({ iso }, v)));
      d.manutencoes.filter(m => m.equipamento === eq).forEach(m => manut.push(Object.assign({ iso }, m)));
    });
    const totDiesel = abast.reduce((s, a) => s + this.toN(a.litros), 0);
    const totKm = abast.reduce((s, a) => s + this.toN(a.kmRodado), 0);
    const totHoras = abast.reduce((s, a) => s + this.toN(a.horasTrabalhadas), 0);
    const totViag = viag.reduce((s, v) => s + this.toN(v.quantidade), 0);
    return {
      equip: eq, abast, viag, manut,
      totDiesel, totKm, totHoras, totViag,
      media: totDiesel > 0 ? totKm / totDiesel : 0,
      ultimo: this.ultimo(eq),
      status: this.getStatus(eq),
      proximaRevisao: this.getProximaRevisao(eq)
    };
  },

  /* ---- Alertas automáticos da frota ---- */
  alertas() {
    const db = this.load();
    const iso = this.garantirDiaAtual();
    const out = [];
    const push = (nivel, icone, msg) => out.push({ nivel, icone, msg }); // nivel: 'alto' | 'medio'

    // estoque baixo
    if ((db.estoqueTanque || 0) <= (db.config.estoqueMin || 0))
      push("alto", "🛢️", `Estoque do tanque baixo: ${Math.round(db.estoqueTanque)} L (mínimo ${db.config.estoqueMin} L)`);

    const dia = this.getDia(iso) || { abastecimentos: [] };
    db.equipamentos.forEach(eq => {
      // status parado / manutenção
      const st = this.getStatus(eq);
      if (st === "parado") push("alto", "⛔", `${eq} está PARADO`);
      else if (st === "manutencao") push("medio", "🔧", `${eq} está em MANUTENÇÃO`);

      // média abaixo da meta (no dia atual)
      dia.abastecimentos.filter(a => a.equipamento === eq).forEach(a => {
        const m = this.toN(a.media);
        if (m > 0 && m < db.config.metaMedia)
          push("medio", "📉", `${eq}: média ${a.media} km/L abaixo da meta (${db.config.metaMedia})`);
      });

      // revisão vencida / próxima
      const rev = this.getProximaRevisao(eq);
      const hor = this.ultimo(eq).horimetroFinal;
      if (rev != null && hor != null) {
        if (hor >= rev) push("alto", "🔴", `${eq}: revisão VENCIDA (horímetro ${Math.round(hor)} ≥ ${rev})`);
        else if (hor >= rev - 50) push("medio", "🟡", `${eq}: revisão próxima (faltam ${Math.round(rev - hor)} h)`);
      }
    });
    return out;
  },

  /* ---- Frota / motoristas ---- */
  addEquipamento(nome) {
    const db = this.load();
    nome = nome.trim().toUpperCase();
    if (nome && !db.equipamentos.includes(nome)) { db.equipamentos.push(nome); this.save(); }
  },
  addMotorista(nome) {
    const db = this.load();
    nome = nome.trim();
    if (nome && !db.motoristas.includes(nome)) { db.motoristas.push(nome); this.save(); }
  },

  /* ---- Reset total ---- */
  reset() {
    this._cache = this._default();
    this.save();
  }
};
