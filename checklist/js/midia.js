/* ============================================================
   Checklist · Fotos e vídeos
   ------------------------------------------------------------
   - A foto é reduzida no próprio celular (1600 px, JPEG) e leva
     carimbo com equipamento, data e hora: é prova, não enfeite.
   - Tudo o que é capturado vai PRIMEIRO para o IndexedDB do aparelho.
     Só sai de lá depois que o Storage confirmou o envio — sem sinal no
     pátio, nada se perde; a fila esvazia sozinha quando a rede volta.
   ============================================================ */
/* ONDE FICAM AS FOTOS
   false (hoje): cada foto vira um documento em checklist_fotos no Firestore,
     que é grátis no plano atual. Sem vídeo: vídeo não cabe num documento.
   true: fotos e vídeos vão para o Firebase Storage. Exige o plano Blaze e as
     regras de checklist/regras-storage.txt. Os checklists antigos continuam
     abrindo, cada foto sabe onde mora. */
const USAR_STORAGE = false;

const FOTO_LADO = USAR_STORAGE ? 1600 : 1280;
const FOTO_QUALIDADE = USAR_STORAGE ? 0.72 : 0.6;
const FOTO_MAX_BYTES = 700 * 1024;  // documento do Firestore tem limite de 1 MiB (e base64 cresce 1/3)
const FOTOS_POR_CHECKLIST = USAR_STORAGE ? 40 : 12;
const VIDEO_MAX_MB = 60;          // tem que bater com a regra do Storage
const VIDEO_MAX_SEG = 60;

const Midia = {
  _db: null,
  video() { return USAR_STORAGE; },
  limiteFotos: FOTOS_POR_CHECKLIST,
  caminho(inspId, mid, ext) { return USAR_STORAGE ? "checklist/" + inspId + "/" + mid + "." + ext : "checklist_fotos/" + mid; },

  /* ---- IndexedDB: uma "gaveta" com os arquivos do aparelho ---- */
  _abrir() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((ok, falha) => {
      const req = indexedDB.open("ck_midias", 1);
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore("midias", { keyPath: "mid" });
        os.createIndex("estado", "estado");
      };
      req.onsuccess = () => { this._db = req.result; ok(this._db); };
      req.onerror = () => falha(req.error);
    });
  },
  async _tx(modo, fn) {
    const db = await this._abrir();
    return new Promise((ok, falha) => {
      const tx = db.transaction("midias", modo);
      const r = fn(tx.objectStore("midias"));
      tx.oncomplete = () => ok(r && r.result !== undefined ? r.result : r);
      tx.onerror = () => falha(tx.error);
      tx.onabort = () => falha(tx.error);
    });
  },
  guardar(reg) { return this._tx("readwrite", os => { os.put(reg); }); },
  ler(mid) { return this._tx("readonly", os => os.get(mid)); },
  apagar(mid) { return this._tx("readwrite", os => { os.delete(mid); }); },
  porEstado(estado) { return this._tx("readonly", os => os.index("estado").getAll(estado)); },
  async todos() { return this._tx("readonly", os => os.getAll()); },

  novoId() {
    const r = crypto.getRandomValues(new Uint8Array(6));
    return Date.now().toString(36) + [...r].map(b => b.toString(16).padStart(2, "0")).join("");
  },

  /* ---- foto: reduz e carimba ---- */
  async prepararFoto(arquivo, carimbo) {
    const img = await this._carregarImagem(arquivo);
    const escala = Math.min(1, FOTO_LADO / Math.max(img.width, img.height));
    const w = Math.round(img.width * escala), h = Math.round(img.height * escala);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    if (img.close) img.close();
    if (carimbo) {
      const fs = Math.max(14, Math.round(w / 40));
      ctx.font = "bold " + fs + "px sans-serif";
      const pad = Math.round(fs * 0.5);
      const tw = ctx.measureText(carimbo).width;
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fillRect(0, h - fs - pad * 2, Math.min(w, tw + pad * 2), fs + pad * 2);
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "bottom";
      ctx.fillText(carimbo, pad, h - pad);
    }
    let q = FOTO_QUALIDADE, blob = null;
    // foto de muito detalhe (cascalho, grade) comprime mal: baixa a qualidade até caber
    for (let i = 0; i < 5; i++) {
      blob = await new Promise(ok => cv.toBlob(ok, "image/jpeg", q));
      if (!blob || USAR_STORAGE || blob.size <= FOTO_MAX_BYTES) break;
      q -= 0.12;
    }
    if (!blob) throw new Error("Não deu para processar a foto.");
    if (!USAR_STORAGE && blob.size > FOTO_MAX_BYTES) throw new Error("Foto grande demais. Tire de novo, mais de perto.");
    return { blob, tipo: "foto", ext: "jpg", w, h };
  },
  _carregarImagem(arquivo) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(arquivo, { imageOrientation: "from-image" }).catch(() => this._imgTag(arquivo));
    }
    return this._imgTag(arquivo);
  },
  _imgTag(arquivo) {
    return new Promise((ok, falha) => {
      const url = URL.createObjectURL(arquivo);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); ok(im); };
      im.onerror = () => { URL.revokeObjectURL(url); falha(new Error("Arquivo de imagem inválido.")); };
      im.src = url;
    });
  },

  /* ---- vídeo: não dá para recomprimir no navegador, então limita ---- */
  async prepararVideo(arquivo) {
    const mb = arquivo.size / 1048576;
    if (mb > VIDEO_MAX_MB) {
      throw new Error("Vídeo muito grande (" + mb.toFixed(0) + " MB). Grave até " + VIDEO_MAX_SEG + " segundos.");
    }
    const dur = await new Promise(ok => {
      const v = document.createElement("video");
      const url = URL.createObjectURL(arquivo);
      const fim = d => { URL.revokeObjectURL(url); ok(d); };
      v.preload = "metadata";
      v.onloadedmetadata = () => fim(isFinite(v.duration) ? v.duration : 0);
      v.onerror = () => fim(0);
      setTimeout(() => fim(0), 4000);
      v.src = url;
    });
    if (dur > VIDEO_MAX_SEG + 2) {
      throw new Error("Vídeo com " + Math.round(dur) + " s. O limite é " + VIDEO_MAX_SEG + " s.");
    }
    const tipoMime = arquivo.type || "video/mp4";
    const ext = (tipoMime.split("/")[1] || "mp4").replace("quicktime", "mov").split(";")[0];
    return { blob: arquivo.slice(0, arquivo.size, tipoMime), tipo: "video", ext, dur: Math.round(dur) };
  },

  /* ---- fila de envio ---- */
  _enviando: false,
  aoMudar: null,            // a tela escuta para atualizar o contador

  async pendentes() {
    try { return (await this.porEstado("fila")).length; } catch (e) { return 0; }
  },

  /* Sobe o que estiver na fila. Um por vez: no 3G do pátio, paralelo só
     faz todos falharem juntos. */
  async processar() {
    if (this._enviando || !navigator.onLine || !Dados.online()) return;
    this._enviando = true;
    try {
      const fila = await this.porEstado("fila");
      for (const reg of fila) {
        if (!navigator.onLine) break;
        try {
          await this._enviarUm(reg);
          await this.apagar(reg.mid);
        } catch (e) {
          reg.tentativas = (reg.tentativas || 0) + 1;
          reg.ultimoErro = String((e && (e.code || e.message)) || e);
          await this.guardar(reg);
          // sem permissão não melhora tentando de novo agora
          if (String(reg.ultimoErro).includes("unauthorized")) break;
        }
        if (this.aoMudar) this.aoMudar();
      }
    } finally {
      this._enviando = false;
      if (this.aoMudar) this.aoMudar();
    }
  },

  async _enviarUm(reg) {
    if (!reg.path.startsWith("checklist/")) return this._enviarFirestore(reg);
    const ref = firebase.storage().ref(reg.path);
    // já subiu numa tentativa anterior (caiu antes de marcar)? não manda de novo
    let existe = false;
    try { await ref.getMetadata(); existe = true; } catch (e) { existe = false; }
    if (!existe) {
      await new Promise((ok, falha) => {
        const tarefa = ref.put(reg.blob, {
          contentType: reg.blob.type || (reg.tipo === "foto" ? "image/jpeg" : "video/mp4"),
          customMetadata: { inspecao: reg.inspId, item: reg.item || "geral" }
        });
        tarefa.on("state_changed", snap => {
          reg.progresso = snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0;
          if (this.aoProgresso) this.aoProgresso(reg);
        }, falha, ok);
      });
    }
    await Dados.marcarMidiaEnviada(reg.inspId, reg.mid);
  },

  /* Foto sem Storage: um documento por foto (cabe folgado no 1 MiB). O set
     repetido grava o mesmo conteúdo, então tentar de novo não duplica. */
  async _enviarFirestore(reg) {
    const dados = await new Promise((ok, falha) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = () => falha(fr.error);
      fr.readAsDataURL(reg.blob);
    });
    await firebase.firestore().doc(reg.path).set({
      inspecao: reg.inspId, item: reg.item || "geral", criadoPor: Dados.usuario.email,
      criadoEm: Date.now(), dados
    });
    await Dados.marcarMidiaEnviada(reg.inspId, reg.mid);
  },

  /* endereço para ver o arquivo (só quem está logado e liberado consegue) */
  async url(path) {
    if (!path.startsWith("checklist/")) {
      const d = await firebase.firestore().doc(path).get();
      if (!d.exists) throw new Error("foto não encontrada");
      return d.data().dados;
    }
    return firebase.storage().ref(path).getDownloadURL();
  },
  /* apagar o checklist leva as fotos do Firestore junto (as do Storage ficam: a regra não deixa apagar) */
  apagarRemotas(midias) {
    return Promise.all(Object.values(midias || {}).filter(m => m.path && !m.path.startsWith("checklist/"))
      .map(m => firebase.firestore().doc(m.path).delete().catch(() => {})));
  }
};

if (typeof window !== "undefined") {
  window.Midia = Midia;
  window.addEventListener("online", () => Midia.processar());
}
