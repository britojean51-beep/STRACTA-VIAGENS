/* ============================================================
   Checklist · Envio em segundo plano
   ------------------------------------------------------------
   Checklist feito SEM SINAL fica guardado na "saída" do aparelho
   (IndexedDB ck_saida). Quando a internet volta, ele sai sozinho:
   - com o app aberto: pelo próprio app (enviarSaida, em app.js);
   - com o app FECHADO: pelo service worker (evento "sync" do Android),
     falando direto com o Firestore (REST), com o login guardado no aparelho.
   As fotos da fila (ck_midias) vão junto. As regras do Firestore são as
   mesmas: o envio é em nome de quem fez o checklist.
   Este arquivo roda nos dois lugares (página e service worker).
   ============================================================ */
const Saida = {
  _db: null,
  _abrir() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((ok, falha) => {
      const req = indexedDB.open("ck_saida", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("itens", { keyPath: "id" });
      req.onsuccess = () => { this._db = req.result; ok(this._db); };
      req.onerror = () => falha(req.error);
    });
  },
  async _tx(modo, fn) {
    const db = await this._abrir();
    return new Promise((ok, falha) => {
      const tx = db.transaction("itens", modo);
      const r = fn(tx.objectStore("itens"));
      tx.oncomplete = () => ok(r && r.result !== undefined ? r.result : undefined);
      tx.onerror = () => falha(tx.error);
    });
  },
  /* item: { id, email, docPath, equipPath, resultado, dados, criadoEm } */
  guardar(item) { return this._tx("readwrite", os => { os.put(item); }); },
  todos() { return this._tx("readonly", os => os.getAll()).catch(() => []); },
  apagar(id) { return this._tx("readwrite", os => { os.delete(id); }); }
};

/* pede ao Android para avisar o service worker quando a internet voltar */
function pedirEnvioEmSegundoPlano() {
  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(r => r.sync && r.sync.register("ck-enviar")).catch(() => {});
    }
  } catch (e) {}
}

/* ---- Firestore pela REST (só o service worker usa) ---- */
const EnvioREST = {
  base() { return "https://firestore.googleapis.com/v1/projects/" + FIREBASE_CONFIG.projectId + "/databases/(default)/documents"; },
  nome(path) { return "projects/" + FIREBASE_CONFIG.projectId + "/databases/(default)/documents/" + path; },

  valor(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === "string") return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(x => this.valor(x)) } };
    return { mapValue: { fields: this.campos(v) } };
  },
  campos(o) {
    const f = {};
    Object.keys(o || {}).forEach(k => { if (o[k] !== undefined) f[k] = this.valor(o[k]); });
    return f;
  },
  /* nome de campo no caminho: com crase quando não é só letras/números */
  campo(...partes) {
    return partes.map(p => /^[a-zA-Z_][a-zA-Z_0-9]*$/.test(p) ? p : "`" + String(p).replace(/[\\`]/g, c => "\\" + c) + "`").join(".");
  },

  /* login guardado pelo Firebase no aparelho; renova o passe se venceu */
  async token() {
    const db = await new Promise((ok, falha) => {
      const req = indexedDB.open("firebaseLocalStorageDb");
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
    if (!db.objectStoreNames.contains("firebaseLocalStorage")) { db.close(); return null; }
    const chave = "firebase:authUser:" + FIREBASE_CONFIG.apiKey + ":[DEFAULT]";
    const reg = await new Promise(ok => {
      const r = db.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").get(chave);
      r.onsuccess = () => ok(r.result); r.onerror = () => ok(null);
    });
    db.close();
    const u = reg && reg.value, t = u && u.stsTokenManager;
    if (!u || !t || !u.email) return null;
    if (t.accessToken && t.expirationTime > Date.now() + 60000) return { email: String(u.email).toLowerCase(), id: t.accessToken };
    if (!t.refreshToken) return null;
    const res = await fetch("https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(FIREBASE_CONFIG.apiKey), {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(t.refreshToken)
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.id_token ? { email: String(u.email).toLowerCase(), id: j.id_token } : null;
  },

  async ler(tk, path) {
    const res = await fetch(this.base() + "/" + path, { headers: { Authorization: "Bearer " + tk.id } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("ler " + res.status);
    return res.json();
  },
  async gravar(tk, writes) {
    const res = await fetch(this.base() + ":commit", {
      method: "POST", headers: { Authorization: "Bearer " + tk.id, "Content-Type": "application/json" },
      body: JSON.stringify({ writes })
    });
    if (!res.ok) throw new Error("gravar " + res.status);
  },

  /* o checklist e a pendência do equipamento, de uma vez só */
  async enviarChecklist(tk, it) {
    if (await this.ler(tk, it.docPath)) return "ja";   // o app já tinha enviado
    const writes = [];
    if (it.equipPath && it.resultado && it.resultado !== "liberado") {
      writes.push({
        update: { name: this.nome(it.equipPath), fields: { pendencias: { mapValue: { fields: { [it.id]: { stringValue: it.resultado } } } } } },
        updateMask: { fieldPaths: [this.campo("pendencias", it.id)] },
        currentDocument: { exists: true }
      });
    }
    writes.push({ update: { name: this.nome(it.docPath), fields: this.campos(it.dados) }, currentDocument: { exists: false } });
    await this.gravar(tk, writes);
    return "enviado";
  },

  async base64(blob) {
    const b = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  },
  /* uma foto da fila: o documento da foto e o "enviada" no checklist */
  async enviarFoto(tk, reg, inspPath) {
    const doc = await this.ler(tk, inspPath);
    if (!doc) return "espera";                       // o checklist ainda não chegou
    const m = (((doc.fields || {}).midias || {}).mapValue || {}).fields || {};
    const ja = (((m[reg.mid] || {}).mapValue || {}).fields || {}).ok;
    if (ja && ja.booleanValue) return "ja";
    const dados = "data:" + (reg.blob.type || "image/jpeg") + ";base64," + await this.base64(reg.blob);
    await this.gravar(tk, [
      { update: { name: this.nome(reg.path), fields: this.campos({ inspecao: reg.inspId, item: reg.item || "geral", criadoPor: tk.email, criadoEm: Date.now(), dados }) } },
      { update: { name: this.nome(inspPath), fields: { midias: { mapValue: { fields: { [reg.mid]: { mapValue: { fields: { ok: { booleanValue: true } } } } } } } } },
        updateMask: { fieldPaths: [this.campo("midias", reg.mid, "ok")] },
        updateTransforms: [{ fieldPath: "pendentes", increment: { integerValue: "-1" } }],
        // se o app marcou a foto no meio tempo, não desconta duas vezes
        currentDocument: { updateTime: doc.updateTime } }
    ]);
    return "enviado";
  }
};

/* fila de fotos (a mesma gaveta que o app usa: js/midia.js) */
const GavetaMidias = {
  _abrir() {
    return new Promise((ok, falha) => {
      const req = indexedDB.open("ck_midias", 1);
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore("midias", { keyPath: "mid" });
        os.createIndex("estado", "estado");
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  },
  async naFila() {
    const db = await this._abrir();
    return new Promise(ok => {
      const r = db.transaction("midias", "readonly").objectStore("midias").index("estado").getAll("fila");
      r.onsuccess = () => { db.close(); ok(r.result || []); }; r.onerror = () => { db.close(); ok([]); };
    });
  },
  async apagar(mid) {
    const db = await this._abrir();
    return new Promise(ok => {
      const tx = db.transaction("midias", "readwrite"); tx.objectStore("midias").delete(mid);
      tx.oncomplete = () => { db.close(); ok(); }; tx.onerror = () => { db.close(); ok(); };
    });
  }
};

/* o que o service worker faz quando a internet volta. Devolve quantos checklists saíram. */
async function enviarEmSegundoPlano() {
  const tk = await EnvioREST.token();
  if (!tk) return { checklists: [], fotos: 0 };
  const saiu = [];
  let falhou = false;
  for (const it of await Saida.todos()) {
    if (it.email !== tk.email) continue;             // de outra pessoa que usou o aparelho: espera ela entrar
    try {
      const r = await EnvioREST.enviarChecklist(tk, it);
      await Saida.apagar(it.id);
      if (r === "enviado") saiu.push(it);
    } catch (e) { falhou = true; }                   // fica na saída: tenta de novo depois
  }
  const naSaida = new Set((await Saida.todos()).map(x => x.id));
  let fotos = 0;
  for (const reg of await GavetaMidias.naFila()) {
    if (!reg.path || /(^|\/)checklist\//.test(reg.path) || !reg.inspId || naSaida.has(reg.inspId)) continue;   // Storage: só o app envia
    const inspPath = reg.inspPath || reg.path.replace(/(checklist_)?fotos\/[^/]+$/, (m, p) => (p ? "checklist_" : "") + "inspecoes/" + reg.inspId);
    try {
      const r = await EnvioREST.enviarFoto(tk, reg, inspPath);
      if (r !== "espera") { await GavetaMidias.apagar(reg.mid); if (r === "enviado") fotos++; }
    } catch (e) { falhou = true; }
  }
  return { checklists: saiu, fotos, falhou };
}
