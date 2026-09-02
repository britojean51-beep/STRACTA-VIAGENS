/* ============================================================
   GP2T · Dados na nuvem (Firestore)
   ------------------------------------------------------------
   O app continua LENDO do aparelho (localStorage), do mesmo jeito.
   Esta camada só faz o espelho:
     - o que muda aqui, sobe;
     - o que muda em outro celular, desce e redesenha a tela.
   Sem internet o app funciona igual: o Firestore guarda a fila e
   envia quando a rede voltar.

   Cada lançamento é um documento (não uma lista do dia inteiro),
   então dois operadores lançando ao mesmo tempo não se atropelam.
   ============================================================ */
const FROTA_ID = "gp2t";
const JANELA_DIAS = 120;                 // quanto tempo o celular acompanha ao vivo
const COLECOES = ["abastecimentos", "viagens", "manutencoes"];

const Cloud = {
  _unsub: [],
  _pronta: Promise.resolve(),
  _ligado: false,
  _pendentes: false,
  _erro: null,
  onMudanca: null,

  /* ---- situação ---- */
  disponivel() {
    return typeof firebase !== "undefined" && !!firebase.firestore
      && typeof Auth !== "undefined" && Auth.configurado() && !!Auth.usuario;
  },
  ligada() { return !!DB.load().config.nuvem; },
  ativa() { return this.ligada() && this.disponivel(); },
  estado() {
    if (!this.ligada()) return { chave: "desligada", texto: "desligada" };
    if (!this.disponivel()) return { chave: "sem-login", texto: "precisa de login" };
    if (this._erro) return { chave: "erro", texto: this._erro.texto };
    if (!navigator.onLine || this._pendentes) return { chave: "offline", texto: "sem internet — vai subir depois" };
    return { chave: "ok", texto: "em dia" };
  },

  _fs() { return firebase.firestore(); },
  _frota() { return this._fs().collection("frota").doc(FROTA_ID); },
  _col(nome) { return this._frota().collection(nome); },
  _cad(nome) { return this._frota().collection("cadastro").doc(nome); },
  _quem() { return (Auth.usuario && Auth.usuario.email) || ""; },

  /* ---- liga/desliga ---- */
  async iniciar() {
    if (this._ligado || !this.ativa()) return;
    this._ligado = true;
    this._erro = null;
    try { await this._fs().enablePersistence({ synchronizeTabs: true }); } catch (e) { /* já ligada ou aba múltipla */ }
    this._pronta = this._semear();
    await this._pronta;
    this._ouvir();
  },

  /* Primeira vez na nuvem: leva os valores atuais deste celular (tanques,
     frota, status). Sem isso o estoque começaria do zero e os descontos
     deixariam o tanque negativo. Quem já achar o documento pronto, não mexe. */
  async _semear() {
    const db = DB.load();
    const cfg = Object.assign({}, db.config); delete cfg.nuvem;
    const inicial = [
      ["frota", { equipamentos: db.equipamentos, motoristas: db.motoristas,
                  abastecedores: db.abastecedores, tipoEquip: db.tipoEquip,
                  proximaRevisao: db.proximaRevisao, config: cfg }],
      ["operacao", { estado: db.estado, status: db.status }],
      ["estoque", db.estoque]
    ];
    for (const [nome, dados] of inicial) {
      try {
        const doc = await this._cad(nome).get();
        if (!doc.exists) await this._cad(nome).set(dados, { merge: true });
      } catch (e) { this._falha(e, "preparar cadastro/" + nome); }
    }
  },
  parar() {
    this._unsub.forEach(f => { try { f(); } catch (e) {} });
    this._unsub = [];
    this._ligado = false;
  },

  _notificar() { try { this.onMudanca && this.onMudanca(); } catch (e) {} },

  /* Guarda ONDE falhou e o código do Firestore — sem isso não dá para saber
     se o problema é a regra, a internet ou o login. */
  _falha(e, onde) {
    const cod = (e && e.code) || "erro";
    const motivo = cod === "permission-denied" ? "sem permissão"
      : cod === "unavailable" ? "sem conexão"
      : cod === "unauthenticated" ? "login expirado"
      : "falhou";
    this._erro = { codigo: cod, onde: onde || "", texto: motivo + (onde ? " ao " + onde : "") };
    // Escuta recusada morre e não volta sozinha: solta tudo para permitir reconectar.
    if (cod === "permission-denied" || cod === "unauthenticated") this.parar();
    this._notificar();
  },

  /* Depois de acertar as regras: liga de novo sem precisar recarregar o app. */
  async reconectar() {
    this.parar();
    this._erro = null;
    this._notificar();
    await this.iniciar();
    return this.estado();
  },

  /* ---- escuta o que muda na nuvem ---- */
  _ouvir() {
    const desde = DB.addDias(DB.hojeISO(), -JANELA_DIAS);
    COLECOES.forEach(col => {
      const q = this._col(col).where("dia", ">=", desde);
      this._unsub.push(q.onSnapshot(
        snap => { this._pendentes = snap.metadata.hasPendingWrites; this._aplicarLancamentos(col, snap); },
        e => this._falha(e, "consultar " + col)
      ));
    });
    ["frota", "operacao", "estoque"].forEach(nome => {
      this._unsub.push(this._cad(nome).onSnapshot(
        doc => this._aplicarCadastro(nome, doc.data() || {}),
        e => this._falha(e, "ler cadastro/" + nome)
      ));
    });
  },

  /* Mescla no cache local: nunca apaga dias fora da janela acompanhada */
  _aplicarLancamentos(col, snap) {
    const db = DB.load();
    let mudou = false;
    snap.docChanges().forEach(ch => {
      const d = ch.doc.data() || {};
      const iso = d.dia;
      if (!iso) return;
      const dia = (db.dias[iso] ||= { abastecimentos: [], viagens: [], manutencoes: [] });
      const lista = dia[col] || (dia[col] = []);
      const i = lista.findIndex(r => r.id === ch.doc.id);
      if (ch.type === "removed") {
        if (i >= 0) { lista.splice(i, 1); mudou = true; }
        return;
      }
      const reg = Object.assign({}, d, { id: ch.doc.id });
      delete reg.dia;
      if (i < 0) { lista.push(reg); mudou = true; }
      else if (JSON.stringify(lista[i]) !== JSON.stringify(reg)) { lista[i] = reg; mudou = true; }
    });
    if (mudou) { DB.save(); this._notificar(); }
  },

  _aplicarCadastro(nome, d) {
    const db = DB.load();
    if (nome === "frota") {
      if (Array.isArray(d.equipamentos)) db.equipamentos = d.equipamentos;
      if (Array.isArray(d.motoristas)) db.motoristas = d.motoristas;
      if (Array.isArray(d.abastecedores)) db.abastecedores = d.abastecedores;
      if (d.tipoEquip) db.tipoEquip = d.tipoEquip;
      if (d.proximaRevisao) db.proximaRevisao = d.proximaRevisao;
      if (d.config) {
        const cfg = Object.assign({}, d.config);
        delete cfg.nuvem;          // a chave da nuvem é de cada aparelho
        Object.assign(db.config, cfg);
      }
    } else if (nome === "operacao") {
      if (d.estado) db.estado = d.estado;
      if (d.status) db.status = d.status;
    } else if (nome === "estoque") {
      ["s10", "s500", "arla"].forEach(t => { if (typeof d[t] === "number") db.estoque[t] = d[t]; });
    }
    DB.save();
    this._notificar();
  },

  /* ---- escritas (chamadas pelos ganchos do storage) ---- */
  push(col, iso, reg) {
    if (!this.ativa() || !reg || !reg.id) return;
    const dados = Object.assign({}, reg, {
      dia: iso,
      criadoPor: reg.criadoPor || this._quem(),
      atualizadoPor: this._quem(),
      atualizadoEm: Date.now()
    });
    delete dados.id;
    this._col(col).doc(reg.id).set(dados, { merge: false }).catch(e => this._falha(e, "gravar em " + col));
  },
  remover(col, id) {
    if (!this.ativa() || !id) return;
    this._col(col).doc(id).delete().catch(e => this._falha(e, "excluir de " + col));
  },
  patch(nome, dados) {
    if (!this.ativa()) return;
    this._cad(nome).set(dados, { merge: true }).catch(e => this._falha(e, "gravar cadastro/" + nome));
  },
  /* soma/subtrai no tanque — dois celulares abastecendo junto continuam batendo */
  ajustarEstoque(tipo, delta) {
    if (!this.ativa() || !delta) return;
    // espera a semeadura: somar num tanque que ainda não existe daria valor negativo
    this._pronta.then(() => {
      const inc = firebase.firestore.FieldValue.increment(delta);
      return this._cad("estoque").set({ [tipo]: inc }, { merge: true });
    }).catch(e => this._falha(e, "atualizar o tanque"));
  },

  /* ---- Diagnóstico: refaz cada operação isolada e diz qual delas trava ----
     A ordem é a mesma que o app usa, então o primeiro ❌ é a causa. */
  async diagnosticar() {
    const passos = [];
    const tentar = async (nome, fn) => {
      try { const extra = await fn(); passos.push({ passo: nome, ok: true, info: extra || "" }); return true; }
      catch (e) {
        passos.push({ passo: nome, ok: false, erro: (e && e.code) || String(e && e.message || e) });
        return false;
      }
    };
    if (!this.disponivel()) {
      return [{ passo: "login", ok: false, erro: "sem login (entre com seu usuário)" }];
    }
    const eu = this._quem();

    await tentar("1. ler sua liberação em usuarios/" + eu, async () => {
      const d = await this._fs().collection("usuarios").doc(eu).get();
      if (!d.exists) throw { code: "documento não existe — confira o e-mail do usuário" };
      const dados = d.data() || {};
      return "perfil: " + (dados.perfil || "?") + (dados.ativo === false ? " (DESATIVADO)" : "");
    });
    await tentar("2. ler cadastro/frota", async () => { await this._cad("frota").get(); });
    await tentar("3. gravar em cadastro/estoque", async () => {
      await this._cad("estoque").set({ ping: Date.now() }, { merge: true });
      await this._cad("estoque").set({ ping: firebase.firestore.FieldValue.delete() }, { merge: true });
    });
    await tentar("4. consultar os abastecimentos", async () => {
      const desde = DB.addDias(DB.hojeISO(), -JANELA_DIAS);
      const snap = await this._col("abastecimentos").where("dia", ">=", desde).get();
      return snap.docs.length + " na nuvem";
    });
    await tentar("5. criar e apagar um lançamento de teste", async () => {
      const ref = this._col("abastecimentos").doc("teste-" + Date.now());
      await ref.set({ dia: DB.hojeISO(), teste: true, criadoPor: eu });
      await ref.delete();
    });
    return passos;
  },

  /* ---- sobe a base inteira deste celular (idempotente: grava por id) ---- */
  async enviarTudo() {
    if (!this.disponivel()) return { ok: false, erro: "Entre com seu usuário para usar a nuvem." };
    if (!this.ligada()) return { ok: false, erro: "Ligue a nuvem primeiro." };
    const db = DB.load();
    try {
      let lote = this._fs().batch(), n = 0, total = 0;
      const gravar = async (ref, dados, opts) => {
        lote.set(ref, dados, opts || {});
        n++; total++;
        if (n >= 400) { await lote.commit(); lote = this._fs().batch(); n = 0; }
      };
      for (const iso of Object.keys(db.dias)) {
        const dia = db.dias[iso] || {};
        for (const col of COLECOES) {
          for (const reg of (dia[col] || [])) {
            if (!reg.id) continue;
            const dados = Object.assign({}, reg, {
              dia: iso, criadoPor: reg.criadoPor || this._quem(),
              atualizadoPor: this._quem(), atualizadoEm: Date.now()
            });
            delete dados.id;
            await gravar(this._col(col).doc(reg.id), dados);
          }
        }
      }
      const cfg = Object.assign({}, db.config); delete cfg.nuvem;
      await gravar(this._cad("frota"), {
        equipamentos: db.equipamentos, motoristas: db.motoristas,
        abastecedores: db.abastecedores, tipoEquip: db.tipoEquip,
        proximaRevisao: db.proximaRevisao, config: cfg
      }, { merge: true });
      await gravar(this._cad("operacao"), { estado: db.estado, status: db.status }, { merge: true });
      await gravar(this._cad("estoque"), db.estoque, { merge: true });
      if (n) await lote.commit();
      await this.iniciar();
      return { ok: true, total };
    } catch (e) {
      return { ok: false, erro: (e && e.code === "permission-denied")
        ? "Sem permissão. Publique as regras do Firestore." : "Não deu para enviar. Confira a internet." };
    }
  }
};

if (typeof window !== "undefined") {
  window.Cloud = Cloud;
  window.addEventListener("online", () => { Cloud._erro = null; Cloud._notificar(); });
  window.addEventListener("offline", () => Cloud._notificar());
}
