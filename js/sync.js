/* ============================================================
   STRACTA · Sincronização com Google Sheets
   ------------------------------------------------------------
   O app é a FONTE DA VERDADE. Cada registro carrega um _id.
   - Salvar/editar → envia "upsert" (atualiza a mesma linha, não duplica)
   - Excluir       → envia "delete" (remove a linha)
   - "Sincronizar tudo" → reenvia toda a base (seguro, idempotente)

   Envio (POST) usa mode:"no-cors" — resolve quando há internet e
   fica na fila (syncPend) quando está offline, reenviando depois.
   O teste de conexão usa JSONP (GET), que consegue ler a resposta.
   ============================================================ */
const Sync = {
  url() { return (DB.load().config.sheetsUrl || "").trim(); },
  ativo() { return !!this.url(); },
  pendentes() { return (DB.load().syncPend || []).length; },

  /* ---- rótulos de status para a planilha ---- */
  _statusLabel(st) {
    return {
      operando: "Operando", reserva: "Reserva", manutencao: "Manutenção",
      parado: "Parado", final_expediente: "Final de expediente"
    }[st] || "Operando";
  },

  /* ---- mapeamento app → colunas da planilha (nomes = cabeçalhos) ---- */
  lancamentoRow(iso, a) {
    return {
      _id: a.id,
      "Data": iso,
      "Hora": a.hora || "",
      "Equipamento": a.equipamento,
      "Operador": a.motorista || "",
      "Horímetro Inicial": a.horimetroInicial ?? "",
      "Horímetro Final": a.horimetroFinal ?? "",
      "Horas": a.horasTrabalhadas ?? "",
      "Litros": a.litros ?? "",
      "Combustível": a.combustivel || "S-10",
      "ARLA (L)": a.litrosArla || "",
      "KM Rodado": a.kmRodado || "",
      "Média": a.media ?? "",
      "Unidade": a.unidadeMedia || "km/L",
      "Toneladas": DB.tonEquipDia(a.equipamento, iso) || "",
      "L/Ton": DB.ltonEquipDia(a.equipamento, iso).toFixed(2).replace(".", ",") || "",
      "Situação": a.situacao || ""
      // nada de fórmula: o app manda tudo calculado
    };
  },

  viagemRow(iso, v) {
    return {
      _id: v.id,
      "Data": iso,
      "Equipamento": v.equipamento,
      "Operador": v.motorista || "",
      "Origem": v.origem,
      "Destino": v.destino,
      "Viagens": v.quantidade,
      "Material": v.material || "",
      "Peso/viagem (t)": v.pesoViagem ?? "",
      "Peso total (t)": v.pesoTotal ?? ""
    };
  },

  /* ---- Linhas dos resumos (números prontos, sem fórmula) ---- */
  _n(v, casas) { return v ? Number(v).toFixed(casas || 0).replace(".", ",") : (v === 0 ? "0" : ""); },

  resumoDiaRow(iso) {
    const r = DB.resumoDia(iso);
    return {
      "Data": iso,
      "Equipamentos": r.operando.length,
      "Operadores": r.operadores.length,
      "Consumo total (L)": this._n(r.diesel),
      "Horas totais": this._n(r.horas, 1),
      "L/h": this._n(r.lh, 2),
      "Produção (t)": this._n(r.toneladas),
      "L/Ton": this._n(r.lton, 2),
      "Diesel S-10 (L)": this._n(r.dieselS10),
      "Diesel S-500 (L)": this._n(r.dieselS500),
      "ARLA (L)": this._n(r.arla),
      "KM": this._n(r.km),
      "Média km/L": this._n(r.media, 2),
      "Viagens": r.viagens,
      "Manutenções": r.manutencao.length,
      "Quais equipamentos": r.operando.join(", "),
      "Quais operadores": r.operadores.join(", ")
    };
  },
  resumoEquipRows(iso) {
    return DB.totaisPorEquipamento([iso]).map(e => ({
      "Data": iso,
      "Equipamento": e.eq,
      "Consumo (L)": this._n(e.diesel),
      "Horas": this._n(e.horas, 1),
      "L/h": this._n(e.lh, 2),
      "Produção (t)": this._n(e.toneladas),
      "L/Ton": this._n(e.lton, 2),
      "KM": this._n(e.km),
      "Média km/L": this._n(e.media, 2),
      "Viagens": e.viagens
    }));
  },
  resumoOperadorRows(iso) {
    return DB.totaisPorOperador([iso]).map(o => ({
      "Data": iso,
      "Operador": o.operador,
      "Equipamentos": o.equipamentos.join(", "),
      "Consumo (L)": this._n(o.diesel),
      "Horas": this._n(o.horas, 1),
      "L/h": this._n(o.lh, 2),
      "Produção (t)": this._n(o.toneladas),
      "L/Ton": this._n(o.lton, 2),
      "Viagens": o.viagens
    }));
  },
  resumoMesRow(mes) {
    const r = DB.resumoPeriodo(mes.dias);
    return {
      _id: mes.chave,
      "Mês": mes.label,
      "Dias com lançamento": r.dias,
      "Equipamentos": r.operando.length,
      "Operadores": r.operadores.length,
      "Consumo total (L)": this._n(r.diesel),
      "Horas totais": this._n(r.horas, 1),
      "L/h": this._n(r.lh, 2),
      "Produção (t)": this._n(r.toneladas),
      "L/Ton": this._n(r.lton, 2),
      "Diesel S-10 (L)": this._n(r.dieselS10),
      "Diesel S-500 (L)": this._n(r.dieselS500),
      "ARLA (L)": this._n(r.arla),
      "KM": this._n(r.km),
      "Média km/L": this._n(r.media, 2),
      "Viagens": r.viagens,
      "Manutenções": r.manutencao.length,
      "Quais equipamentos": r.operando.join(", "),
      "Quais operadores": r.operadores.join(", ")
    };
  },
  equipamentoRow(eq) {
    const u = DB.ultimo(eq);
    return {
      _id: eq,
      "Código": eq,
      "Tipo": DB.getTipoEquip(eq) === "horimetro" ? "Horímetro (L/h)" : "Rodante (km/L)",
      "Modelo": "",
      "Status": this._statusLabel(DB.getStatus(eq)),
      "Horímetro Atual": u.horimetroFinal ?? "",
      "KM Atual": u.kmFinal ?? ""
    };
  },
  operadorRow(nome) {
    return { _id: nome, "Nome": nome, "Função": "Operador", "Status": "Ativo" };
  },
  manutencaoRow(iso, m) {
    return {
      _id: m.id,
      "Data": iso,
      "Equipamento": m.equipamento,
      "Operador/Responsável": m.responsavel || m.motorista || "",
      "Horímetro": "",
      "KM": m.horKm || "",
      "Tipo": m.tipo || "",
      "Serviço Realizado": m.servico || "",
      "Peças/Trocas": m.pecas || "",
      "Observação": m.observacoes || "",
      "Próxima Manutenção": DB.getProximaRevisao(m.equipamento) ?? ""
    };
  },

  /* ---- API pública (chamada pelos handlers do app) ---- */
  pushLancamento(iso, reg) { this._enqueue({ action: "upsert", kind: "lancamento", row: this.lancamentoRow(iso, reg) }); },
  deleteLancamento(id)     { this._enqueue({ action: "delete", kind: "lancamento", id }); },
  pushManutencao(iso, reg) { this._enqueue({ action: "upsert", kind: "manutencao", row: this.manutencaoRow(iso, reg) }); },
  deleteManutencao(id)     { this._enqueue({ action: "delete", kind: "manutencao", id }); },
  pushEquipamento(eq)      { this._enqueue({ action: "upsert", kind: "equipamento", row: this.equipamentoRow(eq) }); },
  deleteEquipamento(eq)    { this._enqueue({ action: "delete", kind: "equipamento", id: eq }); },
  pushOperador(nome)       { this._enqueue({ action: "upsert", kind: "operador", row: this.operadorRow(nome) }); },
  pushViagem(iso, reg)     { this._enqueue({ action: "upsert", kind: "viagem", row: this.viagemRow(iso, reg) }); },
  deleteViagem(id)         { this._enqueue({ action: "delete", kind: "viagem", id }); },

  /* Recalcula e regrava os resumos do dia (substitui as linhas daquela data)
     e atualiza a linha do mês a que o dia pertence. */
  pushResumoDia(iso, comMes = true) {
    if (!this.ativo()) return;
    this._enqueue({ action: "substituirDia", kind: "resumoDia", data: iso, rows: [this.resumoDiaRow(iso)] });
    this._enqueue({ action: "substituirDia", kind: "resumoEquip", data: iso, rows: this.resumoEquipRows(iso) });
    this._enqueue({ action: "substituirDia", kind: "resumoOperador", data: iso, rows: this.resumoOperadorRows(iso) });
    if (comMes) this.pushResumoMes(iso);
  },

  /* Uma linha por mês (o mês inteiro é recalculado a cada mudança) */
  pushResumoMes(iso) {
    if (!this.ativo()) return;
    const mes = DB.mesesDisponiveis().find(m => m.chave === String(iso).slice(0, 7));
    if (mes) this._enqueue({ action: "upsert", kind: "resumoMes", row: this.resumoMesRow(mes) });
  },

  /* ---- Reenvia toda a base e confirma via ping ---- */
  syncAll(cb) {
    if (!this.ativo()) { cb && cb({ ok: false, erro: "Configure o link da planilha primeiro." }); return; }
    const db = DB.load();
    const eqRows = db.equipamentos.map(e => this.equipamentoRow(e));
    const opRows = db.motoristas.map(n => this.operadorRow(n));
    const lanRows = [], manRows = [], viaRows = [];
    const dias = Object.keys(db.dias).sort();
    dias.forEach(iso => {
      (db.dias[iso].abastecimentos || []).forEach(a => lanRows.push(this.lancamentoRow(iso, a)));
      (db.dias[iso].manutencoes || []).forEach(m => manRows.push(this.manutencaoRow(iso, m)));
      (db.dias[iso].viagens || []).forEach(v => viaRows.push(this.viagemRow(iso, v)));
    });
    [["equipamento", eqRows], ["operador", opRows], ["lancamento", lanRows],
     ["viagem", viaRows], ["manutencao", manRows]]
      .forEach(([kind, rows]) => { if (rows.length) this._enqueue({ action: "bulk", kind, rows }); });
    // resumos de todos os dias e de cada mês (o mês vai uma vez só)
    dias.forEach(iso => this.pushResumoDia(iso, false));
    DB.mesesDisponiveis().forEach(m => this._enqueue({ action: "upsert", kind: "resumoMes", row: this.resumoMesRow(m) }));
    const t0 = Date.now();
    const check = () => {
      if (this.pendentes() === 0) { this.testar(cb); }
      else if (Date.now() - t0 > 60000) { cb && cb({ ok: false, erro: "Ainda há envios pendentes. Tente de novo com internet." }); }
      else setTimeout(check, 700);
    };
    setTimeout(check, 700);
  },

  /* ---- Teste de conexão (JSONP, consegue ler a resposta) ---- */
  testar(cb) {
    const u = this.url();
    if (!u) { cb && cb({ ok: false, erro: "URL não configurada." }); return; }
    const name = "__stractaCb" + Date.now() + Math.floor(Math.random() * 1000);
    const s = document.createElement("script");
    let done = false;
    const cleanup = () => { try { delete window[name]; } catch (e) { window[name] = undefined; } s.remove(); };
    window[name] = res => { done = true; cleanup(); cb && cb(res); };
    s.onerror = () => { if (!done) { cleanup(); cb && cb({ ok: false, erro: "Não conectou. Confira se o link está certo e publicado." }); } };
    s.src = u + (u.includes("?") ? "&" : "?") + "action=ping&callback=" + name + "&_=" + Date.now();
    document.body.appendChild(s);
    setTimeout(() => { if (!done) { cleanup(); cb && cb({ ok: false, erro: "Sem resposta (tempo esgotado)." }); } }, 15000);
  },

  /* ---- Transporte / fila ---- */
  _flushing: false,
  _send(payload) {
    return fetch(this.url(), {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  },
  _enqueue(op) {
    if (!this.ativo()) return;                 // sem link configurado: não acumula fila órfã
    const db = DB.load();
    (db.syncPend = db.syncPend || []).push(op);
    DB.save();
    this._flush();
    this._badge();
  },
  async _flush() {
    if (this._flushing || !this.ativo()) return;
    const db = DB.load();
    if (!db.syncPend || !db.syncPend.length) return;
    this._flushing = true;
    try {
      while (db.syncPend.length) {
        try { await this._send(db.syncPend[0]); }
        catch (e) { break; }                   // offline: mantém a fila e para
        db.syncPend.shift();
        DB.save();
      }
    } finally { this._flushing = false; this._badge(); }
  },
  _badge() {
    const el = document.getElementById("syncBadge");
    if (!el) return;
    const p = this.pendentes();
    if (!this.ativo()) { el.textContent = "desligada"; el.className = "pill pill-gray"; }
    else if (p > 0) { el.textContent = p + " pendente(s)"; el.className = "pill pill-blue"; }
    else { el.textContent = "em dia"; el.className = "pill pill-green"; }
  }
};

// reenvia pendentes quando a internet voltar
if (typeof window !== "undefined") {
  window.Sync = Sync;
  window.addEventListener("online", () => Sync._flush());
}
