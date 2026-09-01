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
      estoque: { s10: 4250, s500: 0, arla: 500 }, // litros por tanque
      tipoEquip: {},                   // { "CB-17": "km_horimetro"|"horimetro" }
      status: {},                      // { "CB-17": "operando"|"reserva"|"manutencao"|"parado"|"final_expediente" }
      proximaRevisao: {},              // { "CB-17": 20000 } — horímetro/KM alvo da próxima revisão
      config: {                        // metas de gestão
        metaMedia: 1.0,                // km/L mínimo esperado (equipamento rodante)
        metaLh: 20,                    // L/h máximo aceito (equipamento de horímetro)
        metaViagens: 140,              // meta de viagens/dia da frota
        estoqueMin: 1000,              // litros: alerta de diesel baixo (cada tanque)
        estoqueArlaMin: 100,           // litros: alerta de ARLA baixo
        sheetsUrl: ""                  // URL do Web App (Google Sheets) para sincronizar
      },
      syncPend: []                     // fila de operações pendentes de envio à planilha
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
    this._cache.tipoEquip = data.tipoEquip || {};
    // estoque: migra o antigo estoqueTanque (único) para o novo formato por tanque
    if (data.estoque) {
      this._cache.estoque = Object.assign({ s10: 0, s500: 0, arla: 0 }, data.estoque);
    } else {
      this._cache.estoque = {
        s10: data.estoqueTanque != null ? data.estoqueTanque : base.estoque.s10,
        s500: 0,
        arla: base.estoque.arla
      };
    }
    delete this._cache.estoqueTanque;
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
    // "Final de expediente" do dia que fecha vira "Reserva" no novo dia
    Object.keys(db.status).forEach(eq => {
      if (db.status[eq] === "final_expediente") db.status[eq] = "reserva";
    });
    const atual = db.diaAtual || this.hojeISO();
    const proximo = dataAlvo || this.proximoDia(atual);
    if (!db.dias[proximo]) {
      db.dias[proximo] = { abastecimentos: [], viagens: [], manutencoes: [] };
    }
    db.diaAtual = proximo;
    this.save();
    return { anterior: atual, novo: proximo };
  },

  /* Tonelagem do equipamento no dia — prioriza o peso das VIAGENS;
     se não houver viagem, usa o campo "toneladas" do abastecimento (pá/carregadeira). */
  tonEquipDia(eq, iso) {
    const d = this.getDia(iso) || { abastecimentos: [], viagens: [] };
    const pesoViagens = (d.viagens || []).filter(v => v.equipamento === eq)
      .reduce((s, v) => s + this.toN(v.pesoTotal), 0);
    if (pesoViagens > 0) return pesoViagens;
    return (d.abastecimentos || []).filter(a => a.equipamento === eq)
      .reduce((s, a) => s + this.toN(a.toneladas), 0);
  },
  /* L/Ton do equipamento no dia = litros abastecidos ÷ tonelagem do dia */
  ltonEquipDia(eq, iso) {
    const d = this.getDia(iso) || { abastecimentos: [] };
    const litros = (d.abastecimentos || []).filter(a => a.equipamento === eq)
      .reduce((s, a) => s + this.toN(a.litros), 0);
    const ton = this.tonEquipDia(eq, iso);
    return ton > 0 ? litros / ton : 0;
  },

  /* Resumo consolidado de um dia (reutilizado no Novo Dia, painel, etc.) */
  resumoDia(iso) {
    const d = this.getDia(iso) || { abastecimentos: [], viagens: [], manutencoes: [] };
    const toN = v => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
    let diesel = 0, dieselS10 = 0, dieselS500 = 0, arla = 0, km = 0, viagens = 0, horas = 0, toneladas = 0;
    const operando = new Set();
    const operadores = new Set();
    d.abastecimentos.forEach(a => {
      const l = toN(a.litros);
      diesel += l;
      if (a.combustivel === "S-500") dieselS500 += l; else dieselS10 += l;
      arla += toN(a.litrosArla);
      km += toN(a.kmRodado); horas += toN(a.horasTrabalhadas);
      operando.add(a.equipamento);
      if (a.motorista) operadores.add(a.motorista);
    });
    d.viagens.forEach(v => { viagens += toN(v.quantidade); operando.add(v.equipamento); if (v.motorista) operadores.add(v.motorista); });
    // tonelagem do dia: soma por equipamento (viagens têm prioridade sobre o campo do abastecimento)
    toneladas = [...operando].reduce((s, eq) => s + this.tonEquipDia(eq, iso), 0);
    const manutencao = [...new Set(d.manutencoes.map(m => m.equipamento))];
    return {
      diesel, dieselS10, dieselS500, arla, km, viagens, horas, toneladas,
      media: diesel > 0 ? km / diesel : 0,
      lh: horas > 0 ? diesel / horas : 0,
      lton: toneladas > 0 ? diesel / toneladas : 0,
      operando: [...operando], operadores: [...operadores], manutencao
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

  /* Situação escolhida no abastecimento → status do equipamento */
  statusDaSituacao(sit) {
    return {
      "Continua em operação": "operando",
      "Retorno de manutenção": "operando",
      "Saída para manutenção": "manutencao",
      "Reserva": "reserva",
      "Final de expediente": "final_expediente"
    }[sit] || "operando";
  },

  /* ---- Abastecimento ---- */
  addAbastecimento(iso, reg) {
    const db = this.load();
    if (!db.dias[iso]) db.dias[iso] = { abastecimentos: [], viagens: [], manutencoes: [] };
    reg.id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    db.dias[iso].abastecimentos.push(reg);
    // atualiza acumulado (KM pode ser nulo em equipamento de horímetro)
    this.setUltimo(reg.equipamento, reg.kmFinal, reg.horimetroFinal);
    // desconta o tanque de diesel correto
    const tanque = reg.combustivel === "S-500" ? "s500" : "s10";
    db.estoque[tanque] = Math.max(0, (db.estoque[tanque] || 0) - (Number(reg.litros) || 0));
    // desconta o ARLA 32
    if (reg.litrosArla) db.estoque.arla = Math.max(0, (db.estoque.arla || 0) - (Number(reg.litrosArla) || 0));
    // aplica o status conforme a situação
    if (reg.situacao) db.status[reg.equipamento] = this.statusDaSituacao(reg.situacao);
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

  /* ---- Estoques dos tanques (tipo: 's10' | 's500' | 'arla') ---- */
  getEstoque(tipo) { return this.load().estoque[tipo] || 0; },
  setEstoque(tipo, litros) {
    const db = this.load();
    db.estoque[tipo] = Number(litros) || 0;
    this.save();
  },
  addEstoque(tipo, litros) {
    const db = this.load();
    db.estoque[tipo] = (db.estoque[tipo] || 0) + (Number(litros) || 0);
    this.save();
  },

  /* ---- Tipo de medição do equipamento ---- */
  getTipoEquip(eq) {
    const t = this.load().tipoEquip[eq];
    if (t) return t;
    return /^CB/i.test(eq) ? "km_horimetro" : "horimetro"; // padrão pelo código
  },
  setTipoEquip(eq, tipo) {
    const db = this.load();
    db.tipoEquip[eq] = tipo;
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
    // tonelagem total (por dia, viagens têm prioridade) e L/Ton geral
    const totToneladas = dias.reduce((s, iso) => s + this.tonEquipDia(eq, iso), 0);
    const tipo = this.getTipoEquip(eq);
    return {
      equip: eq, abast, viag, manut,
      totDiesel, totKm, totHoras, totViag, totToneladas,
      lton: totToneladas > 0 ? totDiesel / totToneladas : 0,
      tipo,
      unidadeMedia: tipo === "horimetro" ? "L/h" : "km/L",
      media: tipo === "horimetro"
        ? (totHoras > 0 ? totDiesel / totHoras : 0)   // L/h
        : (totDiesel > 0 ? totKm / totDiesel : 0),    // km/L
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

    // estoque baixo (por tanque)
    if (db.estoque.s10 <= db.config.estoqueMin)
      push("alto", "🛢️", `Diesel S-10 baixo: ${Math.round(db.estoque.s10)} L (mínimo ${db.config.estoqueMin} L)`);
    if (db.estoque.s500 <= db.config.estoqueMin)
      push("alto", "🛢️", `Diesel S-500 baixo: ${Math.round(db.estoque.s500)} L (mínimo ${db.config.estoqueMin} L)`);
    if (db.estoque.arla <= db.config.estoqueArlaMin)
      push("medio", "💧", `ARLA 32 baixo: ${Math.round(db.estoque.arla)} L (mínimo ${db.config.estoqueArlaMin} L)`);

    const dia = this.getDia(iso) || { abastecimentos: [] };
    db.equipamentos.forEach(eq => {
      // status parado / manutenção
      const st = this.getStatus(eq);
      if (st === "parado") push("alto", "⛔", `${eq} está PARADO`);
      else if (st === "manutencao") push("medio", "🔧", `${eq} está em MANUTENÇÃO`);

      // consumo fora da meta (no dia atual) — km/L (mínimo) ou L/h (máximo)
      dia.abastecimentos.filter(a => a.equipamento === eq).forEach(a => {
        const m = this.toN(a.media);
        if (a.unidadeMedia === "L/h") {
          if (m > 0 && m > db.config.metaLh)
            push("medio", "📈", `${eq}: consumo ${a.media} L/h acima da meta (${db.config.metaLh})`);
        } else {
          if (m > 0 && m < db.config.metaMedia)
            push("medio", "📉", `${eq}: média ${a.media} km/L abaixo da meta (${db.config.metaMedia})`);
        }
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
  /* Remove o equipamento da frota. Mantém o histórico nos dias/relatórios. */
  removerEquipamento(eq) {
    const db = this.load();
    db.equipamentos = db.equipamentos.filter(e => e !== eq);
    delete db.tipoEquip[eq];
    delete db.status[eq];
    delete db.proximaRevisao[eq];
    delete db.estado[eq];
    this.save();
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
