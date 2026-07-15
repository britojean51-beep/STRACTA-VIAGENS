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

/* ---------- Utilidades numéricas ---------- */
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
const fmt = (n, d = 0) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

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
  corrigir:      telaCorrigir
};

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
      <button class="menu-card" data-go="dashboard">
        <span class="ico">📊</span><span class="lbl">Dashboard</span>
        <span class="desc">Indicadores da frota</span>
      </button>
    </div>
    <div class="spacer"></div>
    <p class="hint" style="text-align:center">STRACTA V1.0 · funciona 100% no celular · dados salvos neste aparelho</p>
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
function telaAbastecimento() {
  $("#headerTitle").textContent = "⛽ Abastecimento";
  $("#headerSub").textContent = "DIESEL · KM · HORÍMETRO";
  const db = DB.load();
  const dia = DB.garantirDiaAtual();
  const ed = editando;

  const optsEquip = db.equipamentos.map(e => `<option ${ed && ed.equipamento === e ? "selected" : ""}>${e}</option>`).join("");
  const optsMot = db.motoristas.map(m => `<option ${ed && ed.motorista === m ? "selected" : ""}>${m}</option>`).join("");
  const optsAb = db.abastecedores.map(a => `<option ${ed && ed.abastecedor === a ? "selected" : ""}>${a}</option>`).join("");

  app.innerHTML = `
    <div class="card">
      <h3>⛽ ${ed ? "Editar" : "Novo"} abastecimento <span class="badge-auto">auto-cálculo</span></h3>

      <div class="field">
        <label>Equipamento</label>
        <select id="fEquip">${optsEquip}</select>
      </div>
      <div class="field">
        <label>Motorista</label>
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

      <div class="field-row">
        <div class="field">
          <label>Litros (Diesel S10)</label>
          <input id="fLitros" inputmode="decimal" value="${ed?.litros ?? ""}">
        </div>
        <div class="field">
          <label>Média KM/L</label>
          <input id="fMedia" class="computed" readonly value="${ed?.media ?? ""}">
        </div>
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
  `;

  const el = {
    equip: $("#fEquip"), horiIni: $("#fHoriIni"), horiFim: $("#fHoriFim"), horas: $("#fHoras"),
    kmIni: $("#fKmIni"), kmFim: $("#fKmFim"), kmRod: $("#fKmRod"),
    litros: $("#fLitros"), media: $("#fMedia")
  };

  function preencherAuto() {
    if (editando) return;
    const u = DB.ultimo(el.equip.value);
    el.horiIni.value = u.horimetroFinal ?? "";
    el.kmIni.value = u.kmFinal ?? "";
    recalcular();
  }
  function recalcular() {
    const horas = num(el.horiFim.value) - num(el.horiIni.value);
    const kmRod = num(el.kmFim.value) - num(el.kmIni.value);
    const litros = num(el.litros.value);
    el.horas.value = horas > 0 ? fmt(horas, 1) + " h" : "";
    el.kmRod.value = kmRod > 0 ? fmt(kmRod, 0) + " km" : "";
    el.media.value = (litros > 0 && kmRod > 0) ? fmt(kmRod / litros, 2) + " km/L" : "";
  }

  el.equip.onchange = preencherAuto;
  [el.horiIni, el.horiFim, el.kmIni, el.kmFim, el.litros].forEach(i => i.oninput = recalcular);
  if (!editando) preencherAuto(); else recalcular();

  $("#btnSalvar").onclick = () => {
    const equip = el.equip.value;
    const horiIni = num(el.horiIni.value), horiFim = num(el.horiFim.value);
    const kmIni = num(el.kmIni.value), kmFim = num(el.kmFim.value);
    const litros = num(el.litros.value);

    if (!litros) { toast("Informe os litros abastecidos", "err"); return; }
    if (horiFim < horiIni) { toast("Horímetro final menor que o inicial", "err"); return; }
    if (kmFim < kmIni) { toast("KM final menor que o inicial", "err"); return; }

    const horas = horiFim - horiIni;
    const kmRod = kmFim - kmIni;
    const reg = {
      equipamento: equip,
      motorista: $("#fMot").value,
      horimetroInicial: horiIni,
      horimetroFinal: horiFim,
      horasTrabalhadas: fmt(horas, 1),
      kmInicial: kmIni,
      kmFinal: kmFim,
      kmRodado: kmRod,
      litros: litros,
      media: kmRod > 0 ? fmt(kmRod / litros, 2) : "0",
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
      toast(`✔ ${equip} salvo · ${fmt(litros, 0)} L`);
      telaAbastecimento(); // recarrega limpo (campos limpos, auto refeito)
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
    box.innerHTML = Object.entries(porEq).map(([eq, arr]) => {
      const sub = arr.reduce((s, v) => s + Number(v.quantidade), 0); total += sub;
      const rotas = arr.map(v => `O${v.origem}→D${v.destino}=${v.quantidade}`).join(" · ");
      return `<div class="itemrow"><div class="info"><b>${eq}</b> = ${sub} viagens
        <div class="sub">${rotas}</div></div></div>`;
    }).join("") + `<div class="spacer"></div><p class="tag-total">Total frota: ${total} viagens</p>`;
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
function telaManutencao() {
  $("#headerTitle").textContent = "🔧 Manutenção";
  $("#headerSub").textContent = "PREVENTIVA · CORRETIVA";
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
      <div class="field">
        <label>Horímetro / KM</label>
        <input id="mHorKm" inputmode="decimal" placeholder="19910">
      </div>
      <div class="field">
        <label>Observações</label>
        <textarea id="mObs"></textarea>
      </div>
      <button class="btn btn-primary" id="btnSalvar">💾 SALVAR</button>
    </div>

    <div class="card">
      <h3>📅 Manutenções de hoje (${DB.fmtBR(dia)})</h3>
      <div id="mHoje"></div>
    </div>
  `;

  function render() {
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
    if (!serv) { toast("Descreva o serviço", "err"); return; }
    DB.addManutencao(dia, {
      equipamento: $("#mEquip").value, tipo: $("#mTipo").value,
      servico: serv, horKm: $("#mHorKm").value.trim(), observacoes: $("#mObs").value.trim()
    });
    toast("✔ Manutenção registrada");
    $("#mServico").value = ""; $("#mHorKm").value = ""; $("#mObs").value = "";
    render();
  };

  render();
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

  let totalDiesel = 0, totalKm = 0, totalViagens = 0;
  const operando = new Set();

  d.abastecimentos.forEach(a => {
    operando.add(a.equipamento);
    totalDiesel += num(a.litros);
    totalKm += num(a.kmRodado);
    txt += `🚛 ${a.equipamento}\n`;
    txt += `Motorista: ${a.motorista}\n`;
    txt += `Horímetro: ${a.horimetroFinal}\n`;
    txt += `Horas Trabalhadas: ${a.horasTrabalhadas} h\n`;
    txt += `KM Rodado: ${fmt(a.kmRodado)} km\n`;
    txt += `Diesel: ${fmt(a.litros)} L\n`;
    txt += `Média: ${a.media} km/L\n`;
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
  txt += `Total Diesel: ${fmt(totalDiesel)} L\n`;
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
  render();
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function telaDashboard() {
  $("#headerTitle").textContent = "📊 Dashboard";
  $("#headerSub").textContent = "INDICADORES DA FROTA";
  const db = DB.load();
  const dia = DB.garantirDiaAtual();
  const d = DB.getDia(dia) || { abastecimentos: [], viagens: [], manutencoes: [] };

  let totalDiesel = 0, totalKm = 0, totalViagens = 0;
  const operando = new Set();
  d.abastecimentos.forEach(a => { totalDiesel += num(a.litros); totalKm += num(a.kmRodado); operando.add(a.equipamento); });
  d.viagens.forEach(v => { totalViagens += Number(v.quantidade); operando.add(v.equipamento); });
  const emManut = new Set(d.manutencoes.map(m => m.equipamento));
  const mediaFrota = totalDiesel > 0 ? totalKm / totalDiesel : 0;

  app.innerHTML = `
    <p class="section-title">Dia ${DB.fmtBR(dia)}</p>
    <div class="kpi-grid">
      <div class="kpi"><div class="k-label">⛽ Diesel S10</div><div class="k-value">${fmt(totalDiesel)}<span class="k-unit"> L</span></div></div>
      <div class="kpi k-green"><div class="k-label">📈 Média Frota</div><div class="k-value">${fmt(mediaFrota, 2)}<span class="k-unit"> km/L</span></div></div>
      <div class="kpi k-blue"><div class="k-label">🚚 Total Viagens</div><div class="k-value">${totalViagens}</div></div>
      <div class="kpi"><div class="k-label">🛣️ Total KM</div><div class="k-value">${fmt(totalKm)}<span class="k-unit"> km</span></div></div>
      <div class="kpi k-green"><div class="k-label">🟢 Operando</div><div class="k-value">${String(operando.size).padStart(2, "0")}</div></div>
      <div class="kpi k-red"><div class="k-label">🔧 Manutenção</div><div class="k-value">${String(emManut.size).padStart(2, "0")}</div></div>
      <div class="kpi k-yellow"><div class="k-label">🛢️ Estoque Tanque</div><div class="k-value">${fmt(db.estoqueTanque)}<span class="k-unit"> L</span></div></div>
      <div class="kpi k-blue"><div class="k-label">🚛 Frota Total</div><div class="k-value">${String(db.equipamentos.length).padStart(2, "0")}</div></div>
    </div>

    <div class="spacer"></div>
    <div class="card">
      <h3>🛢️ Abastecer tanque</h3>
      <p class="hint">Cada abastecimento de equipamento desconta o estoque automaticamente.</p>
      <div class="field-row">
        <div class="field"><label>Litros recebidos</label><input id="tqAdd" inputmode="decimal" placeholder="ex: 3000"></div>
        <div class="field"><label>&nbsp;</label><button class="btn btn-green" id="btnTqAdd">➕ Entrada</button></div>
      </div>
      <div class="field"><label>Ajustar estoque manualmente</label>
        <input id="tqSet" inputmode="decimal" placeholder="definir valor total"></div>
      <button class="btn btn-ghost btn-sm" id="btnTqSet">Definir estoque</button>
    </div>
  `;

  $("#btnTqAdd").onclick = () => {
    const l = num($("#tqAdd").value);
    if (!l) { toast("Informe os litros", "err"); return; }
    DB.addEstoque(l); toast(`✔ +${fmt(l)} L no tanque`); telaDashboard();
  };
  $("#btnTqSet").onclick = () => {
    const l = num($("#tqSet").value);
    DB.setEstoque(l); toast("✔ Estoque atualizado"); telaDashboard();
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
