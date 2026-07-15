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
      estoqueTanque: 4250              // litros no tanque
    };
  },

  _cache: null,

  load() {
    if (this._cache) return this._cache;
    try {
      const raw = localStorage.getItem(DB_KEY);
      this._cache = raw ? JSON.parse(raw) : this._default();
    } catch (e) {
      this._cache = this._default();
    }
    return this._cache;
  },

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
