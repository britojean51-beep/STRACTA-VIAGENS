/* ============================================================
   Checklist em PDF (um checklist por arquivo): cabeçalho, resultado,
   itens com observação, resolução e solicitação, e as fotos.
   O jsPDF só é baixado na primeira vez que alguém gera um PDF.
   ============================================================ */
const PDF_LIB = "js/vendor/jspdf-2.5.2.umd.min.js";

const PDF = {
  _lib: null,
  carregarLib() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    if (this._lib) return this._lib;
    this._lib = new Promise((ok, falha) => {
      const s = document.createElement("script");
      s.src = PDF_LIB;
      s.onload = () => window.jspdf ? ok(window.jspdf) : falha(new Error("jsPDF"));
      s.onerror = () => { this._lib = null; falha(new Error("Sem sinal para preparar o PDF.")); };
      document.head.appendChild(s);
    });
    return this._lib;
  },

  // a fonte padrão do PDF não tem emoji: tira o que não for texto comum
  _t(s) { return String(s == null ? "" : s).replace(/[^\u0000-ÿ–—•]/g, "").replace(/\s+/g, " ").trim(); },

  async _imagem(path) {
    const url = await Midia.url(path);
    const dim = await new Promise(ok => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.onerror = () => ok(null); im.src = url; });
    return dim ? { url, w: dim[0], h: dim[1] } : null;
  },

  async gerar(i) {
    const { jsPDF } = await this.carregarLib();
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const t = s => this._t(s);
    const W = 210, M = 14, L = W - 2 * M, BAIXO = 297 - 16;
    let y = 0;
    const COR = { ok: [21, 128, 61], alerta: [161, 92, 7], perigo: [185, 28, 28], texto: [11, 18, 32], muted: [71, 85, 105], linha: [203, 213, 225] };
    const cor = c => doc.setTextColor(...c);
    const novaPagina = () => { doc.addPage(); y = M; };
    const cabe = h => { if (y + h > BAIXO) novaPagina(); };

    const R = RESULTADOS[i.resultado] || RESULTADOS.liberado, A = RESULTADOS[statusAtual(i)];
    const clsCor = c => c === "ok" ? COR.ok : c === "alerta" ? COR.alerta : COR.perigo;
    const res = i.resolucoes || {}, sol = i.solicitacoes || {};
    const legado = i.tratativa && i.tratativa.status === "resolvido" && !i.resolucoes;
    const eq = i.equipamento || {};

    // faixa do topo
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 26, "F");
    doc.setFillColor(255, 122, 26); doc.rect(0, 26, W, 1.4, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(255, 255, 255);
    doc.text("CHECKLIST · " + t(nomeEquip(eq) || "Equipamento"), M, 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(203, 213, 225);
    doc.text(t((i.modelo || {}).nome) + "  ·  " + t(TIPOS[eq.tipo] || ""), M, 18);
    doc.text(t(dataHora(i.criadoEm)), W - M, 11, { align: "right" });
    y = 34;

    // dados
    const dados = [["Feito por", t(i.criadoNome) + (PERFIS[i.criadoPerfil] ? " (" + PERFIS[i.criadoPerfil].toLowerCase() + ")" : "")],
      ["Data e hora", t(dataHora(i.criadoEm))]];
    if (eq.descricao) dados.push(["Descrição", t(eq.descricao)]);
    if (i.km != null) dados.push(["KM", i.km.toLocaleString("pt-BR")]);
    if (i.horimetro != null) dados.push(["Horímetro", i.horimetro.toLocaleString("pt-BR")]);
    if (i.duracaoSeg) dados.push(["Duração", Math.max(1, Math.round(i.duracaoSeg / 60)) + " min"]);
    if (i.geo) dados.push(["Local", i.geo.lat.toFixed(5) + ", " + i.geo.lng.toFixed(5)]);
    doc.setFontSize(10);
    dados.forEach(([k, v], n) => {
      const x = M + (n % 2) * (L / 2), yy = y + Math.floor(n / 2) * 6;
      doc.setFont("helvetica", "bold"); cor(COR.muted); doc.text(k + ":", x, yy);
      doc.setFont("helvetica", "normal"); cor(COR.texto); doc.text(v, x + 24, yy);
    });
    y += Math.ceil(dados.length / 2) * 6 + 2;

    // resultado
    const nok = (i.itens || []).filter(x => x.st === "nok");
    const resolvidos = nok.filter(x => legado || res[x.id]).length;
    doc.setDrawColor(...clsCor(R.cls)); doc.setLineWidth(0.8);
    doc.roundedRect(M, y, L, nok.length ? 20 : 13, 2, 2, "S");
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); cor(clsCor(R.cls));
    doc.text("Resultado: " + t(R.txt), M + 4, y + 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); cor(COR.texto);
    doc.text(nok.length ? nok.length + " item(ns) não conforme(s)" : "Nenhum item não conforme.", W - M - 4, y + 8, { align: "right" });
    if (nok.length) {
      doc.setFont("helvetica", "bold"); cor(clsCor(A.cls));
      doc.text("Situação agora: " + t(A.txt), M + 4, y + 15);
      doc.setFont("helvetica", "normal"); cor(COR.texto);
      doc.text(resolvidos + " de " + nok.length + " resolvido(s)" + (solicitadosAbertos(i).length ? " · " + solicitadosAbertos(i).length + " com solicitação" : ""), W - M - 4, y + 15, { align: "right" });
    }
    y += (nok.length ? 20 : 13) + 5;

    const vistos = vistosDe(i);
    doc.setFontSize(9); cor(COR.muted);
    doc.text(vistos.length ? "Visualizado por " + t(textoVistos(vistos)) : "Ainda não visualizado pela gestão.", M, y);
    y += 7;

    // itens: os que pedem atenção primeiro, como na tela
    const peso = it => it.st !== "nok" ? 3 : (legado || res[it.id]) ? 2 : it.critico ? 0 : 1;
    const itens = (i.itens || []).map((it, n) => [it, n]).sort((a, b) => peso(a[0]) - peso(b[0]) || a[1] - b[1]).map(x => x[0]);
    const COL = { item: M + 2, nivel: M + 104, sit: M + 128 };
    const cabecalhoItens = () => {
      doc.setFillColor(241, 245, 249); doc.rect(M, y - 4.5, L, 7, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); cor(COR.muted);
      doc.text("ITEM", COL.item, y); doc.text("NÍVEL", COL.nivel, y); doc.text("SITUAÇÃO", COL.sit, y);
      y += 6;
    };
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); cor(COR.texto);
    cabe(20); doc.text("Itens verificados (" + itens.length + ")", M, y); y += 7;
    cabecalhoItens();
    itens.forEach(it => {
      doc.setFontSize(10);
      const linhasTxt = doc.splitTextToSize(t(it.texto), COL.nivel - COL.item - 3);
      const extras = [];
      if (it.st === "nok" && it.obs) extras.push({ c: COR.perigo, s: "Defeito: " + t(it.obs) });
      const r = res[it.id], sl = sol[it.id];
      if (it.st === "nok" && r) extras.push({ c: COR.ok, s: "Resolvido por " + t(r.por) + " em " + t(dataHora(r.em)) + (r.nota ? ": " + t(r.nota) : "") });
      else if (it.st === "nok" && legado) extras.push({ c: COR.ok, s: "Resolvido (tratativa geral)" });
      if (it.st === "nok" && sl && !r) extras.push({ c: COR.alerta, s: "Solicitado por " + t(sl.por) + " em " + t(dataHora(sl.em)) + ": " + t(sl.nota) });
      else if (it.st === "nok" && sl && r) extras.push({ c: COR.muted, s: "Antes: solicitado em " + t(dataHora(sl.em)) + " - " + t(sl.nota) });
      if (it.st !== "nok" && it.obs) extras.push({ c: COR.muted, s: "Obs.: " + t(it.obs) });
      doc.setFontSize(9);
      const linhasEx = extras.map(e => ({ c: e.c, l: doc.splitTextToSize(e.s, L - 6) }));
      const h = linhasTxt.length * 4.6 + linhasEx.reduce((a, e) => a + e.l.length * 4.1, 0) + 3;
      if (y + h > BAIXO) { novaPagina(); cabecalhoItens(); }
      const topo = y;
      if (it.st === "nok") { doc.setFillColor(...(r || legado ? [240, 253, 244] : [254, 242, 242])); doc.rect(M, topo - 4, L, h, "F"); }
      doc.setFontSize(10); doc.setFont("helvetica", it.st === "nok" ? "bold" : "normal"); cor(COR.texto);
      doc.text(linhasTxt, COL.item, y);
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); cor(it.critico ? COR.perigo : COR.muted);
      doc.text(it.critico ? "Crítico" : "Observação", COL.nivel, y);
      doc.setFont("helvetica", "bold");
      const st = it.st === "ok" ? ["Conforme", COR.ok] : it.st === "nok" ? [(r || legado) ? "Não conforme - resolvido" : "NÃO CONFORME", (r || legado) ? COR.ok : COR.perigo] : ["Não se aplica", COR.muted];
      cor(st[1]); doc.text(st[0], COL.sit, y);
      y += linhasTxt.length * 4.6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      linhasEx.forEach(e => { cor(e.c); doc.text(e.l, COL.item + 2, y); y += e.l.length * 4.1; });
      y = topo + h;
      doc.setDrawColor(...COR.linha); doc.setLineWidth(0.2); doc.line(M, y - 4, M + L, y - 4);
    });

    if (i.obs) {
      y += 3; cabe(16);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); cor(COR.texto); doc.text("Observação geral", M, y); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const l = doc.splitTextToSize(t(i.obs), L); cabe(l.length * 4.6); doc.text(l, M, y); y += l.length * 4.6 + 2;
    }

    // fotos: do defeito, da correção e as gerais, com legenda
    const nomeItem = id => { const it = (i.itens || []).find(x => x.id === id); return it ? t(it.texto) : ""; };
    const fotos = Object.entries(i.midias || {}).filter(([, m]) => m.ok && m.tipo !== "video" && m.path)
      .map(([mid, m]) => ({ mid, m, leg: m.item === "geral" ? "Geral" : String(m.item).startsWith("res:") ? "Correção · " + nomeItem(m.item.slice(4)) : nomeItem(m.item) }))
      .sort((a, b) => (a.m.item === "geral") - (b.m.item === "geral"));
    if (fotos.length) {
      const imgs = await Promise.all(fotos.map(f => this._imagem(f.m.path).catch(() => null)));
      y += 4; cabe(70);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); cor(COR.texto); doc.text("Fotos (" + fotos.length + ")", M, y); y += 4;
      const larg = (L - 6) / 2, alt = 62;
      let col = 0;
      fotos.forEach((f, n) => {
        const im = imgs[n];
        if (col === 0) cabe(alt + 9);
        const x = M + col * (larg + 6);
        if (im) {
          const esc = Math.min(larg / im.w, alt / im.h), w = im.w * esc, h = im.h * esc;
          try { doc.addImage(im.url, "JPEG", x + (larg - w) / 2, y + (alt - h) / 2, w, h); }
          catch (e) { doc.setFontSize(9); cor(COR.muted); doc.text("(foto indisponível)", x + 2, y + alt / 2); }
        } else { doc.setFontSize(9); cor(COR.muted); doc.text("(foto indisponível)", x + 2, y + alt / 2); }
        doc.setDrawColor(...COR.linha); doc.rect(x, y, larg, alt, "S");
        doc.setFontSize(8.5); cor(COR.muted);
        doc.text(doc.splitTextToSize(f.leg, larg)[0] || "", x, y + alt + 4);
        col = 1 - col;
        if (col === 0 || n === fotos.length - 1) y += alt + 9;
      });
    }
    const videos = Object.values(i.midias || {}).filter(m => m.tipo === "video").length;
    if (videos) { cabe(8); doc.setFontSize(9); cor(COR.muted); doc.text(videos + " vídeo(s) disponível(is) no app.", M, y); y += 6; }

    // rodapé em todas as páginas
    const n = doc.getNumberOfPages();
    const quem = t((Dados.usuario && (Dados.usuario.nome || Dados.usuario.usuario)) || "");
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setDrawColor(...COR.linha); doc.setLineWidth(0.2); doc.line(M, 297 - 11, W - M, 297 - 11);
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); cor(COR.muted);
      doc.text("Gerado em " + t(dataHora(Date.now())) + (quem ? " por " + quem : "") + "  ·  ID " + i.id, M, 297 - 6.5);
      doc.text("Página " + p + " de " + n, W - M, 297 - 6.5, { align: "right" });
    }
    const nome = ("checklist-" + (eq.prefixo || eq.placa || "equipamento") + "-" + diaDe(i.criadoEm) + ".pdf").replace(/[^\w.-]+/g, "_");
    return new File([doc.output("blob")], nome, { type: "application/pdf" });
  },

  /* celular: abre o "compartilhar" (WhatsApp, e-mail…); computador: baixa o arquivo */
  async enviar(i, botao) {
    if (botao) { botao.disabled = true; botao.dataset.txt = botao.textContent; botao.textContent = "Preparando o PDF…"; }
    try {
      const arq = await this.gerar(i);
      const titulo = "Checklist " + nomeEquip(i.equipamento) + " · " + dataHora(i.criadoEm);
      if (navigator.canShare && navigator.canShare({ files: [arq] })) {
        try { await navigator.share({ files: [arq], title: titulo }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(arq); a.download = arq.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast("PDF baixado: " + arq.name, "ok");
    } catch (e) {
      toast((e && e.message) || "Não deu para gerar o PDF.", "erro");
    } finally {
      if (botao && botao.isConnected) { botao.disabled = false; botao.textContent = botao.dataset.txt; }
    }
  }
};
