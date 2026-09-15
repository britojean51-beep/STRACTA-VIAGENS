/* SDK do Firebase de mentira, do lado da página.
   - auth: usuários fixos, com sessão que sobrevive ao reload (como a de verdade)
   - firestore: conversa com o Firestore de mentira do Node (__fsSet/__fsGet/...) */
window.__USERS__ = {
  auth: [{ email: 'jean@gp2t.local', senha: '123456' },
         { email: 'ze@gp2t.local', senha: '123456' },
         { email: 'op@gp2t.local', senha: '123456' }]
};
window.__SEM_REDE__ = false;
window.__ENVIOS_FS__ = 0;

(function () {
  const SESSAO_SDK = "__sdk_sessao__";
  var _cb = null, _user = null;

  function comMetodos(u) {
    if (!u) return u;
    u.reauthenticateWithCredential = async function (cred) {
      if (window.__SEM_REDE__) { var e0 = new Error("offline"); e0.code = "auth/network-request-failed"; throw e0; }
      var c = window.__USERS__.auth.find(function (x) { return x.email === u.email; });
      if (!c || !cred || cred.email !== u.email || c.senha !== cred.senha) {
        var e = new Error("senha"); e.code = "auth/wrong-password"; throw e;
      }
      return { user: { email: u.email } };
    };
    u.updatePassword = async function (nova) {
      if (window.__SEM_REDE__) { var e0 = new Error("offline"); e0.code = "auth/network-request-failed"; throw e0; }
      if (!nova || nova.length < 6) { var e = new Error("fraca"); e.code = "auth/weak-password"; throw e; }
      var c = window.__USERS__.auth.find(function (x) { return x.email === u.email; });
      if (c) c.senha = nova;
      return true;
    };
    return u;
  }
  try { _user = comMetodos(JSON.parse(localStorage.getItem(SESSAO_SDK) || "null")); } catch (e) { _user = null; }
  function setUser(u) {
    _user = comMetodos(u);
    try { u ? localStorage.setItem(SESSAO_SDK, JSON.stringify(u)) : localStorage.removeItem(SESSAO_SDK); } catch (e) {}
  }

  function conferir(r) {
    if (r === "__NEGADO__") { var e = new Error("denied"); e.code = "permission-denied"; throw e; }
    return r;
  }
  const rede = () => {
    if (window.__SEM_REDE__) { var e = new Error("offline"); e.code = "unavailable"; throw e; }
  };

  /* ---- documento ---- */
  function Doc(caminho) {
    this.id = caminho.split("/").pop();
    this.path = caminho;
  }
  /* subcoleção: frota/gp2t -> frota/gp2t/solicitacoes. Sem isto, nada abaixo de
     frota/{id} existe — que é onde moram lançamentos, cadastro e solicitações. */
  Doc.prototype.collection = function (nome) { return new Col(this.path + "/" + nome); };
  Doc.prototype.get = async function () {
    rede();
    const raw = conferir(await window.__fsGet(this.path));
    const dados = raw ? JSON.parse(raw) : null;
    const id = this.id;
    return { exists: !!dados, id, data: () => dados };
  };
  /* ouvinte de um documento só (cadastro/frota, cadastro/operacao, cadastro/estoque) */
  Doc.prototype.onSnapshot = function (cb, errCb) {
    const self = this;
    let anterior = null, vivo = true;
    const passo = async () => {
      if (!vivo) return;
      try {
        const raw = conferir(await window.__fsGet(self.path));
        if (raw !== anterior) {
          anterior = raw;
          const dados = raw ? JSON.parse(raw) : null;
          cb({ exists: !!dados, id: self.id, data: () => dados });
        }
      } catch (e) { if (errCb) { vivo = false; errCb(e); return; } }
      if (vivo) setTimeout(passo, 300);
    };
    passo();
    return () => { vivo = false; };
  };
  Doc.prototype.set = async function (dados, opts) {
    rede();
    window.__ENVIOS_FS__++;
    conferir(await window.__fsSet(this.path, JSON.stringify(limpar(dados)), !!(opts && opts.merge)));
    return true;
  };
  Doc.prototype.update = Doc.prototype.set;
  Doc.prototype.delete = async function () {
    rede();
    conferir(await window.__fsDel(this.path));
    return true;
  };
  /* FieldValue vira marcador que o Node entende */
  function limpar(o) {
    if (o === null || typeof o !== "object") return o;
    if (Array.isArray(o)) return o.map(limpar);
    if (o.__marcador__ === "del") return { __del__: true };
    if (o.__marcador__ === "inc") return { __inc__: o.n };
    const out = {};
    Object.keys(o).forEach(k => { out[k] = limpar(o[k]); });
    return out;
  }

  /* ---- coleção ---- */
  function Col(caminho) { this.path = caminho; this._filtros = []; }
  Col.prototype.doc = function (id) { return new Doc(this.path + "/" + id); };
  Col.prototype.where = function (campo, op, valor) {
    const c = new Col(this.path);
    c._filtros = this._filtros.concat([[campo, op, valor]]);
    return c;
  };
  Col.prototype._ler = async function () {
    const raw = conferir(await window.__fsLista(this.path));
    let itens = JSON.parse(raw || "[]").map(([id, json]) => ({ id, dados: JSON.parse(json) }));
    this._filtros.forEach(([campo, op, valor]) => {
      itens = itens.filter(x => {
        const v = x.dados[campo];
        if (op === ">=") return v >= valor;
        if (op === "==") return v === valor;
        if (op === "<=") return v <= valor;
        return true;
      });
    });
    return itens;
  };
  Col.prototype.get = async function () {
    rede();
    const itens = await this._ler();
    return { docs: itens.map(x => ({ id: x.id, data: () => x.dados })) };
  };
  /* onSnapshot por sondagem: simples e suficiente para o teste ver a mudança
     chegar de um "celular" no outro. */
  Col.prototype.onSnapshot = function (cb, errCb) {
    const self = this;
    let anterior = new Map();
    let vivo = true;
    const passo = async () => {
      if (!vivo) return;
      try {
        const itens = await self._ler();
        const atual = new Map(itens.map(x => [x.id, JSON.stringify(x.dados)]));
        const mudancas = [];
        atual.forEach((json, id) => {
          if (!anterior.has(id)) mudancas.push({ type: "added", doc: { id, data: () => JSON.parse(json) } });
          else if (anterior.get(id) !== json) mudancas.push({ type: "modified", doc: { id, data: () => JSON.parse(json) } });
        });
        anterior.forEach((json, id) => {
          if (!atual.has(id)) mudancas.push({ type: "removed", doc: { id, data: () => JSON.parse(json) } });
        });
        anterior = atual;
        if (mudancas.length) cb({ metadata: { hasPendingWrites: false }, docChanges: () => mudancas });
      } catch (e) { if (errCb) { vivo = false; errCb(e); return; } }
      if (vivo) setTimeout(passo, 300);
    };
    passo();
    return () => { vivo = false; };
  };

  function Documento(caminho) { return new Doc(caminho); }

  function firestore() {
    return {
      enablePersistence: async () => true,
      collection: nome => new Col(nome),
      doc: caminho => Documento(caminho)
    };
  }
  firestore.FieldValue = {
    increment: n => ({ __marcador__: "inc", n }),
    delete: () => ({ __marcador__: "del" })
  };

  function fabricaAuth(escopo) {
    var proprio = null;
    return function () {
      return {
        get currentUser() { return escopo === "principal" ? _user : proprio; },
        setPersistence: async function () {},
        createUserWithEmailAndPassword: async function (email, senha) {
          if (window.__SEM_REDE__) { var e0 = new Error("offline"); e0.code = "auth/network-request-failed"; throw e0; }
          if (window.__USERS__.auth.some(function (x) { return x.email === email; })) {
            var e1 = new Error("existe"); e1.code = "auth/email-already-in-use"; throw e1;
          }
          if (!senha || senha.length < 6) { var e2 = new Error("fraca"); e2.code = "auth/weak-password"; throw e2; }
          window.__USERS__.auth.push({ email: email, senha: senha });
          if (escopo === "principal") { setUser({ email: email }); if (_cb) _cb(_user); }
          else proprio = { email: email };
          return { user: { email: email } };
        },
        signOut: async function () {
          if (escopo === "principal") { setUser(null); if (_cb) _cb(null); } else proprio = null;
        }
      };
    };
  }
  var authSecundario = {};

  window.firebase = {
    apps: [],
    initializeApp: function (cfg, nome) {
      var self = this;
      if (!nome) { this.apps = [{ name: "[DEFAULT]" }]; return { name: "[DEFAULT]" }; }
      var app = {
        name: nome,
        auth: authSecundario[nome] || (authSecundario[nome] = fabricaAuth(nome)),
        delete: async function () { self.apps = self.apps.filter(function (a) { return a.name !== nome; }); }
      };
      this.apps = this.apps.filter(function (a) { return a.name !== nome; }).concat([app]);
      return app;
    },
    app: function () { return { name: "[DEFAULT]" }; },
    auth: Object.assign(function () {
      return {
        get currentUser() { return _user; },
        setPersistence: async function () {},
        onAuthStateChanged: function (cb) { _cb = cb; setTimeout(function () { cb(_user); }, 0); },
        signInWithEmailAndPassword: async function (email, senha) {
          if (window.__SEM_REDE__) { var er = new Error("offline"); er.code = "auth/network-request-failed"; throw er; }
          var u = window.__USERS__.auth.find(function (x) { return x.email === email; });
          if (!u) { var e1 = new Error('x'); e1.code = 'auth/user-not-found'; throw e1; }
          if (u.senha !== senha) { var e2 = new Error('x'); e2.code = 'auth/wrong-password'; throw e2; }
          setUser({ email: email }); if (_cb) _cb(_user);
          return { user: { email: email } };
        },
        sendPasswordResetEmail: async function () { return true; },
        signOut: async function () { setUser(null); if (_cb) _cb(null); }
      };
    }, {
      Auth: { Persistence: { LOCAL: 'local' } },
      EmailAuthProvider: { credential: function (email, senha) { return { email: email, senha: senha }; } }
    }),
    firestore: firestore
  };
})();
