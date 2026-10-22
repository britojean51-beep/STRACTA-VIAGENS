/* ============================================================
   Checklist de Máquinas e Caminhões · telas
   ============================================================ */
const VERSAO = "ck25";
const RASCUNHO_KEY = "ck_rascunho";     // + ":" + email — cada pessoa tem o seu
const HISTORICO_KEY = "ck_historico";   // + ":" + email
/* chave por usuário: no mesmo celular, um motorista não vê o checklist do outro */
const chaveDe = base => base + ":" + ((Dados.usuario && Dados.usuario.email) || "anonimo");
const TIPOS = { caminhao: "Caminhão", maquina: "Máquina", leve: "Veículo leve", outro: "Outro" };
const RESULTADOS = {
  liberado: { txt: "OPERANDO", ico: "✅", cls: "ok" },
  restricao: { txt: "OPERACIONAL COM OBSERVAÇÃO", ico: "⚠️", cls: "alerta" },
  bloqueado: { txt: "MANUTENÇÃO", ico: "🔧", cls: "perigo" }   // a chave segue "bloqueado" nos dados
};

/* Modelos que já vêm prontos. O admin edita ou cria outros em Cadastros. */
const MODELOS_PADRAO = [
  /* Formulário FO.09.STR.018 — Check List Veículos Pesados (18 itens), igual ao papel */
  { id: "padrao-pesados-18", nome: "Caminhão — check list veículos pesados (FO.09.STR.018)", tipo: "caminhao", itens: [
    ["Condição do condutor, CNH e treinamentos válidos", true],
    ["Documentação, placa e identificação do veículo (TAG) na traseira e dianteira", false],
    ["Extintor de incêndio", true],
    ["Cinto de segurança para todos os ocupantes do veículo", true],
    ["Vidros para-brisa, traseiro e laterais, limpador / lavador de para-brisas e para-sol", false],
    ["Espelho retrovisores, interno e externos", false],
    ["Acesso ao veículo (degraus, escadas e alças) e estado geral do veículo / lataria", false],
    ["Arrumação e limpeza do veículo", false],
    ["Identificação da empresa no veículo e fita adesiva refletora", false],
    ["Calços para estacionamento, cones / triângulos de sinalização de segurança", false],
    ["Estado geral dos pneus (talão, flanco e banda de rodagem) e tampa da válvula", true],
    ["Óleo de direção, freio, motor e água do radiador entre o nível mínimo e máximo", false],
    ["Rádio de comunicação", false],
    ["Ar condicionado", false],
    ["Buzina e sinal sonoro de ré acoplado ao sistema de câmbio", true],
    ["Faróis principais dianteiros com luz baixa e alta, luzes de freio e lanternas de marcha ré funcionando", true],
    ["Luzes de setas e pisca alerta: dianteiras e traseiras funcionando e luz de iluminação de placa traseira", false],
    ["Dispositivo de controle de ruído do escapamento e emissão de fumaça preta", false]] },
  { id: "padrao-caminhao", nome: "Caminhão — diário", tipo: "caminhao", itens: [
    ["Pneus (calibragem, cortes, desgaste)", true], ["Freio de serviço e de estacionamento", true],
    ["Vazamentos (óleo, ar, combustível, água)", true], ["Luz de freio, setas e pisca-alerta", true],
    ["Faróis e lanternas", false], ["Alarme de ré", true], ["Cinto de segurança", true],
    ["Extintor (carga e validade)", true], ["Buzina", false], ["Retrovisores", false],
    ["Para-brisa e limpadores", false], ["Nível do óleo do motor", false], ["Nível da água do radiador", false],
    ["Tacógrafo", false], ["Triângulo, macaco e chave de roda", false], ["Carroceria / báscula", false],
    ["Documento do veículo (CRLV)", false], ["Limpeza e organização da cabine", false]] },
  /* Folha de checklist de máquinas da empresa (22 itens), igual ao papel */
  { id: "padrao-maquina-22", nome: "Máquina — checklist de segurança (22 itens)", tipo: "maquina", itens: [
    ["Condição do condutor, CNH e treinamentos válidos", true],
    ["Identificação da máquina (TAG) na traseira e dianteira, identificação da empresa e fita adesiva refletora", false],
    ["Extintor de incêndio e cinto de segurança", true],
    ["Vidros para-brisa, traseiro e laterais, limpador / lavador de para-brisas e para-sol", false],
    ["Espelho retrovisores, interno e externos", false],
    ["Acesso à máquina (degraus, escadas e alças) e estado geral da máquina / lataria", false],
    ["Arrumação e limpeza da máquina", false],
    ["Calços para estacionamento e cones de sinalização de segurança", false],
    ["Estado geral dos pneus (talão, flanco e banda de rodagem) e tampa da válvula", true],
    ["Partes rodantes, concha, dentes e lâmina", false],
    ["Verificar vazamento de óleo na máquina em geral e estado das mangueiras", true],
    ["Polos da bateria protegidos / enclausurados", false],
    ["Proteção de partes móveis eficaz", true],
    ["Óleo hidráulico, motor e água do radiador entre o nível mínimo e máximo", false],
    ["Buzina e sinal sonoro de ré acoplado ao sistema de câmbio", true],
    ["Rádio de comunicação", false],
    ["Freio de estacionamento e de serviços", true],
    ["Ar condicionado", false],
    ["Faróis principais dianteiros e luzes de posição dianteiras e traseiras funcionando", false],
    ["Luzes de freio e lanternas de marcha ré funcionando", false],
    ["Luzes de setas e pisca alerta: dianteiras e traseiras funcionando", false],
    ["Dispositivo de controle de ruído do escapamento e emissão de fumaça preta", false]] },
  { id: "padrao-maquina", nome: "Máquina — diário", tipo: "maquina", itens: [
    ["Vazamentos (óleo, hidráulico, combustível)", true], ["Mangueiras e conexões hidráulicas", true],
    ["Pneus ou esteiras", true], ["Freios", true], ["Alarme de ré", true], ["Cinto de segurança", true],
    ["Extintor (carga e validade)", true], ["Nível do óleo do motor", false], ["Nível do óleo hidráulico", false],
    ["Nível da água do radiador", false], ["Lubrificação / graxa dos pinos", false],
    ["Caçamba, concha e dentes", false], ["Luzes de trabalho", false], ["Vidros e espelhos", false],
    ["Painel sem luz de alerta", false], ["Filtro de ar", false], ["Limpeza e organização da cabine", false]] }
].map(m => Object.assign({}, m, { padrao: true,
  itens: m.itens.map(([texto, critico], i) => ({ id: "i" + (i + 1), texto, critico })) }));

/* Formulários em papel da empresa: viram o modelo automático do tipo */
const FORMULARIOS_OFICIAIS = ["padrao-pesados-18", "padrao-maquina-22"];

/* Situação do equipamento: sai dos defeitos ainda em aberto (pendencias). */
const SITUACOES = {
  manutencao: { txt: "Em manutenção", ico: "🔧", cls: "perigo" },
  restricao: { txt: "Com restrição", ico: "⚠️", cls: "alerta" },
  operacional: { txt: "Operando", ico: "✅", cls: "ok" }
};
function situacaoDe(e) {
  const v = Object.values((e && e.pendencias) || {});
  return v.includes("bloqueado") ? "manutencao" : v.includes("restricao") ? "restricao" : "operacional";
}
/* Onde o checklist aparece no Painel: o resolvido conta como Operando
   (o resultado original continua guardado e aparece no detalhe). */
/* Itens não conformes ainda sem resolução. O resolvido pelo botão geral da
   versão anterior (tratativa resolvida, sem resoluções por item) conta como tudo resolvido. */
function itensAbertos(i) {
  if (i.tratativa && i.tratativa.status === "resolvido" && !i.resolucoes) return [];
  const res = i.resolucoes || {};
  return (i.itens || []).filter(x => x.st === "nok" && !res[x.id]);
}
/* Itens ainda abertos com solicitação registrada (ex.: peça pedida, aguardando compra) */
function solicitadosAbertos(i) {
  const sol = i.solicitacoes || {};
  return itensAbertos(i).filter(x => sol[x.id]);
}
/* Situação atual do checklist pelos itens em aberto */
function statusAtual(i) {
  const ab = itensAbertos(i);
  return ab.some(x => x.critico) ? "bloqueado" : ab.length ? "restricao" : "liberado";
}
function statusPainel(i) {
  if (i.itens) return statusAtual(i);
  // resumo guardado no aparelho (lista do Início)
  return i.atual || (i.resolvido ? "liberado" : i.resultado);
}
/* o checklist em aberto mais recente que deixou o equipamento nessa situação */
/* Quem da gestão marcou que viu o checklist (a chave é o e-mail com "," no lugar de ".") */
const vistosDe = i => Object.values((i && i.vistos) || {}).sort((a, b) => a.em - b.em);
const chaveVisto = email => String(email || "").replace(/\./g, ",");
const textoVistos = v => v.map(x => x.por + " (" + dataHora(x.em) + ")").join(", ");

function pendenciaMaisRecente(e) {
  const p = (e && e.pendencias) || {}, alvo = situacaoDe(e) === "manutencao" ? "bloqueado" : "restricao";
  return Object.keys(p).filter(k => p[k] === alvo).sort().pop() || "";
}
const NIVEIS = {
  critico: "Crítico — defeito põe em manutenção",
  operacional: "Operacional com observação — defeito anotado, segue operando (restrição)"
};

/* ---------- ícones de traço (no lugar de emoji, para um visual de aplicativo) ---------- */
const ic = d => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONES = {
  inicio: ic('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>'),
  novo: ic('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M12 9v7M8.5 12.5h7"/>'),
  painel: ic('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
  cadastros: ic('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>'),
  conta: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  usuario: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  cadeado: ic('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  olho: ic('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  olhoFechado: ic('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  semRede: ic('<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.4-1.8M2 9.5a15 15 0 0 1 4.3-2.6M22 9.5A15 15 0 0 0 11 5.1"/><circle cx="12" cy="20" r="1"/>')
};
/* logo: o mesmo desenho do ícone do app (prancheta com ✓) */
const LOGO = `<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="96" fill="#0f172a"/>
  <rect x="120" y="84" width="272" height="352" rx="36" fill="#16223b" stroke="#ff7a1a" stroke-width="16"/>
  <rect x="196" y="60" width="120" height="56" rx="20" fill="#ff7a1a"/>
  <g stroke-linecap="round" stroke-linejoin="round" fill="none" stroke-width="22">
  <path d="M168 196l26 26 46-50" stroke="#22c55e"/><path d="M168 300l26 26 46-50" stroke="#22c55e"/>
  <path d="M276 200h76M276 304h76" stroke="#93a2c4"/></g></svg>`;

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const app = () => $("#app");
const h = v => String(v == null ? "" : v).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = n => String(n).padStart(2, "0");
const diaDe = ms => { const d = new Date(ms); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
const dataHora = ms => { const d = new Date(ms);
  return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
const nomeEquip = e => e ? [e.prefixo, e.placa].filter(Boolean).join(" · ") : "";
const numero = v => { const n = parseFloat(String(v || "").replace(",", ".")); return isFinite(n) ? n : null; };

function toast(msg, tipo) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast mostra " + (tipo || "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = "toast"; }, 3200);
}
/* Janela de confirmação no visual do app (no lugar da janela cinza do navegador).
   o: { titulo, ok, cancelar, perigo (botão vermelho), html (conteúdo pronto) } */
function confirmar(msg, o = {}) {
  const ant = document.querySelector(".mdl-fundo"); if (ant) ant.remove();
  return new Promise(ok => {
    const f = document.createElement("div");
    f.className = "mdl-fundo";
    f.innerHTML = `<div class="mdl" role="dialog" aria-modal="true" aria-labelledby="mdlTitulo">
      <h2 id="mdlTitulo">${h(o.titulo || "Confirmar")}</h2>
      <div class="mdl-msg">${o.html || h(msg).replace(/\n/g, "<br>")}</div>
      <div class="mdl-bts">
        <button class="btn btn-ghost" id="mdlCancel">${h(o.cancelar || "Cancelar")}</button>
        <button class="btn ${o.perigo ? "btn-perigo" : ""}" id="mdlOk">${h(o.ok || "Confirmar")}</button>
      </div></div>`;
    const fim = v => { f.remove(); document.removeEventListener("keydown", tecla); ok(v); };
    const tecla = e => { if (e.key === "Escape") fim(false); };
    f.onclick = e => { if (e.target === f || e.target.id === "mdlCancel") fim(false); else if (e.target.id === "mdlOk") fim(true); };
    document.addEventListener("keydown", tecla);
    document.body.appendChild(f);
    f.querySelector("#mdlOk").focus();
  });
}

function lerJSON(k, padrao) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? padrao : v; } catch (e) { return padrao; } }
function gravarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

/* ---------- instalar como aplicativo ----------
   Android/Chrome: o navegador avisa (beforeinstallprompt) e o botão abre a janela de instalar.
   iPhone: não existe esse aviso, então mostra o passo a passo do Safari. */
const Instalar = {
  evento: null,
  instalado() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  },
  ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent); },
  cartao(sempre) {
    if (this.instalado()) return sempre ? `<div class="card instalar ok-borda"><b>✅ App instalado</b><p class="mini">Abra pelo ícone "Checklist" na tela do celular.</p></div>` : "";
    if (this.evento) return `<div class="card instalar"><b>📲 Baixe o aplicativo</b>
      <p class="mini">Fica com ícone na tela do celular, abre em tela cheia e funciona sem sinal.</p>
      <button class="btn" id="btnInstalar">📲 Instalar o app</button></div>`;
    if (this.ios()) return `<div class="card instalar"><b>📲 Instalar no iPhone</b>
      <p class="mini">No Safari, toque em <b>Compartilhar</b> (quadrado com seta ↑) e depois em <b>"Adicionar à Tela de Início"</b>.</p></div>`;
    return sempre ? `<div class="card instalar"><b>📲 Instalar o app</b>
      <p class="mini">No Chrome, toque no menu <b>⋮</b> e depois em <b>"Instalar app"</b> ou <b>"Adicionar à tela inicial"</b>.</p></div>` : "";
  },
  preencher() { document.querySelectorAll("[data-slot-instalar]").forEach(el => { el.innerHTML = this.cartao(el.dataset.slotInstalar === "sempre"); }); },
  async instalar() {
    if (!this.evento) return;
    const ev = this.evento; this.evento = null;
    ev.prompt();
    try { const r = await ev.userChoice; if (r && r.outcome === "accepted") toast("App instalado ✔", "ok"); } catch (e) {}
    this.preencher();
  }
};
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); Instalar.evento = e; Instalar.preencher(); });
window.addEventListener("appinstalled", () => { Instalar.evento = null; Instalar.preencher(); toast("App instalado ✔ — abra pelo ícone na tela", "ok"); });
document.addEventListener("click", e => { if (e.target.closest("#btnInstalar")) Instalar.instalar(); });

/* ---------- estado ---------- */
const Estado = {
  equipamentos: [],
  modelos: [],
  _ouvintes: [],
  rascunho: null,
  urls: {},            // mid -> objectURL (miniaturas do aparelho)

  /* Os da nuvem + os padrão que ainda não foram editados nem apagados.
     Um padrão editado vira documento com o mesmo id; apagado fica marcado "removido". */
  modelosEfetivos() {
    const ids = new Set(this.modelos.map(m => m.id));
    return this.modelos.filter(m => !m.removido).concat(MODELOS_PADRAO.filter(m => !ids.has(m.id)));
  },
  /* Modelo do equipamento: o escolhido no cadastro dele; senão o formulário
     oficial do tipo (FO de veículos pesados / máquinas), se não foi apagado;
     senão o primeiro do tipo. */
  modeloPara(equip) {
    const ms = this.modelosEfetivos(), tipo = equip && equip.tipo;
    return (equip && equip.modeloId && ms.find(m => m.id === equip.modeloId))
      || ms.find(m => m.tipo === tipo && FORMULARIOS_OFICIAIS.includes(m.id))
      || ms.find(m => m.tipo === tipo) || ms[0];
  },
  ouvir() {
    this.parar();
    this._ouvintes.push(Dados.ouvir("equipamentos", l => {
      if (l) this.equipamentos = l.sort((a, b) => String(a.prefixo).localeCompare(String(b.prefixo), "pt-BR", { numeric: true }));
      Telas.atualizarSeVisivel(["novo", "cad-equip"]);
    }));
    this._ouvintes.push(Dados.ouvir("modelos", l => {
      if (l) this.modelos = l.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
      Telas.atualizarSeVisivel(["cad-modelos", "cad-equip"]);
    }));
  },
  parar() { this._ouvintes.forEach(f => { try { f(); } catch (e) {} }); this._ouvintes = []; }
};

/* histórico do próprio aparelho: quem fez vê o que fez mesmo sem sinal */
const Historico = {
  lista() { return lerJSON(chaveDe(HISTORICO_KEY), []); },
  _gravar(l) { gravarJSON(chaveDe(HISTORICO_KEY), l.slice(0, 60)); },
  adicionar(r) { const l = this.lista(); l.unshift(r); this._gravar(l); },
  marcar(id, campos) {
    const l = this.lista(); const r = l.find(x => x.id === id);
    if (r) { Object.assign(r, campos); this._gravar(l); }
  },
  remover(id) { this._gravar(this.lista().filter(x => x.id !== id)); },
  async conferirPendentes() {
    const pend = this.lista().filter(x => !x.enviado);
    for (const r of pend) if (await Dados.confirmada(r.id)) this.marcar(r.id, { enviado: true });
  },
  /* A lista vem do servidor: só os checklists DESTA pessoa (feitos em
     qualquer celular), com a situação atual (resolvido -> Operando, apagado
     some). O que ainda está na fila deste aparelho continua na lista.
     Sem sinal, fica como está. */
  _sincronizadoEm: 0,
  async sincronizar() {
    if (!navigator.onLine || !Dados.usuario) return false;
    this._sincronizadoEm = Date.now();
    const meus = await Dados.minhas(Dados.usuario.email);
    if (!meus) return false;
    return this.aplicar(meus).mudou;
  },
  /* resumo de um checklist para o Início, com o andamento da manutenção */
  resumo(d) {
    const atual = statusAtual(d);
    const nok = (d.itens || []).filter(x => x.st === "nok").length;
    return { id: d.id, equip: nomeEquip(d.equipamento), resultado: d.resultado, defeitos: d.defeitos || 0,
      criadoEm: d.criadoEm, enviado: true, atual, resolvido: atual === "liberado",
      itensNok: nok, resolvidos: nok - itensAbertos(d).length, solicitados: solicitadosAbertos(d).length,
      vistoPor: vistosDe(d).map(x => x.por) };
  },
  /* troca a lista pela do servidor; devolve o que mudou de situação */
  aplicar(meus) {
    const ant = this.lista();
    const fila = ant.filter(x => !x.enviado && !meus.some(m => m.id === x.id));
    // o Firestore mostra na hora o que ainda vai enviar: "na fila" só sai quando o servidor confirmar
    const nova = fila.concat(meus.map(d => {
      const r = this.resumo(d), a = ant.find(x => x.id === d.id);
      if (a && !a.enviado) r.enviado = false;
      return r;
    })).sort((a, b) => b.criadoEm - a.criadoEm);
    const mudancas = nova.filter(n => { const a = ant.find(x => x.id === n.id); return a && a.enviado && (a.atual || a.resultado) !== n.atual; })
      .map(n => ({ id: n.id, equip: n.equip, para: n.atual }));
    const mudou = JSON.stringify(nova) !== JSON.stringify(ant);
    if (mudou) this._gravar(nova);
    return { mudou, mudancas };
  },
  /* versão antiga guardava uma lista só por celular: some na primeira
     sincronização (o que não é desta pessoa sai pela lista do servidor) */
  migrar() {
    try {
      const velha = lerJSON(HISTORICO_KEY, null);
      if (velha && !localStorage.getItem(chaveDe(HISTORICO_KEY))) this._gravar(velha.filter(x => !x.enviado));
      localStorage.removeItem(HISTORICO_KEY);
    } catch (e) {}
  }
};

/* ---------- navegação ---------- */
const Telas = {
  atual: null,
  pilha: [],
  ir(nome, arg, semPilha) {
    const soGestao = ["painel"], soAdmin = ["cadastros", "cad-equip", "cad-modelos", "cad-modelo", "cad-usuarios"];
    if ((soGestao.includes(nome) && !Dados.ehGestao()) || (soAdmin.includes(nome) && !Dados.ehAdmin())) nome = "inicio";
    if (!semPilha && this.atual && this.atual.nome !== nome) this.pilha.push(this.atual);
    if (["inicio", "painel", "cadastros", "conta"].includes(nome)) this.pilha = [];
    this.atual = { nome, arg };
    this.render();
  },
  voltar() {
    const ant = this.pilha.pop();
    if (ant) { this.atual = ant; this.render(); } else this.ir("inicio", null, true);
  },
  render() {
    const { nome, arg } = this.atual;
    const fn = Render[nome];
    window.scrollTo(0, 0);
    $("#btnVoltar").style.visibility = this.pilha.length ? "visible" : "hidden";
    document.querySelectorAll(".aba").forEach(b => {
      const raiz = { "novo": "novo", "checklist": "novo", "detalhe": "painel", "cad-equip": "cadastros",
        "cad-modelos": "cadastros", "cad-modelo": "cadastros", "cad-usuarios": "cadastros" }[nome] || nome;
      b.classList.toggle("ativa", b.dataset.ir === raiz);
    });
    if (fn) fn(arg);
    Instalar.preencher();
    Atualizacao.talvezAgora();
  },
  atualizarSeVisivel(nomes) { if (this.atual && nomes.includes(this.atual.nome)) this.render(); }
};

function titulo(t, sub) { $("#titulo").textContent = t; $("#subtitulo").textContent = sub || ""; }

/* ---------- rede ---------- */
async function atualizarRede() {
  const el = $("#rede");
  const n = await Midia.pendentes();
  el.className = "rede " + (navigator.onLine ? "on" : "off");
  el.textContent = navigator.onLine ? (n ? "⬆ " + n : "●") : "sem sinal" + (n ? " · " + n : "");
  el.title = navigator.onLine ? (n ? n + " arquivo(s) enviando" : "Conectado") : "Sem sinal — tudo fica guardado";
  const c = document.querySelector("[data-pendentes]");
  if (c) c.textContent = n ? n + " foto(s)/vídeo(s) aguardando envio" : "Tudo enviado ✔";
}

/* ============================================================
   TELAS
   ============================================================ */
const Render = {};

/* ---------- login ---------- */
Render.login = function (erro) {
  titulo("Checklist de Frota", "Máquinas e caminhões");
  document.body.classList.add("tela-login");
  $("#abas").hidden = true;
  $("#btnVoltar").style.visibility = "hidden";
  app().innerHTML = `
    <div class="marca">
      <div class="marca-logo">${LOGO}</div>
      <h1>Checklist de Frota</h1>
      <p>Máquinas e caminhões</p>
    </div>
    <form class="card login" id="fLogin" autocomplete="on">
      <h2>Acesse sua conta</h2>
      <label for="lgUsuario">Usuário</label>
      <div class="campo-ico">${ICONES.usuario}
        <input name="usuario" id="lgUsuario" autocomplete="username" autocapitalize="none" spellcheck="false"
          value="${h(Dados.ultimoUsuario())}" placeholder="ex.: joao.silva" required />
      </div>
      <label for="lgSenha">Senha</label>
      <div class="campo-ico senha">${ICONES.cadeado}
        <input name="senha" id="lgSenha" type="password" autocomplete="current-password" placeholder="Sua senha" required />
        <button type="button" class="olho" id="lgOlho" aria-label="Mostrar senha" aria-pressed="false">${ICONES.olho}</button>
      </div>
      <div class="aviso-rede" id="lgRede" ${navigator.onLine ? "hidden" : ""}>${ICONES.semRede}
        <span>Sem internet — o primeiro acesso neste celular precisa de sinal.</span></div>
      <p class="erro" id="lgErro" role="alert">${h(erro || "")}</p>
      <button class="btn btn-grande btn-entrar" id="lgEntrar">Entrar</button>
      <p class="muted mini centro">Esqueceu a senha? Fale com o administrador.</p>
    </form>
    <div data-slot-instalar="talvez"></div>
    <p class="versao">versão ${h(VERSAO)}</p>`;
  Instalar.preencher();
  const u = $("#lgUsuario"), s = $("#lgSenha"), olho = $("#lgOlho");
  (u.value ? s : u).focus();
  olho.onclick = () => {
    const mostrar = s.type === "password";
    s.type = mostrar ? "text" : "password";
    olho.innerHTML = mostrar ? ICONES.olhoFechado : ICONES.olho;
    olho.setAttribute("aria-pressed", String(mostrar));
    olho.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
  };
  $("#fLogin").onsubmit = async ev => {
    ev.preventDefault();
    const b = $("#lgEntrar");
    b.disabled = true; b.innerHTML = `<span class="girando" aria-hidden="true"></span> Entrando…`;
    const r = await Dados.entrar(u.value, s.value);
    if (r.ok) return entrouNoApp();
    b.disabled = false; b.textContent = "Entrar";
    $("#lgErro").textContent = r.erro;
  };
};
/* aviso de sem internet do login acompanha a rede */
["online", "offline"].forEach(t => window.addEventListener(t, () => { const a = $("#lgRede"); if (a) a.hidden = navigator.onLine; }));

/* ---------- início ---------- */
Render.inicio = function () {
  titulo("Checklist de Frota", "Olá, " + (Dados.usuario.nome || Dados.usuario.usuario));
  const r = Estado.rascunho;
  const hist = Historico.lista();
  const hoje = diaDe(Date.now());
  const deHoje = hist.filter(x => diaDe(x.criadoEm) === hoje);
  // checklists de hoje com não conforme: acompanha até voltar a operar
  const acompanhar = deHoje.filter(x => x.enviado && x.resultado && x.resultado !== "liberado");
  app().innerHTML = `
    ${r ? `<div class="card destaque">
        <b>Checklist em andamento</b>
        <p>${h(nomeEquip(r.equip))} · ${Object.keys(r.respostas).length}/${r.modelo.itens.length} itens</p>
        <div class="linha">
          <button class="btn" id="btnContinuar">Continuar</button>
          <button class="btn btn-ghost" id="btnDescartar">Descartar</button>
        </div></div>` : ""}
    <button class="btn btn-grande btn-novo" id="btnNovo">➕ Novo checklist</button>
    <div class="kpis">
      <div class="kpi"><b>${deHoje.length}</b><span>hoje</span></div>
      <div class="kpi"><b>${deHoje.filter(x => statusPainel(x) !== "liberado").length}</b><span>não conformes</span></div>
      <div class="kpi"><b>${hist.filter(x => !x.enviado).length}</b><span>na fila</span></div>
    </div>
    ${acompanhar.length ? `<h3 class="secao">Acompanhe hoje</h3>` + acompanhar.map(x => {
      const S = RESULTADOS[statusPainel(x)];
      const ok = statusPainel(x) === "liberado";
      return `<div class="card acompanhe ${S.cls}">
        <div class="linha-topo"><b>${h(x.equip)}</b><span class="tag ${S.cls}">${S.ico} ${ok ? "Operando" : S === RESULTADOS.bloqueado ? "Em manutenção" : "Com restrição"}</span></div>
        <p class="mini">${ok ? "✅ Voltou a operar — tudo resolvido." :
          (x.itensNok != null ? `${x.resolvidos} de ${x.itensNok} item(ns) resolvido(s)` : "Aguardando a manutenção")
          + (x.solicitados ? ` · 🛒 ${x.solicitados} aguardando peça` : "")}
          <br>${x.vistoPor && x.vistoPor.length ? "👁 Visto por " + h(x.vistoPor.join(", ")) : "Ainda não visualizado pela gestão"}</p>
        <button class="btn btn-ghost btn-acompanhar" data-ver="${h(x.id)}">Ver andamento ›</button></div>`;
    }).join("") : ""}
    <p class="muted mini" data-pendentes></p>
    <div data-slot-instalar="talvez"></div>
    <h3 class="secao">Meus últimos checklists</h3>
    ${hist.length ? hist.slice(0, 20).map(x => {
      const R = RESULTADOS[statusPainel(x)] || RESULTADOS.liberado;
      return `<div class="item ${R.cls}" ${x.enviado ? `data-ver="${h(x.id)}"` : ""}>
        <div><b>${h(x.equip)}</b><small>${dataHora(x.criadoEm)} · ${x.defeitos || 0} não conforme(s)${statusPainel(x) !== x.resultado ? " · era " + ((RESULTADOS[x.resultado] || R).txt.toLowerCase()) : ""}${x.vistoPor && x.vistoPor.length ? " · 👁 visto" : ""}</small></div>
        <div class="dir"><span class="tag ${R.cls}">${R.ico} ${R.txt}</span>
        <small>${statusPainel(x) === "liberado" && x.resultado !== "liberado" ? "✔ resolvido" : statusPainel(x) !== x.resultado ? "◐ em andamento" : x.enviado ? "✔ enviado" : "⏳ na fila"}</small></div></div>`;
    }).join("") : `<p class="vazio">Nenhum checklist feito neste aparelho ainda.</p>`}`;
  $("#btnNovo").onclick = () => r ? Telas.ir("checklist") : Telas.ir("novo");
  app().onclick = ev => { const v = ev.target.closest("[data-ver]"); if (v) Telas.ir("detalhe", v.dataset.ver); };
  if (r) {
    $("#btnContinuar").onclick = () => Telas.ir("checklist");
    $("#btnDescartar").onclick = async () => {
      if (await confirmar("O checklist em andamento e as fotos dele serão apagados.", { titulo: "Descartar checklist?", ok: "Descartar", perigo: true })) {
        await descartarRascunho(); Telas.render();
      }
    };
  }
  atualizarRede();
  // voltando ao Início: confere no servidor o que o Painel resolveu (no máx. 1x por minuto)
  // (a primeira conferência, ao abrir o app, é feita em entrouNoApp)
  if (Historico._sincronizadoEm && Date.now() - Historico._sincronizadoEm > 60000) {
    Historico.sincronizar().then(m => { if (m) Telas.atualizarSeVisivel(["inicio"]); });
  }
};

/* ---------- novo: escolher o equipamento ---------- */
Render.novo = function (busca) {
  titulo("NOVO CHECKLIST", "Escolha o equipamento");
  if (Estado.rascunho) return Telas.ir("checklist", null, true);
  const q = String(busca || "").toLowerCase();
  const lista = Estado.equipamentos.filter(e => e.ativo !== false &&
    (!q || nomeEquip(e).toLowerCase().includes(q) || String(e.descricao || "").toLowerCase().includes(q)));
  app().innerHTML = `
    <input class="busca" id="busca" type="search" placeholder="🔎 Prefixo ou placa" value="${h(busca || "")}" />
    <div class="grade" id="grade">
      ${lista.map(e => { const S = SITUACOES[situacaoDe(e)]; return `<button class="equip sit-${S.cls}" data-id="${h(e.id)}">
        ${visualEquip(e)}
        <b>${h(e.prefixo || e.placa)}</b><small>${h(e.placa && e.prefixo ? e.placa : (e.descricao || TIPOS[e.tipo] || ""))}</small>
        ${S.cls !== "ok" ? `<em class="tag ${S.cls}">${S.ico} ${S.txt}</em>` : ""}
      </button>`; }).join("")}
    </div>
    ${!lista.length ? `<p class="vazio">${Estado.equipamentos.length ? "Nada encontrado." : "Nenhum equipamento cadastrado ainda."}</p>` : ""}
    ${!Dados.ehAdmin() ? (Estado.equipamentos.length ? "" : `<p class="vazio">Peça ao administrador para cadastrar os equipamentos.</p>`) : `
    <details class="card" id="avulso" ${Estado.equipamentos.length ? "" : "open"}>
      <summary>Equipamento não está na lista?</summary>
      <label>Prefixo ou placa<input id="avPlaca" placeholder="ex.: CB-12 ou ABC1D23" /></label>
      <label>Tipo<select id="avTipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      <button class="btn" id="avIr">Começar</button>
    </details>`}`;
  const b = $("#busca");
  b.oninput = () => { const pos = b.selectionStart; Render.novo(b.value); const nb = $("#busca"); nb.focus(); nb.setSelectionRange(pos, pos); };
  Telas.atual.arg = busca;
  $("#grade").onclick = ev => {
    const el = ev.target.closest(".equip"); if (!el || $("#grade").classList.contains("indo")) return;
    const e = Estado.equipamentos.find(x => x.id === el.dataset.id);
    if (situacaoDe(e) === "manutencao") toast("Atenção: " + nomeEquip(e) + " está EM MANUTENÇÃO.", "erro");
    const ir = () => iniciarChecklist({ id: e.id, prefixo: e.prefixo || "", placa: e.placa || "", tipo: e.tipo || "outro", modeloId: e.modeloId || "" });
    // o veículo sai andando e aí abre o checklist (sem animação se o celular pede menos movimento)
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return ir();
    $("#grade").classList.add("indo"); el.classList.add("saindo");
    if (navigator.vibrate) navigator.vibrate(15);
    setTimeout(() => { if (Telas.atual.nome === "novo") ir(); }, 650);
  };
  if ($("#avIr")) $("#avIr").onclick = () => {
    const p = $("#avPlaca").value.trim().toUpperCase();
    if (!p) return toast("Digite o prefixo ou a placa.", "erro");
    iniciarChecklist({ id: "", prefixo: p, placa: "", tipo: $("#avTipo").value, modeloId: "" });
  };
};

/* Imagem do cartão: a foto do próprio equipamento, se o admin pôs; senão o desenho do tipo */
function visualEquip(e) {
  if (e.foto) return `<span class="vis foto"><img src="${h(e.foto)}" alt="" /></span>`;
  if (e.tipo === "maquina") return `<span class="vis"><img src="img/maquina.svg" alt="" /></span>`;
  if (e.tipo === "caminhao" || !e.tipo) return `<span class="vis"><img src="img/caminhao.jpg" alt="" /></span>`;
  return `<span class="vis"><svg viewBox="0 0 120 60" aria-hidden="true"><g fill="none" stroke="#475569" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
    <path d="M10 42 V32 q0-4 4-5 l14-3 12-12 h34 q4 0 6 3 l8 12 h16 q6 0 6 6 V42 Z"/><path d="M44 15 v12 M80 15 v12"/></g>
    <g fill="#1e293b"><circle cx="30" cy="44" r="8"/><circle cx="92" cy="44" r="8"/></g><g fill="#cbd5e1"><circle cx="30" cy="44" r="3"/><circle cx="92" cy="44" r="3"/></g></svg></span>`;
}

/* Foto do equipamento para o cartão: pequena (vai junto do cadastro, que todo celular baixa) */
async function fotoDoEquipamento(arq) {
  const img = await Midia._carregarImagem(arq);
  const esc = Math.min(1, 480 / Math.max(img.width, img.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  if (img.close) img.close();
  return cv.toDataURL("image/jpeg", 0.7);
}

function iniciarChecklist(equip) {
  const m = Estado.modeloPara(equip);
  Estado.rascunho = {
    id: Dados.novoIdInspecao(), equip,
    modelo: { id: m.id, nome: m.nome, itens: m.itens.map(i => ({ id: i.id, texto: i.texto, critico: !!i.critico })) },
    km: "", horimetro: "", respostas: {}, midias: {}, obs: "", inicio: Date.now(), geo: null
  };
  salvarRascunho();
  // localização ajuda a auditar onde foi feito; se negar, segue sem
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(p => {
      if (!Estado.rascunho) return;
      Estado.rascunho.geo = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), prec: Math.round(p.coords.accuracy) };
      salvarRascunho();
    }, () => {}, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }
  Telas.ir("checklist");
}
function salvarRascunho() { gravarJSON(chaveDe(RASCUNHO_KEY), Estado.rascunho); }
async function descartarRascunho() {
  const r = Estado.rascunho; if (!r) return;
  for (const mid of Object.keys(r.midias)) { try { await Midia.apagar(mid); } catch (e) {} liberarURL(mid); }
  Estado.rascunho = null;
  try { localStorage.removeItem(chaveDe(RASCUNHO_KEY)); } catch (e) {}
}

/* miniaturas: o arquivo vem do IndexedDB do aparelho */
async function urlLocal(mid) {
  if (Estado.urls[mid]) return Estado.urls[mid];
  const reg = await Midia.ler(mid);
  if (!reg) return "";
  return (Estado.urls[mid] = URL.createObjectURL(reg.blob));
}
function liberarURL(mid) { if (Estado.urls[mid]) { URL.revokeObjectURL(Estado.urls[mid]); delete Estado.urls[mid]; } }
async function preencherMiniaturas(raiz) {
  for (const el of raiz.querySelectorAll("[data-mid]")) {
    const u = await urlLocal(el.dataset.mid);
    if (!u) continue;
    if (el.tagName === "IMG" || el.tagName === "VIDEO") el.src = u;
  }
}
function miniaturas(item) {
  const r = Estado.rascunho;
  return Object.entries(r.midias).filter(([, m]) => m.item === item).map(([mid, m]) =>
    `<div class="mini-midia">${m.tipo === "video"
      ? `<video data-mid="${mid}" muted playsinline preload="metadata"></video><span class="play">▶</span>`
      : `<img data-mid="${mid}" alt="foto" />`}
      <button class="tirar" data-tirar="${mid}" aria-label="Remover">✕</button></div>`).join("");
}

/* ---------- o checklist ---------- */
Render.checklist = function () {
  const r = Estado.rascunho;
  if (!r) return Telas.ir("novo", null, true);
  titulo(nomeEquip(r.equip) || "CHECKLIST", r.modelo.nome);
  const feitos = Object.keys(r.respostas).length, total = r.modelo.itens.length;
  app().innerHTML = `
    <div class="progresso"><div style="width:${Math.round(feitos / total * 100)}%"></div></div>
    <p class="muted mini">${feitos} de ${total} itens · toque em ✔ OK, ✖ Não conforme ou N/A</p>
    <div class="card linha2">
      <label>KM atual<input id="ckKm" inputmode="decimal" value="${h(r.km)}" placeholder="opcional" /></label>
      <label>Horímetro<input id="ckHor" inputmode="decimal" value="${h(r.horimetro)}" placeholder="opcional" /></label>
    </div>
    <button class="btn btn-ghost btn-tudo" id="ckTudoOk">✔ Marcar os que faltam como OK</button>
    <div id="itens">
      ${r.modelo.itens.map((it, n) => {
        const resp = r.respostas[it.id] || {};
        return `<div class="ck-item ${resp.st || ""}" data-item="${h(it.id)}">
          <div class="ck-txt"><span class="num">${n + 1}</span>${h(it.texto)}${it.critico ? ' <span class="critico" title="Item crítico: defeito põe o equipamento em manutenção">CRÍTICO</span>' : ""}</div>
          <div class="ck-bts">
            <button class="st ok ${resp.st === "ok" ? "on" : ""}" data-st="ok">✔ OK</button>
            <button class="st nok ${resp.st === "nok" ? "on" : ""}" data-st="nok">✖ Não conforme</button>
            <button class="st na ${resp.st === "na" ? "on" : ""}" data-st="na">N/A</button>
          </div>
          ${resp.st === "nok" && it.critico ? `<div class="aviso-critico" role="alert">🔧 Acione a manutenção</div>` : ""}
          ${resp.st === "nok" ? `<textarea class="ck-obs" placeholder="O que está errado? (obrigatório)" rows="2">${h(resp.obs || "")}</textarea>` : ""}
          <div class="midias">${miniaturas(it.id)}
            <button class="add-midia" data-foto="${h(it.id)}" aria-label="Tirar foto">📷</button>
            <button class="add-midia" data-galeria="${h(it.id)}" aria-label="Escolher da galeria">🖼️</button>
            ${Midia.video() ? `<button class="add-midia" data-video="${h(it.id)}">🎥</button>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="card">
      <b>Fotos gerais e observações</b>
      <p class="muted mini">Frente, traseira, laterais, painel…</p>
      <div class="midias">${miniaturas("geral")}
        <button class="add-midia" data-foto="geral" aria-label="Tirar foto">📷</button>
        <button class="add-midia" data-galeria="geral" aria-label="Escolher da galeria">🖼️</button>
        ${Midia.video() ? `<button class="add-midia" data-video="geral">🎥</button>` : ""}
      </div>
      <textarea id="ckObs" rows="3" placeholder="Observação geral (opcional)">${h(r.obs)}</textarea>
    </div>
    <button class="btn btn-grande" id="ckFinalizar">Finalizar checklist</button>
    <input type="file" id="inFoto" accept="image/*" capture="environment" hidden />
    <input type="file" id="inGaleria" accept="image/*" hidden />
    <input type="file" id="inVideo" accept="video/*" capture="environment" hidden />`;
  preencherMiniaturas(app());

  $("#ckKm").oninput = e => { r.km = e.target.value; salvarRascunho(); };
  $("#ckHor").oninput = e => { r.horimetro = e.target.value; salvarRascunho(); };
  $("#ckObs").oninput = e => { r.obs = e.target.value; salvarRascunho(); };
  $("#ckTudoOk").onclick = () => {
    r.modelo.itens.forEach(it => { if (!r.respostas[it.id]) r.respostas[it.id] = { st: "ok" }; });
    salvarRascunho(); Telas.render();
  };
  $("#itens").addEventListener("input", ev => {
    if (!ev.target.classList.contains("ck-obs")) return;
    const id = ev.target.closest(".ck-item").dataset.item;
    r.respostas[id].obs = ev.target.value; salvarRascunho();
  });
  app().onclick = async ev => {
    const st = ev.target.closest("[data-st]");
    if (st) {
      const id = st.closest(".ck-item").dataset.item;
      const ant = r.respostas[id] || {};
      r.respostas[id] = { st: st.dataset.st, obs: st.dataset.st === "nok" ? (ant.obs || "") : "" };
      salvarRascunho();
      const y = window.scrollY; Telas.render(); window.scrollTo(0, y);
      if (st.dataset.st === "nok") {
        const item = r.modelo.itens.find(x => x.id === id);
        if (item && item.critico) {
          toast("🔧 Acione a manutenção", "erro");
          try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
        }
        const ta = document.querySelector(`[data-item="${CSS.escape(id)}"] .ck-obs`);
        if (ta) ta.focus();
      }
      return;
    }
    const f = ev.target.closest("[data-foto]"), v = ev.target.closest("[data-video]"), g = ev.target.closest("[data-galeria]");
    if (g) { capturar("foto", g.dataset.galeria, true); return; }
    if (f || v) { capturar(f ? "foto" : "video", (f || v).dataset[f ? "foto" : "video"]); return; }
    const tirar = ev.target.closest("[data-tirar]");
    if (tirar) {
      const mid = tirar.dataset.tirar;
      delete r.midias[mid]; salvarRascunho();
      await Midia.apagar(mid).catch(() => {}); liberarURL(mid);
      const y = window.scrollY; Telas.render(); window.scrollTo(0, y);
      return;
    }
    if (ev.target.closest(".mini-midia")) {
      const m = ev.target.closest(".mini-midia").querySelector("[data-mid]");
      if (m) verMidia(await urlLocal(m.dataset.mid), m.tagName === "VIDEO" ? "video" : "foto");
    }
  };
  $("#ckFinalizar").onclick = finalizar;
};

/* Carimbo da foto. Da galeria vai marcado e com a data da própria foto
   (e não a de agora), para ninguém confundir com uma foto tirada na hora. */
function carimboFoto(prefixo, arq, galeria) {
  const quando = galeria ? "galeria · foto de " + dataHora(arq.lastModified || Date.now()) : dataHora(Date.now());
  return prefixo + " · " + quando + " · " + (Dados.usuario.usuario || "");
}

function capturar(tipo, item, galeria) {
  const inp = $(galeria ? "#inGaleria" : tipo === "foto" ? "#inFoto" : "#inVideo");
  inp.value = "";
  inp.onchange = async () => {
    const arq = inp.files && inp.files[0];
    if (!arq) return;
    const r = Estado.rascunho;
    if (Object.keys(r.midias).length >= Midia.limiteFotos) {
      return toast("Limite de " + Midia.limiteFotos + " fotos por checklist. Tire uma para pôr outra.", "erro");
    }
    toast(tipo === "foto" ? "Processando foto…" : "Guardando vídeo…");
    try {
      const carimbo = carimboFoto(nomeEquip(r.equip) || "", arq, galeria);
      const p = tipo === "foto" ? await Midia.prepararFoto(arq, carimbo) : await Midia.prepararVideo(arq);
      const mid = Midia.novoId();
      await Midia.guardar({ mid, estado: "rascunho", blob: p.blob, tipo: p.tipo, ext: p.ext, item, rascunho: r.id });
      r.midias[mid] = { item, tipo: p.tipo, ext: p.ext, dur: p.dur || null, tam: p.blob.size, origem: galeria ? "galeria" : "camera" };
      salvarRascunho();
      const y = window.scrollY; Telas.render(); window.scrollTo(0, y);
      toast(tipo === "foto" ? "Foto adicionada ✔" : "Vídeo adicionado ✔", "ok");
    } catch (e) { toast(e.message || "Não deu para usar esse arquivo.", "erro"); }
  };
  inp.click();
}

function verMidia(url, tipo) {
  if (!url) return toast("Arquivo ainda não disponível.", "erro");
  const o = document.createElement("div");
  o.className = "visor";
  o.innerHTML = (tipo === "video" ? `<video src="${h(url)}" controls autoplay playsinline></video>` : `<img src="${h(url)}" alt="" />`)
    + `<button class="fechar" aria-label="Fechar">✕</button>`;
  o.onclick = ev => { if (ev.target === o || ev.target.classList.contains("fechar")) o.remove(); };
  document.body.appendChild(o);
}

async function finalizar() {
  const r = Estado.rascunho;
  if (!r) return;
  const faltam = r.modelo.itens.filter(it => !r.respostas[it.id]);
  if (faltam.length) {
    toast("Faltam " + faltam.length + " item(ns) para responder.", "erro");
    const el = document.querySelector(`[data-item="${CSS.escape(faltam[0].id)}"]`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("pisca"); }
    return;
  }
  const semObs = r.modelo.itens.filter(it => r.respostas[it.id].st === "nok" && !String(r.respostas[it.id].obs || "").trim());
  if (semObs.length) {
    toast("Descreva o defeito de: " + semObs[0].texto, "erro");
    const el = document.querySelector(`[data-item="${CSS.escape(semObs[0].id)}"] .ck-obs`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
    return;
  }
  const itens = r.modelo.itens.map(it => ({ id: it.id, texto: it.texto, critico: it.critico,
    st: r.respostas[it.id].st, obs: String(r.respostas[it.id].obs || "").trim() }));
  const defeitos = itens.filter(i => i.st === "nok");
  const criticos = defeitos.filter(i => i.critico);
  const resultado = criticos.length ? "bloqueado" : defeitos.length ? "restricao" : "liberado";
  // tudo respondido: finaliza e envia direto (a tela de resultado mostra o resumo)
  if (finalizar.indo === r.id) return;   // toque duplo no botão: envia uma vez só
  finalizar.indo = r.id;

  const agora = Date.now();
  const midias = {};
  Object.entries(r.midias).forEach(([mid, m]) => {
    midias[mid] = { item: m.item, tipo: m.tipo, path: Midia.caminho(r.id, mid, m.ext), ok: false,
      dur: m.dur || null, tam: m.tam || null, origem: m.origem || "camera" };
  });
  const insp = {
    id: r.id, equipamento: r.equip, modelo: { id: r.modelo.id, nome: r.modelo.nome }, itens,
    km: numero(r.km), horimetro: numero(r.horimetro), obs: String(r.obs || "").trim(),
    resultado, defeitos: defeitos.length, criticos: criticos.length,
    midias, pendentes: Object.keys(midias).length,
    criadoPor: Dados.usuario.email, criadoNome: Dados.usuario.nome || Dados.usuario.usuario, criadoPerfil: Dados.usuario.perfil,
    criadoEm: agora, dia: diaDe(agora), duracaoSeg: Math.round((agora - r.inicio) / 1000),
    geo: r.geo || null, tratativa: resultado === "liberado" ? null : { status: "aberto" }, app: VERSAO
  };
  // as mídias passam de "rascunho" para "fila": o envio começa assim que houver sinal
  for (const [mid, m] of Object.entries(midias)) {
    const reg = await Midia.ler(mid);
    if (reg) { reg.estado = "fila"; reg.inspId = r.id; reg.path = m.path; await Midia.guardar(reg); }
  }
  Historico.adicionar({ id: r.id, equip: nomeEquip(r.equip), resultado, defeitos: defeitos.length, criadoEm: agora, enviado: false });
  Dados.abrirPendencia(r.equip.id, r.id, resultado);
  Dados.gravarInspecao(insp)
    .then(() => { Historico.marcar(r.id, { enviado: true }); Telas.atualizarSeVisivel(["inicio"]); })
    .catch(e => toast("Erro ao enviar: " + ((e && e.code) || "tente de novo"), "erro"));
  Object.keys(r.midias).forEach(liberarURL);
  Estado.rascunho = null;
  try { localStorage.removeItem(chaveDe(RASCUNHO_KEY)); } catch (e) {}
  Midia.processar();
  Telas.pilha = [];
  Telas.ir("resultado", { resultado, defeitos: defeitos.map(d => d.texto), equip: nomeEquip(insp.equipamento),
    online: navigator.onLine }, true);
}

Render.resultado = function (a) {
  const R = RESULTADOS[a.resultado];
  titulo("CHECKLIST ENVIADO", a.equip);
  app().innerHTML = `
    <div class="card resultado ${R.cls}">
      <div class="grande">${R.ico}</div>
      <h2>${R.txt}</h2>
      <p>${h(a.equip)}</p>
      ${a.defeitos.length ? `<ul>${a.defeitos.map(d => `<li>${h(d)}</li>`).join("")}</ul>` : ""}
      ${a.resultado === "bloqueado" ? `<div class="aviso-critico forte">🔧 Acione a manutenção</div><p>Item crítico não conforme: não opere o equipamento.</p>` : ""}
      ${a.resultado === "restricao" ? `<p>Pode operar, com atenção aos itens acima. A manutenção foi avisada.</p>` : ""}
    </div>
    <p class="muted mini">${a.online ? "Enviando agora. Fotos e vídeos sobem em segundo plano." :
      "Sem sinal: ficou guardado no aparelho e vai sozinho quando a rede voltar."}</p>
    <p class="muted mini" data-pendentes></p>
    <button class="btn btn-grande" id="rsNovo">➕ Outro checklist</button>
    <button class="btn btn-ghost" id="rsInicio">Voltar ao início</button>`;
  $("#rsNovo").onclick = () => Telas.ir("novo");
  $("#rsInicio").onclick = () => Telas.ir("inicio");
  atualizarRede();
};

/* ---------- painel (admin) ---------- */
const Painel = { dia: "", filtro: "todos", busca: "", lista: null, carregando: false };

Render.painel = async function () {
  titulo("PAINEL", "Checklists recebidos");
  const p = Painel;
  const desenhar = () => {
    const l = (p.lista || []).filter(i =>
      (p.filtro === "todos" || (p.filtro === "aberto" ? i.tratativa && i.tratativa.status === "aberto"
        : p.filtro === "solicitado" ? solicitadosAbertos(i).length > 0 : statusPainel(i) === p.filtro)) &&
      (!p.busca || (nomeEquip(i.equipamento) + " " + (i.criadoNome || "")).toLowerCase().includes(p.busca.toLowerCase())));
    const todos = p.lista || [];
    // situação da frota: só os checklists do dia escolhido (o mais recente de cada equipamento)
    const hoje = diaDe(Date.now()), ehHoje = p.dia === hoje;
    const ultimo = {};
    todos.forEach(i => { const id = (i.equipamento || {}).id; if (id && (!ultimo[id] || i.criadoEm > ultimo[id].criadoEm)) ultimo[id] = i; });
    const porSit = { manutencao: [], restricao: [], operacional: [], semChecklist: [] };
    const SIT = { bloqueado: "manutencao", restricao: "restricao", liberado: "operacional" };
    Estado.equipamentos.filter(e => e.ativo !== false).forEach(e => {
      const i = ultimo[e.id];
      porSit[i ? SIT[statusPainel(i)] || "operacional" : "semChecklist"].push({ e, i });
    });
    // hoje, sem checklist: avisa se ainda tem defeito em aberto de outro dia
    const deAntes = e => ehHoje && situacaoDe(e) !== "operacional" ? ` (${SITUACOES[situacaoDe(e)].ico} pendente de outro dia)` : "";
    const [a, m, d] = p.dia.split("-");
    const nomeDia = ehHoje ? "hoje" : p.dia === diaDe(Date.now() - 864e5) ? "ontem" : `${d}/${m}/${a}`;
    app().innerHTML = `
      <div class="dia-sel" id="pDias">
        <button data-passo="-1" aria-label="Dia anterior">‹</button>
        <input type="date" id="pDia" value="${p.dia}" max="${hoje}" aria-label="Dia" />
        <button data-passo="1" aria-label="Próximo dia" ${ehHoje ? "disabled" : ""}>›</button>
        ${ehHoje ? "" : `<button data-passo="0" class="hoje">Hoje</button>`}
      </div>
      <div class="kpis">
        <div class="kpi"><b>${todos.length}</b><span>checklists</span></div>
        <div class="kpi ok"><b>${todos.filter(i => statusPainel(i) === "liberado").length}</b><span>operando</span></div>
        <div class="kpi alerta"><b>${todos.filter(i => statusPainel(i) === "restricao").length}</b><span>restrição</span></div>
        <div class="kpi perigo"><b>${todos.filter(i => statusPainel(i) === "bloqueado").length}</b><span>manutenção</span></div>
      </div>
      <div class="card frota" id="pFrota"><b>Situação da frota · ${nomeDia}</b>
        ${["manutencao", "restricao"].map(k => porSit[k].length ? `<div class="sit ${SITUACOES[k].cls}">
          <span class="tag ${SITUACOES[k].cls}">${SITUACOES[k].ico} ${SITUACOES[k].txt} (${porSit[k].length})</span>
          ${porSit[k].map(x => `<div class="link" data-abrir="${h(x.i.id)}">${h(nomeEquip(x.e))}</div>`).join("")}</div>` : "").join("")}
        <p class="mini"><span class="tag ok">✅ Operando (${porSit.operacional.length})</span></p>
        ${porSit.semChecklist.length ? `<div class="sit sem">
          <span class="tag sem">⏳ Sem checklist ${ehHoje ? "hoje" : "no dia"} (${porSit.semChecklist.length})</span>
          <p class="mini nomes">${porSit.semChecklist.map(x => h(nomeEquip(x.e)) + deAntes(x.e)).join(" · ")}</p></div>` : ""}
      </div>
      <input class="busca" id="pBusca" type="search" placeholder="🔎 Equipamento ou nome" value="${h(p.busca)}" />
      <div class="chips" id="pFiltro">
        ${[["todos", "Todos"], ["bloqueado", "🔧 Manutenção"], ["restricao", "⚠️ Restrição"], ["liberado", "✅ Operando"], ["solicitado", "🛒 Solicitado"], ["aberto", "⏳ Em aberto"]]
          .map(([k, t]) => `<button data-f="${k}" class="${p.filtro === k ? "on" : ""}">${t}</button>`).join("")}
      </div>
      ${p.carregando && !p.lista ? `<p class="carregando">Carregando…</p>` : ""}
      ${p.erro ? `<p class="erro">${h(p.erro)}</p>` : ""}
      <div id="pLista">${l.map(i => {
        const R = RESULTADOS[statusPainel(i)] || RESULTADOS.liberado;
        return `<div class="item ${R.cls}" data-abrir="${h(i.id)}">
          <div><b>${h(nomeEquip(i.equipamento))}</b><small>${dataHora(i.criadoEm)} · ${h(i.criadoNome)}${PERFIS[i.criadoPerfil] ? " (" + PERFIS[i.criadoPerfil].toLowerCase() + ")" : ""}${statusPainel(i) !== i.resultado ? " · era " + RESULTADOS[i.resultado].txt.toLowerCase() : ""}
            ${vistosDe(i).length ? `<span class="visto">👁 ${h(vistosDe(i).map(x => x.por).join(", "))}</span>` : `<span class="nao-visto">● não visualizado</span>`}</small></div>
          <div class="dir">${Dados.ehAdmin() ? `<button class="apagar" data-apagar="${h(i.id)}" aria-label="Apagar checklist">🗑</button>` : ""}<span class="tag ${R.cls}">${R.ico} ${i.defeitos || 0}</span>
          <small>${statusPainel(i) === "liberado" && i.resultado !== "liberado" ? "✔ resolvido" : statusPainel(i) !== i.resultado ? "◐ em andamento" : i.tratativa ? "⏳ aberto" : ""}
          ${solicitadosAbertos(i).length ? " · 🛒 " + solicitadosAbertos(i).length + " solicitado(s)" : ""}
          ${Object.keys(i.midias || {}).length ? " · 📎" + Object.keys(i.midias).length : ""}</small></div></div>`;
      }).join("")}</div>
      ${p.lista && !l.length ? `<p class="vazio">Nenhum checklist neste filtro.</p>` : ""}
      ${l.length ? `<button class="btn btn-ghost" id="pCsv">⬇ Baixar planilha (CSV)</button>` : ""}`;
    const irDia = dia => { if (!dia || dia > hoje || dia === p.dia) return; p.dia = dia; p.lista = null; carregar(); };
    $("#pDias").onclick = ev => {
      const b = ev.target.closest("[data-passo]"); if (!b) return;
      const n = +b.dataset.passo, dt = new Date(p.dia + "T12:00:00");
      dt.setDate(dt.getDate() + n);
      irDia(n ? diaDe(dt.getTime()) : hoje);
    };
    $("#pDia").onchange = ev => irDia(ev.target.value);
    $("#pFiltro").onclick = ev => { const b = ev.target.closest("[data-f]"); if (b) { p.filtro = b.dataset.f; desenhar(); } };
    const busca = $("#pBusca");
    busca.oninput = () => { p.busca = busca.value; const pos = busca.selectionStart; desenhar(); const nb = $("#pBusca"); nb.focus(); nb.setSelectionRange(pos, pos); };
    app().onclick = async ev => {
      const del = ev.target.closest("[data-apagar]");
      if (del) {
        const i = (p.lista || []).find(x => x.id === del.dataset.apagar);
        if (i && await apagarInspecao(i)) desenhar();
        return;
      }
      const a = ev.target.closest("[data-abrir]"); if (a) Telas.ir("detalhe", a.dataset.abrir);
    };
    if ($("#pCsv")) $("#pCsv").onclick = () => baixarCSV(l);
  };
  const carregar = async () => {
    p.carregando = true; p.erro = ""; desenhar();
    const ini = new Date(p.dia + "T00:00:00"), fim = new Date(ini); fim.setDate(fim.getDate() + 1);
    const dia = p.dia;
    try {
      const lista = await Dados.inspecoes(ini.getTime(), fim.getTime());
      if (dia !== p.dia) return;   // trocou de dia enquanto carregava
      p.lista = lista;
      p.lista.forEach(i => {
        const eid = (i.equipamento || {}).id, e = Estado.equipamentos.find(x => x.id === eid);
        if (e && statusAtual(i) !== "liberado" && !(e.pendencias || {})[i.id]) Dados.abrirPendencia(eid, i.id, statusAtual(i));
      });
    }
    catch (e) { p.lista = p.lista || []; p.erro = "Não deu para carregar (" + ((e && e.code) || "sem sinal") + ")."; }
    p.carregando = false;
    if (Telas.atual.nome === "painel") desenhar();
  };
  // começa no dia de hoje; o dia escolhido vale até virar o dia
  if (p.hojeEra !== diaDe(Date.now())) { p.hojeEra = p.dia = diaDe(Date.now()); p.lista = null; }
  if (!p.lista) carregar(); else { desenhar(); carregar(); }
};

function baixarCSV(lista) {
  const cab = ["Data", "Equipamento", "Tipo", "Quem fez", "Resultado", "Não conformes", "Itens não conformes", "KM", "Horímetro", "Observação", "Tratativa", "Fotos/vídeos", "ID"];
  const linhas = lista.map(i => [dataHora(i.criadoEm), nomeEquip(i.equipamento), TIPOS[(i.equipamento || {}).tipo] || "",
    i.criadoNome, (RESULTADOS[i.resultado] || {}).txt, i.defeitos,
    (i.itens || []).filter(x => x.st === "nok").map(x => x.texto + (x.obs ? ": " + x.obs : "")).join(" | "),
    i.km == null ? "" : i.km, i.horimetro == null ? "" : i.horimetro, i.obs || "",
    i.tratativa ? i.tratativa.status + (i.tratativa.nota ? " - " + i.tratativa.nota : "") : "",
    Object.keys(i.midias || {}).length, i.id]);
  const csv = "﻿" + [cab].concat(linhas).map(l => l.map(c => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "checklists-" + (Painel.dia || diaDe(Date.now())) + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- detalhe de um checklist (admin) ---------- */
/* Resolução por item: o que está sendo resolvido agora (nota + fotos ainda no aparelho) */
const Resolver = { inspId: "", itemId: "", nota: "", mids: [], modo: "resolver" };   // modo: resolver | solicitar

/* Gestão marca que viu o checklist: aparece para todos (painel, detalhe e o Início de quem fez) */
async function marcarVisto(i) {
  const v = { por: Dados.usuario.nome || Dados.usuario.usuario, em: Date.now() };
  const k = chaveVisto(Dados.usuario.email);
  i.vistos = Object.assign({}, i.vistos, { [k]: v });
  const p = (Painel.lista || []).find(x => x.id === i.id); if (p && p !== i) p.vistos = i.vistos;
  desenharDetalhe(i);
  toast("👁 Marcado como visualizado", "ok");
  try { await Dados.atualizarInspecao(i.id, { ["vistos." + k]: v }); }
  catch (e) { toast("Não deu para salvar (" + ((e && e.code) || "sem sinal") + ").", "erro"); }
}

Render.detalhe = async function (id) {
  titulo("CHECKLIST", "");
  app().innerHTML = `<p class="carregando">Carregando…</p>`;
  let i = (Painel.lista || []).find(x => x.id === id);
  try { i = (await Dados.inspecao(id)) || i; } catch (e) {}
  if (!i) { app().innerHTML = `<p class="erro">Checklist não encontrado.</p>`; return; }
  if (Telas.atual.nome !== "detalhe" || Telas.atual.arg !== id) return;
  // motorista/operador: só o próprio checklist (a regra do Firestore também barra)
  if (!Dados.ehGestao() && i.criadoPor !== Dados.usuario.email) {
    toast("Checklist de outra pessoa.", "erro"); return Telas.ir("inicio", null, true);
  }
  if (Resolver.inspId !== i.id) await cancelarResolucao();
  desenharDetalhe(i);
};

function desenharDetalhe(i) {
  Estado.detalhe = i;
  const R = RESULTADOS[i.resultado] || RESULTADOS.liberado;
  const A = RESULTADOS[statusAtual(i)];
  const res = i.resolucoes || {};
  const legado = i.tratativa && i.tratativa.status === "resolvido" && !i.resolucoes;   // resolvido pelo botão geral antigo
  const nok = (i.itens || []).filter(x => x.st === "nok");
  const resolvidos = nok.filter(x => legado || res[x.id]).length;
  titulo(nomeEquip(i.equipamento), dataHora(i.criadoEm));
  const vistos = vistosDe(i), euVi = !!((i.vistos || {})[chaveVisto(Dados.usuario.email)]);
  // os que pedem atenção primeiro: não conforme em aberto (crítico antes), depois os já resolvidos, depois os ok
  const peso = it => it.st !== "nok" ? 3 : (legado || res[it.id]) ? 2 : it.critico ? 0 : 1;
  const ordenados = (i.itens || []).map((it, n) => [it, n]).sort((a, b) => peso(a[0]) - peso(b[0]) || a[1] - b[1]).map(x => x[0]);
  const midiasDe = item => Object.entries(i.midias || {}).filter(([, m]) => m.item === item).map(([mid, m]) =>
    `<button class="mini-midia remota" data-path="${h(m.path)}" data-tipo="${m.tipo}" ${m.ok ? "" : "disabled"}>
      ${m.ok ? (m.tipo === "video" ? `<span class="play">▶</span>` : `<img data-thumb="${h(m.path)}" alt="foto" />`)
        : `<span class="espera">⏳<small>enviando</small></span>`}</button>`).join("");
  const blocoItem = it => {
    if (it.st !== "nok") return "";
    const r = res[it.id], sl = (i.solicitacoes || {})[it.id];
    const caixaSol = sl ? `<div class="solicitado"><b>🛒 Solicitado</b> <span class="muted mini">· ${h(sl.por)} · ${dataHora(sl.em)}</span>
        <p>${h(sl.nota)}</p></div>` : "";
    if (r || legado) return `<div class="resolvido">
        <b>✅ Resolvido</b>${r ? ` <span class="muted mini">· ${h(r.por)} · ${dataHora(r.em)}</span>` : ` <span class="muted mini">(tratativa geral)</span>`}
        ${r && r.nota ? `<p>${h(r.nota)}</p>` : ""}
        ${sl ? `<p class="mini muted">🛒 Antes: solicitado em ${dataHora(sl.em)} — ${h(sl.nota)}</p>` : ""}
        <div class="midias">${midiasDe("res:" + it.id)}</div>
        ${r && Dados.ehGestao() ? `<button class="mini-bt" data-reabrir="${h(it.id)}">Reabrir item</button>` : ""}
      </div>`;
    // motorista/operador: acompanha, não resolve
    if (!Dados.ehGestao()) return caixaSol || `<p class="aguardando">⏳ Aguardando a manutenção</p>`;
    if (Resolver.inspId === i.id && Resolver.itemId === it.id && Resolver.modo === "solicitar") return `${caixaSol}<div class="resolvendo solicitando">
        <b>🛒 Solicitação: ${h(it.texto)}</b>
        <textarea id="slNota" rows="2" placeholder="O que foi solicitado? (ex.: troca do pneu, compra da peça)">${h(Resolver.nota)}</textarea>
        <p class="mini muted">O item continua em aberto até ser resolvido.</p>
        <div class="linha"><button class="btn btn-ghost" id="rsCancelar">Cancelar</button>
          <button class="btn" id="slConfirmar">🛒 Registrar</button></div>
      </div>`;
    if (Resolver.inspId === i.id && Resolver.itemId === it.id) return `${caixaSol}<div class="resolvendo">
        <b>🔧 Resolver: ${h(it.texto)}</b>
        <textarea id="rsNota" rows="2" placeholder="O que foi feito? (obrigatório)">${h(Resolver.nota)}</textarea>
        <div class="midias">${Resolver.mids.map(mid => `<div class="mini-midia"><img data-mid="${mid}" alt="foto" />
          <button class="tirar" data-rs-tirar="${mid}" aria-label="Remover">✕</button></div>`).join("")}
          <button class="add-midia" id="rsFoto" aria-label="Tirar foto da correção">📷</button>
          <button class="add-midia" id="rsGaleria" aria-label="Escolher da galeria">🖼️</button></div>
        <div class="linha"><button class="btn btn-ghost" id="rsCancelar">Cancelar</button>
          <button class="btn" id="rsConfirmar">✅ Confirmar</button></div>
      </div>`;
    return `${caixaSol}<div class="acoes-item">
        <button class="btn btn-resolver" data-resolver="${h(it.id)}">🔧 Resolver este item</button>
        <button class="btn btn-ghost btn-resolver" data-solicitar="${h(it.id)}">🛒 ${sl ? "Editar solicitação" : "Solicitação"}</button>
      </div>${sl ? `<button class="mini-bt" data-sol-cancelar="${h(it.id)}">Cancelar solicitação</button>` : ""}`;
  };
  app().innerHTML = `
    <div class="card resultado ${R.cls} compacto"><h2>${R.ico} ${R.txt}</h2>
      <p>${h(i.criadoNome)} · ${h((i.modelo || {}).nome)}${i.duracaoSeg ? " · " + Math.max(1, Math.round(i.duracaoSeg / 60)) + " min" : ""}</p>
      <p>${i.km != null ? "KM " + i.km.toLocaleString("pt-BR") : ""}${i.km != null && i.horimetro != null ? " · " : ""}${i.horimetro != null ? "Horímetro " + i.horimetro.toLocaleString("pt-BR") : ""}</p>
      ${i.geo ? `<p><a href="https://maps.google.com/?q=${i.geo.lat},${i.geo.lng}" target="_blank" rel="noopener">📍 ver no mapa</a></p>` : ""}
      ${i.pendentes > 0 ? `<p class="mini">⏳ ${i.pendentes} foto(s) ainda subindo</p>` : ""}
    </div>
    <div class="card visto-card" id="dtVisto">
      ${vistos.length ? `<p>👁 <b>Visualizado</b> por ${h(textoVistos(vistos))}</p>` : `<p class="muted">👁 Ainda não visualizado pela gestão.</p>`}
      ${Dados.ehGestao() && !euVi ? `<button class="btn" id="dtMarcarVisto">👁 Marcar como visualizado</button>` : ""}
    </div>
    ${nok.length ? `<div class="card ${A.cls === "ok" ? "" : "alerta-borda"}" id="dtSituacao">
      <b>Agora: <span class="tag ${A.cls}">${A.ico} ${A.txt}</span></b>
      <p class="mini">${resolvidos} de ${nok.length} item(ns) não conforme(s) resolvido(s).
        ${A.cls === "ok" ? "Equipamento voltou a operar." : Dados.ehGestao() ? "Resolva cada item abaixo, com nota e foto." : "A manutenção vai resolvendo cada item; esta tela atualiza sozinha."}
        ${solicitadosAbertos(i).length ? `<br>🛒 ${solicitadosAbertos(i).length} com solicitação, aguardando.` : ""}</p>
      ${legado && Dados.ehGestao() ? `<button class="btn btn-ghost" id="dtReabrir">Reabrir</button>` : ""}
    </div>` : ""}
    <h3 class="secao">Itens</h3>
    ${ordenados.map(it => `<div class="ck-item ${it.st} ${it.st === "nok" && (legado || res[it.id]) ? "feito" : ""} leitura" data-item="${h(it.id)}">
      <div class="ck-txt"><span class="stico">${it.st === "ok" ? "✔" : it.st === "nok" ? "✖" : "–"}</span>${h(it.texto)}
      ${it.critico ? ' <span class="critico">CRÍTICO</span>' : ""}</div>
      ${it.obs ? `<p class="obs">${h(it.obs)}</p>` : ""}
      <div class="midias">${midiasDe(it.id)}</div>
      ${blocoItem(it)}</div>`).join("")}
    ${Object.values(i.midias || {}).some(m => m.item === "geral") || i.obs ? `<h3 class="secao">Geral</h3>
      <div class="card">${i.obs ? `<p>${h(i.obs)}</p>` : ""}<div class="midias">${midiasDe("geral")}</div></div>` : ""}
    <button class="btn" id="dtPdf">📄 Enviar em PDF</button>
    <button class="btn btn-ghost" id="dtZap">📲 Enviar resumo pelo WhatsApp</button>
    ${Dados.ehAdmin() ? `<button class="btn btn-ghost perigo" id="dtApagar">🗑 Apagar este checklist</button>` : ""}
    <input type="file" id="inFotoRes" accept="image/*" capture="environment" hidden />
    <input type="file" id="inGaleriaRes" accept="image/*" hidden />`;

  // fotos já enviadas vêm do servidor; as da resolução em andamento, do aparelho
  app().querySelectorAll("[data-thumb]").forEach(async img => {
    try { img.src = await Midia.url(img.dataset.thumb); } catch (e) { img.alt = "sem acesso"; }
  });
  preencherMiniaturas(app());
  const sNota = $("#slNota");
  if (sNota) { sNota.oninput = () => { Resolver.nota = sNota.value; }; if (!Resolver.nota) sNota.focus(); }
  const nota = $("#rsNota");
  if (nota) { nota.oninput = () => { Resolver.nota = nota.value; }; if (!Resolver.mids.length && !Resolver.nota) nota.focus(); }

  app().onclick = async ev => {
    const alvo = ev.target;
    const m = alvo.closest(".remota");
    if (m && !m.disabled) {
      try { verMidia(await Midia.url(m.dataset.path), m.dataset.tipo); }
      catch (e) { toast("Não deu para abrir o arquivo.", "erro"); }
      return;
    }
    const abrir = alvo.closest("[data-resolver]");
    if (abrir) {
      await cancelarResolucao();
      Object.assign(Resolver, { inspId: i.id, itemId: abrir.dataset.resolver, nota: "", mids: [], modo: "resolver" });
      return redesenhar(i, abrir.dataset.resolver);
    }
    if (alvo.id === "dtMarcarVisto") return marcarVisto(i);
    if (alvo.id === "rsCancelar") { await cancelarResolucao(); return redesenhar(i); }
    if (alvo.id === "rsFoto") return fotoResolucao(i);
    if (alvo.id === "rsGaleria") return fotoResolucao(i, true);
    const tirar = alvo.closest("[data-rs-tirar]");
    if (tirar) {
      Resolver.mids = Resolver.mids.filter(x => x !== tirar.dataset.rsTirar);
      await Midia.apagar(tirar.dataset.rsTirar).catch(() => {}); liberarURL(tirar.dataset.rsTirar);
      return redesenhar(i, Resolver.itemId);
    }
    if (alvo.id === "rsConfirmar") return confirmarResolucao(i);
    const sol = alvo.closest("[data-solicitar]");
    if (sol) {
      await cancelarResolucao();
      const ant = (i.solicitacoes || {})[sol.dataset.solicitar];
      Object.assign(Resolver, { inspId: i.id, itemId: sol.dataset.solicitar, nota: ant ? ant.nota : "", mids: [], modo: "solicitar" });
      return redesenhar(i, sol.dataset.solicitar);
    }
    if (alvo.id === "slConfirmar") return registrarSolicitacao(i);
    const solX = alvo.closest("[data-sol-cancelar]");
    if (solX) return cancelarSolicitacao(i, solX.dataset.solCancelar);
    const reabrir = alvo.closest("[data-reabrir]");
    if (reabrir) return reabrirItem(i, reabrir.dataset.reabrir);
    if (alvo.id === "dtReabrir") return reabrirLegado(i);
    if (alvo.id === "dtPdf") return PDF.enviar(i, alvo);
    if (alvo.id === "dtZap") return zapDetalhe(i);
    if (alvo.id === "dtApagar") { if (await apagarInspecao(i)) Telas.voltar(); }
  };
}

/* foto da resolução terminou de subir: troca o ⏳ pela foto sem precisar sair da tela */
window.addEventListener("ck-midia-enviada", ev => {
  const i = Estado.detalhe, d = ev.detail || {};
  if (!i || i.id !== d.inspId || !Telas.atual || Telas.atual.nome !== "detalhe" || !(i.midias || {})[d.mid]) return;
  i.midias[d.mid] = Object.assign({}, i.midias[d.mid], { ok: true });
  i.pendentes = Math.max(0, (i.pendentes || 0) - 1);
  // alguém digitando a nota de outro item: não redesenha (fecharia o teclado)
  if (!Resolver.itemId) redesenhar(i);
});

function redesenhar(i, itemId) {
  const y = window.scrollY;
  desenharDetalhe(i);
  window.scrollTo(0, y);
  const el = itemId && document.querySelector(`[data-item="${CSS.escape(itemId)}"]`);
  if (el) el.scrollIntoView({ block: "nearest" });
}

async function cancelarResolucao() {
  for (const mid of Resolver.mids) { await Midia.apagar(mid).catch(() => {}); liberarURL(mid); }
  Object.assign(Resolver, { inspId: "", itemId: "", nota: "", mids: [], modo: "resolver" });
}

/* Solicitação: registra o que foi pedido (compra, troca). O item continua
   em aberto e o equipamento fica na mesma situação até ser resolvido. */
async function registrarSolicitacao(i) {
  const itemId = Resolver.itemId, nota = String(Resolver.nota || "").trim();
  if (!nota) { toast("Escreva o que foi solicitado.", "erro"); const t = $("#slNota"); if (t) t.focus(); return; }
  const sl = { nota, por: Dados.usuario.nome || Dados.usuario.usuario, em: Date.now() };
  const upd = {}; upd["solicitacoes." + itemId] = sl;
  i.solicitacoes = Object.assign({}, i.solicitacoes, { [itemId]: sl });
  Dados.atualizarInspecao(i.id, upd).catch(() => toast("Não deu para salvar.", "erro"));
  Object.assign(Resolver, { inspId: "", itemId: "", nota: "", mids: [], modo: "resolver" });
  const l = (Painel.lista || []).findIndex(x => x.id === i.id); if (l >= 0) Painel.lista[l] = i;
  toast("🛒 Solicitação registrada. O item continua em aberto.", "ok");
  redesenhar(i, itemId);
}
async function cancelarSolicitacao(i, itemId) {
  if (!(await confirmar("A solicitação deste item será apagada. O item continua em aberto.", { titulo: "Cancelar solicitação?", ok: "Apagar", perigo: true }))) return;
  const upd = {}; upd["solicitacoes." + itemId] = firebase.firestore.FieldValue.delete();
  i.solicitacoes = Object.assign({}, i.solicitacoes); delete i.solicitacoes[itemId];
  Dados.atualizarInspecao(i.id, upd).catch(() => toast("Não deu para salvar.", "erro"));
  toast("Solicitação cancelada", "ok");
  redesenhar(i, itemId);
}

function fotoResolucao(i, galeria) {
  const inp = $(galeria ? "#inGaleriaRes" : "#inFotoRes");
  inp.value = "";
  inp.onchange = async () => {
    const arq = inp.files && inp.files[0]; if (!arq) return;
    toast("Processando foto…");
    try {
      const carimbo = carimboFoto("RESOLVIDO · " + nomeEquip(i.equipamento), arq, galeria);
      const p = await Midia.prepararFoto(arq, carimbo);
      const mid = Midia.novoId();
      await Midia.guardar({ mid, estado: "rascunho", blob: p.blob, tipo: "foto", ext: p.ext, item: "res:" + Resolver.itemId });
      Resolver.mids.push(mid);
      redesenhar(i, Resolver.itemId);
      toast("Foto adicionada ✔", "ok");
    } catch (e) { toast(e.message || "Não deu para usar essa foto.", "erro"); }
  };
  inp.click();
}

/* Grava a resolução do item, sobe as fotos e recalcula a situação:
   todos resolvidos -> Operando; só faltam itens com observação -> Restrição. */
async function confirmarResolucao(i) {
  const itemId = Resolver.itemId, nota = String(Resolver.nota || "").trim();
  if (!nota) { toast("Escreva o que foi feito.", "erro"); const t = $("#rsNota"); if (t) t.focus(); return; }
  const por = Dados.usuario.nome || Dados.usuario.usuario, em = Date.now();
  const upd = {}, novas = {};
  for (const mid of Resolver.mids) {
    const reg = await Midia.ler(mid); if (!reg) continue;
    const path = Midia.caminho(i.id, mid, reg.ext);
    novas[mid] = { item: "res:" + itemId, tipo: "foto", path, ok: false, tam: reg.blob.size };
    Object.assign(reg, { estado: "fila", inspId: i.id, path });
    await Midia.guardar(reg);
    upd["midias." + mid] = novas[mid];
  }
  const fotos = Object.keys(novas);
  if (fotos.length) upd.pendentes = firebase.firestore.FieldValue.increment(fotos.length);
  const r = { nota, por, em, fotos };
  upd["resolucoes." + itemId] = r;
  i.resolucoes = Object.assign({}, i.resolucoes, { [itemId]: r });
  i.midias = Object.assign({}, i.midias, novas);
  i.pendentes = (i.pendentes || 0) + fotos.length;
  await aplicarSituacao(i, upd, por, em);
  Object.assign(Resolver, { inspId: "", itemId: "", nota: "", mids: [], modo: "resolver" });
  fotos.forEach(liberarURL);
  Midia.processar();
  const A = RESULTADOS[statusAtual(i)];
  toast("Item resolvido ✔ " + nomeEquip(i.equipamento) + ": " + A.txt.toLowerCase(), "ok");
  redesenhar(i, itemId);
}

async function reabrirItem(i, itemId) {
  if (!(await confirmar("O item volta a ficar em aberto e o equipamento volta para a situação dele.", { titulo: "Reabrir item?", ok: "Reabrir" }))) return;
  const upd = {}; upd["resolucoes." + itemId] = firebase.firestore.FieldValue.delete();
  i.resolucoes = Object.assign({}, i.resolucoes); delete i.resolucoes[itemId];
  await aplicarSituacao(i, upd, Dados.usuario.nome || Dados.usuario.usuario, Date.now());
  toast("Item reaberto", "ok");
  redesenhar(i, itemId);
}

/* checklist resolvido pelo botão geral da versão anterior */
async function reabrirLegado(i) {
  i.tratativa = { status: "aberto" };
  i.resolucoes = {};
  await aplicarSituacao(i, { resolucoes: {} }, Dados.usuario.nome || Dados.usuario.usuario, Date.now());
  redesenhar(i);
}

/* Tratativa, equipamento e listas seguem a situação atual dos itens */
async function aplicarSituacao(i, upd, por, em) {
  const atual = statusAtual(i);
  i.tratativa = atual === "liberado" ? { status: "resolvido", por, em, nota: "Todos os itens resolvidos" } : { status: "aberto" };
  upd.tratativa = i.tratativa;
  Dados.atualizarInspecao(i.id, upd).catch(() => toast("Não deu para salvar.", "erro"));
  const eid = (i.equipamento || {}).id;
  if (atual === "liberado") Dados.fecharPendencia(eid, i.id); else Dados.abrirPendencia(eid, i.id, atual);
  Historico.marcar(i.id, { atual, resolvido: atual === "liberado" });
  const l = (Painel.lista || []).findIndex(x => x.id === i.id);
  if (l >= 0) Painel.lista[l] = i;
}

function zapDetalhe(i) {
  const R = RESULTADOS[i.resultado] || RESULTADOS.liberado, A = RESULTADOS[statusAtual(i)];
  const res = i.resolucoes || {};
  const def = (i.itens || []).filter(x => x.st === "nok");
  const oks = (i.itens || []).filter(x => x.st === "ok"), nas = (i.itens || []).filter(x => x.st !== "ok" && x.st !== "nok");
  const txt = `*CHECKLIST ${R.txt}* ${R.ico}\n🚛 ${nomeEquip(i.equipamento)}\n👤 ${i.criadoNome}\n🕒 ${dataHora(i.criadoEm)}`
    + (i.km != null ? `\nKM: ${i.km}` : "") + (i.horimetro != null ? `\nHorímetro: ${i.horimetro}` : "")
    + (def.length ? `\n\n*Não conformes (${def.length}):*\n` + def.map(d => `• ${d.texto}${d.critico ? " (CRÍTICO)" : ""}${d.obs ? " — " + d.obs : ""}`
      + (res[d.id] ? `\n   ✅ Resolvido: ${res[d.id].nota}` : (i.solicitacoes || {})[d.id] ? `\n   🛒 Solicitado: ${i.solicitacoes[d.id].nota}` : "")).join("\n") : "\n\nSem não conformes.")
    + (oks.length ? `\n\n*Itens OK (${oks.length}):*\n` + oks.map(d => `✅ ${d.texto}`).join("\n") : "")
    + (nas.length ? `\n\n*Não se aplica (${nas.length}):*\n` + nas.map(d => `– ${d.texto}`).join("\n") : "")
    + (def.length ? `\n\n*Agora:* ${A.ico} ${A.txt}` : "")
    + (i.obs ? `\n\nObs.: ${i.obs}` : "");
  window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

/* Só o administrador apaga (a regra do Firestore também barra os outros).
   As fotos vão junto. */
async function apagarInspecao(i) {
  if (!Dados.ehAdmin()) return false;
  if (!(await confirmar(nomeEquip(i.equipamento) + " · " + dataHora(i.criadoEm) + "\nAs fotos vão junto. Não tem como desfazer.",
    { titulo: "Apagar checklist?", ok: "Apagar", perigo: true }))) return false;
  Dados.col("inspecoes").doc(i.id).delete().catch(() => toast("Não deu para apagar.", "erro"));
  Midia.apagarRemotas(i.midias);
  Historico.remover(i.id);
  Dados.fecharPendencia((i.equipamento || {}).id, i.id);
  Painel.lista = (Painel.lista || []).filter(x => x.id !== i.id);
  toast("Checklist apagado.", "ok");
  return true;
}

/* ---------- cadastros (admin) ---------- */
Render.cadastros = function () {
  titulo("CADASTROS", "");
  app().innerHTML = `
    <button class="menu" data-ir="cad-equip"><span>🚛</span><div><b>Equipamentos</b><small>${Estado.equipamentos.length} cadastrado(s)</small></div></button>
    <button class="menu" data-ir="cad-modelos"><span>📝</span><div><b>Modelos de checklist</b><small>${Estado.modelosEfetivos().length} modelo(s) · itens e nível de cada um</small></div></button>
    <button class="menu" data-ir="cad-usuarios"><span>👥</span><div><b>Usuários</b><small>quem pode entrar e fazer checklist</small></div></button>`;
  app().onclick = ev => { const b = ev.target.closest("[data-ir]"); if (b) Telas.ir(b.dataset.ir); };
};

Render["cad-equip"] = function (editId) {
  titulo("EQUIPAMENTOS", "");
  const e = Estado.equipamentos.find(x => x.id === editId) || {};
  const ms = Estado.modelosEfetivos();
  app().innerHTML = `
    <form class="card" id="fEq">
      <b>${e.id ? "Editar equipamento" : "Novo equipamento"}</b>
      <div class="linha2">
        <label>Prefixo<input name="prefixo" value="${h(e.prefixo)}" placeholder="ex.: CB-12" /></label>
        <label>Placa<input name="placa" value="${h(e.placa)}" placeholder="ex.: ABC1D23" /></label>
      </div>
      <label>Descrição<input name="descricao" value="${h(e.descricao)}" placeholder="ex.: Scania G440 basculante" /></label>
      <div class="linha2">
        <label>Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${e.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>Modelo de checklist<select name="modeloId"><option value="">Automático pelo tipo</option>
          ${ms.map(m => `<option value="${h(m.id)}" ${e.modeloId === m.id ? "selected" : ""}>${h(m.nome)}</option>`).join("")}</select></label>
      </div>
      <div class="foto-eq">
        <span class="equip-vis">${visualEquip(e)}</span>
        <div><b class="mini">Foto do equipamento</b><small class="muted mini">Aparece no cartão na hora de escolher. Sem foto, fica o desenho.</small>
        <div class="linha"><button type="button" class="btn btn-ghost" id="eqFoto">📷 Foto</button>
          <button type="button" class="btn btn-ghost" id="eqGaleria">🖼️ Galeria</button>
          <button type="button" class="btn btn-ghost perigo" id="eqSemFoto" ${e.foto ? "" : "hidden"}>Tirar</button></div></div>
      </div>
      <input type="file" id="inFotoEq" accept="image/*" capture="environment" hidden />
      <input type="file" id="inGaleriaEq" accept="image/*" hidden />
      <div class="linha">
        <button class="btn">${e.id ? "Salvar" : "Cadastrar"}</button>
        ${e.id ? `<button type="button" class="btn btn-ghost" id="eqCancelar">Cancelar</button>
          <button type="button" class="btn btn-ghost perigo" id="eqApagar">Apagar</button>` : ""}
      </div>
    </form>
    <h3 class="secao">${Estado.equipamentos.length} equipamento(s)</h3>
    ${Estado.equipamentos.map(x => `<div class="item" data-ed="${h(x.id)}">
      <div><b>${h(nomeEquip(x))}</b><small>${h(TIPOS[x.tipo] || "")}${x.descricao ? " · " + h(x.descricao) : ""}</small></div>
      <div class="dir"><span class="tag ${SITUACOES[situacaoDe(x)].cls}">${SITUACOES[situacaoDe(x)].ico} ${SITUACOES[situacaoDe(x)].txt}</span>
      <small>${h((ms.find(m => m.id === x.modeloId) || {}).nome || "automático")}</small></div></div>`).join("")}`;
  let foto;   // undefined = não mexeu · "" = sem foto · data URL = nova
  const mostrarFoto = () => {
    $(".foto-eq .equip-vis").innerHTML = visualEquip({ ...e, tipo: $("#fEq [name=tipo]").value, foto: foto === undefined ? e.foto : foto });
    $("#eqSemFoto").hidden = !(foto === undefined ? e.foto : foto);
  };
  $("#fEq [name=tipo]").onchange = mostrarFoto;
  for (const [btn, inp] of [["#eqFoto", "#inFotoEq"], ["#eqGaleria", "#inGaleriaEq"]]) {
    $(btn).onclick = () => { $(inp).value = ""; $(inp).click(); };
    $(inp).onchange = async ev2 => {
      const arq = ev2.target.files[0]; if (!arq) return;
      try { foto = await fotoDoEquipamento(arq); mostrarFoto(); toast("Foto pronta. Toque em Salvar.", "ok"); }
      catch (err) { toast("Não deu para usar essa foto.", "erro"); }
    };
  }
  $("#eqSemFoto").onclick = () => { foto = ""; mostrarFoto(); };
  $("#fEq").onsubmit = ev => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    if (foto !== undefined) f.foto = foto;
    f.prefixo = f.prefixo.trim().toUpperCase(); f.placa = f.placa.trim().toUpperCase(); f.descricao = f.descricao.trim();
    if (!f.prefixo && !f.placa) return toast("Informe o prefixo ou a placa.", "erro");
    const repetido = Estado.equipamentos.find(x => x.id !== e.id && ((f.prefixo && x.prefixo === f.prefixo) || (f.placa && x.placa === f.placa)));
    if (repetido) return toast("Já existe: " + nomeEquip(repetido), "erro");
    Dados.salvar("equipamentos", e.id, f).enviado.catch(() => toast("Não deu para salvar (permissão).", "erro"));
    toast("Salvo ✔", "ok");
    Telas.atual.arg = null; Telas.render();
  };
  if (e.id) {
    $("#eqCancelar").onclick = () => { Telas.atual.arg = null; Telas.render(); };
    $("#eqApagar").onclick = async () => {
      if (!(await confirmar(nomeEquip(e) + "\nOs checklists já feitos continuam.", { titulo: "Apagar equipamento?", ok: "Apagar", perigo: true }))) return;
      Dados.remover("equipamentos", e.id).catch(() => toast("Não deu para apagar.", "erro"));
      Telas.atual.arg = null; Telas.render();
    };
  }
  app().onclick = ev => { const it = ev.target.closest("[data-ed]"); if (it) { Telas.atual.arg = it.dataset.ed; Telas.render(); } };
};

Render["cad-modelos"] = function () {
  titulo("MODELOS", "Itens de cada checklist");
  app().innerHTML = `
    <p class="muted mini">Toque num modelo para mudar os itens ou o nível de cada um. Os marcados "padrão" já vêm prontos no app.</p>
    ${Estado.modelosEfetivos().map(m => `<div class="item" data-md="${h(m.id)}">
      <div><b>${h(m.nome)}</b><small>${h(TIPOS[m.tipo] || "")} · ${m.itens.length} itens · ${m.itens.filter(x => x.critico).length} críticos · ${m.itens.filter(x => !x.critico).length} com observação</small></div>
      <div class="dir"><small>${m.padrao ? "padrão · " : ""}editar ›</small></div></div>`).join("")}
    <button class="btn" id="mdNovo">➕ Novo modelo</button>`;
  $("#mdNovo").onclick = () => Telas.ir("cad-modelo", null);
  app().onclick = ev => { const it = ev.target.closest("[data-md]"); if (it) Telas.ir("cad-modelo", it.dataset.md); };
};

Render["cad-modelo"] = function (id) {
  const base = Estado.modelosEfetivos().find(m => m.id === id);   // padrão também: ao salvar vira da nuvem
  // edita uma cópia; só grava ao salvar
  if (!Render["cad-modelo"]._ed || Render["cad-modelo"]._id !== id) {
    Render["cad-modelo"]._id = id;
    Render["cad-modelo"]._ed = base ? JSON.parse(JSON.stringify(base)) : { nome: "", tipo: "caminhao", itens: [] };
  }
  const m = Render["cad-modelo"]._ed;
  titulo(base ? "EDITAR MODELO" : "NOVO MODELO", "");
  app().innerHTML = `
    <div class="card">
      <label>Nome<input id="mdNome" value="${h(m.nome)}" placeholder="ex.: Caminhão basculante — diário" /></label>
      <label>Tipo de equipamento<select id="mdTipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${m.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    </div>
    <div class="card mini">
      <b>Nível de cada item</b>
      <p><span class="critico">CRÍTICO</span> não conforme põe o equipamento <b>em manutenção</b> e mostra <b>"Acione a manutenção"</b> para quem faz o checklist.</p>
      <p><b>Operacional com observação</b>: não conforme com observação; o equipamento <b>segue operando</b> e aparece em <b>Restrição</b>.</p>
      <p class="muted">Quando o gestor marca o defeito como resolvido, o equipamento volta a Operando.</p>
    </div>
    <h3 class="secao">${m.itens.length} itens</h3>
    <div id="mdItens">${m.itens.map((it, n) => `<div class="md-item" data-n="${n}">
      <input class="md-txt" value="${h(it.texto)}" />
      <select class="md-nivel" aria-label="Nível">
        <option value="critico" ${it.critico ? "selected" : ""}>Crítico</option>
        <option value="operacional" ${it.critico ? "" : "selected"}>Operacional com observação</option></select>
      <button class="mini-bt" data-acao="sobe">↑</button><button class="mini-bt" data-acao="tira">✕</button></div>`).join("")}</div>
    <div class="card"><b>Novo item</b>
      <input id="mdNovoItem" placeholder="ex.: Pneus" />
      <div class="linha"><select id="mdNovoNivel" aria-label="Nível do item novo">
        <option value="critico">Crítico (manutenção)</option><option value="operacional" selected>Operacional com observação</option></select>
      <button class="btn" id="mdAdd">Adicionar</button></div></div>
    <button class="btn btn-grande" id="mdSalvar">Salvar modelo</button>
    ${base ? `<button class="btn btn-ghost perigo" id="mdApagar">Apagar modelo</button>` : ""}`;
  $("#mdNome").oninput = e => { m.nome = e.target.value; };
  $("#mdTipo").onchange = e => { m.tipo = e.target.value; };
  $("#mdItens").onchange = $("#mdItens").oninput = ev => {
    const n = +ev.target.closest(".md-item").dataset.n;
    if (ev.target.classList.contains("md-txt")) m.itens[n].texto = ev.target.value;
    if (ev.target.classList.contains("md-nivel")) m.itens[n].critico = ev.target.value === "critico";
  };
  $("#mdItens").onclick = ev => {
    const b = ev.target.closest("[data-acao]"); if (!b) return;
    const n = +b.closest(".md-item").dataset.n;
    if (b.dataset.acao === "tira") m.itens.splice(n, 1);
    if (b.dataset.acao === "sobe" && n > 0) [m.itens[n - 1], m.itens[n]] = [m.itens[n], m.itens[n - 1]];
    Telas.render();
  };
  const add = () => {
    const t = $("#mdNovoItem").value.trim(); if (!t) return;
    const maior = m.itens.reduce((a, x) => Math.max(a, parseInt(String(x.id).slice(1)) || 0), 0);
    m.itens.push({ id: "i" + (maior + 1), texto: t, critico: $("#mdNovoNivel").value === "critico" });
    Telas.render(); $("#mdNovoItem").focus();
  };
  $("#mdAdd").onclick = add;
  $("#mdNovoItem").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); add(); } };
  $("#mdSalvar").onclick = () => {
    m.itens = m.itens.filter(x => String(x.texto).trim());
    if (!m.nome.trim()) return toast("Dê um nome ao modelo.", "erro");
    if (!m.itens.length) return toast("Adicione pelo menos um item.", "erro");
    Dados.salvar("modelos", base && base.id, { nome: m.nome.trim(), tipo: m.tipo, itens: m.itens, removido: false })
      .enviado.catch(() => toast("Não deu para salvar (permissão).", "erro"));
    Render["cad-modelo"]._ed = null;
    toast("Modelo salvo ✔", "ok"); Telas.voltar();
  };
  if (base) $("#mdApagar").onclick = async () => {
    if (!(await confirmar(base.nome, { titulo: "Apagar modelo?", ok: "Apagar", perigo: true }))) return;
    // padrão apagado fica marcado, senão voltaria a aparecer
    if (MODELOS_PADRAO.some(x => x.id === base.id)) Dados.salvar("modelos", base.id, { removido: true }).enviado.catch(() => {});
    else Dados.remover("modelos", base.id).catch(() => {});
    Render["cad-modelo"]._ed = null; Telas.voltar();
  };
};

Render["cad-usuarios"] = async function () {
  titulo("USUÁRIOS", "Quem pode entrar");
  app().innerHTML = `
    <form class="card" id="fUs" autocomplete="off">
      <b>Liberar acesso</b>
      <div class="linha2">
        <label>Usuário<input name="usuario" placeholder="ex.: joao.silva" autocapitalize="none" required /></label>
        <label>Nome<input name="nome" placeholder="João Silva" required /></label>
      </div>
      <div class="linha2">
        <label>Senha inicial<input name="senha" type="text" placeholder="mín. 6 caracteres" autocomplete="new-password" /></label>
        <label>Função<select name="perfil">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      </div>
      <p class="muted mini"><b>Motorista</b> e <b>Operador</b> fazem checklist. <b>Gestor</b> também vê o Painel e resolve os defeitos.
        <b>Administrador</b> também apaga checklists e mexe em Cadastros.</p>
      <p class="muted mini">A pessoa entra com <b>usuário</b> e senha — não precisa ter e-mail. Cada um troca a própria senha em Conta; esqueceu, redefina no console do Firebase (Authentication).</p>
      <button class="btn" id="usCriar">Criar e liberar</button>
    </form>
    <div id="usLista"><p class="carregando">Carregando…</p></div>`;
  $("#fUs").onsubmit = async ev => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    const b = $("#usCriar"); b.disabled = true;
    const r = await Dados.criarUsuario(f.usuario, f.senha, { nome: f.nome.trim(), perfil: f.perfil, ativo: true });
    b.disabled = false;
    if (!r.ok) return toast(r.erro, "erro");
    toast(r.jaExistia ? "Liberado. Esse usuário já existia: vale a senha que ele já usa." : "Acesso criado ✔", "ok");
    Telas.render();
  };
  try {
    const l = (await Dados.usuarios()).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    if (Telas.atual.nome !== "cad-usuarios") return;
    $("#usLista").innerHTML = `<h3 class="secao">${l.length} usuário(s)</h3>` + l.map(u => `<div class="item ${u.ativo === false ? "apagado" : ""}">
      <div><b>${h(u.nome || u.usuario)}</b><small>${h(u.usuario)}${u.ativo === false ? " · bloqueado" : ""}</small></div>
      <div class="dir linha">
        <select class="mini-sel" data-perfil="${h(u.email)}" aria-label="Função">${Object.entries(PERFIS).map(([k, v]) =>
          `<option value="${k}" ${(PERFIS[u.perfil] ? u.perfil : "motorista") === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <button class="mini-bt" data-ativo="${h(u.email)}" data-v="${u.ativo === false ? "1" : "0"}">${u.ativo === false ? "desbloquear" : "bloquear"}</button>
      </div></div>`).join("");
    $("#usLista").onchange = async ev => {
      const s = ev.target.closest("[data-perfil]"); if (!s) return;
      const r = await Dados.salvarUsuario(s.dataset.perfil, { perfil: s.value });
      toast(r.ok ? "Função alterada: " + PERFIS[s.value] : r.erro, r.ok ? "ok" : "erro");
      Telas.render();
    };
    $("#usLista").onclick = async ev => {
      const b = ev.target.closest("[data-ativo]"); if (!b) return;
      const r = await Dados.salvarUsuario(b.dataset.ativo, { ativo: b.dataset.v === "1" });
      if (!r.ok) return toast(r.erro, "erro");
      Telas.render();
    };
  } catch (e) {
    $("#usLista").innerHTML = `<p class="erro">Não deu para carregar (${h((e && e.code) || "sem sinal")}).</p>`;
  }
};

/* ---------- conta ---------- */
Render.conta = function () {
  const u = Dados.usuario;
  titulo("MINHA CONTA", "");
  app().innerHTML = `
    <div class="card"><b>${h(u.nome)}</b><p class="muted">${h(u.usuario)} · ${PERFIS[u.perfil] || ""}</p>
      <p class="muted mini" data-pendentes></p>
      <button class="btn btn-ghost" id="ctEnviar">⬆ Enviar pendentes agora</button></div>
    <form class="card" id="fSenha">
      <b>Trocar senha</b>
      <input type="text" name="u" autocomplete="username" value="${h(u.usuario)}" hidden />
      <label>Senha atual<input name="atual" type="password" autocomplete="current-password" required /></label>
      <label>Senha nova<input name="nova" type="password" autocomplete="new-password" minlength="6" required /></label>
      <button class="btn">Trocar senha</button>
    </form>
    <div data-slot-instalar="sempre"></div>
    <button class="btn btn-ghost perigo" id="ctSair">Sair deste aparelho</button>
    <p class="muted mini centro">Versão ${VERSAO}</p>`;
  $("#ctEnviar").onclick = () => { if (!navigator.onLine) return toast("Sem sinal agora.", "erro"); Midia.processar(); toast("Enviando…"); };
  $("#fSenha").onsubmit = async ev => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    const r = await Dados.trocarSenha(f.atual, f.nova);
    toast(r.ok ? "Senha trocada ✔" : r.erro, r.ok ? "ok" : "erro");
    if (r.ok) ev.target.reset();
  };
  $("#ctSair").onclick = async () => {
    const n = await Midia.pendentes();
    if (!(await confirmar(n ? "Ainda há " + n + " foto(s) para enviar. Elas ficam guardadas e sobem quando você entrar de novo." : "Para entrar de novo será preciso o usuário e a senha.",
      { titulo: "Sair deste aparelho?", ok: "Sair" }))) return;
    Estado.parar(); await Dados.sair(); Render.login();
  };
  atualizarRede();
};

/* ============================================================
   INÍCIO DO APP
   ============================================================ */
/* ---------- atualização automática ----------
   Toda publicação chega sozinha em todos os aparelhos, mesmo com o app aberto:
   o app procura versão nova ao voltar para a tela e a cada 30 min; quando o
   service worker novo assume, recarrega. No meio de um checklist ou de uma
   resolução, espera a pessoa sair dessa tela (o rascunho já fica salvo). */
const Atualizacao = {
  pendente: false,
  _reg: null,
  iniciar() {
    if (!("serviceWorker" in navigator)) return;
    const tinhaControle = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => { this._reg = reg; }).catch(() => {});
    // primeira instalação também dispara controllerchange: aí não é atualização
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (tinhaControle) this.chegou(); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") this.procurar(); });
    window.addEventListener("online", () => this.procurar());
    setInterval(() => this.procurar(), 30 * 60000);
    try {
      const de = sessionStorage.getItem("ck_atualizado_de");
      if (de && de !== VERSAO) setTimeout(() => toast("App atualizado ✔ versão " + VERSAO, "ok"), 600);
      sessionStorage.removeItem("ck_atualizado_de");
    } catch (e) {}
  },
  procurar() { if (this._reg && navigator.onLine) this._reg.update().catch(() => {}); },
  ocupado() {
    const t = Telas.atual && Telas.atual.nome;
    // checklist em andamento, tela do resultado, resolução, janela aberta ou modelo em edição
    return t === "checklist" || t === "resultado" || t === "cad-modelo" || !!Resolver.itemId || !!document.querySelector(".mdl-fundo");
  },
  chegou() {
    if (this.ocupado()) { this.pendente = true; return; }
    this.recarregar();
  },
  recarregar() {
    try { sessionStorage.setItem("ck_atualizado_de", VERSAO); } catch (e) {}
    location.reload();
  },
  /* chamado a cada troca de tela: atualização que esperava vai agora */
  talvezAgora() { if (this.pendente && !this.ocupado()) this.recarregar(); }
};

function entrouNoApp() {
  document.body.classList.remove("tela-login");
  document.body.classList.toggle("admin", Dados.ehAdmin());
  document.body.classList.toggle("gestao", Dados.ehGestao());
  $("#abas").hidden = false;
  Historico.migrar();
  try {   // rascunho da versão antiga (um por celular) fica com quem entrar primeiro
    const velho = localStorage.getItem(RASCUNHO_KEY);
    if (velho && !localStorage.getItem(chaveDe(RASCUNHO_KEY))) localStorage.setItem(chaveDe(RASCUNHO_KEY), velho);
    localStorage.removeItem(RASCUNHO_KEY);
  } catch (e) {}
  Estado.rascunho = lerJSON(chaveDe(RASCUNHO_KEY), null);
  if (Estado.rascunho && !Estado.rascunho.modelo) Estado.rascunho = null;
  Estado.ouvir();
  // os meus checklists ao vivo: o Início e o detalhe acompanham a manutenção sem recarregar
  Estado._ouvintes.push(Dados.ouvirMinhas(Dados.usuario.email, meus => {
    const r = Historico.aplicar(meus);
    r.mudancas.forEach(m => {
      const S = RESULTADOS[m.para];
      toast(m.para === "liberado" ? "✅ " + m.equip + " voltou a operar" : S.ico + " " + m.equip + ": agora " + (m.para === "bloqueado" ? "em manutenção" : "com restrição"), m.para === "liberado" ? "ok" : "");
      try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {}
    });
    const d = Estado.detalhe, novo = d && meus.find(x => x.id === d.id);
    const andamento = x => JSON.stringify([x.resolucoes, x.solicitacoes, x.tratativa, x.midias]);
    if (novo && Telas.atual && Telas.atual.nome === "detalhe" && Telas.atual.arg === d.id && !Resolver.itemId
        && andamento(novo) !== andamento(d)) {
      redesenhar(novo);
    } else if (r.mudou) Telas.atualizarSeVisivel(["inicio"]);
  }));
  Telas.ir("inicio", null, true);
  Midia.aoMudar = atualizarRede;
  Midia.processar();
  Historico.conferirPendentes()
    .then(() => Historico.sincronizar())
    .then(() => Telas.atualizarSeVisivel(["inicio"]));
}

async function iniciar() {
  $("#btnVoltar").onclick = () => Telas.voltar();
  document.querySelectorAll(".aba[data-ir]").forEach(b => { const sp = b.querySelector("span"); if (sp && ICONES[b.dataset.ir]) sp.innerHTML = ICONES[b.dataset.ir]; });
  const lg = document.querySelector("#topo .logo"); if (lg) lg.innerHTML = LOGO;
  $("#abas").onclick = ev => {
    const b = ev.target.closest("[data-ir]"); if (!b) return;
    Telas.ir(b.dataset.ir === "novo" && Estado.rascunho ? "checklist" : b.dataset.ir);
  };
  window.addEventListener("online", atualizarRede);
  window.addEventListener("offline", atualizarRede);
  setInterval(() => { if (Dados.usuario) Midia.processar(); }, 60000);
  Atualizacao.iniciar();

  const r = await Dados.iniciar();
  if (r.modo === "ok") return entrouNoApp();
  if (r.modo === "sem-sdk") {
    Render.login("Sem conexão com o servidor. Abra o app uma vez com internet.");
    return;
  }
  Render.login(r.erro);
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", iniciar);
}
