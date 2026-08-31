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
      "Equipamento": a.equipamento,
      "Operador": a.motorista || "",
      "Horímetro Inicial": a.horimetroInicial ?? "",
      "Horímetro Final": a.horimetroFinal ?? "",
      "Litros": a.litros ?? "",
      "Toneladas": a.toneladas ?? "",
      "KM": a.kmRodado || "",
      "Combustível": a.combustivel || "S-10",
      "ARLA (L)": a.litrosArla || "",
      "Situação": a.situacao || ""
      // Horas, L/h e L/Ton são fórmulas na planilha — não enviamos
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

  /* ---- Reenvia toda a base e confirma via ping ---- */
  syncAll(cb) {
    if (!this.ativo()) { cb && cb({ ok: false, erro: "Configure o link da planilha primeiro." }); return; }
    const db = DB.load();
    const eqRows = db.equipamentos.map(e => this.equipamentoRow(e));
    const opRows = db.motoristas.map(n => this.operadorRow(n));
    const lanRows = [], manRows = [];
    Object.keys(db.dias).forEach(iso => {
      (db.dias[iso].abastecimentos || []).forEach(a => lanRows.push(this.lancamentoRow(iso, a)));
      (db.dias[iso].manutencoes || []).forEach(m => manRows.push(this.manutencaoRow(iso, m)));
    });
    [["equipamento", eqRows], ["operador", opRows], ["lancamento", lanRows], ["manutencao", manRows]]
      .forEach(([kind, rows]) => { if (rows.length) this._enqueue({ action: "bulk", kind, rows }); });
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
