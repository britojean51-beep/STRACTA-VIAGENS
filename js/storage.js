/* ============================================================
   STRACTA · Camada de dados (localStorage)
   Todos os dados ficam salvos no próprio celular.
   ============================================================ */
const DB_KEY = "stracta_frota_v1";

/* Link do App da Web da planilha (Google Sheets) já embutido:
   assim todo celular novo abre o app com a sincronização pronta,
   sem ninguém precisar colar o link. Pode ser trocado no Índice. */
const SHEETS_URL_PADRAO = "https://script.google.com/macros/s/AKfycbzUF4TumqnMtrZbu5WHrj3_RHA3zEEW6rGsG8cBEzZoKSzn9_zATgWBRzvlA_ZujRK2/exec";

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
      status: {},                      // { "CB-17": "operando"|"reserva"|"manutencao"|"final_expediente" }
      operadorEquip: {},               // { "CB-17": "Saulo" } — quem está no equipamento
      proximaRevisao: {},              // { "CB-17": 20000 } — horímetro/KM alvo da próxima revisão
      /* Períodos de manutenção: abrem quando o equipamento é apontado em manutenção
         e fecham quando volta. Objeto (e não lista) para a nuvem mesclar chave por
         chave: dois celulares fechando períodos diferentes não se apagam. */
      paradas: {},                     // { "<id>": { equipamento, entradaDia, entradaHora, saidaDia, saidaHora, minutos } }
      config: {                        // metas de gestão
        metaMedia: 1.0,                // km/L mínimo esperado (equipamento rodante)
        metaLh: 20,                    // L/h máximo aceito (equipamento de horímetro)
        metaViagens: 140,              // meta de viagens/dia da frota
        estoqueMin: 1000,              // litros: alerta de diesel baixo (cada tanque)
        estoqueArlaMin: 100,           // litros: alerta de ARLA baixo
        sheetsUrl: SHEETS_URL_PADRAO,  // URL do Web App (Google Sheets) para sincronizar
        nuvem: true,                   // dados na nuvem: vem ligada de fábrica
        nuvemManual: false             // vira true quando alguém mexe na chavinha
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
    // aparelho que já usava o app sem link configurado também recebe o padrão
    if (!this._cache.config.sheetsUrl) this._cache.config.sheetsUrl = SHEETS_URL_PADRAO;
    // a nuvem passou a vir ligada: quem nunca mexeu na chavinha é ligado agora;
    // quem desligou de propósito (nuvemManual) continua como escolheu
    if (!this._cache.config.nuvemManual) this._cache.config.nuvem = true;
    this._cache.status = data.status || {};
    this._cache.proximaRevisao = data.proximaRevisao || {};
    this._cache.tipoEquip = data.tipoEquip || {};
    this._cache.operadorEquip = data.operadorEquip || {};
    this._cache.paradas = data.paradas || {};
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

  /* Substitui toda a base por um backup (Configurações → Restaurar backup).
     Passa pelo padrão para um backup antigo ganhar os campos novos. */
  restaurar(dados) {
    const base = this._default();
    const novo = Object.assign(base, dados);
    novo.config = Object.assign(base.config, dados.config || {});
    localStorage.setItem(DB_KEY, JSON.stringify(novo));
    this._cache = null;
    return this.load();
  },

  /* Soma vários dias num resumo só (Resumo por Mês da planilha).
     As médias são recalculadas pelos totais — nunca média de médias. */
  resumoPeriodo(dias) {
    const t = { diesel: 0, dieselS10: 0, dieselS500: 0, arla: 0, km: 0, viagens: 0, horas: 0, toneladas: 0 };
    const equip = new Set(), oper = new Set(), manut = new Set();
    let comLancamento = 0;
    dias.forEach(iso => {
      const r = this.resumoDia(iso);
      if (r.operando.length || r.manutencao.length) comLancamento++;
      t.diesel += r.diesel; t.dieselS10 += r.dieselS10; t.dieselS500 += r.dieselS500;
      t.arla += r.arla; t.km += r.km; t.viagens += r.viagens;
      t.horas += r.horas; t.toneladas += r.toneladas;
      r.operando.forEach(e => equip.add(e));
      r.operadores.forEach(o => oper.add(o));
      r.manutencao.forEach(m => manut.add(m));
    });
    return Object.assign(t, {
      dias: comLancamento,
      media: t.diesel > 0 ? t.km / t.diesel : 0,
      lh: t.horas > 0 ? t.diesel / t.horas : 0,
      lton: t.toneladas > 0 ? t.diesel / t.toneladas : 0,
      operando: [...equip], operadores: [...oper], manutencao: [...manut]
    });
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
    this._nuvem(C => C.patch("operacao", { estado: { [equip]: db.estado[equip] } }));
  },

  /* Situação escolhida no abastecimento → status do equipamento */
  statusDaSituacao(sit) {
    return {
      // as duas de hoje
      "Operando": "operando",
      "Manutenção": "manutencao",
      // as antigas continuam valendo: já existem lançamentos gravados com elas
      "Continua em operação": "operando",
      "Retorno de manutenção": "operando",
      "Saída para manutenção": "manutencao",
      "Reserva": "reserva",
      "Parado": "reserva",   // Parado saiu; o que era Parado vira Reserva
      "Final de expediente": "final_expediente"
    }[sit] || "operando";
  },

  /* ---- Ponte com a nuvem (js/cloud.js). Sem nuvem ligada, não faz nada. ---- */
  _nuvem(fn) {
    if (typeof Cloud === "undefined" || !Cloud.ligada()) return;   // ativa() não: offline vai para a fila
    try { fn(Cloud); } catch (e) { /* a nuvem nunca pode derrubar o lançamento */ }
  },
  _quem() {
    return (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario.email) || "";
  },
  _novoId() { return Date.now() + "-" + Math.random().toString(36).slice(2, 7); },

  /* ---- Abastecimento ---- */
  addAbastecimento(iso, reg) {
    const db = this.load();
    if (!db.dias[iso]) db.dias[iso] = { abastecimentos: [], viagens: [], manutencoes: [] };
    reg.id = this._novoId();
    reg.criadoPor = reg.criadoPor || this._quem();
    db.dias[iso].abastecimentos.push(reg);
    // atualiza acumulado (KM pode ser nulo em equipamento de horímetro)
    this.setUltimo(reg.equipamento, reg.kmFinal, reg.horimetroFinal);
    // desconta o tanque de diesel correto
    const tanque = reg.combustivel === "S-500" ? "s500" : "s10";
    const litros = Number(reg.litros) || 0;
    db.estoque[tanque] = Math.max(0, (db.estoque[tanque] || 0) - litros);
    // desconta o ARLA 32
    const arla = Number(reg.litrosArla) || 0;
    if (arla) db.estoque.arla = Math.max(0, (db.estoque.arla || 0) - arla);
    this.save();
    // aplica o status conforme a situação — o horário é o que a pessoa digitou no lançamento
    if (reg.situacao) {
      this.setStatus(reg.equipamento, this.statusDaSituacao(reg.situacao),
                     { dia: iso, hora: reg.hora, origem: "abastecimento" });
    }
    this._nuvem(C => {
      C.push("abastecimentos", iso, reg);
      if (litros) C.ajustarEstoque(tanque, -litros);
      if (arla) C.ajustarEstoque("arla", -arla);
    });
    return reg;
  },

  /* ---- Viagens ---- */
  addViagem(iso, reg) {
    const db = this.load();
    if (!db.dias[iso]) db.dias[iso] = { abastecimentos: [], viagens: [], manutencoes: [] };
    reg.id = this._novoId();
    reg.criadoPor = reg.criadoPor || this._quem();
    db.dias[iso].viagens.push(reg);
    this.save();
    this._nuvem(C => C.push("viagens", iso, reg));
    return reg;
  },

  /* ---- Manutenção ---- */
  addManutencao(iso, reg) {
    const db = this.load();
    if (!db.dias[iso]) db.dias[iso] = { abastecimentos: [], viagens: [], manutencoes: [] };
    reg.id = this._novoId();
    reg.criadoPor = reg.criadoPor || this._quem();
    db.dias[iso].manutencoes.push(reg);
    this.save();
    this._nuvem(C => C.push("manutencoes", iso, reg));
    return reg;
  },

  /* ---- Excluir registro genérico ---- */
  excluir(iso, tipo, id) {
    const db = this.load();
    const dia = db.dias[iso];
    if (!dia || !dia[tipo]) return;
    dia[tipo] = dia[tipo].filter(r => r.id !== id);
    this.save();
    this._nuvem(C => C.remover(tipo, id));
  },

  /* ---- Editar abastecimento ---- */
  atualizarAbastecimento(iso, id, reg) {
    const db = this.load();
    const dia = db.dias[iso];
    if (!dia) return;
    const idx = dia.abastecimentos.findIndex(r => r.id === id);
    if (idx >= 0) {
      reg.id = id;
      reg.criadoPor = reg.criadoPor || dia.abastecimentos[idx].criadoPor || this._quem();
      dia.abastecimentos[idx] = reg;
      this.setUltimo(reg.equipamento, reg.kmFinal, reg.horimetroFinal);
      this.save();
      this._nuvem(C => C.push("abastecimentos", iso, reg));
    }
  },

  /* ---- Estoques dos tanques (tipo: 's10' | 's500' | 'arla') ---- */
  getEstoque(tipo) { return this.load().estoque[tipo] || 0; },
  setEstoque(tipo, litros) {
    const db = this.load();
    db.estoque[tipo] = Number(litros) || 0;
    this.save();
    this._nuvem(C => C.patch("estoque", { [tipo]: db.estoque[tipo] }));
  },
  addEstoque(tipo, litros) {
    const db = this.load();
    const delta = Number(litros) || 0;
    db.estoque[tipo] = (db.estoque[tipo] || 0) + delta;
    this.save();
    this._nuvem(C => C.ajustarEstoque(tipo, delta));
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
    this._nuvem(C => C.patch("frota", { tipoEquip: { [eq]: tipo } }));
  },

  /* ---- Status e revisão por equipamento ---- */
  /* "Parado" saiu do app. Normalizo na leitura, e não apagando o que está
     gravado: equipamento antigo — ou vindo da nuvem de um celular que ainda
     não atualizou — aparece como Reserva sem quebrar nada. */
  getStatus(eq) {
    const st = this.load().status[eq] || "operando";
    return st === "parado" ? "reserva" : st;
  },
  /* Único lugar que muda o status — e por isso o único que precisa saber abrir e
     fechar o período de manutenção. Abastecimento, tela de Manutenção e Ficha
     passam todos por aqui. opts: { dia, hora, origem } */
  setStatus(eq, st, opts) {
    const db = this.load();
    const anterior = db.status[eq] || "operando";
    const o = opts || {};
    const dia = o.dia || this.hojeISO();
    const hora = o.hora || this.horaAgora();
    let parada = null, id = null;

    if (st === "manutencao" && anterior !== "manutencao") {
      id = this._novoId();
      parada = {
        equipamento: eq, entradaDia: dia, entradaHora: hora,
        saidaDia: null, saidaHora: null, minutos: null,
        origem: o.origem || "", quem: this._quem()
      };
      db.paradas[id] = parada;
    } else if (anterior === "manutencao" && st !== "manutencao") {
      id = this._idParadaAberta(eq);
      if (id) {
        parada = db.paradas[id];
        parada.saidaDia = dia;
        parada.saidaHora = hora;
        parada.minutos = this._minutosEntre(parada.entradaDia, parada.entradaHora, dia, hora);
      }
    }

    db.status[eq] = st;
    this.save();
    this._nuvem(C => {
      const dados = { status: { [eq]: st } };
      if (id && parada) dados.paradas = { [id]: parada };
      C.patch("operacao", dados);
    });
  },

  /* ---- Histórico de manutenção (entrada e saída) ---- */
  horaAgora() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  },
  _minutosEntre(dia1, hora1, dia2, hora2) {
    const t = (iso, hm) => {
      const [y, m, d] = String(iso).split("-").map(Number);
      const [hh, mm] = String(hm || "00:00").split(":").map(Number);
      return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0).getTime();
    };
    return Math.max(0, Math.round((t(dia2, hora2) - t(dia1, hora1)) / 60000));
  },
  _idParadaAberta(eq) {
    const p = this.load().paradas;
    // o mais recente primeiro: se sobrou algum aberto antigo, fecha o certo
    return Object.keys(p)
      .filter(id => p[id].equipamento === eq && !p[id].saidaDia)
      .sort((a, b) => (p[a].entradaDia + p[a].entradaHora < p[b].entradaDia + p[b].entradaHora ? 1 : -1))[0] || null;
  },
  paradaAberta(eq) {
    const id = this._idParadaAberta(eq);
    return id ? Object.assign({ id }, this.load().paradas[id]) : null;
  },
  /* Períodos ordenados do mais novo para o mais antigo. Sem eq, traz de toda a frota. */
  paradasDe(eq, limite) {
    const p = this.load().paradas;
    const lista = Object.keys(p)
      .filter(id => !eq || p[id].equipamento === eq)
      .map(id => Object.assign({ id }, p[id]))
      .sort((a, b) => (a.entradaDia + a.entradaHora < b.entradaDia + b.entradaHora ? 1 : -1));
    return limite ? lista.slice(0, limite) : lista;
  },
  /* Texto do tempo parado: "3 h 20 min", "2 d 4 h". Em aberto, conta até agora. */
  duracaoParada(p) {
    if (!p) return "";
    const min = p.saidaDia
      ? (p.minutos != null ? p.minutos : this._minutosEntre(p.entradaDia, p.entradaHora, p.saidaDia, p.saidaHora))
      : this._minutosEntre(p.entradaDia, p.entradaHora, this.hojeISO(), this.horaAgora());
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    if (d > 0) return `${d} d ${h} h`;
    if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
    return `${m} min`;
  },
  getProximaRevisao(eq) { const v = this.load().proximaRevisao[eq]; return v == null ? null : v; },
  setProximaRevisao(eq, valor) {
    const db = this.load();
    if (valor === "" || valor == null) delete db.proximaRevisao[eq];
    else db.proximaRevisao[eq] = this.toN(valor);
    this.save();
    this._nuvem(C => C.patch("frota", { proximaRevisao: db.proximaRevisao }));
  },

  /* ---- Metas de gestão ---- */
  setConfig(patch) {
    const db = this.load(); Object.assign(db.config, patch); this.save();
    const compartilhado = Object.assign({}, patch); delete compartilhado.nuvem;  // a chave é de cada aparelho
    if (Object.keys(compartilhado).length) this._nuvem(C => C.patch("frota", { config: compartilhado }));
  },

  /* ---- Série dos últimos N dias (para gráficos/tendências) ---- */
  serie(n = 7) {
    const dias = this.listaDias().slice(0, n).reverse(); // do mais antigo ao mais novo
    return dias.map(iso => Object.assign({ iso }, this.resumoDia(iso)));
  },

  /* ---- Agrupamento por semana e por mês (Relatório) ---- */
  addDias(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  },
  /* segunda-feira da semana do dia informado */
  inicioSemana(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // 0 = segunda
    return this.addDias(iso, -dow);
  },
  semanasDisponiveis() {
    const grupos = {};
    this.listaDias().forEach(iso => { (grupos[this.inicioSemana(iso)] ||= []).push(iso); });
    return Object.keys(grupos).sort().reverse().map(ini => ({
      chave: ini,
      label: `${this.fmtBR(ini).slice(0, 5)} a ${this.fmtBR(this.addDias(ini, 6)).slice(0, 5)}`,
      dias: grupos[ini].sort()
    }));
  },
  mesesDisponiveis() {
    const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                   "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const grupos = {};
    this.listaDias().forEach(iso => { (grupos[iso.slice(0, 7)] ||= []).push(iso); });
    return Object.keys(grupos).sort().reverse().map(k => {
      const [y, m] = k.split("-").map(Number);
      return { chave: k, label: `${MESES[m - 1]}/${y}`, dias: grupos[k].sort() };
    });
  },

  /* ---- Totais por equipamento para uma lista qualquer de dias ---- */
  totaisPorEquipamento(dias) {
    const mapa = {};
    const pega = eq => (mapa[eq] ||= { eq, diesel: 0, horas: 0, km: 0, viagens: 0, toneladas: 0 });
    dias.forEach(iso => {
      const d = this.getDia(iso) || { abastecimentos: [], viagens: [] };
      (d.abastecimentos || []).forEach(a => {
        const m = pega(a.equipamento);
        m.diesel += this.toN(a.litros);
        m.horas += this.toN(a.horasTrabalhadas);
        m.km += this.toN(a.kmRodado);
      });
      (d.viagens || []).forEach(v => { pega(v.equipamento).viagens += this.toN(v.quantidade); });
      // tonelagem por equipamento no dia (viagens têm prioridade)
      const equipsDoDia = new Set([
        ...(d.abastecimentos || []).map(a => a.equipamento),
        ...(d.viagens || []).map(v => v.equipamento)
      ]);
      equipsDoDia.forEach(eq => { pega(eq).toneladas += this.tonEquipDia(eq, iso); });
    });
    return Object.values(mapa).map(m => ({
      eq: m.eq, diesel: m.diesel, horas: m.horas, km: m.km, viagens: m.viagens, toneladas: m.toneladas,
      lh: m.horas > 0 ? m.diesel / m.horas : 0,
      lton: m.toneladas > 0 ? m.diesel / m.toneladas : 0,
      media: m.diesel > 0 ? m.km / m.diesel : 0
    }));
  },

  /* ---- Totais por OPERADOR para uma lista de dias (espelha o de equipamento) ---- */
  totaisPorOperador(dias) {
    const mapa = {};
    const pega = nome => (mapa[nome] ||= { operador: nome, diesel: 0, horas: 0, km: 0, viagens: 0, toneladas: 0, equipamentos: new Set() });
    dias.forEach(iso => {
      const d = this.getDia(iso) || { abastecimentos: [], viagens: [] };
      (d.abastecimentos || []).forEach(a => {
        if (!a.motorista) return;
        const m = pega(a.motorista);
        m.diesel += this.toN(a.litros);
        m.horas += this.toN(a.horasTrabalhadas);
        m.km += this.toN(a.kmRodado);
        m.equipamentos.add(a.equipamento);
      });
      (d.viagens || []).forEach(v => {
        if (!v.motorista) return;
        const m = pega(v.motorista);
        m.viagens += this.toN(v.quantidade);
        m.toneladas += this.toN(v.pesoTotal);
        m.equipamentos.add(v.equipamento);
      });
      // sem peso nas viagens, usa o campo toneladas do abastecimento
      (d.abastecimentos || []).forEach(a => {
        if (!a.motorista) return;
        const temPeso = (d.viagens || []).some(v => v.motorista === a.motorista && this.toN(v.pesoTotal) > 0);
        if (!temPeso) pega(a.motorista).toneladas += this.toN(a.toneladas);
      });
    });
    return Object.values(mapa).map(m => ({
      operador: m.operador,
      equipamentos: [...m.equipamentos],
      diesel: m.diesel, horas: m.horas, km: m.km, viagens: m.viagens, toneladas: m.toneladas,
      lh: m.horas > 0 ? m.diesel / m.horas : 0,
      lton: m.toneladas > 0 ? m.diesel / m.toneladas : 0,
      media: m.diesel > 0 ? m.km / m.diesel : 0
    }));
  },

  /* Ranking dos últimos N dias (Índice) — usa o helper acima */
  rankingEquipamentos(n = 7) {
    return this.totaisPorEquipamento(this.listaDias().slice(0, n));
  },

  /* ---- As duas medidas de um lançamento ----
     O caminhão registra horímetro JUNTO com o KM, então dá para saber o km/L e o
     L/h dele sem gravar nada novo — inclusive no que já está lançado. */
  lhDoLancamento(a) {
    const horas = this.toN(a.horasTrabalhadas), litros = this.toN(a.litros);
    return horas > 0 ? litros / horas : 0;
  },
  kmLDoLancamento(a) {
    const km = this.toN(a.kmRodado), litros = this.toN(a.litros);
    return litros > 0 ? km / litros : 0;
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
      // as duas medidas, sempre: o caminhão tem km/L e L/h
      lh: totHoras > 0 ? totDiesel / totHoras : 0,
      kmL: totDiesel > 0 ? totKm / totDiesel : 0,
      ultimo: this.ultimo(eq),
      status: this.getStatus(eq),
      proximaRevisao: this.getProximaRevisao(eq)
    };
  },

  /* Um tanque que a empresa não usa vive zerado — e zero é sempre "abaixo do
     mínimo". Sem isso o app avisaria todo dia sobre um tanque que ninguém enche.
     Em uso = tem saldo, ou já saiu combustível dele em algum lançamento. */
  tanqueEmUso(tipo) {
    const db = this.load();
    if ((db.estoque[tipo] || 0) > 0) return true;
    const rotulo = tipo === "s500" ? "S-500" : "S-10";
    return Object.keys(db.dias).some(iso =>
      (db.dias[iso].abastecimentos || []).some(a => tipo === "arla"
        ? this.toN(a.litrosArla) > 0
        : (a.combustivel || "S-10") === rotulo));
  },
  /* Tanques de diesel no mínimo (ou abaixo), ignorando os que não estão em uso. */
  dieselNoMinimo() {
    const db = this.load();
    return [["s10", "Diesel S-10"], ["s500", "Diesel S-500"]]
      .filter(([t]) => this.tanqueEmUso(t) && (db.estoque[t] || 0) <= db.config.estoqueMin)
      .map(([t, nome]) => ({ tanque: t, nome, litros: db.estoque[t] || 0, minimo: db.config.estoqueMin }));
  },

  /* ---- Alertas automáticos da frota ---- */
  alertas() {
    const db = this.load();
    const iso = this.garantirDiaAtual();
    const out = [];
    const push = (nivel, icone, msg) => out.push({ nivel, icone, msg }); // nivel: 'alto' | 'medio'

    // estoque baixo (por tanque em uso)
    this.dieselNoMinimo().forEach(t =>
      push("alto", "🛢️", `${t.nome} baixo: ${Math.round(t.litros)} L (mínimo ${t.minimo} L)`));
    if (this.tanqueEmUso("arla") && db.estoque.arla <= db.config.estoqueArlaMin)
      push("medio", "💧", `ARLA 32 baixo: ${Math.round(db.estoque.arla)} L (mínimo ${db.config.estoqueArlaMin} L)`);

    const dia = this.getDia(iso) || { abastecimentos: [] };
    db.equipamentos.forEach(eq => {
      // equipamento em manutenção
      const st = this.getStatus(eq);
      if (st === "manutencao") {
        const ab = this.paradaAberta(eq);
        push("medio", "🔧", ab
          ? `${eq} está em MANUTENÇÃO desde ${this.fmtBR(ab.entradaDia).slice(0, 5)} ${ab.entradaHora} (${this.duracaoParada(ab)})`
          : `${eq} está em MANUTENÇÃO`);
      }

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
    if (nome && !db.equipamentos.includes(nome)) {
      db.equipamentos.push(nome);
      this.save();
      this._nuvem(C => C.patch("frota", { equipamentos: db.equipamentos }));
    }
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
    this._nuvem(C => {
      C.patch("frota", { equipamentos: db.equipamentos, tipoEquip: db.tipoEquip, proximaRevisao: db.proximaRevisao });
      C.patch("operacao", { status: db.status, estado: db.estado });
    });
  },
  /* Quem está em cada equipamento: usado para preencher o operador sozinho. */
  getOperadorEquip(eq) { return this.load().operadorEquip[eq] || ""; },
  setOperadorEquip(eq, nome) {
    const db = this.load();
    if (nome) db.operadorEquip[eq] = nome; else delete db.operadorEquip[eq];
    this.save();
    this._nuvem(C => C.patch("operacao", { operadorEquip: db.operadorEquip }));
  },
  equipDoOperador(nome) {
    const m = this.load().operadorEquip;
    return Object.keys(m).filter(eq => m[eq] === nome);
  },
  /* Quantos lançamentos a pessoa tem — para avisar antes de apagar. */
  lancamentosDoOperador(nome) {
    const db = this.load();
    let n = 0;
    Object.values(db.dias).forEach(d => {
      n += (d.abastecimentos || []).filter(a => a.motorista === nome).length;
      n += (d.viagens || []).filter(v => v.motorista === nome).length;
    });
    return n;
  },
  /* Tira o operador da lista. O histórico dos dias fica intacto. */
  removerMotorista(nome) {
    const db = this.load();
    db.motoristas = db.motoristas.filter(m => m !== nome);
    Object.keys(db.operadorEquip).forEach(eq => {
      if (db.operadorEquip[eq] === nome) delete db.operadorEquip[eq];
    });
    this.save();
    this._nuvem(C => {
      C.patch("frota", { motoristas: db.motoristas });
      C.patch("operacao", { operadorEquip: db.operadorEquip });
    });
  },
  /* Abastecedores: mesma lógica dos operadores. Apagar não mexe no histórico. */
  addAbastecedor(nome) {
    const db = this.load();
    nome = nome.trim();
    if (nome && !db.abastecedores.includes(nome)) {
      db.abastecedores.push(nome);
      this.save();
      this._nuvem(C => C.patch("frota", { abastecedores: db.abastecedores }));
    }
  },
  removerAbastecedor(nome) {
    const db = this.load();
    db.abastecedores = db.abastecedores.filter(a => a !== nome);
    this.save();
    this._nuvem(C => C.patch("frota", { abastecedores: db.abastecedores }));
  },
  lancamentosDoAbastecedor(nome) {
    let n = 0;
    Object.values(this.load().dias).forEach(d => {
      n += (d.abastecimentos || []).filter(a => a.abastecedor === nome).length;
    });
    return n;
  },

  addMotorista(nome) {
    const db = this.load();
    nome = nome.trim();
    if (nome && !db.motoristas.includes(nome)) {
      db.motoristas.push(nome);
      this.save();
      this._nuvem(C => C.patch("frota", { motoristas: db.motoristas }));
    }
  },

  /* ---- Reset total ---- */
  reset() {
    this._cache = this._default();
    this.save();
  }
};
