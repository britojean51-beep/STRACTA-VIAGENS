/* ============================================================
   STRACTA · Controle de Frota — Lógica da interface
   ============================================================ */
const VERSION = "01/09/2026 · r12 (seletor por mês)";
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
/* Painel: dias selecionados (vazio = dia atual) e janela das tendências (dias) */
let painelDias = [];        // dias do "Geral do dia" / comparação
let painelMes = null;       // mês exibido nos chips da comparação
let trendDias = [];         // dias das Tendências / ranking
let trendMes = null;        // mês exibido nos chips das Tendências
/* Relatório: tipo (diario|semanal|mensal) e período escolhido */
let relatorioTipo = "diario";
let relatorioPeriodoSel = null;
/* Painel: KPI aberto no "Geral do dia" e métrica do ranking por equipamento */
let painelKpi = null;
let painelMetrica = "diesel";

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
    <p class="hint" style="text-align:center">versão ${VERSION}</p>
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
          <label>Produção (toneladas) <span class="mini">pá/carreg.</span></label>
          <input id="fTon" inputmode="decimal" value="${ed?.toneladas ?? ""}" placeholder="ex: 320">
        </div>
        <div class="field">
          <label id="fLtonLabel">L/Ton</label>
          <input id="fLton" class="computed" readonly value="${ed?.lton ?? ""}">
        </div>
      </div>
      <p class="hint">🚚 Para <b>caminhões</b>, deixe em branco: o L/Ton usa o <b>peso lançado nas Viagens</b> (aparece no Painel e no Relatório).</p>

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

    const ton = num($("#fTon").value);
    const lton = (litros > 0 && ton > 0) ? litros / ton : 0;
    $("#fLton").value = lton > 0 ? fmt(lton, 2) + " L/t" : "";

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
  [el.horiIni, el.horiFim, el.kmIni, el.kmFim, el.litros, $("#fTon")].forEach(i => i.oninput = recalcular);
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
    const toneladas = num($("#fTon").value);
    const lton = (litros > 0 && toneladas > 0) ? litros / toneladas : 0;

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
      toneladas: toneladas || null,
      lton: lton ? fmt(lton, 2) : "",
      media: fmt(media, 2),
      unidadeMedia: unidade,
      situacao: $("#fSit").value,
      abastecedor: $("#fAbast").value,
      observacoes: $("#fObs").value.trim()
    };

    if (editando) {
      DB.atualizarAbastecimento(editando._iso, editando.id, reg);
      Sync.pushLancamento(editando._iso, reg);
      editando = null;
      toast("✔ Abastecimento atualizado");
      navegar("corrigir");
    } else {
      DB.addAbastecimento(dia, reg);
      Sync.pushLancamento(dia, reg);
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
      <div class="field-row">
        <div class="field">
          <label>Tipo de material</label>
          <input id="vMat" list="materiais" placeholder="ex: Minério">
          <datalist id="materiais">
            <option>Minério</option><option>Estéril</option><option>Rejeito</option>
            <option>Brita</option><option>Terra</option><option>Areia</option>
          </datalist>
        </div>
        <div class="field">
          <label>Peso por viagem (t) <span class="mini">opcional</span></label>
          <input id="vPeso" inputmode="decimal" placeholder="ex: 30">
        </div>
      </div>
      <p class="hint" id="vPesoTotal" style="display:none"></p>
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
      box.innerHTML = viagensBuffer.map((v, i) => {
        const pt = (Number(v.pesoViagem) || 0) * Number(v.quantidade);
        const extra = [v.material || null, pt > 0 ? `${fmt(pt)} t` : null].filter(Boolean).join(" · ");
        return `
        <div class="itemrow">
          <div class="info"><b>${v.equipamento}</b> · Origem ${v.origem} → Destino ${v.destino}
            <div class="sub">${v.motorista} · ${v.quantidade} viagens${extra ? " · " + extra : ""}</div>
          </div>
          <button class="del" data-i="${i}">✕</button>
        </div>`;
      }).join("");
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
    let total = 0, pesoTotalFrota = 0;
    // ranking: equipamentos ordenados por total de viagens
    const linhas = Object.entries(porEq).map(([eq, arr]) => {
      const sub = arr.reduce((s, v) => s + Number(v.quantidade), 0); total += sub;
      const peso = arr.reduce((s, v) => s + (Number(v.pesoTotal) || 0), 0); pesoTotalFrota += peso;
      // agrupa por ROTA: mesma origem+destino soma; rotas diferentes ficam separadas
      const porRota = {};
      arr.forEach(v => {
        const k = `${v.origem}→${v.destino}`;
        const g = (porRota[k] ||= { origem: v.origem, destino: v.destino, qtd: 0, peso: 0, mats: new Set() });
        g.qtd += Number(v.quantidade);
        g.peso += Number(v.pesoTotal) || 0;
        if (v.material) g.mats.add(v.material);
      });
      const rotas = Object.values(porRota).map(g =>
        `Origem ${g.origem} → Destino ${g.destino} = ${g.qtd}` +
        (g.mats.size ? ` · ${[...g.mats].join(", ")}` : "") +
        (g.peso > 0 ? ` · ${fmt(g.peso)} t` : "")
      );
      return { eq, sub, peso, rotas };
    }).sort((a, b) => b.sub - a.sub);

    const meta = DB.load().config.metaViagens || 0;
    const pct = meta > 0 ? Math.min(100, Math.round((total / meta) * 100)) : 0;
    const barra = meta > 0 ? `
      <div class="spacer"></div>
      <div class="list-head"><span class="mini">Meta do dia: ${meta} viagens</span><span class="tag-total">${total} · ${pct}%</span></div>
      <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>` : "";

    box.innerHTML = linhas.map((l, i) =>
      `<div class="itemrow"><div class="info">${i === 0 ? "🥇 " : ""}<b>${l.eq}</b> = ${l.sub} viagens${l.peso > 0 ? ` · ${fmt(l.peso)} t` : ""}
        ${l.rotas.map(r => `<div class="sub">${r}</div>`).join("")}</div></div>`
    ).join("") + `<div class="spacer"></div><p class="tag-total">Total frota: ${total} viagens${pesoTotalFrota > 0 ? ` · ${fmt(pesoTotalFrota)} t` : ""}</p>` + barra;
  }

  const previewPeso = () => {
    const pt = num($("#vPeso").value) * num($("#vQtd").value);
    const el = $("#vPesoTotal");
    if (pt > 0) { el.style.display = "block"; el.innerHTML = `⚖️ Peso total desta rota: <b>${fmt(pt)} t</b>`; }
    else el.style.display = "none";
  };
  $("#vQtd").oninput = previewPeso;
  $("#vPeso").oninput = previewPeso;

  $("#btnAdd").onclick = () => {
    const orig = $("#vOrig").value.trim(), dest = $("#vDest").value.trim(), qtd = num($("#vQtd").value);
    if (!orig || !dest) { toast("Informe origem e destino", "err"); return; }
    if (!qtd) { toast("Informe a quantidade", "err"); return; }
    const pesoViagem = num($("#vPeso").value);
    viagensBuffer.push({
      equipamento: $("#vEquip").value, motorista: $("#vMot").value,
      origem: orig.padStart(2, "0"), destino: dest.padStart(2, "0"), quantidade: qtd,
      material: $("#vMat").value.trim(), pesoViagem: pesoViagem || null,
      pesoTotal: pesoViagem ? pesoViagem * qtd : null
    });
    $("#vOrig").value = ""; $("#vDest").value = ""; $("#vQtd").value = ""; $("#vPeso").value = "";
    $("#vPesoTotal").style.display = "none";
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
    const mreg = DB.addManutencao(dia, {
      equipamento: eq, tipo: $("#mTipo").value,
      servico: serv, horKm: $("#mHorKm").value.trim(), observacoes: $("#mObs").value.trim()
    });
    DB.setStatus(eq, $("#mStatus").value);
    DB.setProximaRevisao(eq, $("#mProxRev").value.trim());
    Sync.pushManutencao(dia, mreg);
    Sync.pushEquipamento(eq);
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

  let totalDiesel = 0, totalS10 = 0, totalS500 = 0, totalArla = 0, totalKm = 0, totalViagens = 0, totalPeso = 0;
  const operando = new Set();
  const vLine = v => `  Origem ${v.origem} → Destino ${v.destino} = ${v.quantidade}${v.material ? " · " + v.material : ""}${v.pesoTotal ? " · " + fmt(v.pesoTotal) + " t" : ""}\n`;

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
    const tonEq = DB.tonEquipDia(a.equipamento, iso);
    if (tonEq > 0) {
      txt += `Produção: ${fmt(tonEq)} t\n`;
      txt += `L/Ton: ${fmt(DB.ltonEquipDia(a.equipamento, iso), 2)} L/t\n`;
    }
    if (a.situacao) txt += `Situação: ${a.situacao}\n`;
    const vs = viagPorEq[a.equipamento];
    if (vs && vs.length) {
      let sub = 0, subP = 0;
      txt += `Viagens:\n`;
      vs.forEach(v => { sub += Number(v.quantidade); subP += Number(v.pesoTotal) || 0; txt += vLine(v); });
      txt += `Total: ${sub} viagens${subP > 0 ? ` · ${fmt(subP)} t` : ""}\n`;
      totalViagens += sub; totalPeso += subP;
    }
    txt += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  });

  // viagens de equipamentos que não abasteceram
  Object.entries(viagPorEq).forEach(([eq, vs]) => {
    if (operando.has(eq)) return;
    operando.add(eq);
    let sub = 0, subP = 0;
    txt += `🚛 ${eq}\nViagens:\n`;
    vs.forEach(v => { sub += Number(v.quantidade); subP += Number(v.pesoTotal) || 0; txt += vLine(v); });
    txt += `Total: ${sub} viagens${subP > 0 ? ` · ${fmt(subP)} t` : ""}\n\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    totalViagens += sub; totalPeso += subP;
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
  if (totalPeso > 0) txt += `Peso Transportado: ${fmt(totalPeso)} t\n`;
  const totalTon = [...operando].reduce((s, eq) => s + DB.tonEquipDia(eq, iso), 0);
  if (totalTon > 0) txt += `L/Ton Frota: ${fmt(totalDiesel / totalTon, 2)} L/t\n`;
  txt += `Equipamentos Operando: ${String(operando.size).padStart(2, "0")}\n`;
  txt += `Equipamentos Manutenção: ${String(emManut.size).padStart(2, "0")}\n`;
  return txt;
}

/* Relatório consolidado de um período (semana, mês ou qualquer lista de dias) */
function gerarRelatorioPeriodo(dias, titulo) {
  if (!dias || !dias.length) return "Sem dados para este período.";
  const ordem = dias.slice().sort();
  const res = ordem.map(iso => ({ iso, r: DB.resumoDia(iso) }));
  const soma = c => res.reduce((s, x) => s + x.r[c], 0);
  const diesel = soma("diesel"), s10 = soma("dieselS10"), s500 = soma("dieselS500");
  const arla = soma("arla"), horas = soma("horas"), ton = soma("toneladas");
  const km = soma("km"), viagens = soma("viagens");
  const lh = horas > 0 ? diesel / horas : 0;
  const lton = ton > 0 ? diesel / ton : 0;
  const media = diesel > 0 ? km / diesel : 0;

  const equips = new Set(), operadores = new Set(), manut = [];
  let pesoTransp = 0;
  ordem.forEach(iso => {
    const d = DB.getDia(iso) || { abastecimentos: [], viagens: [], manutencoes: [] };
    (d.abastecimentos || []).forEach(a => { equips.add(a.equipamento); if (a.motorista) operadores.add(a.motorista); });
    (d.viagens || []).forEach(v => { equips.add(v.equipamento); if (v.motorista) operadores.add(v.motorista); pesoTransp += num(v.pesoTotal); });
    (d.manutencoes || []).forEach(m => manut.push({ iso, ...m }));
  });
  const diasOperando = res.filter(x => x.r.diesel > 0 || x.r.viagens > 0).length;

  let txt = `📋 ${titulo}\n\nPERÍODO: ${DB.fmtBR(ordem[0])} a ${DB.fmtBR(ordem[ordem.length - 1])}\n`;
  txt += `━━━━━━━━━━━━━━━━━━━━\n\n📊 RESUMO DO PERÍODO\n\n`;
  txt += `Diesel S-10: ${fmt(s10)} L\n`;
  txt += `Diesel S-500: ${fmt(s500)} L\n`;
  txt += `Total Diesel: ${fmt(diesel)} L\n`;
  txt += `ARLA 32: ${fmt(arla)} L\n`;
  txt += `Horas Trabalhadas: ${fmt(horas, 1)} h\n`;
  txt += `L/h: ${fmt(lh, 2)}\n`;
  txt += `Produção: ${fmt(ton)} t\n`;
  txt += `L/Ton: ${fmt(lton, 2)}\n`;
  txt += `Total KM: ${fmt(km)} km\n`;
  txt += `Média Frota: ${fmt(media, 2)} km/L\n`;
  txt += `Total Viagens: ${viagens}\n`;
  if (pesoTransp > 0) txt += `Peso Transportado: ${fmt(pesoTransp)} t\n`;
  txt += `Dias com operação: ${diasOperando} de ${ordem.length}\n`;
  txt += `Equipamentos: ${String(equips.size).padStart(2, "0")}\n`;
  txt += `Operadores: ${String(operadores.size).padStart(2, "0")}\n`;
  txt += `Manutenções: ${String(manut.length).padStart(2, "0")}\n`;

  txt += `\n━━━━━━━━━━━━━━━━━━━━\n\n📅 POR DIA\n\n`;
  res.forEach(x => {
    txt += `${DB.fmtBR(x.iso)} · ${fmt(x.r.diesel)} L · ${fmt(x.r.horas, 1)} h`;
    if (x.r.toneladas > 0) txt += ` · ${fmt(x.r.toneladas)} t`;
    if (x.r.lton > 0) txt += ` · ${fmt(x.r.lton, 2)} L/t`;
    txt += ` · ${x.r.viagens} viagens\n`;
  });

  txt += `\n━━━━━━━━━━━━━━━━━━━━\n\n🚛 POR EQUIPAMENTO\n\n`;
  DB.totaisPorEquipamento(ordem)
    .sort((a, b) => b.diesel - a.diesel)
    .forEach(e => {
      txt += `${e.eq}\n`;
      txt += `  Diesel: ${fmt(e.diesel)} L · Horas: ${fmt(e.horas, 1)} h · L/h: ${fmt(e.lh, 2)}\n`;
      if (e.toneladas > 0) txt += `  Produção: ${fmt(e.toneladas)} t · L/Ton: ${fmt(e.lton, 2)}\n`;
      if (e.km > 0) txt += `  KM: ${fmt(e.km)} km · Média: ${fmt(e.media, 2)} km/L\n`;
      if (e.viagens > 0) txt += `  Viagens: ${e.viagens}\n`;
    });

  if (manut.length) {
    txt += `\n━━━━━━━━━━━━━━━━━━━━\n\n🔧 MANUTENÇÕES\n\n`;
    manut.forEach(m => { txt += `${DB.fmtBR(m.iso)} · ${m.equipamento} · ${m.tipo}: ${m.servico || "—"}\n`; });
  }
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

  const semanas = DB.semanasDisponiveis();
  const meses = DB.mesesDisponiveis();
  // período selecionado dentro do tipo atual
  const opcoes = relatorioTipo === "semanal" ? semanas : relatorioTipo === "mensal" ? meses : null;
  let selPeriodo = null;
  if (opcoes) {
    selPeriodo = opcoes.find(o => o.chave === relatorioPeriodoSel) || opcoes[0];
    relatorioPeriodoSel = selPeriodo ? selPeriodo.chave : null;
  }

  const seletor = relatorioTipo === "diario"
    ? `<label>Selecione o dia</label>
       <select id="rDia">${dias.map(d => `<option value="${d}" ${d === sel ? "selected" : ""}>${DB.fmtBR(d)}</option>`).join("")}</select>`
    : `<label>Selecione ${relatorioTipo === "semanal" ? "a semana" : "o mês"}</label>
       <select id="rPeriodo">${(opcoes || []).map(o => `<option value="${o.chave}" ${o.chave === relatorioPeriodoSel ? "selected" : ""}>${o.label}</option>`).join("")}</select>`;

  app.innerHTML = `
    <div class="card">
      <div class="field">
        <label>Tipo de relatório</label>
        <select id="rTipo">
          <option value="diario" ${relatorioTipo === "diario" ? "selected" : ""}>📅 Diário</option>
          <option value="semanal" ${relatorioTipo === "semanal" ? "selected" : ""}>🗓️ Semanal</option>
          <option value="mensal" ${relatorioTipo === "mensal" ? "selected" : ""}>📆 Mensal</option>
        </select>
      </div>
      <div class="field">${seletor}</div>
      <div class="btn-row">
        <button class="btn btn-green btn-sm" id="btnWhats">📲 WhatsApp</button>
        <button class="btn btn-blue btn-sm" id="btnCopiar">📋 Copiar</button>
        <button class="btn btn-primary btn-sm" id="btnPdf">📄 PDF</button>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-green" id="btnExcel">📊 Enviar planilha (Excel)</button>
    </div>
    <div class="report"><pre id="rTexto"></pre></div>
  `;

  // dias e título do relatório conforme o tipo escolhido
  function alvo() {
    if (relatorioTipo === "diario") {
      const d = $("#rDia") ? $("#rDia").value : sel;
      return { dias: [d], titulo: `RELATÓRIO DIÁRIO`, diario: true };
    }
    const o = (opcoes || []).find(x => x.chave === ($("#rPeriodo") ? $("#rPeriodo").value : relatorioPeriodoSel));
    if (!o) return { dias: [], titulo: "RELATÓRIO", diario: false };
    return {
      dias: o.dias,
      titulo: relatorioTipo === "semanal" ? `RELATÓRIO SEMANAL · ${o.label}` : `RELATÓRIO MENSAL · ${o.label}`,
      diario: false
    };
  }
  function render() {
    const a = alvo();
    $("#rTexto").textContent = a.diario
      ? gerarRelatorioTexto(a.dias[0])
      : gerarRelatorioPeriodo(a.dias, a.titulo);
  }

  $("#rTipo").onchange = e => { relatorioTipo = e.target.value; relatorioPeriodoSel = null; telaRelatorio(); };
  if ($("#rDia")) $("#rDia").onchange = render;
  if ($("#rPeriodo")) $("#rPeriodo").onchange = e => { relatorioPeriodoSel = e.target.value; render(); };

  $("#btnCopiar").onclick = async () => {
    try { await navigator.clipboard.writeText($("#rTexto").textContent); toast("✔ Relatório copiado"); }
    catch { toast("Não foi possível copiar", "err"); }
  };
  $("#btnWhats").onclick = () => {
    const url = "https://wa.me/?text=" + encodeURIComponent($("#rTexto").textContent);
    window.open(url, "_blank");
  };
  $("#btnPdf").onclick = () => { const a = alvo(); gerarPDF(a.dias, a.titulo, $("#rTexto").textContent); };
  $("#btnExcel").onclick = () => { const a = alvo(); exportarExcel(a.dias, `STRACTA · ${a.titulo}`); };
  render();
}

/* Monta o CSV do dia (abre no Excel e no Google Sheets).
   Separador ; e decimais com vírgula (padrão pt-BR). */
function montarCSV(dias, titulo) {
  const lista = (Array.isArray(dias) ? dias : [dias]).slice().sort();
  const esc = v => { const s = String(v == null ? "" : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const linha = arr => arr.map(esc).join(";");
  const L = [];
  L.push(linha([titulo || `STRACTA · Relatório ${DB.fmtBR(lista[0])}`]));
  L.push("");
  // Abastecimentos / Lançamentos
  L.push(linha(["ABASTECIMENTOS / OPERAÇÃO"]));
  L.push(linha(["Data", "Equipamento", "Operador", "Horím. Ini", "Horím. Fim", "Horas", "Litros", "Combustível", "ARLA (L)", "KM", "Média", "Unid.", "Toneladas", "L/Ton", "Situação"]));
  lista.forEach(iso => {
    const d = DB.getDia(iso) || { abastecimentos: [] };
    (d.abastecimentos || []).forEach(a => L.push(linha([
      DB.fmtBR(iso), a.equipamento, a.motorista, a.horimetroInicial, a.horimetroFinal, a.horasTrabalhadas,
      fmt(a.litros), a.combustivel || "S-10", a.litrosArla || "", a.kmRodado || "",
      a.media, a.unidadeMedia || "km/L", a.toneladas ?? "", a.lton || "", a.situacao || ""
    ])));
  });
  L.push("");
  // Viagens
  L.push(linha(["VIAGENS"]));
  L.push(linha(["Data", "Equipamento", "Operador", "Origem", "Destino", "Qtd viagens", "Material", "Peso/viagem (t)", "Peso total (t)"]));
  lista.forEach(iso => {
    const d = DB.getDia(iso) || { viagens: [] };
    (d.viagens || []).forEach(v => L.push(linha([
      DB.fmtBR(iso), v.equipamento, v.motorista || "", v.origem, v.destino, v.quantidade,
      v.material || "", v.pesoViagem != null ? fmt(v.pesoViagem) : "", v.pesoTotal != null ? fmt(v.pesoTotal) : ""
    ])));
  });
  L.push("");
  // Manutenções
  L.push(linha(["MANUTENÇÕES"]));
  L.push(linha(["Data", "Equipamento", "Tipo", "Serviço", "Horímetro/KM", "Observação"]));
  lista.forEach(iso => {
    const d = DB.getDia(iso) || { manutencoes: [] };
    (d.manutencoes || []).forEach(m => L.push(linha([DB.fmtBR(iso), m.equipamento, m.tipo, m.servico || "", m.horKm || "", m.observacoes || ""])));
  });
  return L.join("\n");
}

/* Gera a planilha e oferece compartilhar (WhatsApp, e-mail, Drive) ou baixar. */
function exportarExcel(dias, titulo) {
  const lista = (Array.isArray(dias) ? dias : [dias]).slice().sort();
  const csv = "﻿" + montarCSV(lista, titulo);
  const nome = lista.length > 1
    ? `STRACTA_${lista[0]}_a_${lista[lista.length - 1]}.csv`
    : `STRACTA_${lista[0]}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  try {
    const file = new File([blob], nome, { type: "text/csv" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: titulo || "Relatório STRACTA " + DB.fmtBR(lista[0]) })
        .then(() => toast("📊 Planilha enviada"))
        .catch(() => {/* usuário cancelou */});
      return;
    }
  } catch (e) { /* segue para download */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1200);
  toast("📊 Planilha baixada");
}

/* Gera PDF via impressão do navegador (Imprimir → Salvar como PDF).
   Funciona offline e no celular, sem bibliotecas externas. */
function gerarPDF(dias, titulo, texto) {
  const lista = (Array.isArray(dias) ? dias : [dias]).slice().sort();
  const varios = lista.length > 1;
  // agrega os indicadores do período (um dia = igual a antes)
  const res = lista.map(iso => DB.resumoDia(iso));
  const soma = c => res.reduce((s, x) => s + x[c], 0);
  const diesel = soma("diesel"), km = soma("km"), viagens = soma("viagens"), ton = soma("toneladas");
  const media = diesel > 0 ? km / diesel : 0;
  const equips = new Set(), manuts = new Set();
  lista.forEach((iso, i) => { res[i].operando.forEach(e => equips.add(e)); res[i].manutencao.forEach(e => manuts.add(e)); });
  const corpo = texto || (varios ? gerarRelatorioPeriodo(lista, titulo || "Relatório") : gerarRelatorioTexto(lista[0]));

  let area = document.getElementById("printArea");
  if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.appendChild(area); }
  area.innerHTML = `
    <div class="pdf-head">
      <div class="pdf-logo">🚛 STRACTA MINERAÇÃO</div>
      <div class="pdf-sub">Controle de Frota · ${titulo || "Relatório Diário"}</div>
    </div>
    <h2 class="pdf-date">${varios ? `Período: ${DB.fmtBR(lista[0])} a ${DB.fmtBR(lista[lista.length - 1])}` : `Data: ${DB.fmtBR(lista[0])}`}</h2>
    <div class="pdf-kpis">
      <div><b>${fmt(diesel)}</b><span>Diesel (L)</span></div>
      <div><b>${fmt(media, 2)}</b><span>Média km/L</span></div>
      <div><b>${viagens}</b><span>Viagens</span></div>
      <div><b>${fmt(km)}</b><span>KM rodado</span></div>
      <div><b>${fmt(ton)}</b><span>Produção (t)</span></div>
      <div><b>${String(equips.size).padStart(2, "0")}</b><span>Equipamentos</span></div>
    </div>
    <pre class="pdf-body">${corpo.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>
    <div class="pdf-foot">Gerado pelo Sistema STRACTA · ${DB.fmtBR(DB.hojeISO())}</div>
  `;
  toast("Abrindo impressão · escolha \"Salvar como PDF\"");
  setTimeout(() => window.print(), 300);
}

/* ============================================================
   DASHBOARD
   ============================================================ */
/* Seletor de dias reutilizável: mês + chips. Usado na Comparação e nas Tendências. */
function seletorDias(pref, mesSel, selecionados, dica) {
  const meses = DB.mesesDisponiveis();
  if (!meses.length) return '<p class="empty">Sem dias registrados.</p>';
  const mes = meses.find(m => m.chave === mesSel) || meses[0];
  const diasMes = mes.dias.slice().reverse();           // mais recentes primeiro
  const fora = selecionados.filter(d => !diasMes.includes(d)).sort();
  return `
    <div class="field">
      <label>Mês</label>
      <select id="${pref}Mes">${meses.map(m =>
        `<option value="${m.chave}" ${m.chave === mes.chave ? "selected" : ""}>${m.label}</option>`).join("")}</select>
    </div>
    <label class="mini">${dica}</label>
    <div class="chips-dia">${diasMes.map(d =>
      `<button class="chip-dia ${selecionados.includes(d) ? "ativo" : ""}" data-${pref}dia="${d}">${DB.fmtBR(d).slice(0, 5)}</button>`).join("")}</div>
    <div class="btn-row" style="margin-top:6px">
      <button class="btn btn-ghost btn-sm" data-${pref}todos="1">Todos do mês</button>
      <button class="btn btn-ghost btn-sm" data-${pref}so="1">Só o último</button>
    </div>
    ${fora.length ? `<p class="hint">Também selecionados: ${fora.map(d => DB.fmtBR(d).slice(0, 5)).join(", ")}</p>` : ""}
  `;
}

/* Liga os eventos de um seletor de dias (estado com getters/setters) */
function ligarSeletorDias(pref, estado) {
  const selMes = $(`#${pref}Mes`);
  if (selMes) selMes.onchange = e => { estado.setMes(e.target.value); telaDashboard(); };
  $$(`[data-${pref}dia]`).forEach(el => el.onclick = () => {
    const d = el.dataset[pref + "dia"];
    const atual = estado.getDias();
    if (atual.includes(d)) {
      if (atual.length === 1) { toast("Deixe ao menos um dia selecionado", "err"); return; }
      estado.setDias(atual.filter(x => x !== d));
    } else estado.setDias(atual.concat(d));
    telaDashboard();
  });
  const mesDe = () => {
    const meses = DB.mesesDisponiveis();
    return meses.find(m => m.chave === estado.getMes()) || meses[0];
  };
  const bTodos = $(`[data-${pref}todos]`);
  if (bTodos) bTodos.onclick = () => { const m = mesDe(); if (m) estado.setDias(m.dias.slice()); telaDashboard(); };
  const bSo = $(`[data-${pref}so]`);
  if (bSo) bSo.onclick = () => { const m = mesDe(); if (m) estado.setDias([m.dias[m.dias.length - 1]]); telaDashboard(); };
}

/* Detalhe por trás de cada KPI do "Geral do dia" (chave → título + linhas). */
function detalheKpi(chave, iso) {
  const d = DB.getDia(iso) || { abastecimentos: [], viagens: [], manutencoes: [] };
  const abast = d.abastecimentos || [], viags = d.viagens || [], manut = d.manutencoes || [];
  const equips = [...new Set([...abast.map(a => a.equipamento), ...viags.map(v => v.equipamento)])];
  const somaAb = (eq, campo) => abast.filter(a => a.equipamento === eq).reduce((s, a) => s + num(a[campo]), 0);
  const linha = (t, s) => ({ titulo: t, sub: s });

  const porEquip = (titulo, fn, filtrar = true) => ({
    titulo,
    linhas: equips.map(eq => ({ eq, txt: fn(eq) }))
      .filter(x => !filtrar || x.txt)
      .map(x => linha(x.eq, x.txt))
  });

  switch (chave) {
    case "equipamentos":
      return porEquip("🚛 Equipamentos do dia", eq => {
        const l = somaAb(eq, "litros"), h = somaAb(eq, "horasTrabalhadas");
        const vi = viags.filter(v => v.equipamento === eq).reduce((s, v) => s + num(v.quantidade), 0);
        return `${fmt(l)} L · ${fmt(h, 1)} h${vi ? ` · ${vi} viagens` : ""}`;
      }, false);
    case "operadores": {
      const mapa = {};
      abast.forEach(a => { if (a.motorista) (mapa[a.motorista] ||= new Set()).add(a.equipamento); });
      viags.forEach(v => { if (v.motorista) (mapa[v.motorista] ||= new Set()).add(v.equipamento); });
      return {
        titulo: "👷 Operadores do dia",
        linhas: Object.entries(mapa).map(([nome, eqs]) => linha(nome, [...eqs].join(", ")))
      };
    }
    case "diesel":
      return porEquip("⛽ Consumo de diesel", eq => {
        const arr = abast.filter(a => a.equipamento === eq);
        if (!arr.length) return "";
        const s10 = arr.filter(a => a.combustivel !== "S-500").reduce((s, a) => s + num(a.litros), 0);
        const s500 = arr.filter(a => a.combustivel === "S-500").reduce((s, a) => s + num(a.litros), 0);
        const tot = s10 + s500;
        const det = [s10 ? `S-10: ${fmt(s10)} L` : null, s500 ? `S-500: ${fmt(s500)} L` : null].filter(Boolean).join(" · ");
        return `${fmt(tot)} L${det ? ` (${det})` : ""}`;
      });
    case "horas":
      return porEquip("⏱️ Horas trabalhadas", eq => { const h = somaAb(eq, "horasTrabalhadas"); return h ? `${fmt(h, 1)} h` : ""; });
    case "lh":
      return porEquip("📊 L/h por equipamento", eq => {
        const l = somaAb(eq, "litros"), h = somaAb(eq, "horasTrabalhadas");
        return h > 0 && l > 0 ? `${fmt(l / h, 2)} L/h · ${fmt(l)} L em ${fmt(h, 1)} h` : "";
      });
    case "toneladas":
      return porEquip("🏭 Produção", eq => { const t = DB.tonEquipDia(eq, iso); return t > 0 ? `${fmt(t)} t` : ""; });
    case "lton":
      return porEquip("🏭 L/Ton por equipamento", eq => {
        const lt = DB.ltonEquipDia(eq, iso), t = DB.tonEquipDia(eq, iso);
        return lt > 0 ? `${fmt(lt, 2)} L/t · ${fmt(somaAb(eq, "litros"))} L em ${fmt(t)} t` : "";
      });
    case "media":
      return porEquip("📈 Média km/L", eq => {
        const l = somaAb(eq, "litros"), k = somaAb(eq, "kmRodado");
        return l > 0 && k > 0 ? `${fmt(k / l, 2)} km/L · ${fmt(k)} km` : "";
      });
    case "viagens":
      return porEquip("🚚 Viagens", eq => {
        const arr = viags.filter(v => v.equipamento === eq);
        if (!arr.length) return "";
        const q = arr.reduce((s, v) => s + num(v.quantidade), 0);
        const rotas = arr.map(v => `Origem ${v.origem} → Destino ${v.destino} = ${v.quantidade}`).join(" | ");
        return `${q} viagens · ${rotas}`;
      });
    case "km":
      return porEquip("🛣️ KM rodado", eq => { const k = somaAb(eq, "kmRodado"); return k ? `${fmt(k)} km` : ""; });
    case "arla":
      return porEquip("💧 ARLA 32", eq => { const a = somaAb(eq, "litrosArla"); return a ? `${fmt(a)} L` : ""; });
    case "manutencao":
      return {
        titulo: "🔧 Manutenções do dia",
        linhas: manut.map(m => linha(`${m.equipamento} · ${m.tipo}`, m.servico || "—"))
      };
    default:
      return { titulo: "Detalhe", linhas: [] };
  }
}

function telaDashboard() {
  $("#headerTitle").textContent = "📊 Painel";
  $("#headerSub").textContent = "ALERTAS · GRÁFICOS · METAS";
  const db = DB.load();
  const diaAtual = DB.garantirDiaAtual();
  const listaDias = DB.listaDias();
  // dias selecionados (1 = geral do dia; 2+ = comparação); mantém só os que existem
  let sel = painelDias.filter(d => listaDias.includes(d));
  if (!sel.length) sel = [listaDias.includes(diaAtual) ? diaAtual : (listaDias[0] || diaAtual)];
  painelDias = sel;
  const comparando = sel.length > 1;
  const dia = sel.slice().sort().reverse()[0];   // mais recente dos selecionados
  const r = DB.resumoDia(dia);

  // dias das Tendências/ranking (padrão: últimos 7 dias com registro)
  let td = trendDias.filter(d => listaDias.includes(d));
  if (!td.length) td = listaDias.slice(0, 7);
  trendDias = td;
  const diasTend = td.slice().sort();            // do mais antigo ao mais novo
  const N = diasTend.length;

  // mês exibido em cada seletor (padrão: mês do dia mais recente de cada seleção)
  const mesesDisp = DB.mesesDisponiveis().map(m => m.chave);
  if (!mesesDisp.includes(painelMes)) painelMes = dia.slice(0, 7);
  if (!mesesDisp.includes(trendMes)) trendMes = diasTend[diasTend.length - 1].slice(0, 7);

  // ---- alertas ----
  const alertas = DB.alertas();
  const alertasHtml = alertas.length
    ? alertas.map(a => `<div class="alert-item alert-${a.nivel}"><span class="ai">${a.icone}</span><span>${a.msg}</span></div>`).join("")
    : '<p class="empty" style="padding:8px 0">✅ Nenhum alerta. Frota sob controle.</p>';

  // ---- séries (janela selecionada) ----
  const lab = x => DB.fmtBR(x.iso).slice(0, 5);
  const s = diasTend.map(iso => Object.assign({ iso }, DB.resumoDia(iso)));
  const gDiesel = grafico(s.map(x => ({ label: lab(x), valor: Math.round(x.diesel), rotulo: fmt(x.diesel) })), { tipo: "barra", cor: "#ff7a1a", titulo: "Diesel" });
  const gProd = grafico(s.map(x => ({ label: lab(x), valor: Math.round(x.toneladas), rotulo: fmt(x.toneladas) })), { tipo: "barra", cor: "#a855f7", titulo: "Produção" });
  const gLton = grafico(s.map(x => ({ label: lab(x), valor: x.lton, rotulo: fmt(x.lton, 2) })), { tipo: "linha", cor: "#f59e0b", titulo: "L/Ton" });
  const gLh = grafico(s.map(x => ({ label: lab(x), valor: x.lh, rotulo: fmt(x.lh, 2) })), { tipo: "linha", cor: "#ef4444", titulo: "L/h" });
  const gMedia = grafico(s.map(x => ({ label: lab(x), valor: x.media, rotulo: fmt(x.media, 2) })), { tipo: "linha", cor: "#22c55e", titulo: "Média km/L" });
  const gViagens = grafico(s.map(x => ({ label: lab(x), valor: x.viagens, rotulo: x.viagens })), { tipo: "barra", cor: "#3b82f6", titulo: "Viagens" });

  // ---- comparativo: janela atual x janela anterior (mesmo tamanho) ----
  const totaisPeriodo = lista => {
    const t = lista.reduce((a, x) => {
      a.diesel += x.diesel; a.horas += x.horas; a.toneladas += x.toneladas;
      a.viagens += x.viagens; a.km += x.km; return a;
    }, { diesel: 0, horas: 0, toneladas: 0, viagens: 0, km: 0 });
    t.lh = t.horas > 0 ? t.diesel / t.horas : 0;
    t.lton = t.toneladas > 0 ? t.diesel / t.toneladas : 0;
    t.media = t.diesel > 0 ? t.km / t.diesel : 0;
    return t;
  };
  const idxIni = listaDias.indexOf(diasTend[0]);          // listaDias vem do mais novo ao mais antigo
  const diasAnteriores = idxIni >= 0 ? listaDias.slice(idxIni + 1, idxIni + 1 + N) : [];
  const atual = totaisPeriodo(s);
  const anterior = totaisPeriodo(diasAnteriores.map(iso => DB.resumoDia(iso)));
  const comparaHtml = [
    ["⛽ Diesel", "diesel", " L", 0], ["⏱️ Horas", "horas", " h", 1],
    ["🏭 Produção", "toneladas", " t", 1], ["🚚 Viagens", "viagens", "", 0],
    ["📊 L/h", "lh", " L/h", 2], ["🏭 L/Ton", "lton", " L/t", 2]
  ].map(([lbl, k, un, dec]) => {
    const a = atual[k], b = anterior[k];
    const menorMelhor = (k === "lh" || k === "lton");
    let seta = "→", cor = "var(--muted)";
    if (b > 0 && a !== b) {
      const sobe = a > b;
      const bom = menorMelhor ? !sobe : sobe;
      seta = sobe ? "▲" : "▼";
      cor = bom ? "var(--green)" : "var(--red)";
    }
    const varTxt = b > 0 ? ` ${seta} ${fmt(Math.abs((a - b) / b) * 100, 0)}%` : "";
    return `<div class="kpi"><div class="k-label">${lbl}</div>
      <div class="k-value">${fmt(a, dec)}<span class="k-unit">${un}</span></div>
      <div class="mini" style="color:${cor}">antes ${fmt(b, dec)}${un}${varTxt}</div></div>`;
  }).join("");

  // ---- tabela de comparação (2+ dias) ----
  let comparaDiasHtml = "";
  if (comparando) {
    const ordem = sel.slice().sort();                  // do mais antigo ao mais novo
    const res = ordem.map(d => ({ d, r: DB.resumoDia(d) }));
    const soma = campo => res.reduce((s, x) => s + x.r[campo], 0);
    const tot = {
      diesel: soma("diesel"), horas: soma("horas"), toneladas: soma("toneladas"),
      km: soma("km"), viagens: soma("viagens"), arla: soma("arla")
    };
    // razões recalculadas a partir dos totais (nunca média de médias)
    tot.lh = tot.horas > 0 ? tot.diesel / tot.horas : 0;
    tot.lton = tot.toneladas > 0 ? tot.diesel / tot.toneladas : 0;
    tot.media = tot.diesel > 0 ? tot.km / tot.diesel : 0;

    const LINHAS = [
      ["Equip.", x => String(x.operando.length).padStart(2, "0"), () => "—"],
      ["Operad.", x => String(x.operadores.length).padStart(2, "0"), () => "—"],
      ["Diesel L", x => fmt(x.diesel), () => fmt(tot.diesel)],
      ["Horas", x => fmt(x.horas, 1), () => fmt(tot.horas, 1)],
      ["L/h", x => fmt(x.lh, 2), () => fmt(tot.lh, 2)],
      ["Prod. t", x => fmt(x.toneladas), () => fmt(tot.toneladas)],
      ["L/Ton", x => fmt(x.lton, 2), () => fmt(tot.lton, 2)],
      ["km/L", x => fmt(x.media, 2), () => fmt(tot.media, 2)],
      ["Viagens", x => x.viagens, () => tot.viagens],
      ["KM", x => fmt(x.km), () => fmt(tot.km)],
      ["ARLA L", x => fmt(x.arla), () => fmt(tot.arla)],
      ["Manut.", x => String(x.manutencao.length).padStart(2, "0"), () => "—"]
    ];
    comparaDiasHtml = `
      <div class="cmp-wrap">
        <table class="cmp-table">
          <thead><tr><th>Indicador</th>
            ${res.map(x => `<th>${DB.fmtBR(x.d).slice(0, 5)}</th>`).join("")}
            <th>Total</th></tr></thead>
          <tbody>
            ${LINHAS.map(([lbl, fn, ftot]) => `<tr><th>${lbl}</th>
              ${res.map(x => `<td>${fn(x.r)}</td>`).join("")}
              <td class="tot">${ftot()}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  // ---- detalhe do KPI aberto (Geral do dia) ----
  let detalheHtml = "";
  if (painelKpi && !comparando) {
    const det = detalheKpi(painelKpi, dia);
    const corpo = det.linhas.length
      ? `<div class="itemlist">${det.linhas.map(l =>
          `<div class="itemrow"><div class="info"><b>${l.titulo}</b><div class="sub">${l.sub}</div></div></div>`).join("")}</div>`
      : '<p class="empty">Sem dados neste dia.</p>';
    detalheHtml = `
      <div class="spacer"></div>
      <div class="card" style="background:rgba(255,122,26,.06)">
        <div class="list-head"><h3 style="margin:0">${det.titulo}</h3>
          <button class="btn btn-ghost btn-sm" id="btnFecharKpi">Fechar</button></div>
        ${corpo}
      </div>`;
  }

  // ---- ranking por equipamento (comparação) ----
  const METRICAS = {
    diesel:    { lbl: "⛽ Diesel (L)",     un: " L",    dec: 0, cor: "#ff7a1a" },
    lton:      { lbl: "🏭 L/Ton",          un: " L/t",  dec: 2, cor: "#f59e0b" },
    lh:        { lbl: "📊 L/h",            un: " L/h",  dec: 2, cor: "#ef4444" },
    toneladas: { lbl: "🏭 Produção (t)",   un: " t",    dec: 0, cor: "#a855f7" },
    viagens:   { lbl: "🚚 Viagens",        un: "",      dec: 0, cor: "#3b82f6" },
    media:     { lbl: "📈 Média km/L",     un: " km/L", dec: 2, cor: "#22c55e" },
    horas:     { lbl: "⏱️ Horas",          un: " h",    dec: 1, cor: "#eab308" }
  };
  const met = METRICAS[painelMetrica] || METRICAS.diesel;
  const rank = DB.totaisPorEquipamento(diasTend)
    .filter(x => x[painelMetrica] > 0)
    .sort((a, b) => b[painelMetrica] - a[painelMetrica]);
  const gRank = rank.length
    ? grafico(rank.map(x => ({ label: x.eq, valor: x[painelMetrica], rotulo: fmt(x[painelMetrica], met.dec) })),
              { tipo: "barra", cor: met.cor, titulo: met.lbl })
    : '<p class="empty">Sem dados no período.</p>';
  const rankLista = rank.map((x, i) =>
    `<div class="itemrow"><div class="info">${i === 0 ? "🥇 " : ""}<b>${x.eq}</b>
      <div class="sub">${fmt(x[painelMetrica], met.dec)}${met.un}</div></div></div>`).join("");

  // ---- status da frota ----
  const statusHtml = db.equipamentos.map(eq => {
    const st = DB.getStatus(eq);
    const f = DB.getDia(dia) || { abastecimentos: [], viagens: [] };
    const ab = f.abastecimentos.filter(a => a.equipamento === eq);
    const litros = ab.reduce((x, a) => x + num(a.litros), 0);
    const ultAb = ab.length ? ab[ab.length - 1] : null;
    const md = ultAb ? `${ultAb.media} ${ultAb.unidadeMedia || "km/L"}` : "—";
    const viag = (f.viagens || []).filter(v => v.equipamento === eq).reduce((x, v) => x + num(v.quantidade), 0);
    const lt = DB.ltonEquipDia(eq, dia);
    // motorista(s) que estavam no equipamento no dia selecionado
    const mots = [...new Set([
      ...ab.map(a => a.motorista),
      ...(f.viagens || []).filter(v => v.equipamento === eq).map(v => v.motorista)
    ].filter(Boolean))].join(", ");
    return `<div class="itemrow" data-ficha="${eq}"><div class="info"><b>${eq}</b> ${pillStatus(st)}
      <div class="sub">${mots ? `👷 ${mots}<br>` : ""}${fmt(litros)} L · ${md} · ${viag} viagens${lt > 0 ? ` · ${fmt(lt, 2)} L/t` : ""}</div></div><span class="mini">ficha ›</span></div>`;
  }).join("");

  app.innerHTML = `
    <div class="card">
      <h3>${comparando ? `🔀 Comparação de ${sel.length} dias` : "📅 Geral do dia"}</h3>
      ${seletorDias("pn", painelMes, sel, "Escolha os dias (toque em mais de um para comparar)")}
      ${comparando ? comparaDiasHtml : `
      <p class="hint">Toque num cartão para ver os dados por trás dele.</p>
      <div class="kpi-grid">
        <div class="kpi k-green ${painelKpi === "equipamentos" ? "kpi-ativo" : ""}" data-kpi="equipamentos"><div class="k-label">🚛 Equipamentos</div><div class="k-value">${String(r.operando.length).padStart(2, "0")}</div></div>
        <div class="kpi k-blue ${painelKpi === "operadores" ? "kpi-ativo" : ""}" data-kpi="operadores"><div class="k-label">👷 Operadores</div><div class="k-value">${String(r.operadores.length).padStart(2, "0")}</div></div>
        <div class="kpi ${painelKpi === "diesel" ? "kpi-ativo" : ""}" data-kpi="diesel"><div class="k-label">⛽ Consumo diesel</div><div class="k-value">${fmt(r.diesel)}<span class="k-unit"> L</span></div></div>
        <div class="kpi k-yellow ${painelKpi === "horas" ? "kpi-ativo" : ""}" data-kpi="horas"><div class="k-label">⏱️ Horas totais</div><div class="k-value">${fmt(r.horas, 1)}<span class="k-unit"> h</span></div></div>
        <div class="kpi ${painelKpi === "lh" ? "kpi-ativo" : ""}" data-kpi="lh"><div class="k-label">📊 L/h</div><div class="k-value">${fmt(r.lh, 2)}<span class="k-unit"> L/h</span></div></div>
        <div class="kpi k-blue ${painelKpi === "toneladas" ? "kpi-ativo" : ""}" data-kpi="toneladas"><div class="k-label">🏭 Produção</div><div class="k-value">${fmt(r.toneladas)}<span class="k-unit"> t</span></div></div>
        <div class="kpi k-yellow ${painelKpi === "lton" ? "kpi-ativo" : ""}" data-kpi="lton"><div class="k-label">🏭 L/Ton</div><div class="k-value">${fmt(r.lton, 2)}<span class="k-unit"> L/t</span></div></div>
        <div class="kpi k-green ${painelKpi === "media" ? "kpi-ativo" : ""}" data-kpi="media"><div class="k-label">📈 Média km/L</div><div class="k-value">${fmt(r.media, 2)}<span class="k-unit"> km/L</span></div></div>
        <div class="kpi k-blue ${painelKpi === "viagens" ? "kpi-ativo" : ""}" data-kpi="viagens"><div class="k-label">🚚 Viagens</div><div class="k-value">${r.viagens}</div></div>
        <div class="kpi ${painelKpi === "km" ? "kpi-ativo" : ""}" data-kpi="km"><div class="k-label">🛣️ KM rodado</div><div class="k-value">${fmt(r.km)}<span class="k-unit"> km</span></div></div>
        <div class="kpi ${painelKpi === "arla" ? "kpi-ativo" : ""}" data-kpi="arla"><div class="k-label">💧 ARLA</div><div class="k-value">${fmt(r.arla)}<span class="k-unit"> L</span></div></div>
        <div class="kpi k-red ${painelKpi === "manutencao" ? "kpi-ativo" : ""}" data-kpi="manutencao"><div class="k-label">🔧 Manutenção</div><div class="k-value">${String(r.manutencao.length).padStart(2, "0")}</div></div>
      </div>
      ${detalheHtml}`}
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
      <h3>📈 Tendências</h3>
      ${seletorDias("tr", trendMes, diasTend, "Dias do gráfico (toque para incluir ou tirar)")}
      <p class="chart-title">⛽ Diesel (L)</p>${gDiesel}
      <p class="chart-title">🏭 Produção (t)</p>${gProd}
      <p class="chart-title">🏭 L/Ton (litros por tonelada)</p>${gLton}
      <p class="chart-title">📊 L/h (litros por hora)</p>${gLh}
      <p class="chart-title">📈 Média da frota (km/L)</p>${gMedia}
      <p class="chart-title">🚚 Viagens</p>${gViagens}
    </div>

    <div class="card">
      <h3>🔀 Comparativo <span class="mini">janela atual × anterior</span></h3>
      <p class="hint">${N} dia(s) selecionado(s) nas Tendências, comparados com os ${N} dias anteriores.</p>
      <div class="kpi-grid">${comparaHtml}</div>
    </div>

    <div class="card">
      <h3>🏆 Comparação por equipamento</h3>
      <div class="field">
        <label>Indicador</label>
        <select id="pnMetrica">
          ${Object.entries(METRICAS).map(([k, m]) => `<option value="${k}" ${k === painelMetrica ? "selected" : ""}>${m.lbl}</option>`).join("")}
        </select>
      </div>
      <p class="hint">${N} dia(s) selecionado(s) · do maior para o menor${(painelMetrica === "lh" || painelMetrica === "lton") ? " — aqui o primeiro é o que <b>mais consome</b>" : ""}.</p>
      ${gRank}
      <div class="itemlist">${rankLista}</div>
    </div>

    <div class="card">
      <h3>🚛 Status da frota <span class="mini">${DB.fmtBR(dia)}</span></h3>
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

    <div class="card">
      <h3>☁️ Planilha na nuvem <span id="syncBadge" class="pill pill-gray">desligada</span></h3>
      <p class="hint">Cole o link do App da Web da sua planilha (Google Sheets). Passo a passo: pasta <b>google-sheets</b> do projeto.</p>
      <div class="field">
        <label>Link da planilha (termina em /exec)</label>
        <input id="cfgSheets" placeholder="https://script.google.com/.../exec" value="${db.config.sheetsUrl || ""}">
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-sm" id="btnSheetsSalvar">💾 Salvar</button>
        <button class="btn btn-ghost btn-sm" id="btnSheetsTestar">🔌 Testar conexão</button>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-green" id="btnSheetsSync">🔄 Sincronizar tudo</button>
      <p class="hint" id="sheetsMsg" style="margin-top:8px"></p>
    </div>
  `;

  $$("[data-ficha]").forEach(el => el.onclick = () => abrirFicha(el.dataset.ficha));

  ligarSeletorDias("pn", {
    getMes: () => painelMes, setMes: v => { painelMes = v; },
    getDias: () => painelDias, setDias: v => { painelDias = v; }
  });
  ligarSeletorDias("tr", {
    getMes: () => trendMes, setMes: v => { trendMes = v; },
    getDias: () => trendDias, setDias: v => { trendDias = v; }
  });
  $("#pnMetrica").onchange = e => { painelMetrica = e.target.value; telaDashboard(); };

  // KPIs do "Geral do dia" abrem o detalhe (tocar de novo fecha)
  $$("[data-kpi]").forEach(el => el.onclick = () => {
    painelKpi = (painelKpi === el.dataset.kpi) ? null : el.dataset.kpi;
    telaDashboard();
  });
  const btnFechar = $("#btnFecharKpi");
  if (btnFechar) btnFechar.onclick = () => { painelKpi = null; telaDashboard(); };

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

  // ---- Planilha na nuvem ----
  Sync._badge();
  const msg = (t, cor) => { const m = $("#sheetsMsg"); if (m) { m.innerHTML = t; m.style.color = cor || "var(--muted)"; } };
  $("#btnSheetsSalvar").onclick = () => {
    DB.setConfig({ sheetsUrl: $("#cfgSheets").value.trim() });
    Sync._badge();
    toast("✔ Link salvo");
    msg(Sync.ativo() ? "Link salvo. Toque em <b>Testar conexão</b>." : "Link vazio — sincronização desligada.");
  };
  $("#btnSheetsTestar").onclick = () => {
    DB.setConfig({ sheetsUrl: $("#cfgSheets").value.trim() });
    if (!Sync.ativo()) { msg("Cole o link primeiro.", "var(--red)"); return; }
    msg("Conectando…");
    Sync.testar(res => {
      if (res && res.ok) {
        const l = res.linhas || {};
        msg(`✅ Conectado a <b>${res.planilha}</b>.<br>Linhas — lançamentos: ${l.lancamento || 0} · equip.: ${l.equipamento || 0} · manut.: ${l.manutencao || 0}`, "var(--green)");
      } else {
        msg("❌ " + ((res && res.erro) || "Falha na conexão."), "var(--red)");
      }
    });
  };
  $("#btnSheetsSync").onclick = () => {
    DB.setConfig({ sheetsUrl: $("#cfgSheets").value.trim() });
    if (!Sync.ativo()) { msg("Cole o link primeiro.", "var(--red)"); return; }
    msg("Enviando toda a base… aguarde.");
    Sync.syncAll(res => {
      Sync._badge();
      if (res && res.ok) {
        const l = res.linhas || {};
        msg(`✅ Sincronizado! Na planilha — lançamentos: ${l.lancamento || 0} · equip.: ${l.equipamento || 0} · manut.: ${l.manutencao || 0}`, "var(--green)");
      } else {
        msg("⚠️ " + ((res && res.erro) || "Não deu para confirmar. Veja se há internet."), "var(--red)");
      }
    });
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
      <div class="field-row">
        <div class="field">
          <label>Horímetro atual</label>
          <input id="novoHori" inputmode="decimal" placeholder="ex: 5000">
        </div>
        <div class="field" id="novoKmWrap">
          <label>KM atual</label>
          <input id="novoKm" inputmode="decimal" placeholder="ex: 12000">
        </div>
      </div>
      <button class="btn btn-primary" id="btnAddEq">Adicionar equipamento</button>
    </div>
  `;
  $$("[data-ficha]").forEach(el => el.onclick = () => abrirFicha(el.dataset.ficha));

  $("#novoTipo").onchange = e => {
    $("#novoKmWrap").style.display = e.target.value === "horimetro" ? "none" : "";
  };

  $("#btnAddEq").onclick = () => {
    const v = $("#novoEq").value.trim().toUpperCase();
    if (!v) { toast("Digite o código", "err"); return; }
    const tipo = $("#novoTipo").value;
    DB.addEquipamento(v);
    DB.setTipoEquip(v, tipo);
    const horiVal = $("#novoHori").value.trim();
    const kmVal = $("#novoKm").value.trim();
    const horimetro = horiVal === "" ? null : num(horiVal);
    const km = (tipo === "horimetro" || kmVal === "") ? null : num(kmVal);
    DB.setUltimo(v, km, horimetro);
    Sync.pushEquipamento(v);
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
      <div class="kpi k-blue"><div class="k-label">🏭 Produção</div><div class="k-value">${fmt(f.totToneladas)}<span class="k-unit"> t</span></div></div>
      <div class="kpi k-yellow"><div class="k-label">🏭 L/Ton</div><div class="k-value">${fmt(f.lton, 2)}<span class="k-unit"> L/t</span></div></div>
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
        return `<div class="itemrow"><div class="info"><b>${DB.fmtBR(a.iso)}</b>${a.motorista ? ` <span class="mini">👷 ${a.motorista}</span>` : ""}
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

    <div class="card">
      <h3>⚠️ Excluir equipamento</h3>
      <p class="hint">Remove <b>${eq}</b> da frota. O histórico dos dias anteriores é mantido. Para confirmar, digite <b>CONFIRMAR</b> abaixo.</p>
      <div class="field">
        <input id="fkExcluirConf" placeholder="Digite CONFIRMAR" autocomplete="off">
      </div>
      <button class="btn btn-danger" id="btnExcluirEq">🗑️ Excluir ${eq}</button>
    </div>
  `;

  $("#btnFkSalvar").onclick = () => {
    DB.setStatus(eq, $("#fkStatus").value);
    DB.setTipoEquip(eq, $("#fkTipo").value);
    DB.setProximaRevisao(eq, $("#fkRev").value.trim());
    Sync.pushEquipamento(eq);
    toast("✔ Situação salva"); telaFicha();
  };

  $("#btnExcluirEq").onclick = async () => {
    if ($("#fkExcluirConf").value.trim().toUpperCase() !== "CONFIRMAR") {
      toast("Digite CONFIRMAR para excluir", "err"); return;
    }
    DB.removerEquipamento(eq);
    Sync.deleteEquipamento(eq);
    toast("✔ Equipamento excluído");
    navegar("frota");
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
      <div class="itemrow"><div class="info"><b>${v.equipamento}</b> · Origem ${v.origem} → Destino ${v.destino} = ${v.quantidade}
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
      const id = b.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
      DB.excluir(iso, tipo, id);
      if (tipo === "abastecimentos") Sync.deleteLancamento(id);
      else if (tipo === "manutencoes") Sync.deleteManutencao(id);
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
