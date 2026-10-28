/* ============================================================
   Checklist · Login e dados (Firebase Auth + Firestore)
   ------------------------------------------------------------
   Coleções (todas com prefixo checklist_, separadas do app de frota):
     checklist_usuarios/{email}   quem entra: nome, perfil, ativo
                                  perfil: motorista | operador  -> fazem checklist
                                          gestor               -> + Painel e tratativa
                                          admin                -> + apagar e Cadastros
     checklist_equipamentos/{id}  prefixo, placa, tipo, modeloId,
                                  pendencias {idDoChecklist: "bloqueado"|"restricao"}
                                  (defeitos em aberto: é deles que sai a situação)
     checklist_modelos/{id}       nome, tipo, itens [{id, texto, critico}]
     checklist_inspecoes/{id}     o checklist feito, com respostas e mídias
   Gestor do app de frota entra aqui como admin (é quem libera os primeiros).

   VÁRIAS EMPRESAS: a empresa sai do e-mail de login.
     usuario@gp2t.local         -> STRACTA (a primeira): coleções checklist_* de sempre
     usuario@<codigo>.gp2t.local -> outra empresa: empresas/<codigo>/<coleção>
   Uma empresa nunca enxerga a outra (as regras conferem o cadastro em
   empresas/<codigo>/usuarios). Empresas novas, só o dono cria.

   Sem sinal: o login fica salvo no aparelho (persistência LOCAL do Firebase)
   e o Firestore guarda as gravações numa fila própria, enviada sozinha
   quando a rede volta.
   ============================================================ */
const DOMINIO = "gp2t.local";
const PERFIL_KEY = "ck_perfil";
const ULTIMO_USUARIO_KEY = "ck_ultimo_usuario";
const EMPRESA_KEY = "ck_empresa";
const EMPRESA_PADRAO = "stracta";
const DONO = "jean@" + DOMINIO;
const PERFIS = { motorista: "Motorista", operador: "Operador", tecnico: "Técnico de Segurança", gestor: "Gestor", admin: "Administrador" };
// "inspetor" era o nome da primeira versão: quem ficou com ele vira motorista
const perfilValido = p => PERFIS[p] ? p : "motorista";

function normalizarUsuario(v) {
  return String(v || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}
/* código da empresa: letras, números e hífen (vira parte do e-mail de login) */
function normalizarEmpresa(v) {
  const t = String(v || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  return t || EMPRESA_PADRAO;
}
const dominioDe = emp => emp === EMPRESA_PADRAO ? DOMINIO : emp + "." + DOMINIO;
/* de qual empresa é o e-mail: "@gp2t.local" é a STRACTA; "@acme.gp2t.local", a acme */
function empresaDe(email) {
  const d = String(email || "").toLowerCase().split("@")[1] || "";
  return d.endsWith("." + DOMINIO) ? d.slice(0, -DOMINIO.length - 1) : EMPRESA_PADRAO;
}
/* usuário digitado -> e-mail de login, na empresa de quem está logado
   (ou na escolhida na tela de entrada) */
function emailDe(v, emp) {
  const t = String(v || "").trim().toLowerCase();
  if (t.includes("@")) return t;
  const u = normalizarUsuario(t);
  return u ? u + "@" + dominioDe(emp || Dados.empresa) : "";
}
function usuarioDe(email) {
  const t = String(email || "");
  const d = t.split("@")[1] || "";
  return d === DOMINIO || d.endsWith("." + DOMINIO) ? t.split("@")[0] : t;
}

const Dados = {
  usuario: null,          // { email, usuario, nome, perfil }
  empresa: EMPRESA_PADRAO, // de quem está logado (antes de entrar: a última usada no aparelho)
  _ok: false,

  configurado() { return typeof FIREBASE_CONFIG !== "undefined" && !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey); },
  sdk() { return typeof firebase !== "undefined" && !!firebase.initializeApp; },
  online() { return this._ok && !!(this.sdk() && firebase.auth().currentUser); },
  ehAdmin() { return !!(this.usuario && this.usuario.perfil === "admin"); },
  /* gestor e administrador: veem o Painel e resolvem os defeitos */
  ehGestao() { return !!(this.usuario && (this.usuario.perfil === "admin" || this.usuario.perfil === "gestor")); },
  /* vê os checklists de todos (Painel): a gestão e o técnico de segurança, que acompanha mas não resolve */
  veTodos() { return this.ehGestao() || !!(this.usuario && this.usuario.perfil === "tecnico"); },
  /* o dono do app: cria as outras empresas */
  ehDono() { return !!(this.usuario && this.usuario.email === DONO); },
  fs() { return firebase.firestore(); },
  /* caminho da coleção na empresa atual (a STRACTA fica onde sempre esteve) */
  caminhoCol(nome, emp) {
    emp = emp || this.empresa;
    return emp === EMPRESA_PADRAO ? "checklist_" + nome : "empresas/" + emp + "/" + nome;
  },
  col(nome, emp) { return this.fs().collection(this.caminhoCol(nome, emp)); },
  _usarEmpresa(emp) {
    this.empresa = emp || EMPRESA_PADRAO;
    try { localStorage.setItem(EMPRESA_KEY, this.empresa); } catch (e) {}
  },

  ultimoUsuario() { try { return localStorage.getItem(ULTIMO_USUARIO_KEY) || ""; } catch (e) { return ""; } },
  ultimaEmpresa() { try { return localStorage.getItem(EMPRESA_KEY) || EMPRESA_PADRAO; } catch (e) { return EMPRESA_PADRAO; } },

  /* ---- abre o Firebase e descobre se já tem alguém logado ---- */
  async iniciar() {
    this.empresa = this.ultimaEmpresa();
    if (!this.configurado() || !this.sdk()) return { modo: "sem-sdk" };
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      // fila offline do Firestore: as gravações esperam o sinal voltar
      try { await firebase.firestore().enablePersistence({ synchronizeTabs: true }); } catch (e) {}
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      this._ok = true;
    } catch (e) { return { modo: "sem-sdk" }; }

    return new Promise(resolve => {
      let feito = false;
      const fim = r => { if (!feito) { feito = true; resolve(r); } };
      const pare = firebase.auth().onAuthStateChanged(async user => {
        pare();
        if (!user) return fim({ modo: "login" });
        const r = await this._perfil(user.email);
        if (r.ok) { this.usuario = r.dados; return fim({ modo: "ok" }); }
        await firebase.auth().signOut().catch(() => {});
        fim({ modo: "login", erro: r.erro });
      });
    });
  },

  /* Quem é a pessoa neste app. Sem rede, usa o que ficou guardado. */
  async _perfil(email) {
    const id = String(email || "").toLowerCase();
    const salvo = this._perfilSalvo(id);
    this.empresa = empresaDe(id);
    try {
      const doc = await this.col("usuarios").doc(id).get();
      if (doc.exists) {
        const d = doc.data() || {};
        if (d.ativo === false) return { ok: false, erro: "Acesso bloqueado. Fale com o administrador." };
        return { ok: true, dados: this._guardarPerfil({
          email: id, usuario: usuarioDe(id), nome: d.nome || usuarioDe(id),
          perfil: perfilValido(d.perfil) }) };
      }
      // gestor do app de frota administra o checklist da STRACTA (é quem libera os primeiros)
      const frota = this.empresa !== EMPRESA_PADRAO ? null : await this.fs().collection("usuarios").doc(id).get().catch(() => null);
      if (frota && frota.exists && (frota.data() || {}).perfil === "gestor" && (frota.data() || {}).ativo !== false) {
        const d = frota.data();
        return { ok: true, dados: this._guardarPerfil({
          email: id, usuario: usuarioDe(id), nome: d.nome || usuarioDe(id), perfil: "admin" }) };
      }
      return { ok: false, erro: "Acesso não liberado. Fale com o administrador." };
    } catch (e) {
      const cod = String((e && e.code) || "");
      if (salvo && !cod.includes("permission")) return { ok: true, dados: salvo };
      if (cod.includes("permission")) return { ok: false, erro: "Acesso não liberado. Fale com o administrador." };
      return { ok: false, erro: "Sem internet para confirmar o acesso. Tente de novo." };
    }
  },
  _perfilSalvo(email) {
    try { const p = JSON.parse(localStorage.getItem(PERFIL_KEY) || "null"); return p && p.email === email ? p : null; }
    catch (e) { return null; }
  },
  _guardarPerfil(p) { try { localStorage.setItem(PERFIL_KEY, JSON.stringify(p)); } catch (e) {} return p; },

  async entrar(usuario, senha, empresa) {
    const emp = normalizarEmpresa(empresa);
    const id = emailDe(usuario, emp);
    if (!id) return { ok: false, erro: "Digite o seu usuário." };
    if (!senha) return { ok: false, erro: "Digite a senha." };
    if (!this._ok) return { ok: false, erro: "Sem internet. O primeiro acesso precisa de sinal." };
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(id, senha);
      const r = await this._perfil(cred.user.email);
      if (!r.ok) { await firebase.auth().signOut().catch(() => {}); return r; }
      this.usuario = r.dados;
      this._usarEmpresa(empresaDe(cred.user.email));
      try { localStorage.setItem(ULTIMO_USUARIO_KEY, usuarioDe(id)); } catch (e) {}
      return { ok: true };
    } catch (e) {
      const c = String((e && e.code) || "");
      if (c.includes("wrong-password") || c.includes("invalid-credential") || c.includes("user-not-found")) {
        return { ok: false, erro: "Usuário ou senha incorretos." };
      }
      if (c.includes("too-many-requests")) return { ok: false, erro: "Muitas tentativas. Aguarde alguns minutos." };
      if (c.includes("network")) return { ok: false, erro: "Sem internet. O primeiro acesso precisa de sinal." };
      return { ok: false, erro: "Não foi possível entrar. Tente de novo." };
    }
  },

  async sair() {
    this.usuario = null;
    try { localStorage.removeItem(PERFIL_KEY); } catch (e) {}
    try { await firebase.auth().signOut(); } catch (e) {}
  },

  async trocarSenha(atual, nova) {
    if (!nova || nova.length < 6) return { ok: false, erro: "A senha nova precisa de 6 caracteres ou mais." };
    if (!navigator.onLine) return { ok: false, erro: "Para trocar a senha é preciso internet." };
    const u = firebase.auth().currentUser;
    if (!u) return { ok: false, erro: "Entre de novo para trocar a senha." };
    try {
      await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, atual));
      await u.updatePassword(nova);
      return { ok: true };
    } catch (e) {
      const c = String((e && e.code) || "");
      if (c.includes("wrong-password") || c.includes("invalid-credential")) return { ok: false, erro: "Senha atual incorreta." };
      return { ok: false, erro: "Não foi possível trocar a senha." };
    }
  },

  /* ---- cadastros (equipamentos e modelos): ouvidos ao vivo, vêm do cache sem sinal ---- */
  ouvir(nome, cb) {
    return this.col(nome).onSnapshot(snap => {
      cb(snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    }, () => cb(null));
  },
  salvar(nome, id, dados) {
    const ref = id ? this.col(nome).doc(id) : this.col(nome).doc();
    const p = ref.set(Object.assign({}, dados, { atualizadoEm: Date.now() }), { merge: true });
    return { id: ref.id, enviado: p };
  },
  remover(nome, id) { return this.col(nome).doc(id).delete(); },

  /* ---- inspeções ---- */
  novoIdInspecao() { return this.col("inspecoes").doc().id; },

  /* Não espera o servidor: sem sinal a promessa só resolve quando a rede volta.
     Quem chama segue em frente e acompanha pelo "enviado". */
  gravarInspecao(insp) {
    return this.col("inspecoes").doc(insp.id).set(insp);
  },
  marcarMidiaEnviada(inspId, mid) {
    const upd = {};
    upd["midias." + mid + ".ok"] = true;
    upd.pendentes = firebase.firestore.FieldValue.increment(-1);
    return this.col("inspecoes").doc(inspId).update(upd);
  },
  async confirmada(inspId) {
    try {
      const d = await this.col("inspecoes").doc(inspId).get({ source: "server" });
      return d.exists;
    } catch (e) { return false; }
  },
  /* Como o checklist está no servidor: { existe, dados }.
     null = não deu para saber (sem sinal) — aí nada muda no aparelho. */
  async estado(inspId) {
    try {
      const d = await this.col("inspecoes").doc(inspId).get({ source: "server" });
      return d.exists ? { existe: true, dados: d.data() || {} } : { existe: false };
    } catch (e) { return null; }
  },
  /* Os checklists desta pessoa (a regra só deixa listar os próprios).
     Sem orderBy para não precisar de índice composto: ordena aqui. */
  /* os meus checklists ao vivo (mesma consulta de minhas); devolve como parar */
  ouvirMinhas(email, cb) {
    return this.col("inspecoes").where("criadoPor", "==", email).limit(300).onSnapshot(snap => {
      cb(snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0)).slice(0, 40));
    }, () => {});
  },
  async minhas(email) {
    try {
      const snap = await this.col("inspecoes").where("criadoPor", "==", email).limit(300).get();
      return snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
        .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0)).slice(0, 40);
    } catch (e) { return null; }
  },
  /* ---- lubrificação e inspeção (lançamentos da gestão) ---- */
  async servicos(equipId) {
    const snap = await this.col("servicos").where("equipId", "==", equipId).limit(300).get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)) || (b.em || 0) - (a.em || 0));
  },
  /* resumo no equipamento (todo celular já baixa): última lubrificação, última inspeção e a próxima marcada */
  resumoEquip(equipId, campos) { return this.col("equipamentos").doc(equipId).update(campos); },
  async inspecoes(desdeMs, ateMs) {
    let q = this.col("inspecoes").where("criadoEm", ">=", desdeMs);
    if (ateMs) q = q.where("criadoEm", "<", ateMs);
    const snap = await q
      .orderBy("criadoEm", "desc").limit(1000).get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  },
  async inspecao(id) {
    const d = await this.col("inspecoes").doc(id).get();
    return d.exists ? Object.assign({ id: d.id }, d.data()) : null;
  },
  /* gestor/admin: tratativa, resolução por item e as fotos da resolução */
  atualizarInspecao(id, upd) {
    return this.col("inspecoes").doc(id).update(upd);
  },

  /* Situação do equipamento = pior defeito ainda em aberto.
     Checklist com defeito abre a pendência; "resolvido" (ou apagar) fecha. */
  abrirPendencia(equipId, inspId, resultado) {
    if (!equipId || resultado === "liberado") return Promise.resolve();
    const upd = {}; upd["pendencias." + inspId] = resultado;
    return this.col("equipamentos").doc(equipId).update(upd).catch(() => {});
  },
  fecharPendencia(equipId, inspId) {
    if (!equipId) return Promise.resolve();
    const upd = {}; upd["pendencias." + inspId] = firebase.firestore.FieldValue.delete();
    return this.col("equipamentos").doc(equipId).update(upd).catch(() => {});
  },

  /* ---- usuários (só admin) ---- */
  async usuarios() {
    const snap = await this.col("usuarios").get();
    return snap.docs.map(d => Object.assign({ email: d.id, usuario: usuarioDe(d.id) }, d.data()));
  },
  /* createUser troca a sessão do app em que roda — por isso usa um SEGUNDO
     app do Firebase, descartado em seguida. Quem está logado não cai. */
  async criarUsuario(usuario, senha, dados) {
    const id = emailDe(usuario);
    if (!id) return { ok: false, erro: "Informe o usuário." };
    if (!navigator.onLine) return { ok: false, erro: "Para cadastrar é preciso internet." };
    let jaExistia = false;
    if (senha) {
      const a = await this._criarAcesso(id, senha);
      if (!a.ok) return a;
      jaExistia = a.jaExistia;
    }
    const r = await this.salvarUsuario(id, dados);
    return r.ok ? { ok: true, jaExistia } : r;
  },
  async _criarAcesso(id, senha) {
    if (senha.length < 6) return { ok: false, erro: "A senha precisa de 6 caracteres ou mais." };
    let jaExistia = false, sec = null;
    try {
      sec = firebase.apps.find(a => a.name === "ck-adm") || firebase.initializeApp(FIREBASE_CONFIG, "ck-adm");
      await sec.auth().createUserWithEmailAndPassword(id, senha);
    } catch (e) {
      if (String((e && e.code) || "").includes("email-already-in-use")) jaExistia = true;
      else { try { if (sec) await sec.delete(); } catch (x) {} return { ok: false, erro: "Não foi possível criar o acesso." }; }
    }
    try { await sec.auth().signOut(); } catch (e) {}
    try { await sec.delete(); } catch (e) {}
    return { ok: true, jaExistia };
  },

  /* ---- empresas (só o dono) ---- */
  async empresas() {
    const snap = await this.fs().collection("empresas").get();
    return snap.docs.map(d => Object.assign({ codigo: d.id }, d.data()))
      .sort((a, b) => String(a.nome || a.codigo).localeCompare(String(b.nome || b.codigo)));
  },
  /* nova empresa com o primeiro administrador dela */
  async criarEmpresa(e) {
    const cod = normalizarEmpresa(e.codigo);
    if (!e.codigo || cod === EMPRESA_PADRAO || !/^[a-z0-9][a-z0-9-]{1,19}$/.test(cod)) {
      return { ok: false, erro: "Código inválido: de 2 a 20 letras, números ou hífen." };
    }
    if (!String(e.nome || "").trim()) return { ok: false, erro: "Informe o nome da empresa." };
    const adm = normalizarUsuario(e.admUsuario);
    if (!adm) return { ok: false, erro: "Informe o usuário do administrador." };
    if (!navigator.onLine) return { ok: false, erro: "Para cadastrar é preciso internet." };
    const ref = this.fs().collection("empresas").doc(cod);
    try {
      if ((await ref.get()).exists) return { ok: false, erro: "Já existe uma empresa com esse código." };
    } catch (x) { /* sem permissão para ler o que não existe: segue e o set confirma */ }
    const id = adm + "@" + dominioDe(cod);
    const a = await this._criarAcesso(id, String(e.admSenha || ""));
    if (!a.ok) return a;
    try {
      await ref.set({ nome: String(e.nome).trim(), cnpj: String(e.cnpj || "").trim(), ativo: true,
        criadoEm: Date.now(), criadoPor: this.usuario.email });
      await this.col("usuarios", cod).doc(id).set({ nome: String(e.admNome || adm).trim(), perfil: "admin", ativo: true });
      return { ok: true, codigo: cod, email: id, jaExistia: a.jaExistia };
    } catch (x) { return { ok: false, erro: "Não foi possível salvar a empresa (confira as regras do Firestore)." }; }
  },
  async ativarEmpresa(cod, ativo) {
    try { await this.fs().collection("empresas").doc(cod).set({ ativo: !!ativo }, { merge: true }); return { ok: true }; }
    catch (x) { return { ok: false, erro: "Não foi possível mudar a empresa." }; }
  },
  async salvarUsuario(email, dados) {
    const id = emailDe(email);
    if (this.usuario && id === this.usuario.email && (dados.ativo === false || (dados.perfil && dados.perfil !== this.usuario.perfil))) {
      return { ok: false, erro: "Você não pode mudar o seu próprio acesso." };
    }
    // o gestor cadastra e muda funções, mas administrador só o administrador nomeia
    if (dados.perfil === "admin" && !this.ehAdmin()) return { ok: false, erro: "Só o administrador pode dar a função Administrador." };
    if (dados.perfil && !PERFIS[dados.perfil]) return { ok: false, erro: "Função inválida." };
    try {
      await this.col("usuarios").doc(id).set(dados, { merge: true });
      return { ok: true };
    } catch (e) { return { ok: false, erro: "Não foi possível salvar (confira as regras do Firestore)." }; }
  }
};

if (typeof window !== "undefined") {
  window.Dados = Dados;
  window.PERFIS = PERFIS;
  window.emailDe = emailDe;
  window.empresaDe = empresaDe;
  window.normalizarEmpresa = normalizarEmpresa;
  window.usuarioDe = usuarioDe;
}
