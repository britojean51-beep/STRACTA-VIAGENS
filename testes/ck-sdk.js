/* SDK do Firebase de mentira para o app de Checklist (/checklist).
   Auth, Firestore e Storage na própria página. O Firestore fica no localStorage
   (sobrevive ao reload, como a persistência de verdade). Com __SEM_REDE__ ligado,
   as gravações ficam numa fila e só "chegam no servidor" quando a rede volta —
   é o comportamento do Firestore que o app usa para funcionar no pátio sem sinal. */
(function () {
  const BANCO = "__ck_banco__", SESSAO = "__ck_sessao__";
  window.__SEM_REDE__ = false;
  window.__STORAGE__ = {};          // path -> { blob, contentType }
  window.__USERS__ = window.__USERS__ || [
    { email: "jean@gp2t.local", senha: "123456" },
    { email: "ze@gp2t.local", senha: "123456" }
  ];
  const ler = () => { try { return JSON.parse(localStorage.getItem(BANCO) || "{}"); } catch (e) { return {}; } };
  const gravar = b => localStorage.setItem(BANCO, JSON.stringify(b));
  const erro = (code) => { const e = new Error(code); e.code = code; return e; };
  const ouvintes = new Set();
  const avisar = () => ouvintes.forEach(f => { try { f(); } catch (e) {} });
  let fila = [];                     // gravações esperando a rede
  window.__redeVoltou = () => {
    window.__SEM_REDE__ = false;
    const f = fila; fila = [];
    f.forEach(ok => ok());
    window.dispatchEvent(new Event("online"));
  };

  /* ---- auth ---- */
  let user = null, cbs = [];
  try { user = JSON.parse(localStorage.getItem(SESSAO) || "null"); } catch (e) {}
  const setUser = u => { user = u ? comMetodos(u) : null; u ? localStorage.setItem(SESSAO, JSON.stringify({ email: u.email })) : localStorage.removeItem(SESSAO); cbs.forEach(cb => cb(user)); };
  function comMetodos(u) {
    u.reauthenticateWithCredential = async c => {
      const x = window.__USERS__.find(a => a.email === u.email);
      if (!x || x.senha !== c.senha) throw erro("auth/wrong-password");
    };
    u.updatePassword = async n => { window.__USERS__.find(a => a.email === u.email).senha = n; };
    return u;
  }
  if (user) comMetodos(user);
  function authDe(principal) {
    let proprio = null;
    return {
      get currentUser() { return principal ? user : proprio; },
      setPersistence: async () => {},
      onAuthStateChanged(cb) { if (principal) { cbs.push(cb); setTimeout(() => cb(user), 10); } return () => { cbs = cbs.filter(x => x !== cb); }; },
      async signInWithEmailAndPassword(email, senha) {
        if (window.__SEM_REDE__) throw erro("auth/network-request-failed");
        const x = window.__USERS__.find(a => a.email === email);
        if (!x || x.senha !== senha) throw erro("auth/invalid-credential");
        if (principal) setUser({ email }); else proprio = { email };
        return { user: { email } };
      },
      async createUserWithEmailAndPassword(email, senha) {
        if (window.__USERS__.some(a => a.email === email)) throw erro("auth/email-already-in-use");
        window.__USERS__.push({ email, senha });
        proprio = { email };
        return { user: { email } };
      },
      async signOut() { if (principal) setUser(null); else proprio = null; }
    };
  }
  const authPrincipal = authDe(true);

  /* ---- firestore ---- */
  let seq = 0;
  const novoId = () => "id" + Date.now().toString(36) + (seq++);
  function aplicar(path, dados, merge) {
    const b = ler();
    const atual = b[path];
    let novo;
    if (merge === "update") {
      if (!atual) throw erro("not-found");
      novo = JSON.parse(JSON.stringify(atual));
      Object.entries(dados).forEach(([k, v]) => {
        const partes = k.split("."); let o = novo;
        partes.slice(0, -1).forEach(p => { o[p] = o[p] || {}; o = o[p]; });
        const f = partes[partes.length - 1];
        if (v && v.__inc__ !== undefined) o[f] = (Number(o[f]) || 0) + v.__inc__; else o[f] = v;
      });
    } else if (merge && atual) novo = Object.assign({}, atual, dados);
    else novo = dados;
    b[path] = JSON.parse(JSON.stringify(novo));
    gravar(b); avisar();
  }
  // grava na hora no "cache" e só resolve quando a rede deixa
  function escrever(fn) {
    fn();
    return new Promise(ok => { if (window.__SEM_REDE__) fila.push(ok); else setTimeout(ok, 5); });
  }
  function Doc(path) { this.path = path; this.id = path.split("/").pop(); }
  Doc.prototype.set = function (d, o) { return escrever(() => aplicar(this.path, d, o && o.merge)); };
  Doc.prototype.update = function (d) { return escrever(() => aplicar(this.path, d, "update")); };
  Doc.prototype.delete = function () { return escrever(() => { const b = ler(); delete b[this.path]; gravar(b); avisar(); }); };
  Doc.prototype.get = async function (o) {
    if (o && o.source === "server" && window.__SEM_REDE__) throw erro("unavailable");
    const d = ler()[this.path];
    return { exists: !!d, id: this.id, data: () => d && JSON.parse(JSON.stringify(d)) };
  };
  function Col(path, f) { this.path = path; this.f = f || []; }
  Col.prototype.doc = function (id) { return new Doc(this.path + "/" + (id || novoId())); };
  Col.prototype.where = function (c, op, v) { return new Col(this.path, this.f.concat([["w", c, op, v]])); };
  Col.prototype.orderBy = function (c, dir) { return new Col(this.path, this.f.concat([["o", c, dir]])); };
  Col.prototype.limit = function (n) { return new Col(this.path, this.f.concat([["l", n]])); };
  Col.prototype._docs = function () {
    const b = ler();
    let l = Object.keys(b).filter(k => k.startsWith(this.path + "/") && !k.slice(this.path.length + 1).includes("/"))
      .map(k => ({ id: k.split("/").pop(), d: b[k] }));
    this.f.forEach(([t, c, op, v]) => {
      if (t === "w") l = l.filter(x => op === ">=" ? x.d[c] >= v : op === "==" ? x.d[c] === v : true);
      if (t === "o") l.sort((a, z) => (a.d[c] < z.d[c] ? -1 : 1) * (op === "desc" ? -1 : 1));
      if (t === "l") l = l.slice(0, c);
    });
    return { docs: l.map(x => ({ id: x.id, data: () => JSON.parse(JSON.stringify(x.d)) })) };
  };
  Col.prototype.get = async function () { return this._docs(); };
  Col.prototype.onSnapshot = function (cb) {
    const f = () => cb(this._docs());
    ouvintes.add(f); setTimeout(f, 5);
    return () => ouvintes.delete(f);
  };
  const fsInst = { enablePersistence: async () => {}, collection: n => new Col(n) };
  function firestore() { return fsInst; }
  firestore.FieldValue = { increment: n => ({ __inc__: n }) };

  /* ---- storage ---- */
  function Ref(path) { this.path = path; }
  Ref.prototype.getMetadata = async function () {
    if (window.__SEM_REDE__) throw erro("storage/retry-limit-exceeded");
    if (!window.__STORAGE__[this.path]) throw erro("storage/object-not-found");
    return { size: window.__STORAGE__[this.path].blob.size };
  };
  Ref.prototype.put = function (blob, meta) {
    const path = this.path, obs = [];
    setTimeout(() => {
      const [prog, falha, ok] = obs[0] || [];
      if (window.__SEM_REDE__) return falha && falha(erro("storage/retry-limit-exceeded"));
      prog && prog({ bytesTransferred: blob.size, totalBytes: blob.size });
      window.__STORAGE__[path] = { blob, contentType: meta && meta.contentType };
      ok && ok();
    }, 20);
    return { on: (ev, p, f, o) => obs.push([p, f, o]) };
  };
  Ref.prototype.getDownloadURL = async function () {
    const x = window.__STORAGE__[this.path];
    if (!x) throw erro("storage/object-not-found");
    return URL.createObjectURL(x.blob);
  };
  const stInst = { ref: p => new Ref(p) };

  const apps = [];
  window.firebase = {
    apps,
    initializeApp(cfg, nome) {
      const a = { name: nome || "[DEFAULT]", auth: () => nome ? (a._auth = a._auth || authDe(false)) : authPrincipal, delete: async () => { apps.splice(apps.indexOf(a), 1); } };
      apps.push(a); return a;
    },
    auth: Object.assign(() => authPrincipal, {
      Auth: { Persistence: { LOCAL: "local" } },
      EmailAuthProvider: { credential: (email, senha) => ({ email, senha }) }
    }),
    firestore,
    storage: () => stInst
  };
})();
