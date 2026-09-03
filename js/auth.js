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
const CONTAS_KEY = "gp2t_contas";      // credenciais locais, para entrar sem internet
const VALIDADE_OFFLINE = 90;           // dias desde a última confirmação online
/* O Firebase exige um identificador em formato de e-mail, mas ele não precisa
   existir de verdade. Usamos um domínio interno: quem entra digita só "saulo"
   e o app completa para "saulo@gp2t.local". Ninguém precisa ter e-mail. */
const DOMINIO_INTERNO = "gp2t.local";

/* "José Silva" -> "jose.silva" (sem acento, sem espaço, só o que o e-mail aceita) */
function normalizarUsuario(v) {
  return String(v || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}
/* Nome curto -> identificador completo. Se já vier com @, respeita. */
function emailDe(v) {
  const t = String(v || "").trim().toLowerCase();
  if (t.includes("@")) return t;
  const u = normalizarUsuario(t);
  return u ? u + "@" + DOMINIO_INTERNO : "";
}
/* Identificador completo -> nome curto, para mostrar na tela */
function usuarioDe(email) {
  const t = String(email || "");
  return t.endsWith("@" + DOMINIO_INTERNO) ? t.split("@")[0] : t;
}

const Auth = {
  usuario: null,        // { email, nome, perfil }
  pronto: false,
  _fb: null,            // app do firebase
  _offline: false,      // entrou usando a sessão salva

  configurado() { return !!(typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey); },
  sdkDisponivel() { return typeof firebase !== "undefined" && !!firebase.initializeApp; },
  ehGestor() { return !this.configurado() || (this.usuario && this.usuario.perfil === "gestor"); },
  perfil() { return this.usuario ? this.usuario.perfil : "gestor"; },

  /* ---- credenciais locais: permitem entrar sem internet em quem já entrou aqui ----
     Guardamos um RESUMO da senha (PBKDF2-SHA256 com sal), nunca a senha. */
  _contas() { try { return JSON.parse(localStorage.getItem(CONTAS_KEY) || "{}"); } catch (e) { return {}; } },
  _gravarContas(c) { try { localStorage.setItem(CONTAS_KEY, JSON.stringify(c)); } catch (e) {} },
  _cripto() { return (typeof crypto !== "undefined" && crypto.subtle) ? crypto.subtle : null; },
  _hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); },

  async _resumo(senha, saltHex) {
    const sub = this._cripto();
    if (!sub) return null;                       // sem WebCrypto: fica sem acesso offline
    const enc = new TextEncoder();
    const salt = new Uint8Array((saltHex.match(/../g) || []).map(h => parseInt(h, 16)));
    const chave = await sub.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
    const bits = await sub.deriveBits(
      { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, chave, 256);
    return this._hex(bits);
  },

  async _salvarConta(dados, senha) {
    if (!this._cripto() || !senha) return;
    const contas = this._contas();
    const antiga = contas[dados.email] || {};
    const salt = antiga.salt || this._hex(crypto.getRandomValues(new Uint8Array(16)));
    const resumo = await this._resumo(senha, salt);
    if (!resumo) return;
    contas[dados.email] = Object.assign({}, dados, { salt, resumo, confirmadoEm: Date.now() });
    this._gravarContas(contas);
  },

  /* Confere a senha digitada contra o resumo guardado neste aparelho. */
  async _conferirLocal(email, senha) {
    const c = this._contas()[email];
    if (!c || !c.resumo) return { status: "sem-conta" };
    const dias = (Date.now() - (c.confirmadoEm || 0)) / 86400000;
    if (dias > VALIDADE_OFFLINE) return { status: "vencida" };
    const resumo = await this._resumo(senha, c.salt);
    if (!resumo || resumo !== c.resumo) return { status: "senha" };
    return { status: "ok", dados: { email: c.email, usuario: c.usuario, nome: c.nome, perfil: c.perfil } };
  },

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
          const r = await this._buscarUsuario(user.email);
          if (r.status === "ok") {
            this.usuario = r.dados;
            this._salvarSessao(r.dados);
            return responder({ modo: "ok" });
          }
          if (r.status === "erro-rede") {
            // não deu para conferir: segue com a sessão salva, sem derrubar ninguém
            const s = this._lerSessao();
            if (s) { this.usuario = s; this._offline = true; return responder({ modo: "offline" }); }
            return responder({ modo: "login", erro: "Não deu para confirmar seu acesso. Tente de novo com internet." });
          }
          await this.sair(true);
          responder({ modo: "login", erro: "Acesso não liberado. Fale com o gestor." });
        });
      } catch (e) { clearTimeout(timer); responder({ modo: "login" }); }
    });
  },

  /* ---- lê a liberação do usuário (usuarios/{email}) ---- */
  async _buscarUsuario(email) {
    const id = String(email || "").trim().toLowerCase();
    try {
      const doc = await firebase.firestore().collection("usuarios").doc(id).get();
      if (!doc.exists) return { status: "nao-liberado" };
      const d = doc.data() || {};
      if (d.ativo === false) return { status: "nao-liberado" };
      return { status: "ok", dados: {
        email: id,
        usuario: usuarioDe(id),
        nome: d.nome || usuarioDe(id),
        perfil: d.perfil === "gestor" ? "gestor" : "operador"
      } };
    } catch (e) {
      // sinal ruim/servidor fora: NÃO é o mesmo que "sem permissão"
      return { status: "erro-rede" };
    }
  },

  async entrar(usuario, senha) {
    const id = emailDe(usuario);
    if (!id) return { ok: false, erro: "Informe seu usuário." };
    if (!this.sdkDisponivel() || !navigator.onLine) return this._entrarOffline(id, senha);
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(id, senha);
      const r = await this._buscarUsuario(cred.user.email);
      if (r.status === "ok") {
        this.usuario = r.dados; this._offline = false;
        this._salvarSessao(r.dados);
        await this._salvarConta(r.dados, senha);      // habilita entrar sem internet depois
        return { ok: true };
      }
      if (r.status === "erro-rede") {
        const off = await this._entrarOffline(id, senha);
        if (off.ok) return off;
        return { ok: false, erro: "Não deu para confirmar seu acesso. Tente de novo com internet." };
      }
      await this.sair(true);
      return { ok: false, erro: "Acesso não liberado. Fale com o gestor." };
    } catch (e) {
      const cod = (e && e.code) || "";
      // caiu a rede no meio: tenta pelo que está guardado neste celular
      if (cod.includes("network") || cod.includes("unavailable") || cod.includes("timeout")) {
        const off = await this._entrarOffline(id, senha);
        if (off.ok) return off;
      }
      return { ok: false, erro: this._msgErro(e) };
    }
  },

  /* Entrada sem internet: só funciona para quem já entrou neste aparelho. */
  async _entrarOffline(id, senha) {
    const r = await this._conferirLocal(id, senha);
    if (r.status === "ok") {
      this.usuario = r.dados;
      this._offline = true;
      this._senhaMemoria = senha;          // só na memória, para reconectar quando a rede voltar
      this._salvarSessao(r.dados);
      return { ok: true, offline: true };
    }
    if (r.status === "senha") return { ok: false, erro: "Senha incorreta." };
    if (r.status === "vencida") return { ok: false, erro: "Faz muito tempo sem conectar. Entre uma vez com internet." };
    return { ok: false, erro: "Sem internet. Este usuário ainda não entrou neste celular — é preciso conectar uma vez." };
  },

  /* Rede voltou: troca a sessão offline por uma real, sem incomodar ninguém. */
  async _promover() {
    if (!this._offline || !this._senhaMemoria || !this.sdkDisponivel() || !this.usuario) return false;
    try {
      const cred = await firebase.auth().signInWithEmailAndPassword(this.usuario.email, this._senhaMemoria);
      const r = await this._buscarUsuario(cred.user.email);
      if (r.status !== "ok") return false;
      this.usuario = r.dados; this._offline = false;
      this._salvarSessao(r.dados);
      await this._salvarConta(r.dados, this._senhaMemoria);
      if (typeof Cloud !== "undefined") Cloud.iniciar().catch(() => {});
      return true;
    } catch (e) { return false; }
  },

  /* Só faz sentido para e-mail de verdade; com usuário interno, quem redefine é o gestor. */
  async recuperarSenha(usuario) {
    const id = emailDe(usuario);
    if (id.endsWith("@" + DOMINIO_INTERNO)) {
      return { ok: false, erro: "Peça ao gestor para redefinir sua senha." };
    }
    if (!this.sdkDisponivel()) return { ok: false, erro: "Sem internet no momento." };
    try {
      await firebase.auth().sendPasswordResetEmail(id);
      return { ok: true };
    } catch (e) { return { ok: false, erro: this._msgErro(e) }; }
  },

  async sair(silencioso) {
    // as credenciais locais FICAM: é o que permite voltar sem internet
    this.usuario = null; this._offline = false; this._senhaMemoria = null;
    this._limparSessao();
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
      return snap.docs.map(d => Object.assign({ email: d.id, usuario: usuarioDe(d.id) }, d.data()));
    } catch (e) { return []; }
  },
  /* Cria a pessoa no Firebase SEM derrubar quem está logado.
     O createUser troca a sessão do app onde roda — por isso ele roda num
     SEGUNDO app do Firebase, descartado logo em seguida. */
  async criarUsuario(usuario, senha, dados) {
    if (!this.sdkDisponivel()) return { ok: false, erro: "Sem internet no momento." };
    const id = emailDe(usuario);
    if (!id) return { ok: false, erro: "Informe o nome de usuário." };
    if (!senha || senha.length < 6) return { ok: false, erro: "A senha precisa de 6 caracteres ou mais." };

    let secundario = null, jaExistia = false;
    try {
      secundario = firebase.apps.find(a => a.name === "adm") || firebase.initializeApp(FIREBASE_CONFIG, "adm");
      await secundario.auth().createUserWithEmailAndPassword(id, senha);
    } catch (e) {
      const cod = (e && e.code) || "";
      if (cod.includes("email-already-in-use")) jaExistia = true;
      else {
        try { if (secundario) await secundario.delete(); } catch (x) {}
        return { ok: false, erro: this._msgErro(e) };
      }
    }
    try { await secundario.auth().signOut(); } catch (e) {}
    try { await secundario.delete(); } catch (e) {}

    const r = await this.salvarUsuario(usuario, dados);
    if (!r.ok) return r;
    return { ok: true, jaExistia };
  },

  async salvarUsuario(usuario, dados) {
    if (!this.sdkDisponivel()) return { ok: false, erro: "Sem internet no momento." };
    const id = emailDe(usuario);
    if (!id) return { ok: false, erro: "Informe o nome de usuário." };
    // mexer no próprio perfil ou se bloquear tira o acesso e não teria volta pelo app
    if (this.usuario && id === this.usuario.email &&
        (dados.perfil && dados.perfil !== "gestor" || dados.ativo === false)) {
      return { ok: false, erro: "Você não pode tirar o seu próprio acesso." };
    }
    try {
      await firebase.firestore().collection("usuarios").doc(id).set(dados, { merge: true });
      return { ok: true };
    } catch (e) { return { ok: false, erro: "Não foi possível salvar (confira as regras do Firestore)." }; }
  },
  async removerUsuario(usuario) {
    if (!this.sdkDisponivel()) return { ok: false, erro: "Sem internet no momento." };
    // a trava fica aqui, e não só na tela: excluir a própria liberação tranca o acesso
    if (this.usuario && emailDe(usuario) === this.usuario.email) {
      return { ok: false, erro: "Você não pode excluir o seu próprio acesso." };
    }
    try {
      await firebase.firestore().collection("usuarios").doc(emailDe(usuario)).delete();
      return { ok: true };
    } catch (e) { return { ok: false, erro: "Não foi possível remover." }; }
  }
};

if (typeof window !== "undefined") {
  window.Auth = Auth;
  window.addEventListener("online", () => { Auth._promover(); });
  window.emailDe = emailDe;
  window.usuarioDe = usuarioDe;
}
