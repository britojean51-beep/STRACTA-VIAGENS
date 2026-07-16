/* ============================================================
   STRACTA · Controle de Frota — Lógica da interface
   ============================================================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $("#app");

/* Estado de navegação da tela de viagens (itens pendentes) */
let viagensBuffer = [];
/* Registro em edição (abastecimento) */
let editando = null;
/* Dia pré-selecionado ao abrir o Relatório (vindo do histórico) */
let relatorioDiaPre = null;
/* Equipamento selecionado ao abrir a Ficha */
let fichaEquip = null;

/* ---------- Utilidades numéricas ---------- */
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
const fmt = (n, d = 0) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/* ---------- Gráficos simples em SVG (offline, sem bibliotecas) ---------- */
function grafico(dados, opts = {}) {
  // dados: [{ label, valor, rotulo? }]  | tipo: 'barra' | 'linha'
  const w = 340, h = 150, padX = 12, padTop = 18, padBot = 26;
  const tipo = opts.tipo || "barra";
  const cor = opts.cor || "#ff7a1a";
  const max = Math.max(1, ...dados.map(d => d.valor));
  const areaW = w - padX * 2, areaH = h - padTop - padBot;
  if (!dados.length) return `<p class="empty">Sem dados para o gráfico.</p>`;

  let corpo = "";
  if (tipo === "linha") {
    const step = dados.length > 1 ? areaW / (dados.length - 1) : 0;
    const pts = dados.map((d, i) => {
      const x = padX + i * step;
      const y = padTop + areaH - (d.valor / max) * areaH;
      return { x, y, d };
    });
    const linha = pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
    corpo += `<path d="${linha}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round"/>`;
    corpo += pts.map(p =>
      `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${cor}"/>
       <text x="${p.x.toFixed(1)}" y="${(p.y - 7).toFixed(1)}" text-anchor="middle" font-size="9" fill="#e8eefc">${p.d.rotulo ?? p.d.valor}</text>
       <text x="${p.x.toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="8.5" fill="#93a2c4">${p.d.label}</text>`
    ).join("");
  } else {
    const gap = areaW / dados.length;
    const bw = gap * 0.6;
    corpo = dados.map((d, i) => {
      const bh = (d.valor / max) * areaH;
      const x = padX + i * gap + (gap - bw) / 2;
      const y = padTop + areaH - bh;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="3" fill="${cor}"/>
        <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="#e8eefc">${d.rotulo ?? d.valor}</text>
        <text x="${(x + bw / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="8.5" fill="#93a2c4">${d.label}</text>`;
    }).join("");
  }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet"
            role="img" aria-label="${opts.titulo || "gráfico"}">
            <line x1="${padX}" y1="${padTop + areaH}" x2="${w - padX}" y2="${padTop + areaH}" stroke="#26344f" stroke-width="1"/>
            ${corpo}
          </svg>`;
}

/* ---------- Toast ---------- */
function toast(msg, tipo = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show " + tipo;
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.className = "toast"), 2600);
}

/* ---------- Modal de confirmação ---------- */
function confirmar(msg) {
  return new Promise(res => {
    const ov = $("#modalOverlay");
    $("#modalMsg").textContent = msg;
    ov.classList.add("show");
    const done = v => { ov.classList.remove("show"); res(v); };
    $("#modalConfirm").onclick = () => done(true);
    $("#modalCancel").onclick = () => done(false);
  });
}

/* ============================================================
   ROTEADOR
   ============================================================ */
const rotas = {
  home:          telaHome,
  novodia:       telaNovoDia,
  abastecimento: telaAbastecimento,
  viagens:       telaViagens,
  manutencao:    telaManutencao,
  relatorio:     telaRelatorio,
  dashboard:     telaDashboard,
  frota:         telaFrota,
  ficha:         telaFicha,
  corrigir:      telaCorrigir
};

function abrirFicha(eq) { fichaEquip = eq; navegar("ficha"); }

function navegar(rota) {
  const fn = rotas[rota] || telaHome;
  window.scrollTo(0, 0);
  app.innerHTML = "";
  document.body.classList.toggle("has-back", rota !== "home");
  fn();
  // marca aba ativa
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.nav === rota));
  atualizarCabecalho();
  location.hash = rota;
}

function atualizarCabecalho() {
  const dia = DB.garantirDiaAtual();
  $("#headerDay").textContent = DB.fmtBR(dia);
}

/* ============================================================
   TELA INICIAL
   ============================================================ */
function telaHome() {
  $("#headerTitle").textContent = "🚛 STRACTA MINERAÇÃO";
  $("#headerSub").textContent = "CONTROLE DE FROTA";

  app.innerHTML = `
    <div class="menu-grid">
      <button class="menu-card accent wide" data-go="novodia">
        <span class="ico">🟢</span>
        <span class="lbl">NOVO DIA</span>
        <span class="desc">Fecha o dia e abre o próximo copiando KM e horímetro finais</span>
      </button>
      <button class="menu-card" data-go="abastecimento">
        <span class="ico">⛽</span><span class="lbl">Abastecimento</span>
        <span class="desc">Diesel, KM e horímetro</span>
      </button>
      <button class="menu-card" data-go="viagens">
        <span class="ico">🚚</span><span class="lbl">Viagens</span>
        <span class="desc">Origem, destino e ciclos</span>
      </button>
      <button class="menu-card" data-go="manutencao">
        <span class="ico">🔧</span><span class="lbl">Manutenção</span>
        <span class="desc">Preventiva e corretiva</span>
      </button>
      <button class="menu-card" data-go="corrigir">
        <span class="ico">✏️</span><span class="lbl">Corrigir Dados</span>
        <span class="desc">Editar ou excluir</span>
      </button>
      <button class="menu-card" data-go="relatorio">
        <span class="ico">📋</span><span class="lbl">Relatório Diário</span>
        <span class="desc">Gerado automático</span>
      </button>
      <button class="menu-card" data-go="frota">
        <span class="ico">🚛</span><span class="lbl">Frota</span>
        <span class="desc">Status e ficha por equipamento</span>
      </button>
      <button class="menu-card" data-go="dashboard">
        <span class="ico">📊</span><span class="lbl">Painel</span>
        <span class="desc">Alertas, gráficos e tendências</span>
      </button>
    </div>
    <div class="spacer"></div>
    <p class="hint" style="text-align:center">STRACTA · Gestão de Frota · funciona no celular, tablet e computador</p>
  `;
  $$("[data-go]").forEach(b => b.onclick = () => navegar(b.dataset.go));
}

/* ============================================================
   NOVO DIA
   ============================================================ */
function telaNovoDia() {
  $("#headerTitle").textContent = "🟢 Novo Dia";
  $("#headerSub").textContent = "FECHAMENTO E ABERTURA";
  const db = DB.load();
  const atual = DB.garantirDiaAtual();
  const r = DB.resumoDia(atual);
  const semMov = db.equipamentos.filter(e => !r.operando.includes(e) && !r.manutencao.includes(e));
  const sugestao = DB.proximoDia(atual);

  const kpi = (label, val, cls = "") =>
    `<div class="kpi ${cls}"><div class="k-label">${label}</div><div class="k-value">${val}</div></div>`;

  app.innerHTML = `
    <p class="section-title">Resumo do dia aberto · ${DB.fmtBR(atual)}</p>
    <div class="kpi-grid" style="margin-bottom:14px">
      ${kpi("⛽ Diesel", fmt(r.diesel) + '<span class="k-unit"> L</span>')}
      ${kpi("📈 Média", fmt(r.media, 2) + '<span class="k-unit"> km/L</span>', "k-green")}
      ${kpi("🚚 Viagens", r.viagens, "k-blue")}
      ${kpi("🛣️ KM", fmt(r.km) + '<span class="k-unit"> km</span>')}
      ${kpi("🟢 Operando", String(r.operando.length).padStart(2, "0"), "k-green")}
      ${kpi("🔧 Manutenção", String(r.manutencao.length).padStart(2, "0"), "k-red")}
    </div>

    <div class="card">
      <h3>⚠️ Pendências do dia</h3>
      ${semMov.length
        ? `<p class="hint">Equipamentos sem nenhum lançamento em ${DB.fmtBR(atual)}:</p>
           <div class="chip-row">${semMov.map(e => `<span class="chip">${e}</span>`).join("")}</div>`
        : `<p class="empty" style="padding:8px 0">✅ Todos os equipamentos tiveram movimento hoje.</p>`}
    </div>

    <div class="card">
      <h3>🟢 Fechar dia e abrir outro</h3>
      <p class="hint">O <b>KM Final</b> e o <b>Horímetro Final</b> de cada equipamento já entram como iniciais no novo dia, automaticamente.</p>
      <div class="field">
        <label>Data do novo dia</label>
        <input type="date" id="ndData" value="${sugestao}">
      </div>
      <button class="btn btn-green" id="btnNovoDia"></button>
    </div>

    <div class="card">
      <h3>📌 Acumulado que será copiado</h3>
      <div class="itemlist">${db.equipamentos.map(eq => {
        const u = DB.ultimo(eq);
        return `<div class="itemrow"><div class="info"><b>${eq}</b>
          <div class="sub">KM final: ${u.kmFinal ?? "—"} · Horím. final: ${u.horimetroFinal ?? "—"}</div></div></div>`;
      }).join("") || '<p class="empty">Sem dados ainda.</p>'}</div>
    </div>

    <div class="card">
      <h3>📅 Histórico de dias</h3>
      <div class="itemlist">${DB.listaDias().map(iso => {
        const rr = DB.resumoDia(iso);
        return `<div class="itemrow" data-dia="${iso}"><div class="info"><b>${DB.fmtBR(iso)}</b>${iso === atual ? ' <span class="pill pill-green">aberto</span>' : ""}
          <div class="sub">${fmt(rr.diesel)} L · ${rr.viagens} viagens · ${fmt(rr.media, 2)} km/L</div></div><span class="mini">ver ›</span></div>`;
      }).join("") || '<p class="empty">Sem dias registrados.</p>'}</div>
    </div>
  `;

  const dataInput = $("#ndData");
  const btn = $("#btnNovoDia");
  const rotulo = () => { btn.textContent = `🟢 FECHAR ${DB.fmtBR(atual)} → ABRIR ${DB.fmtBR(dataInput.value || sugestao)}`; };
  rotulo();
  dataInput.oninput = rotulo;

  btn.onclick = async () => {
    const nova = dataInput.value || sugestao;
    const ok = await confirmar(`Fechar o dia ${DB.fmtBR(atual)} e abrir ${DB.fmtBR(nova)}?`);
    if (!ok) return;
    const res = DB.novoDia(nova);
    toast(`✔ Dia ${DB.fmtBR(res.novo)} aberto!`);
    atualizarCabecalho();
    setTimeout(() => navegar("home"), 700);
  };

  $$("[data-dia]").forEach(el => el.onclick = () => { relatorioDiaPre = el.dataset.dia; navegar("relatorio"); });
}

/* ============================================================
   ABASTECIMENTO
   ============================================================ */
const SITUACOES = ["Continua em operação", "Retorno de manutenção", "Saída para manutenção", "Reserva", "Final de expediente"];

function telaAbastecimento() {
  $("#headerTitle").textContent = "⛽ Abastecimento";
  $("#headerSub").textContent = "DIESEL · ARLA · SITUAÇÃO";
  const db = DB.load();
  const dia = DB.garantirDiaAtual();
  const ed = editando;

  const optsEquip = db.equipamentos.map(e => `<option ${ed && ed.equipamento === e ? "selected" : ""}>${e}</option>`).join("");
  const optsMot = db.motoristas.map(m => `<option ${ed && ed.motorista === m ? "selected" : ""}>${m}</option>`).join("");
  const optsAb = db.abastecedores.map(a => `<option ${ed && ed.abastecedor === a ? "selected" : ""}>${a}</option>`).join("");
  const optsComb = ["S-10", "S-500"].map(c => `<option ${ed?.combustivel === c ? "selected" : ""}>${c}</option>`).join("");
  const optsSit = SITUACOES.map(s => `<option ${ed?.situacao === s ? "selected" : ""}>${s}</option>`).join("");

  app.innerHTML = `
    <div class="card">
      <h3>⛽ ${ed ? "Editar" : "Novo"} abastecimento <span class="badge-auto">auto-cálculo</span></h3>

      <div class="field">
        <label>Equipamento <span id="fTipoTag" class="badge-auto"></span></label>
        <select id="fEquip">${optsEquip}</select>
      </div>
      <div class="field">
        <label>Motorista / Operador</label>
        <select id="fMot">${optsMot}</select>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Horímetro Inicial <span class="badge-auto">auto</span></label>
          <input id="fHoriIni" inputmode="decimal" value="${ed?.horimetroInicial ?? ""}">
        </div>
        <div class="field">
          <label>Horímetro Final</label>
          <input id="fHoriFim" inputmode="decimal" value="${ed?.horimetroFinal ?? ""}">
        </div>
      </div>
      <div class="field">
        <label>Horas Trabalhadas</label>
        <input id="fHoras" class="computed" readonly value="${ed?.horasTrabalhadas ?? ""}">
      </div>

      <div id="blocoKm">
        <div class="field-row">
          <div class="field">
            <label>KM Inicial <span class="badge-auto">auto</span></label>
            <input id="fKmIni" inputmode="decimal" value="${ed?.kmInicial ?? ""}">
          </div>
          <div class="field">
            <label>KM Final</label>
            <input id="fKmFim" inputmode="decimal" value="${ed?.kmFinal ?? ""}">
          </div>
        </div>
        <div class="field">
          <label>KM Rodado</label>
          <input id="fKmRod" class="computed" readonly value="${ed?.kmRodado ?? ""}">
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Combustível</label>
          <select id="fComb">${optsComb}</select>
        </div>
        <div class="field">
          <label>Litros</label>
          <input id="fLitros" inputmode="decimal" value="${ed?.litros ?? ""}">
        </div>
      </div>
      <div class="field">
        <label id="fMediaLabel">Média</label>
        <input id="fMedia" class="computed" readonly value="${ed?.media ?? ""}">
      </div>
      <p class="hint" id="fMediaAlerta" style="display:none"></p>

      <div class="field-row">
        <div class="field">
          <label>Abasteceu ARLA 32?</label>
          <select id="fArla"><option value="nao" ${!ed?.arla ? "selected" : ""}>Não</option><option value="sim" ${ed?.arla ? "selected" : ""}>Sim</option></select>
        </div>
        <div class="field" id="fArlaLitrosWrap" style="${ed?.arla ? "" : "display:none"}">
          <label>Litros de ARLA</label>
          <input id="fArlaLitros" inputmode="decimal" value="${ed?.litrosArla ?? ""}">
        </div>
      </div>

      <div class="field">
        <label>Situação do equipamento</label>
        <select id="fSit">${optsSit}</select>
      </div>

      <div class="field">
        <label>Abastecedor</label>
        <select id="fAbast">${optsAb}</select>
      </div>
      <div class="field">
        <label>Observações</label>
        <textarea id="fObs">${ed?.observacoes ?? ""}</textarea>
      </div>

      <button class="btn btn-primary" id="btnSalvar">💾 ${ed ? "ATUALIZAR" : "SALVAR"}</button>
      ${ed ? '<div class="spacer"></div><button class="btn btn-ghost" id="btnCancelEdit">Cancelar edição</button>' : ""}
    </div>

    <div class="card">
      <h3>📈 Últimos abastecimentos <span id="fRecTitulo" class="mini"></span></h3>
      <div id="fRecentes"></div>
    </div>
  `;

  const el = {
    equip: $("#fEquip"), horiIni: $("#fHoriIni"), horiFim: $("#fHoriFim"), horas: $("#fHoras"),
    kmIni: $("#fKmIni"), kmFim: $("#fKmFim"), kmRod: $("#fKmRod"),
    litros: $("#fLitros"), media: $("#fMedia")
  };

  function tipoAtual() { return DB.getTipoEquip(el.equip.value); }
  function isHorimetro() { return tipoAtual() === "horimetro"; }

  function ajustarPorTipo() {
    const hor = isHorimetro();
    $("#blocoKm").style.display = hor ? "none" : "";
    $("#fTipoTag").textContent = hor ? "horímetro · L/h" : "km · km/L";
    $("#fMediaLabel").innerHTML = hor
      ? `Média L/h <span class="mini">(máx ${fmt(db.config.metaLh, 0)})</span>`
      : `Média km/L <span class="mini">(meta ${fmt(db.config.metaMedia, 2)})</span>`;
  }

  function preencherAuto() {
    if (!editando) {
      const u = DB.ultimo(el.equip.value);
      el.horiIni.value = u.horimetroFinal ?? "";
      el.kmIni.value = u.kmFinal ?? "";
    }
    ajustarPorTipo();
    recalcular();
    renderRecentes();
  }

  function recalcular() {
    const horas = num(el.horiFim.value) - num(el.horiIni.value);
    const kmRod = num(el.kmFim.value) - num(el.kmIni.value);
    const litros = num(el.litros.value);
    el.horas.value = horas > 0 ? fmt(horas, 1) + " h" : "";
    el.kmRod.value = kmRod > 0 ? fmt(kmRod, 0) + " km" : "";

    const hor = isHorimetro();
    let media = 0, unidade = hor ? "L/h" : "km/L";
    if (hor) media = (litros > 0 && horas > 0) ? litros / horas : 0;
    else media = (litros > 0 && kmRod > 0) ? kmRod / litros : 0;
    el.media.value = media > 0 ? fmt(media, 2) + " " + unidade : "";

    const al = $("#fMediaAlerta");
    let fora = false, txt = "";
    if (hor && media > 0 && media > db.config.metaLh) {
      fora = true; txt = `⚠️ Consumo <b>${fmt(media, 2)}</b> L/h acima da meta (${fmt(db.config.metaLh, 0)}).`;
    } else if (!hor && media > 0 && media < db.config.metaMedia) {
      fora = true; txt = `⚠️ Média <b>${fmt(media, 2)}</b> km/L abaixo da meta (${fmt(db.config.metaMedia, 2)}).`;
    }
    al.style.display = fora ? "block" : "none";
    if (fora) { al.innerHTML = txt; al.style.color = "var(--red)"; }
  }

  function renderRecentes() {
    const eq = el.equip.value;
    const f = DB.fichaEquipamento(eq);
    const ult = f.abast.slice(-3).reverse();
    $("#fRecTitulo").textContent = `· ${eq}`;
    $("#fRecentes").innerHTML = ult.length ? ult.map(a => {
      const und = a.unidadeMedia || "km/L";
      const extra = und === "L/h" ? `${a.horasTrabalhadas} h` : `${fmt(a.kmRodado)} km`;
      return `<div class="itemrow"><div class="info"><b>${DB.fmtBR(a.iso)}</b>
        <div class="sub">${fmt(a.litros)} L ${a.combustivel || "S-10"} · ${extra} · ${a.media} ${und}${a.litrosArla ? " · ARLA " + fmt(a.litrosArla) + " L" : ""}</div></div></div>`;
    }).join("") : '<p class="empty">Sem abastecimentos anteriores.</p>';
  }

  $("#fArla").onchange = e => { $("#fArlaLitrosWrap").style.display = e.target.value === "sim" ? "" : "none"; };
  el.equip.onchange = preencherAuto;
  [el.horiIni, el.horiFim, el.kmIni, el.kmFim, el.litros].forEach(i => i.oninput = recalcular);
  if (!editando) preencherAuto(); else { ajustarPorTipo(); recalcular(); renderRecentes(); }

  $("#btnSalvar").onclick = () => {
    const equip = el.equip.value;
    const hor = isHorimetro();
    const horiIni = num(el.horiIni.value), horiFim = num(el.horiFim.value);
    const kmIni = num(el.kmIni.value), kmFim = num(el.kmFim.value);
    const litros = num(el.litros.value);
    const arlaSim = $("#fArla").value === "sim";
    const litrosArla = arlaSim ? num($("#fArlaLitros").value) : 0;

    if (!litros) { toast("Informe os litros abastecidos", "err"); return; }
    if (horiFim < horiIni) { toast("Horímetro final menor que o inicial", "err"); return; }
    if (!hor && kmFim < kmIni) { toast("KM final menor que o inicial", "err"); return; }
    if (arlaSim && !litrosArla) { toast("Informe os litros de ARLA", "err"); return; }

    const horas = horiFim - horiIni;
    const kmRod = hor ? 0 : (kmFim - kmIni);
    const media = hor
      ? (horas > 0 ? litros / horas : 0)
      : (kmRod > 0 ? kmRod / litros : 0);
    const unidade = hor ? "L/h" : "km/L";

    const reg = {
      equipamento: equip,
      motorista: $("#fMot").value,
      horimetroInicial: horiIni,
      horimetroFinal: horiFim,
      horasTrabalhadas: fmt(horas, 1),
      kmInicial: hor ? null : kmIni,
      kmFinal: hor ? null : kmFim,
      kmRodado: kmRod,
      litros: litros,
      combustivel: $("#fComb").value,
      arla: arlaSim,
      litrosArla: litrosArla,
      media: fmt(media, 2),
      unidadeMedia: unidade,
      situacao: $("#fSit").value,
      abastecedor: $("#fAbast").value,
      observacoes: $("#fObs").value.trim()
    };

    if (editando) {
      DB.atualizarAbastecimento(editando._iso, editando.id, reg);
      editando = null;
      toast("✔ Abastecimento atualizado");
      navegar("corrigir");
    } else {
      DB.addAbastecimento(dia, reg);
      const foraMeta = hor ? (media > db.config.metaLh) : (media > 0 && media < db.config.metaMedia);
      if (reg.situacao === "Final de expediente") toast(`🌙 ${equip}: final de expediente`);
      else if (foraMeta) toast(`⚠️ ${equip}: consumo fora da meta`, "err");
      else toast(`✔ ${equip} salvo · ${fmt(litros, 0)} L`);
      telaAbastecimento();
    }
  };

  if (ed) $("#btnCancelEdit").onclick = () => { editando = null; navegar("corrigir"); };
}

/* ============================================================
   VIAGENS
   ============================================================ */
function telaViagens() {
  $("#headerTitle").textContent = "🚚 Viagens";
  $("#headerSub").textContent = "ORIGEM · DESTINO · CICLOS";
  const db = DB.load();
  const dia = DB.garantirDiaAtual();

  const optsEquip = db.equipamentos.map(e => `<option>${e}</option>`).join("");
  const optsMot = db.motoristas.map(m => `<option>${m}</option>`).join("");

  app.innerHTML = `
    <div class="card">
      <h3>🚚 Registrar viagens</h3>
      <div class="field">
        <label>Equipamento</label>
        <select id="vEquip">${optsEquip}</select>
      </div>
      <div class="field">
        <label>Motorista</label>
        <select id="vMot">${optsMot}</select>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Origem (código)</label>
          <input id="vOrig" inputmode="numeric" placeholder="01">
        </div>
        <div class="field">
          <label>Destino (código)</label>
          <input id="vDest" inputmode="numeric" placeholder="02">
        </div>
      </div>
      <div class="field">
        <label>Quantidade de viagens</label>
        <input id="vQtd" inputmode="numeric" placeholder="10">
      </div>
      <button class="btn btn-blue" id="btnAdd">➕ ADICIONAR ROTA</button>
    </div>

    <div class="card">
      <div class="list-head">
        <h3 style="margin:0">Rotas a salvar</h3>
        <span class="tag-total" id="somaBuffer">0 viagens</span>
      </div>
      <div class="itemlist" id="bufferList"><p class="empty">Nenhuma rota adicionada.</p></div>
      <button class="btn btn-primary" id="btnSalvar">💾 SALVAR VIAGENS</button>
    </div>

    <div class="card">
      <h3>📅 Viagens de hoje (${DB.fmtBR(dia)})</h3>
      <div id="hojeList"></div>
    </div>
  `;

  function renderBuffer() {
    const box = $("#bufferList");
    if (!viagensBuffer.length) {
      box.innerHTML = '<p class="empty">Nenhuma rota adicionada.</p>';
    } else {
      box.innerHTML = viagensBuffer.map((v, i) => `
        <div class="itemrow">
          <div class="info"><b>${v.equipamento}</b> · O${v.origem} → D${v.destino}
            <div class="sub">${v.motorista} · ${v.quantidade} viagens</div>
          </div>
          <button class="del" data-i="${i}">✕</button>
        </div>`).join("");
      $$("#bufferList .del").forEach(b => b.onclick = () => { viagensBuffer.splice(+b.dataset.i, 1); renderBuffer(); });
    }
    const soma = viagensBuffer.reduce((s, v) => s + Number(v.quantidade), 0);
    $("#somaBuffer").textContent = `${soma} viagens`;
  }

  function renderHoje() {
    const d = DB.getDia(dia);
    const vs = d ? d.viagens : [];
    const box = $("#hojeList");
    if (!vs.length) { box.innerHTML = '<p class="empty">Sem viagens salvas hoje.</p>'; return; }
    // agrupa por equipamento
    const porEq = {};
    vs.forEach(v => { (porEq[v.equipamento] ||= []).push(v); });
    let total = 0;
    // ranking: equipamentos ordenados por total de viagens
    const linhas = Object.entries(porEq).map(([eq, arr]) => {
      const sub = arr.reduce((s, v) => s + Number(v.quantidade), 0); total += sub;
      const rotas = arr.map(v => `O${v.origem}→D${v.destino}=${v.quantidade}`).join(" · ");
      return { eq, sub, rotas };
    }).sort((a, b) => b.sub - a.sub);

    const meta = DB.load().config.metaViagens || 0;
    const pct = meta > 0 ? Math.min(100, Math.round((total / meta) * 100)) : 0;
    const barra = meta > 0 ? `
      <div class="spacer"></div>
      <div class="list-head"><span class="mini">Meta do dia: ${meta} viagens</span><span class="tag-total">${total} · ${pct}%</span></div>
      <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>` : "";

    box.innerHTML = linhas.map((l, i) =>
      `<div class="itemrow"><div class="info">${i === 0 ? "🥇 " : ""}<b>${l.eq}</b> = ${l.sub} viagens
        <div class="sub">${l.rotas}</div></div></div>`
    ).join("") + `<div class="spacer"></div><p class="tag-total">Total frota: ${total} viagens</p>` + barra;
  }

  $("#btnAdd").onclick = () => {
    const orig = $("#vOrig").value.trim(), dest = $("#vDest").value.trim(), qtd = num($("#vQtd").value);
    if (!orig || !dest) { toast("Informe origem e destino", "err"); return; }
    if (!qtd) { toast("Informe a quantidade", "err"); return; }
    viagensBuffer.push({
      equipamento: $("#vEquip").value, motorista: $("#vMot").value,
      origem: orig.padStart(2, "0"), destino: dest.padStart(2, "0"), quantidade: qtd
    });
    $("#vOrig").value = ""; $("#vDest").value = ""; $("#vQtd").value = "";
    renderBuffer();
    toast("➕ Rota adicionada");
  };

  $("#btnSalvar").onclick = () => {
    if (!viagensBuffer.length) { toast("Adicione ao menos uma rota", "err"); return; }
    viagensBuffer.forEach(v => DB.addViagem(dia, v));
    toast(`✔ ${viagensBuffer.length} rota(s) salva(s)`);
    viagensBuffer = [];
    renderBuffer(); renderHoje();
  };

  renderBuffer(); renderHoje();
}

/* ============================================================
   MANUTENÇÃO
   ============================================================ */
function pillStatus(st) {
  if (st === "parado") return '<span class="pill pill-red">⛔ Parado</span>';
  if (st === "manutencao") return '<span class="pill pill-blue">🔧 Manutenção</span>';
  if (st === "reserva") return '<span class="pill pill-blue">🔵 Reserva</span>';
  if (st === "final_expediente") return '<span class="pill pill-gray">🌙 Final de expediente</span>';
  return '<span class="pill pill-green">🟢 Operando</span>';
}

/* opções de status usadas nos selects (Ficha e Manutenção) */
const STATUS_OPCOES = [
  ["operando", "🟢 Operando"],
  ["reserva", "🔵 Reserva"],
  ["manutencao", "🔧 Em manutenção"],
  ["parado", "⛔ Parado"],
  ["final_expediente", "🌙 Final de expediente"]
];
function optsStatus(sel) {
  return STATUS_OPCOES.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l}</option>`).join("");
}

function telaManutencao() {
  $("#headerTitle").textContent = "🔧 Manutenção";
  $("#headerSub").textContent = "SERVIÇOS · STATUS · REVISÕES";
  const db = DB.load();
  const dia = DB.garantirDiaAtual();
  const optsEquip = db.equipamentos.map(e => `<option>${e}</option>`).join("");
  const tipos = ["Preventiva", "Corretiva", "Lubrificação", "Calibração", "Troca de Óleo"];

  app.innerHTML = `
    <div class="card">
      <h3>🔧 Registrar manutenção</h3>
      <div class="field">
        <label>Equipamento</label>
        <select id="mEquip">${optsEquip}</select>
      </div>
      <div class="field">
        <label>Tipo</label>
        <select id="mTipo">${tipos.map(t => `<option>${t}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label>Serviço executado</label>
        <textarea id="mServico" placeholder="Descreva o serviço"></textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Horímetro / KM atual</label>
          <input id="mHorKm" inputmode="decimal" placeholder="19910">
        </div>
        <div class="field">
          <label>Situação após o serviço</label>
          <select id="mStatus">${optsStatus("operando")}</select>
        </div>
      </div>
      <div class="field">
        <label>Próxima revisão em (horímetro/KM) <span class="badge-auto">opcional</span></label>
        <input id="mProxRev" inputmode="decimal" placeholder="ex: 20000">
      </div>
      <div class="field">
        <label>Observações</label>
        <textarea id="mObs"></textarea>
      </div>
      <button class="btn btn-primary" id="btnSalvar">💾 SALVAR</button>
    </div>

    <div class="card">
      <h3>🚦 Situação e próximas revisões</h3>
      <div id="mRevisoes"></div>
    </div>

    <div class="card">
      <h3>📅 Manutenções de hoje (${DB.fmtBR(dia)})</h3>
      <div id="mHoje"></div>
    </div>
  `;

  // ao trocar de equipamento, mostra o status e a revisão já cadastrados
  const selEquip = $("#mEquip");
  function carregarEquip() {
    const eq = selEquip.value;
    $("#mStatus").value = DB.getStatus(eq);
    const rev = DB.getProximaRevisao(eq);
    $("#mProxRev").value = rev == null ? "" : rev;
  }
  selEquip.onchange = carregarEquip;

  function renderRevisoes() {
    const box = $("#mRevisoes");
    box.innerHTML = db.equipamentos.map(eq => {
      const st = DB.getStatus(eq);
      const rev = DB.getProximaRevisao(eq);
      const hor = DB.ultimo(eq).horimetroFinal;
      let aviso = '<span class="mini">sem revisão definida</span>';
      if (rev != null) {
        if (hor != null && hor >= rev) aviso = '<span class="pill pill-red">revisão vencida</span>';
        else if (hor != null && hor >= rev - 50) aviso = '<span class="pill pill-blue">revisão próxima</span>';
        else aviso = `<span class="mini">próxima em ${fmt(rev)}${hor != null ? ` · faltam ${fmt(rev - hor)}` : ""}</span>`;
      }
      return `<div class="itemrow" data-ficha="${eq}"><div class="info"><b>${eq}</b> ${pillStatus(st)}
        <div class="sub">${aviso}</div></div><span class="mini">ver ›</span></div>`;
    }).join("");
    $$("#mRevisoes [data-ficha]").forEach(el => el.onclick = () => abrirFicha(el.dataset.ficha));
  }

  function renderHoje() {
    const d = DB.getDia(dia);
    const ms = d ? d.manutencoes : [];
    const box = $("#mHoje");
    if (!ms.length) { box.innerHTML = '<p class="empty">Sem manutenções hoje.</p>'; return; }
    box.innerHTML = ms.map(m => `
      <div class="itemrow"><div class="info"><b>${m.equipamento}</b>
        <span class="pill pill-red">${m.tipo}</span>
        <div class="sub">${m.servico || "—"} · ${m.horKm || "—"}</div>
      </div></div>`).join("");
  }

  $("#btnSalvar").onclick = () => {
    const serv = $("#mServico").value.trim();
    const eq = selEquip.value;
    if (!serv) { toast("Descreva o serviço", "err"); return; }
    DB.addManutencao(dia, {
      equipamento: eq, tipo: $("#mTipo").value,
      servico: serv, horKm: $("#mHorKm").value.trim(), observacoes: $("#mObs").value.trim()
    });
    DB.setStatus(eq, $("#mStatus").value);
    DB.setProximaRevisao(eq, $("#mProxRev").value.trim());
    toast("✔ Manutenção registrada");
    $("#mServico").value = ""; $("#mHorKm").value = ""; $("#mObs").value = "";
    renderRevisoes(); renderHoje();
  };

  carregarEquip(); renderRevisoes(); renderHoje();
}

/* ============================================================
   RELATÓRIO DIÁRIO
   ============================================================ */
function gerarRelatorioTexto(iso) {
  const d = DB.getDia(iso);
  if (!d) return "Sem dados para este dia.";
  const emManut = new Set(d.manutencoes.map(m => m.equipamento));

  let txt = `📋 RELATÓRIO DIÁRIO\n\nDATA: ${DB.fmtBR(iso)}\n`;
  txt += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // viagens agrupadas por equipamento
  const viagPorEq = {};
  d.viagens.forEach(v => { (viagPorEq[v.equipamento] ||= []).push(v); });

  let totalDiesel = 0, totalS10 = 0, totalS500 = 0, totalArla = 0, totalKm = 0, totalViagens = 0;
  const operando = new Set();

  d.abastecimentos.forEach(a => {
    operando.add(a.equipamento);
    const litros = num(a.litros);
    totalDiesel += litros;
    if (a.combustivel === "S-500") totalS500 += litros; else totalS10 += litros;
    totalArla += num(a.litrosArla);
    totalKm += num(a.kmRodado);
    const und = a.unidadeMedia || "km/L";
    txt += `🚛 ${a.equipamento}\n`;
    txt += `Operador: ${a.motorista}\n`;
    txt += `Horímetro: ${a.horimetroFinal}\n`;
    txt += `Horas Trabalhadas: ${a.horasTrabalhadas} h\n`;
    if (und === "km/L") txt += `KM Rodado: ${fmt(a.kmRodado)} km\n`;
    txt += `Combustível: ${a.combustivel || "S-10"} · ${fmt(a.litros)} L\n`;
    if (a.litrosArla) txt += `ARLA 32: ${fmt(a.litrosArla)} L\n`;
    txt += `Média: ${a.media} ${und}\n`;
    if (a.situacao) txt += `Situação: ${a.situacao}\n`;
    const vs = viagPorEq[a.equipamento];
    if (vs && vs.length) {
      let sub = 0;
      txt += `Viagens:\n`;
      vs.forEach(v => { sub += Number(v.quantidade); txt += `  O${v.origem} → D${v.destino} = ${v.quantidade}\n`; });
      txt += `Total: ${sub} viagens\n`;
      totalViagens += sub;
    }
    txt += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  });

  // viagens de equipamentos que não abasteceram
  Object.entries(viagPorEq).forEach(([eq, vs]) => {
    if (operando.has(eq)) return;
    operando.add(eq);
    let sub = 0;
    txt += `🚛 ${eq}\nViagens:\n`;
    vs.forEach(v => { sub += Number(v.quantidade); txt += `  O${v.origem} → D${v.destino} = ${v.quantidade}\n`; });
    txt += `Total: ${sub} viagens\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    totalViagens += sub;
  });

  // manutenções
  if (d.manutencoes.length) {
    txt += `🔧 MANUTENÇÃO\n`;
    d.manutencoes.forEach(m => { txt += `${m.equipamento} · ${m.tipo}: ${m.servico}\n`; });
    txt += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  }

  const mediaFrota = totalDiesel > 0 ? (totalKm / totalDiesel) : 0;
  txt += `📊 RESUMO GERAL\n\n`;
  txt += `Diesel S-10: ${fmt(totalS10)} L\n`;
  txt += `Diesel S-500: ${fmt(totalS500)} L\n`;
  txt += `Total Diesel: ${fmt(totalDiesel)} L\n`;
  txt += `ARLA 32: ${fmt(totalArla)} L\n`;
  txt += `Total KM: ${fmt(totalKm)} km\n`;
  txt += `Média Frota: ${fmt(mediaFrota, 2)} km/L\n`;
  txt += `Total Viagens: ${totalViagens}\n`;
  txt += `Equipamentos Operando: ${String(operando.size).padStart(2, "0")}\n`;
  txt += `Equipamentos Manutenção: ${String(emManut.size).padStart(2, "0")}\n`;
  return txt;
}

function telaRelatorio() {
  $("#headerTitle").textContent = "📋 Relatório Diário";
  $("#headerSub").textContent = "GERADO AUTOMÁTICO";
  const dias = DB.listaDias();
  const atual = DB.garantirDiaAtual();
  const sel = (relatorioDiaPre && dias.includes(relatorioDiaPre)) ? relatorioDiaPre
            : (dias.includes(atual) ? atual : (dias[0] || atual));
  relatorioDiaPre = null;

  app.innerHTML = `
    <div class="card">
      <div class="field">
        <label>Selecione o dia</label>
        <select id="rDia">${dias.map(d => `<option value="${d}" ${d === sel ? "selected" : ""}>${DB.fmtBR(d)}</option>`).join("")}</select>
      </div>
      <div class="btn-row">
        <button class="btn btn-green btn-sm" id="btnWhats">📲 WhatsApp</button>
        <button class="btn btn-blue btn-sm" id="btnCopiar">📋 Copiar</button>
        <button class="btn btn-primary btn-sm" id="btnPdf">📄 PDF</button>
      </div>
    </div>
    <div class="report"><pre id="rTexto"></pre></div>
  `;

  function render() {
    $("#rTexto").textContent = gerarRelatorioTexto($("#rDia").value);
  }
  $("#rDia").onchange = render;
  $("#btnCopiar").onclick = async () => {
    try { await navigator.clipboard.writeText($("#rTexto").textContent); toast("✔ Relatório copiado"); }
    catch { toast("Não foi possível copiar", "err"); }
  };
  $("#btnWhats").onclick = () => {
    const url = "https://wa.me/?text=" + encodeURIComponent($("#rTexto").textContent);
    window.open(url, "_blank");
  };
  $("#btnPdf").onclick = () => gerarPDF($("#rDia").value);
  render();
}

/* Gera PDF via impressão do navegador (Imprimir → Salvar como PDF).
   Funciona offline e no celular, sem bibliotecas externas. */
function gerarPDF(iso) {
  const r = DB.resumoDia(iso);
  const texto = gerarRelatorioTexto(iso);
  let area = document.getElementById("printArea");
  if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.appendChild(area); }
  area.innerHTML = `
    <div class="pdf-head">
      <div class="pdf-logo">🚛 STRACTA MINERAÇÃO</div>
      <div class="pdf-sub">Controle de Frota · Relatório Diário</div>
    </div>
    <h2 class="pdf-date">Data: ${DB.fmtBR(iso)}</h2>
    <div class="pdf-kpis">
      <div><b>${fmt(r.diesel)}</b><span>Diesel (L)</span></div>
      <div><b>${fmt(r.media, 2)}</b><span>Média km/L</span></div>
      <div><b>${r.viagens}</b><span>Viagens</span></div>
      <div><b>${fmt(r.km)}</b><span>KM rodado</span></div>
      <div><b>${String(r.operando.length).padStart(2, "0")}</b><span>Operando</span></div>
      <div><b>${String(r.manutencao.length).padStart(2, "0")}</b><span>Manutenção</span></div>
    </div>
    <pre class="pdf-body">${texto.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>
    <div class="pdf-foot">Gerado pelo Sistema STRACTA · ${DB.fmtBR(DB.hojeISO())}</div>
  `;
  toast("Abrindo impressão · escolha \"Salvar como PDF\"");
  setTimeout(() => window.print(), 300);
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function telaDashboard() {
  $("#headerTitle").textContent = "📊 Painel";
  $("#headerSub").textContent = "ALERTAS · GRÁFICOS · METAS";
  const db = DB.load();
  const dia = DB.garantirDiaAtual();
  const r = DB.resumoDia(dia);

  // ---- alertas ----
  const alertas = DB.alertas();
  const alertasHtml = alertas.length
    ? alertas.map(a => `<div class="alert-item alert-${a.nivel}"><span class="ai">${a.icone}</span><span>${a.msg}</span></div>`).join("")
    : '<p class="empty" style="padding:8px 0">✅ Nenhum alerta. Frota sob controle.</p>';

  // ---- séries (últimos 7 dias) ----
  const s = DB.serie(7);
  const gDiesel = grafico(s.map(x => ({ label: DB.fmtBR(x.iso).slice(0, 5), valor: Math.round(x.diesel), rotulo: fmt(x.diesel) })), { tipo: "barra", cor: "#ff7a1a", titulo: "Diesel" });
  const gMedia = grafico(s.map(x => ({ label: DB.fmtBR(x.iso).slice(0, 5), valor: x.media, rotulo: fmt(x.media, 2) })), { tipo: "linha", cor: "#22c55e", titulo: "Média km/L" });
  const gViagens = grafico(s.map(x => ({ label: DB.fmtBR(x.iso).slice(0, 5), valor: x.viagens, rotulo: x.viagens })), { tipo: "barra", cor: "#3b82f6", titulo: "Viagens" });

  // ---- status da frota ----
  const statusHtml = db.equipamentos.map(eq => {
    const st = DB.getStatus(eq);
    const f = DB.getDia(dia) || { abastecimentos: [], viagens: [] };
    const ab = f.abastecimentos.filter(a => a.equipamento === eq);
    const litros = ab.reduce((x, a) => x + num(a.litros), 0);
    const ultAb = ab.length ? ab[ab.length - 1] : null;
    const md = ultAb ? `${ultAb.media} ${ultAb.unidadeMedia || "km/L"}` : "—";
    const viag = (f.viagens || []).filter(v => v.equipamento === eq).reduce((x, v) => x + num(v.quantidade), 0);
    return `<div class="itemrow" data-ficha="${eq}"><div class="info"><b>${eq}</b> ${pillStatus(st)}
      <div class="sub">${fmt(litros)} L · ${md} · ${viag} viagens</div></div><span class="mini">ficha ›</span></div>`;
  }).join("");

  app.innerHTML = `
    <p class="section-title">Dia ${DB.fmtBR(dia)}</p>
    <div class="kpi-grid">
      <div class="kpi"><div class="k-label">⛽ Diesel S10</div><div class="k-value">${fmt(r.diesel)}<span class="k-unit"> L</span></div></div>
      <div class="kpi k-green"><div class="k-label">📈 Média Frota</div><div class="k-value">${fmt(r.media, 2)}<span class="k-unit"> km/L</span></div></div>
      <div class="kpi k-blue"><div class="k-label">🚚 Total Viagens</div><div class="k-value">${r.viagens}</div></div>
      <div class="kpi"><div class="k-label">🛣️ Total KM</div><div class="k-value">${fmt(r.km)}<span class="k-unit"> km</span></div></div>
      <div class="kpi k-green"><div class="k-label">🟢 Operando</div><div class="k-value">${String(r.operando.length).padStart(2, "0")}</div></div>
      <div class="kpi k-red"><div class="k-label">🔧 Manutenção</div><div class="k-value">${String(r.manutencao.length).padStart(2, "0")}</div></div>
      <div class="kpi"><div class="k-label">💧 ARLA (dia)</div><div class="k-value">${fmt(r.arla)}<span class="k-unit"> L</span></div></div>
      <div class="kpi k-blue"><div class="k-label">🚛 Frota Total</div><div class="k-value">${String(db.equipamentos.length).padStart(2, "0")}</div></div>
    </div>

    <p class="section-title" style="margin-top:16px">Estoques dos tanques</p>
    <div class="kpi-grid">
      <div class="kpi k-yellow"><div class="k-label">🛢️ Diesel S-10</div><div class="k-value">${fmt(db.estoque.s10)}<span class="k-unit"> L</span></div></div>
      <div class="kpi k-yellow"><div class="k-label">🛢️ Diesel S-500</div><div class="k-value">${fmt(db.estoque.s500)}<span class="k-unit"> L</span></div></div>
      <div class="kpi k-blue"><div class="k-label">💧 ARLA 32</div><div class="k-value">${fmt(db.estoque.arla)}<span class="k-unit"> L</span></div></div>
    </div>

    <div class="spacer"></div>
    <div class="card">
      <h3>🔔 Alertas <span class="mini">${alertas.length ? "(" + alertas.length + ")" : ""}</span></h3>
      ${alertasHtml}
    </div>

    <div class="card">
      <h3>📈 Tendências · últimos 7 dias</h3>
      <p class="chart-title">⛽ Diesel (L)</p>${gDiesel}
      <p class="chart-title">📈 Média da frota (km/L)</p>${gMedia}
      <p class="chart-title">🚚 Viagens</p>${gViagens}
    </div>

    <div class="card">
      <h3>🚛 Status da frota</h3>
      <div class="itemlist">${statusHtml}</div>
    </div>

    <div class="card">
      <h3>🎯 Metas de gestão</h3>
      <div class="metas-grid">
        <div class="field"><label>Média mínima km/L</label><input id="cfgMedia" inputmode="decimal" value="${db.config.metaMedia}"></div>
        <div class="field"><label>Consumo máx. L/h</label><input id="cfgLh" inputmode="decimal" value="${db.config.metaLh}"></div>
        <div class="field"><label>Meta viagens/dia</label><input id="cfgViagens" inputmode="numeric" value="${db.config.metaViagens}"></div>
        <div class="field"><label>Diesel mínimo (L)</label><input id="cfgEstoque" inputmode="numeric" value="${db.config.estoqueMin}"></div>
        <div class="field"><label>ARLA mínimo (L)</label><input id="cfgArlaMin" inputmode="numeric" value="${db.config.estoqueArlaMin}"></div>
      </div>
      <button class="btn btn-ghost btn-sm" id="btnCfg">Salvar metas</button>
    </div>

    <div class="card">
      <h3>🛢️ Entrada nos tanques</h3>
      <p class="hint">Cada abastecimento de equipamento desconta o estoque automaticamente.</p>
      <div class="field">
        <label>Tanque</label>
        <select id="tqTipo">
          <option value="s10">🛢️ Diesel S-10</option>
          <option value="s500">🛢️ Diesel S-500</option>
          <option value="arla">💧 ARLA 32</option>
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label>Litros recebidos</label><input id="tqAdd" inputmode="decimal" placeholder="ex: 3000"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-green" id="btnTqAdd">➕ Entrada</button></div>
      </div>
      <div class="field"><label>Ou ajustar o saldo manualmente</label>
        <input id="tqSet" inputmode="decimal" placeholder="definir valor total"></div>
      <button class="btn btn-ghost btn-sm" id="btnTqSet">Definir saldo</button>
    </div>
  `;

  $$("[data-ficha]").forEach(el => el.onclick = () => abrirFicha(el.dataset.ficha));

  $("#btnCfg").onclick = () => {
    DB.setConfig({
      metaMedia: num($("#cfgMedia").value),
      metaLh: num($("#cfgLh").value),
      metaViagens: num($("#cfgViagens").value),
      estoqueMin: num($("#cfgEstoque").value),
      estoqueArlaMin: num($("#cfgArlaMin").value)
    });
    toast("✔ Metas salvas"); telaDashboard();
  };
  $("#btnTqAdd").onclick = () => {
    const l = num($("#tqAdd").value);
    if (!l) { toast("Informe os litros", "err"); return; }
    DB.addEstoque($("#tqTipo").value, l); toast(`✔ +${fmt(l)} L adicionados`); telaDashboard();
  };
  $("#btnTqSet").onclick = () => {
    const l = num($("#tqSet").value);
    DB.setEstoque($("#tqTipo").value, l); toast("✔ Saldo atualizado"); telaDashboard();
  };
}

/* ============================================================
   FROTA · lista de equipamentos com status
   ============================================================ */
function telaFrota() {
  $("#headerTitle").textContent = "🚛 Frota";
  $("#headerSub").textContent = "STATUS DE CADA EQUIPAMENTO";
  const db = DB.load();

  app.innerHTML = `
    <div class="card">
      <h3>🚛 Equipamentos <span class="mini">(${db.equipamentos.length})</span></h3>
      <p class="hint">Toque num equipamento para ver a ficha completa.</p>
      <div class="itemlist">${db.equipamentos.map(eq => {
        const f = DB.fichaEquipamento(eq);
        const rev = f.proximaRevisao;
        const hor = f.ultimo.horimetroFinal;
        let revInfo = "sem revisão definida";
        if (rev != null) revInfo = (hor != null && hor >= rev) ? "⚠️ revisão vencida"
          : `próxima revisão: ${fmt(rev)}`;
        const und = f.unidadeMedia;
        return `<div class="itemrow" data-ficha="${eq}"><div class="info"><b>${eq}</b> ${pillStatus(f.status)}
          <div class="sub">${f.tipo === "horimetro" ? "horímetro" : "km"} · ${fmt(f.media, 2)} ${und} · ${revInfo}</div></div><span class="mini">ver ›</span></div>`;
      }).join("")}</div>
    </div>

    <div class="card">
      <h3>➕ Adicionar equipamento</h3>
      <div class="field">
        <label>Código</label>
        <input id="novoEq" placeholder="ex: CB-30, PC-03">
      </div>
      <div class="field">
        <label>Medição do equipamento</label>
        <select id="novoTipo">
          <option value="km_horimetro">🚚 KM + Horímetro (mede em km/L)</option>
          <option value="horimetro">🚜 Somente Horímetro (mede em L/h)</option>
        </select>
      </div>
      <button class="btn btn-primary" id="btnAddEq">Adicionar equipamento</button>
    </div>
  `;
  $$("[data-ficha]").forEach(el => el.onclick = () => abrirFicha(el.dataset.ficha));
  $("#btnAddEq").onclick = () => {
    const v = $("#novoEq").value.trim().toUpperCase();
    if (!v) { toast("Digite o código", "err"); return; }
    DB.addEquipamento(v);
    DB.setTipoEquip(v, $("#novoTipo").value);
    toast("✔ Equipamento adicionado"); telaFrota();
  };
}

/* ============================================================
   FICHA DO EQUIPAMENTO
   ============================================================ */
function telaFicha() {
  const eq = fichaEquip || DB.load().equipamentos[0];
  $("#headerTitle").textContent = "🚛 " + eq;
  $("#headerSub").textContent = "FICHA DO EQUIPAMENTO";
  const f = DB.fichaEquipamento(eq);

  // série de médias dos abastecimentos (últimos 8)
  const serieMedia = f.abast.slice(-8).map(a => ({ label: DB.fmtBR(a.iso).slice(0, 5), valor: num(a.media), rotulo: a.media }));

  app.innerHTML = `
    <div class="card">
      <h3>🚦 Situação</h3>
      <div class="field">
        <label>Status atual</label>
        <select id="fkStatus">${optsStatus(f.status)}</select>
      </div>
      <div class="field">
        <label>Medição do equipamento</label>
        <select id="fkTipo">
          <option value="km_horimetro" ${f.tipo === "km_horimetro" ? "selected" : ""}>🚚 KM + Horímetro (km/L)</option>
          <option value="horimetro" ${f.tipo === "horimetro" ? "selected" : ""}>🚜 Somente Horímetro (L/h)</option>
        </select>
      </div>
      <div class="field">
        <label>Próxima revisão em (horímetro/KM)</label>
        <input id="fkRev" inputmode="decimal" value="${f.proximaRevisao ?? ""}" placeholder="ex: 20000">
      </div>
      <button class="btn btn-primary btn-sm" id="btnFkSalvar">💾 Salvar situação</button>
    </div>

    <div class="kpi-grid">
      <div class="kpi"><div class="k-label">⛽ Diesel total</div><div class="k-value">${fmt(f.totDiesel)}<span class="k-unit"> L</span></div></div>
      <div class="kpi k-green"><div class="k-label">📈 Média geral</div><div class="k-value">${fmt(f.media, 2)}<span class="k-unit"> ${f.unidadeMedia}</span></div></div>
      <div class="kpi k-blue"><div class="k-label">🚚 Viagens</div><div class="k-value">${fmt(f.totViag)}</div></div>
      <div class="kpi"><div class="k-label">🛣️ KM total</div><div class="k-value">${fmt(f.totKm)}<span class="k-unit"> km</span></div></div>
      <div class="kpi k-yellow"><div class="k-label">⏱️ Horas</div><div class="k-value">${fmt(f.totHoras, 1)}<span class="k-unit"> h</span></div></div>
      <div class="kpi"><div class="k-label">📍 Horím. atual</div><div class="k-value">${f.ultimo.horimetroFinal ?? "—"}</div></div>
    </div>

    <div class="spacer"></div>
    <div class="card">
      <h3>📈 Evolução da média (${f.unidadeMedia})</h3>
      ${serieMedia.length ? grafico(serieMedia, { tipo: "linha", cor: "#22c55e" }) : '<p class="empty">Sem abastecimentos registrados.</p>'}
    </div>

    <div class="card">
      <h3>⛽ Abastecimentos</h3>
      <div class="itemlist">${f.abast.slice().reverse().slice(0, 15).map(a => {
        const und = a.unidadeMedia || "km/L";
        const extra = und === "L/h" ? `${a.horasTrabalhadas} h` : `${fmt(a.kmRodado)} km`;
        return `<div class="itemrow"><div class="info"><b>${DB.fmtBR(a.iso)}</b>
          <div class="sub">${fmt(a.litros)} L ${a.combustivel || "S-10"} · ${extra} · ${a.media} ${und}${a.litrosArla ? " · ARLA " + fmt(a.litrosArla) + " L" : ""}</div></div></div>`;
      }).join("") || '<p class="empty">Nenhum.</p>'}</div>
    </div>

    <div class="card">
      <h3>🔧 Manutenções</h3>
      <div class="itemlist">${f.manut.slice().reverse().map(m =>
        `<div class="itemrow"><div class="info"><b>${DB.fmtBR(m.iso)}</b> <span class="pill pill-red">${m.tipo}</span>
          <div class="sub">${m.servico || "—"} · ${m.horKm || "—"}</div></div></div>`
      ).join("") || '<p class="empty">Nenhuma.</p>'}</div>
    </div>
  `;

  $("#btnFkSalvar").onclick = () => {
    DB.setStatus(eq, $("#fkStatus").value);
    DB.setTipoEquip(eq, $("#fkTipo").value);
    DB.setProximaRevisao(eq, $("#fkRev").value.trim());
    toast("✔ Situação salva"); telaFicha();
  };
}

/* ============================================================
   CORRIGIR / EXCLUIR DADOS
   ============================================================ */
function telaCorrigir() {
  $("#headerTitle").textContent = "✏️ Corrigir Dados";
  $("#headerSub").textContent = "EDITAR · EXCLUIR";
  const dias = DB.listaDias();
  const atual = DB.garantirDiaAtual();
  const sel = dias.includes(atual) ? atual : (dias[0] || atual);

  app.innerHTML = `
    <div class="card">
      <div class="field">
        <label>Selecione o dia</label>
        <select id="cDia">${dias.map(d => `<option value="${d}" ${d === sel ? "selected" : ""}>${DB.fmtBR(d)}</option>`).join("")}</select>
      </div>
    </div>
    <div id="cConteudo"></div>
  `;

  function render() {
    const iso = $("#cDia").value;
    const d = DB.getDia(iso) || { abastecimentos: [], viagens: [], manutencoes: [] };
    let html = "";

    html += `<div class="card"><h3>⛽ Abastecimentos</h3>`;
    html += d.abastecimentos.length ? d.abastecimentos.map(a => `
      <div class="itemrow"><div class="info"><b>${a.equipamento}</b> · ${fmt(a.litros)} L · ${a.media} km/L
        <div class="sub">${a.motorista} · ${fmt(a.kmRodado)} km · ${a.horasTrabalhadas} h</div></div>
        <div>
          <button class="btn-sm btn btn-blue" data-edit="${a.id}">✏️</button>
          <button class="del" data-del-ab="${a.id}">🗑️</button>
        </div>
      </div>`).join("") : '<p class="empty">Nenhum abastecimento.</p>';
    html += `</div>`;

    html += `<div class="card"><h3>🚚 Viagens</h3>`;
    html += d.viagens.length ? d.viagens.map(v => `
      <div class="itemrow"><div class="info"><b>${v.equipamento}</b> · O${v.origem}→D${v.destino} = ${v.quantidade}
        <div class="sub">${v.motorista}</div></div>
        <button class="del" data-del-vi="${v.id}">🗑️</button>
      </div>`).join("") : '<p class="empty">Nenhuma viagem.</p>';
    html += `</div>`;

    html += `<div class="card"><h3>🔧 Manutenções</h3>`;
    html += d.manutencoes.length ? d.manutencoes.map(m => `
      <div class="itemrow"><div class="info"><b>${m.equipamento}</b> · ${m.tipo}
        <div class="sub">${m.servico || "—"}</div></div>
        <button class="del" data-del-ma="${m.id}">🗑️</button>
      </div>`).join("") : '<p class="empty">Nenhuma manutenção.</p>';
    html += `</div>`;

    $("#cConteudo").innerHTML = html;

    // editar abastecimento
    $$("[data-edit]").forEach(b => b.onclick = () => {
      const a = d.abastecimentos.find(x => x.id === b.dataset.edit);
      if (a) { editando = { ...a, _iso: iso }; navegar("abastecimento"); }
    });
    // excluir
    const bindDel = (attr, tipo) => $$(`[data-${attr}]`).forEach(b => b.onclick = async () => {
      const ok = await confirmar("Excluir este registro?");
      if (!ok) return;
      DB.excluir(iso, tipo, b.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]);
      toast("✔ Registro excluído"); render();
    });
    bindDel("del-ab", "abastecimentos");
    bindDel("del-vi", "viagens");
    bindDel("del-ma", "manutencoes");
  }

  $("#cDia").onchange = render;
  render();
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
$("#btnBack").onclick = () => navegar("home");
$$(".tab").forEach(t => t.onclick = () => { viagensBuffer = []; editando = null; navegar(t.dataset.nav); });

DB.garantirDiaAtual();
const rotaInicial = (location.hash || "#home").slice(1);
navegar(rotas[rotaInicial] ? rotaInicial : "home");

/* Service worker (offline / instalável) */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
