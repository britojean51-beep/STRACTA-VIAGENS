/* ============================================================
   Checklist · Login e dados (Firebase Auth + Firestore)
   ------------------------------------------------------------
   Coleções (todas com prefixo checklist_, separadas do app de frota):
     checklist_usuarios/{email}   quem entra: nome, perfil (admin|inspetor), ativo
     checklist_equipamentos/{id}  prefixo, placa, tipo, modeloId
     checklist_modelos/{id}       nome, tipo, itens [{id, texto, critico}]
     checklist_inspecoes/{id}     o checklist feito, com respostas e mídias
   Gestor do app de frota entra aqui como admin (é quem libera os primeiros).

   Sem sinal: o login fica salvo no aparelho (persistência LOCAL do Firebase)
   e o Firestore guarda as gravações numa fila própria, enviada sozinha
   quando a rede volta.
   ============================================================ */
const DOMINIO = "gp2t.local";
const PERFIL_KEY = "ck_perfil";
const ULTIMO_USUARIO_KEY = "ck_ultimo_usuario";

function normalizarUsuario(v) {
  return String(v || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}
function emailDe(v) {
  const t = String(v || "").trim().toLowerCase();
  if (t.includes("@")) return t;
  const u = normalizarUsuario(t);
  return u ? u + "@" + DOMINIO : "";
}
function usuarioDe(email) {
  const t = String(email || "");
  return t.endsWith("@" + DOMINIO) ? t.split("@")[0] : t;
}

const Dados = {
  usuario: null,          // { email, usuario, nome, perfil }
  _ok: false,

  configurado() { return typeof FIREBASE_CONFIG !== "undefined" && !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey); },
  sdk() { return typeof firebase !== "undefined" && !!firebase.initializeApp; },
  online() { return this._ok && !!(this.sdk() && firebase.auth().currentUser); },
  ehAdmin() { return !!(this.usuario && this.usuario.perfil === "admin"); },
  fs() { return firebase.firestore(); },
  col(nome) { return this.fs().collection("checklist_" + nome); },

  ultimoUsuario() { try { return localStorage.getItem(ULTIMO_USUARIO_KEY) || ""; } catch (e) { return ""; } },

  /* ---- abre o Firebase e descobre se já tem alguém logado ---- */
  async iniciar() {
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
    try {
      const doc = await this.col("usuarios").doc(id).get();
      if (doc.exists) {
        const d = doc.data() || {};
        if (d.ativo === false) return { ok: false, erro: "Acesso bloqueado. Fale com o administrador." };
        return { ok: true, dados: this._guardarPerfil({
          email: id, usuario: usuarioDe(id), nome: d.nome || usuarioDe(id),
          perfil: d.perfil === "admin" ? "admin" : "inspetor" }) };
      }
      // gestor do app de frota administra o checklist (é quem libera os primeiros)
      const frota = await this.fs().collection("usuarios").doc(id).get().catch(() => null);
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

  async entrar(usuario, senha) {
    const id = emailDe(usuario);
    if (!id) return { ok: false, erro: "Digite o seu usuário." };
    if (!senha) return { ok: false, erro: "Digite a senha." };
    if (!this._ok) return { ok: false, erro: "Sem internet. O primeiro acesso precisa de sinal." };
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(id, senha);
      const r = await this._perfil(cred.user.email);
      if (!r.ok) { await firebase.auth().signOut().catch(() => {}); return r; }
      this.usuario = r.dados;
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
  async inspecoes(desdeMs) {
    const snap = await this.col("inspecoes").where("criadoEm", ">=", desdeMs)
      .orderBy("criadoEm", "desc").limit(1000).get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  },
  async inspecao(id) {
    const d = await this.col("inspecoes").doc(id).get();
    return d.exists ? Object.assign({ id: d.id }, d.data()) : null;
  },
  tratar(id, tratativa) {
    return this.col("inspecoes").doc(id).update({ tratativa });
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
    let jaExistia = false, sec = null;
    if (senha) {
      if (senha.length < 6) return { ok: false, erro: "A senha precisa de 6 caracteres ou mais." };
      try {
        sec = firebase.apps.find(a => a.name === "ck-adm") || firebase.initializeApp(FIREBASE_CONFIG, "ck-adm");
        await sec.auth().createUserWithEmailAndPassword(id, senha);
      } catch (e) {
        if (String((e && e.code) || "").includes("email-already-in-use")) jaExistia = true;
        else { try { if (sec) await sec.delete(); } catch (x) {} return { ok: false, erro: "Não foi possível criar o acesso." }; }
      }
      try { await sec.auth().signOut(); } catch (e) {}
      try { await sec.delete(); } catch (e) {}
    }
    const r = await this.salvarUsuario(id, dados);
    return r.ok ? { ok: true, jaExistia } : r;
  },
  async salvarUsuario(email, dados) {
    const id = emailDe(email);
    if (this.usuario && id === this.usuario.email && (dados.ativo === false || (dados.perfil && dados.perfil !== "admin"))) {
      return { ok: false, erro: "Você não pode tirar o seu próprio acesso." };
    }
    try {
      await this.col("usuarios").doc(id).set(dados, { merge: true });
      return { ok: true };
    } catch (e) { return { ok: false, erro: "Não foi possível salvar (confira as regras do Firestore)." }; }
  }
};

if (typeof window !== "undefined") {
  window.Dados = Dados;
  window.emailDe = emailDe;
  window.usuarioDe = usuarioDe;
}
