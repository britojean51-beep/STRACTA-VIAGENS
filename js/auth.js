/* ============================================================
   GP2T · Login e perfis (Firebase Auth + Firestore)
   ------------------------------------------------------------
   - Sem FIREBASE_CONFIG → app aberto, como antes (modo local).
   - Com config → exige login. Só entra quem tem documento ativo
     em "usuarios/{email}" (o gestor libera na tela Usuários).
   - Guarda a sessão no aparelho para continuar funcionando
     offline, no campo, sem sinal.
   ============================================================ */
const SESSAO_KEY = "gp2t_sessao";

const Auth = {
  usuario: null,        // { email, nome, perfil }
  pronto: false,
  _fb: null,            // app do firebase
  _offline: false,      // entrou usando a sessão salva

  configurado() { return !!(typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey); },
  sdkDisponivel() { return typeof firebase !== "undefined" && !!firebase.initializeApp; },
  ehGestor() { return !this.configurado() || (this.usuario && this.usuario.perfil === "gestor"); },
  perfil() { return this.usuario ? this.usuario.perfil : "gestor"; },

  /* ---- sessão salva no aparelho (modo offline) ---- */
  _salvarSessao(u) { try { localStorage.setItem(SESSAO_KEY, JSON.stringify(u)); } catch (e) {} },
  _lerSessao() { try { return JSON.parse(localStorage.getItem(SESSAO_KEY) || "null"); } catch (e) { return null; } },
  _limparSessao() { try { localStorage.removeItem(SESSAO_KEY); } catch (e) {} },

  /* ---- inicialização: decide entre app aberto, sessão salva ou login ---- */
  async iniciar() {
    if (!this.configurado()) { this.pronto = true; return { modo: "local" }; }

    if (!this.sdkDisponivel()) {
      // sem internet ou SDK bloqueado: tenta a sessão salva
      const s = this._lerSessao();
      this.pronto = true;
      if (s) { this.usuario = s; this._offline = true; return { modo: "offline" }; }
      return { modo: "sem-conexao" };
    }

    try {
      this._fb = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (e) { /* segue: pode cair na sessão salva */ }

    return new Promise(resolve => {
      let respondido = false;
      const responder = r => { if (!respondido) { respondido = true; this.pronto = true; resolve(r); } };
      // se o Firebase demorar demais (sinal ruim), usa a sessão salva
      const timer = setTimeout(() => {
        const s = this._lerSessao();
        if (s) { this.usuario = s; this._offline = true; responder({ modo: "offline" }); }
        else responder({ modo: "login" });
      }, 8000);

      try {
        firebase.auth().onAuthStateChanged(async user => {
          clearTimeout(timer);
          if (!user) { this.usuario = null; return responder({ modo: "login" }); }
          const dados = await this._buscarUsuario(user.email);
          if (!dados) {
            await this.sair(true);
            return responder({ modo: "login", erro: "Acesso não liberado. Fale com o gestor." });
          }
          this.usuario = dados;
          this._salvarSessao(dados);
          responder({ modo: "ok" });
        });
      } catch (e) { clearTimeout(timer); responder({ modo: "login" }); }
    });
  },

  /* ---- lê a liberação do usuário (usuarios/{email}) ---- */
  async _buscarUsuario(email) {
    const id = String(email || "").trim().toLowerCase();
    try {
      const doc = await firebase.firestore().collection("usuarios").doc(id).get();
      if (!doc.exists) return null;
      const d = doc.data() || {};
      if (d.ativo === false) return null;
      return { email: id, nome: d.nome || id.split("@")[0], perfil: d.perfil === "gestor" ? "gestor" : "operador" };
    } catch (e) {
      return null;
    }
  },

  async entrar(email, senha) {
    if (!this.sdkDisponivel()) return { ok: false, erro: "Sem internet. Conecte-se para entrar pela primeira vez." };
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(String(email).trim(), senha);
      const dados = await this._buscarUsuario(cred.user.email);
      if (!dados) { await this.sair(true); return { ok: false, erro: "Acesso não liberado. Fale com o gestor." }; }
      this.usuario = dados; this._salvarSessao(dados);
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: this._msgErro(e) };
    }
  },

  async recuperarSenha(email) {
    if (!this.sdkDisponivel()) return { ok: false, erro: "Sem internet no momento." };
    try {
      await firebase.auth().sendPasswordResetEmail(String(email).trim());
      return { ok: true };
    } catch (e) { return { ok: false, erro: this._msgErro(e) }; }
  },

  async sair(silencioso) {
    this.usuario = null; this._limparSessao();
    try { if (this.sdkDisponivel()) await firebase.auth().signOut(); } catch (e) {}
    if (!silencioso && typeof mostrarLogin === "function") mostrarLogin();
  },

  _msgErro(e) {
    const c = (e && e.code) || "";
    if (c.includes("wrong-password") || c.includes("invalid-credential")) return "Senha incorreta.";
    if (c.includes("user-not-found")) return "E-mail não cadastrado.";
    if (c.includes("invalid-email")) return "E-mail inválido.";
    if (c.includes("too-many-requests")) return "Muitas tentativas. Aguarde alguns minutos.";
    if (c.includes("network")) return "Sem internet no momento.";
    return "Não foi possível entrar. Tente de novo.";
  },

  /* ---- usuários liberados (tela Usuários, só gestor) ---- */
  async listarUsuarios() {
    if (!this.sdkDisponivel()) return [];
    try {
      const snap = await firebase.firestore().collection("usuarios").get();
      return snap.docs.map(d => Object.assign({ email: d.id }, d.data()));
    } catch (e) { return []; }
  },
  async salvarUsuario(email, dados) {
    if (!this.sdkDisponivel()) return { ok: false, erro: "Sem internet no momento." };
    const id = String(email).trim().toLowerCase();
    if (!id.includes("@")) return { ok: false, erro: "Informe um e-mail válido." };
    try {
      await firebase.firestore().collection("usuarios").doc(id).set(dados, { merge: true });
      return { ok: true };
    } catch (e) { return { ok: false, erro: "Não foi possível salvar (confira as regras do Firestore)." }; }
  },
  async removerUsuario(email) {
    if (!this.sdkDisponivel()) return { ok: false, erro: "Sem internet no momento." };
    try {
      await firebase.firestore().collection("usuarios").doc(String(email).toLowerCase()).delete();
      return { ok: true };
    } catch (e) { return { ok: false, erro: "Não foi possível remover." }; }
  }
};

if (typeof window !== "undefined") window.Auth = Auth;
