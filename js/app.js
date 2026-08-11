/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — app.js
   Bootstrap do app: navegação entre telas, renderização e
   registro do service worker (offline).
   ══════════════════════════════════════════════════════════ */

let _turnoAtivoCache = null;
let _viagemTimerHandle = null;
let _paradaTimerHandle = null;
let _ultimaViagemConcluidaId = null;
let _equipamentoSelecionadoId = null;
let _trajetoData = null;
let _trajetoMap = null;
let _trajetoAreas = null;
let _trajetoConteudo = null;
let _origemPainelEquip = 'painel';
let _abrirHistoricoEquip = false;

// Mantido por compatibilidade com todas as telas que já chamam podeGerenciarFrota() —
// a regra de verdade agora mora só em permissoes.js
function podeGerenciarFrota() {
  return Permissoes.podeGerenciarFrota();
}

// Contexto "no carregamento": ligado ao finalizar um deslocamento para carregamento,
// desligado ao iniciar viagem/outro deslocamento ou encerrar turno.
const CTX_CARREG_CHAVE = 'stracta_viagens_ctx_carreg';
function _setCtxCarregamento(on) {
  const t = _turnoAtivoCache;
  if (on && t) localStorage.setItem(CTX_CARREG_CHAVE, t.id);
  else localStorage.removeItem(CTX_CARREG_CHAVE);
}
function _emCarregamento() {
  const t = _turnoAtivoCache;
  return !!(t && localStorage.getItem(CTX_CARREG_CHAVE) === t.id);
}

// ---------- JANELA MODAL (formulários com layout profissional) ----------
// campos: [{ id, label, tipo, placeholder, valor, opcoes }]
// opcoes (se for select): [{ valor, texto }]
function abrirModalFormulario({ titulo, subtitulo, campos, aoSalvar, textoSalvar = 'Salvar' }) {
  const antigo = qs('#modal-overlay-ativo');
  if (antigo) antigo.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay-ativo';

  const camposHtml = campos.map(c => {
    if (c.tipo === 'select') {
      return `
        <div class="field">
          <label>${c.label}</label>
          <select id="modal-campo-${c.id}">
            ${(c.opcoes || []).map(o => `<option value="${o.valor}" ${o.valor === c.valor ? 'selected' : ''}>${o.texto}</option>`).join('')}
          </select>
        </div>`;
    }
    return `
      <div class="field">
        <label>${c.label}</label>
        <input id="modal-campo-${c.id}" type="${c.tipo || 'text'}" placeholder="${c.placeholder || ''}" value="${c.valor ?? ''}" inputmode="${c.tipo === 'number' ? 'numeric' : 'text'}">
      </div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-titulo">${titulo}</div>
      ${subtitulo ? `<div class="modal-subtitulo">${subtitulo}</div>` : ''}
      ${camposHtml}
      <div class="btn-row mt12">
        <button class="btn btn-outline" id="modal-btn-cancelar">Cancelar</button>
        <button class="btn btn-primary" id="modal-btn-salvar">${textoSalvar}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) fechar(); });
  overlay.querySelector('#modal-btn-cancelar').onclick = fechar;
  overlay.querySelector('#modal-btn-salvar').onclick = () => {
    const valores = {};
    campos.forEach(c => { valores[c.id] = qs(`#modal-campo-${c.id}`, overlay).value.trim(); });
    fechar();
    aoSalvar(valores);
  };
}

// Modal genérico só de leitura (rolável) para mostrar detalhes/listas.
function abrirModalDetalhe({ titulo, subtitulo, conteudo }) {
  const antigo = qs('#modal-overlay-ativo');
  if (antigo) antigo.remove();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay-ativo';
  overlay.innerHTML = `
    <div class="modal-card detalhe">
      <div class="modal-titulo">${titulo}</div>
      ${subtitulo ? `<div class="modal-subtitulo">${subtitulo}</div>` : ''}
      <div class="mt8">${conteudo}</div>
      <div class="btn-row mt12">
        <button class="btn btn-primary" id="modal-btn-fechar">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const fechar = () => overlay.remove();
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) fechar(); });
  overlay.querySelector('#modal-btn-fechar').onclick = fechar;
}

// ---------- BOOTSTRAP ----------
// ---------- INSTALAÇÃO DO APP (PWA) ----------
let _promptInstalar = null;

function _appInstalado() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
         window.navigator.standalone === true;
}
function _ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}
// Navegador "interno" (dentro do WhatsApp/Instagram/Facebook) não instala PWA.
function _ehNavegadorInterno() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line\/|; wv\)|WhatsApp/i.test(ua);
}
function _mostrarBotoesInstalar(mostrar) {
  ['#btn-instalar', '#btn-instalar-login'].forEach(sel => {
    const el = qs(sel);
    if (el) el.style.display = mostrar ? '' : 'none';
  });
}

// O Android/Chrome dispara este evento quando o app pode ser instalado.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _promptInstalar = e;
  try { if (!_appInstalado()) _mostrarBotoesInstalar(true); } catch (_) {}
});
window.addEventListener('appinstalled', () => {
  _promptInstalar = null;
  try { _mostrarBotoesInstalar(false); } catch (_) {}
  showToast('✅ Aplicativo instalado!');
});

function configurarInstalacao() {
  // Mostra o botão SEMPRE (a não ser que o app já esteja instalado). Assim o usuário
  // sempre acha como instalar: se o navegador liberar, abre o instalador nativo;
  // senão, mostramos as instruções (inclusive o caso de estar num navegador interno).
  _mostrarBotoesInstalar(!_appInstalado());
}

async function instalarApp() {
  if (_appInstalado()) { showToast('✅ O aplicativo já está instalado', 'var(--green)'); return; }

  // Se o instalador nativo ainda não chegou (mas o navegador suporta), espera um
  // instante — ele costuma chegar logo após abrir a página. Assim o toque abre o
  // instalador sozinho, sem precisar de instruções.
  if (!_promptInstalar && !_ehIOS() && !_ehNavegadorInterno()) {
    showToast('📲 Preparando instalação...', 'var(--blue)', 3000);
    await new Promise((resolve) => {
      let feito = false;
      const t = setTimeout(() => { if (!feito) { feito = true; resolve(); } }, 3000);
      window.addEventListener('beforeinstallprompt', () => {
        if (!feito) { feito = true; clearTimeout(t); resolve(); }
      }, { once: true });
    });
  }

  if (_promptInstalar) {
    _promptInstalar.prompt();
    try {
      const escolha = await _promptInstalar.userChoice;
      if (escolha && escolha.outcome === 'accepted') _mostrarBotoesInstalar(false);
    } catch (_) {}
    _promptInstalar = null;
    return;
  }

  // Navegador interno (WhatsApp/Instagram): precisa abrir no navegador de verdade.
  if (_ehNavegadorInterno()) {
    alert('Este link foi aberto dentro de outro app (WhatsApp/Instagram), que não instala aplicativos.\n\nToque nos 3 pontinhos (⋮) no canto e escolha "Abrir no Chrome" (ou no navegador). Depois toque em "Instalar aplicativo" de novo.');
    return;
  }
  if (_ehIOS()) {
    alert('Para instalar no iPhone:\n\n1) Abra este site no navegador SAFARI (não pelo link de dentro do WhatsApp/Instagram).\n2) Toque no botão Compartilhar (o quadrado com a seta para cima).\n3) Escolha "Adicionar à Tela de Início".\n4) Toque em "Adicionar".');
    return;
  }
  alert('Para instalar no Android:\n\n1) Abra este site no CHROME (não pelo navegador de dentro do WhatsApp/Instagram — se abriu por um link, toque nos 3 pontinhos e "Abrir no Chrome").\n2) Toque no menu ⋮ (canto superior direito).\n3) Escolha "Instalar aplicativo" ou "Adicionar à tela inicial".');
}

async function iniciarApp() {
  await abrirBanco();
  await aplicarConfigPadraoSeNecessario();
  await Auth.garantirUsuarioPadrao();
  await migrarDesenvolvedorParaAdmin();
  await registrarVersaoInstalada();
  await aplicarTemaSalvo();
  await aplicarMarca();
  atualizarStatusConexao();
  iniciarEscutaResetRemoto();
  Sync.iniciarMonitoramento();
  Sync.onStatusChange(atualizarStatusConexao);
  Sync.onStatusChange(atualizarTelasAoVivo);
  migrarAreasParaObjetos();

  window.addEventListener('online', atualizarStatusConexao);
  window.addEventListener('offline', atualizarStatusConexao);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').then((reg) => {
      // verifica por atualizações assim que o app abre e a cada 5 minutos
      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});

    // quando uma nova versão assume o controle da página, avisa e recarrega
    let jaRecarregou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (jaRecarregou) return;
      jaRecarregou = true;
      showToast('🔄 Nova versão disponível — atualizando...', 'var(--blue)', 1800);
      setTimeout(() => window.location.reload(), 1200);
    });
  }

  configurarInstalacao();

  if (Auth.estaLogado()) {
    _turnoAtivoCache = await Motorista.turnoAtivo();
    navigate('home');
  } else {
    navigate('login');
  }
}

// ---------- MIGRAÇÃO: áreas com pontos em array-de-arrays → objetos {lat,lng} ----------
// O Firestore não aceita "array de arrays", então áreas antigas (pontos como [[lat,lng],...])
// nunca chegavam nos outros aparelhos. Aqui convertemos para [{lat,lng},...] e reenviamos.
// Idempotente: só age em áreas que ainda têm pontos no formato antigo.
async function migrarAreasParaObjetos() {
  try {
    const areas = await DB.getAll('areas');
    for (const a of areas) {
      if (!Array.isArray(a.pontos)) continue;
      const temArray = a.pontos.some(p => Array.isArray(p));
      if (!temArray) continue;
      a.pontos = a.pontos
        .map(p => Array.isArray(p) ? { lat: p[0], lng: p[1] } : (p ? { lat: p.lat, lng: p.lng } : null))
        .filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
      a.editadoEm = agoraISO();
      await DB.put('areas', a);
      if (typeof Sync !== 'undefined') Sync.enfileirar('area', a);
    }
  } catch (e) {
    console.warn('Falha ao migrar áreas', e);
  }
}

// ---------- MIGRAÇÃO: nível "Desenvolvedor" → "Administrador" ----------
// O perfil Desenvolvedor deixou de existir; o Administrador é o topo. Converte
// usuários antigos para não perderem acesso. Idempotente.
async function migrarDesenvolvedorParaAdmin() {
  try {
    const usuarios = await DB.getAll('usuarios');
    for (const u of usuarios) {
      if (u.nivel === 'Desenvolvedor') {
        u.nivel = 'Administrador';
        u.editadoEm = agoraISO();
        await DB.put('usuarios', u);
        if (typeof Sync !== 'undefined') Sync.enfileirar('usuario', u);
      }
    }
  } catch (e) {
    console.warn('Falha ao migrar níveis', e);
  }
}

// ---------- MODO TESTE DE OPERAÇÃO (administrador) ----------
// Inicia um turno de teste num equipamento fictício. Tudo criado é marcado
// como teste e NÃO entra nos relatórios/painel; pode ser apagado depois.
async function iniciarTesteOperacaoUI() {
  if (!Permissoes.podeVerDiagnostico()) { showToast('Acesso restrito a Administrador', 'var(--iron)'); return; }
  const jaAtivo = await Motorista.turnoAtivo();
  if (jaAtivo) { showToast('Encerre o turno atual antes de testar', 'var(--iron)'); return; }
  const u = Auth.usuarioAtual();
  const equip = await Equipamentos.garantirEquipTeste();
  const t = await Motorista.iniciarTurno({
    motoristaId: u.id, motoristaNome: u.nome,
    equipamentoId: equip.id, equipamentoCodigo: equip.codigo,
    kmInicial: 0, horimetroInicial: 0, teste: true
  });
  if (t && t.erro) { showToast(t.erro, 'var(--iron)'); return; }
  _turnoAtivoCache = t;
  showToast('🧪 Modo teste iniciado');
  navigate('operacao');
}

async function apagarDadosTesteUI() {
  if (!Permissoes.podeVerDiagnostico()) { showToast('Acesso restrito a Administrador', 'var(--iron)'); return; }
  if (!confirm('Apagar TODOS os dados de teste (turnos, viagens, deslocamentos e paradas marcados como teste)?')) return;
  const mapaTipo = { turnos: 'turno', viagens: 'viagem', deslocamentos: 'deslocamento', paradas: 'parada' };
  for (const store of Object.keys(mapaTipo)) {
    const todos = await DB.getAll(store);
    for (const r of todos) {
      if (r.teste) {
        await DB.delete(store, r.id);
        if (typeof Sync !== 'undefined') Sync.enfileirarExclusao(mapaTipo[store], r.id);
      }
    }
  }
  localStorage.removeItem('stracta_viagens_turno_ativo_id');
  _turnoAtivoCache = await Motorista.turnoAtivo();
  showToast('🧹 Dados de teste apagados');
  navigate('home');
}

// ---------- IDENTIDADE DA EMPRESA (white-label) ----------
// Nome/slogan configuráveis por cliente; a GP2T é a fornecedora (crédito fixo "por GP2T").
async function aplicarMarca() {
  const nome = (await DB.getConfig('empresa_nome', 'STRACTA')) || 'STRACTA';
  const slogan = (await DB.getConfig('empresa_slogan', 'Controle operacional da frota')) || 'Controle operacional da frota';
  window.MARCA = { nome, slogan };
  const topo = qs('#brand-topo'); if (topo) topo.textContent = nome;
  const logo = qs('#login-logo'); if (logo) logo.textContent = nome;
  const sub = qs('#login-sub'); if (sub) sub.textContent = slogan;
  document.title = nome;
}

async function salvarMarcaUI() {
  if (!Permissoes.podeGerenciarUsuarios()) { showToast('Acesso restrito a Administrador', 'var(--iron)'); return; }
  const nome = (qs('#cfg-empresa-nome').value || '').trim() || 'STRACTA';
  const slogan = (qs('#cfg-empresa-slogan').value || '').trim() || 'Controle operacional da frota';
  await DB.setConfig('empresa_nome', nome);
  await DB.setConfig('empresa_slogan', slogan);
  await aplicarMarca();
  renderConfig();
  showToast('✅ Identidade da empresa salva!');
}

// ---------- TEMA CLARO/ESCURO ----------
async function aplicarTemaSalvo() {
  const tema = await DB.getConfig('tema', 'escuro');
  document.documentElement.setAttribute('data-tema', tema);
}

async function alternarTema() {
  const atual = await DB.getConfig('tema', 'escuro');
  const novo = atual === 'escuro' ? 'claro' : 'escuro';
  await DB.setConfig('tema', novo);
  document.documentElement.setAttribute('data-tema', novo);
  showToast(`🎨 Tema ${novo}`);
  renderConfig();
}

// ---------- STATUS DE CONEXÃO ----------
async function atualizarStatusConexao() {
  const pill = qs('#conn-pill');
  if (!pill) return;
  const pendentes = (await Sync.pendentes()).length;
  const online = estaOnline();
  pill.className = 'conn-pill ' + (online ? 'online' : 'offline') + (pendentes ? ' pendente' : '');
  pill.dataset.pend = pendentes ? `${pendentes} pendente${pendentes > 1 ? 's' : ''}` : '';
  qs('#conn-pill .txt').textContent = online ? 'Online' : 'Offline';
}

// Quando chega uma mudança em tempo real (outro aparelho iniciou/concluiu uma
// viagem, por exemplo), atualiza sozinho as telas de Painel se estiverem abertas
// — assim "Em Rota" aparece na hora, sem precisar recarregar manualmente.
function atualizarTelasAoVivo(status) {
  if (!status || status.tipo !== 'tempo_real') return;
  const telaPainel = qs('#screen-painel');
  const telaPainelEquip = qs('#screen-painel-equip');
  if (telaPainel && telaPainel.classList.contains('active')) renderPainel();
  if (telaPainelEquip && telaPainelEquip.classList.contains('active')) renderPainelEquip();
}

// ---------- NAVEGAÇÃO ----------
async function navigate(tela) {
  qsa('.screen').forEach(s => s.classList.remove('active'));
  qsa('.nav-item').forEach(n => n.classList.remove('active'));
  const el = qs(`#screen-${tela}`);
  if (el) el.classList.add('active');
  const nav = qs(`.nav-item[data-tela="${tela}"]`);
  if (nav) nav.classList.add('active');

  const bottomNav = qs('.bottom-nav');
  if (bottomNav) bottomNav.style.display = (tela === 'login') ? 'none' : 'flex';

  if (_viagemTimerHandle && tela !== 'operacao') { clearInterval(_viagemTimerHandle); _viagemTimerHandle = null; }
  if (_paradaTimerHandle && tela !== 'operacao') { clearInterval(_paradaTimerHandle); _paradaTimerHandle = null; }
  if (typeof Mapa !== 'undefined' && tela !== 'mapa') Mapa.fechar();
  if (typeof Areas !== 'undefined' && tela !== 'areas') Areas.fechar();

  const renderers = {
    home: renderHome,
    turno: renderTurno,
    operacao: renderOperacao,
    viagens: renderViagens,
    'lancar-rotas': renderLancarRotas,
    servicos: renderServicos,
    frota: renderFrota,
    painel: renderPainel,
    'painel-equip': renderPainelEquip,
    mapa: renderMapa,
    areas: renderAreas,
    trajeto: renderTrajeto,
    config: renderConfig,
    usuarios: renderUsuarios,
    diagnostico: renderDiagnostico
  };
  if (tela === 'usuarios') {
    if (!Permissoes.podeGerenciarUsuarios()) {
      showToast('Acesso restrito a Administrador', 'var(--iron)');
      qsa('.screen').forEach(s => s.classList.remove('active'));
      qs('#screen-config').classList.add('active');
      return;
    }
  }
  if (tela === 'lancar-rotas') {
    if (!podeGerenciarFrota()) {
      showToast('Acesso restrito a Encarregado, Supervisor, Gerência ou Administrador', 'var(--iron)');
      qsa('.screen').forEach(s => s.classList.remove('active'));
      qs('#screen-viagens').classList.add('active');
      return;
    }
  }
  if (tela === 'diagnostico') {
    if (!Permissoes.podeVerDiagnostico()) {
      showToast('Acesso restrito a Administrador', 'var(--iron)');
      qsa('.screen').forEach(s => s.classList.remove('active'));
      qs('#screen-config').classList.add('active');
      return;
    }
  }
  if (tela === 'mapa') {
    if (!Permissoes.podeVerTudoOperacional()) {
      showToast('Acesso restrito à gestão (Encarregado ou acima)', 'var(--iron)');
      qsa('.screen').forEach(s => s.classList.remove('active'));
      qs('#screen-home').classList.add('active');
      return;
    }
  }
  if (tela === 'areas') {
    if (!Permissoes.podeGerenciarRotas()) {
      showToast('Acesso restrito à gestão (Encarregado ou acima)', 'var(--iron)');
      qsa('.screen').forEach(s => s.classList.remove('active'));
      qs('#screen-home').classList.add('active');
      return;
    }
  }

  if (renderers[tela]) await renderers[tela]();
}

// ---------- LOGIN ----------
async function fazerLogin() {
  const usuario = qs('#login-usuario').value.trim();
  const senha = qs('#login-senha').value;
  if (!usuario || !senha) { showToast('Preencha usuário e senha', 'var(--iron)'); return; }
  const r = await Auth.login(usuario, senha);
  if (!r.sucesso) { showToast(r.erro, 'var(--iron)'); return; }
  showToast(`Bem-vindo, ${r.sessao.nome}!`);
  Log.registrar('login', { usuario: r.sessao.usuario, nivel: r.sessao.nivel });
  _turnoAtivoCache = await Motorista.turnoAtivo();
  navigate('home');

  // sincroniza em segundo plano — a tela não fica esperando o Sheets/Firebase
  // terminarem, só atualiza sozinha se algo novo chegar
  if (estaOnline()) {
    Sync.sincronizarTudo().then(mudou => {
      if (mudou) {
        _turnoAtivoCache = null; // força recalcular, caso o turno tenha vindo de outro aparelho
        const telaAtiva = qs('.screen.active');
        if (telaAtiva && telaAtiva.id === 'screen-home') renderHome();
      }
    });
  }
}

function fazerLogout() {
  Log.registrar('logout');
  if (typeof Rastreamento !== 'undefined') Rastreamento.parar();
  Auth.logout();
  navigate('login');
}

// ---------- HOME ----------
async function renderHome() {
  const u = Auth.usuarioAtual();
  const gestao = Permissoes.podeVerTudoOperacional();
  qs('#home-saudacao').textContent = u ? `Olá, ${u.nome.split(' ')[0]}` : '';
  _turnoAtivoCache = await Motorista.turnoAtivo();
  const box = qs('#home-turno-box');

  // subtítulo por perfil
  const sub = qs('#home-sub');
  if (sub) sub.textContent = gestao ? 'O que você precisa fazer agora?' : 'Bora operar 🚛';

  // atalhos/menus de gestão só aparecem para quem tem permissão
  const btnMapa = qs('#btn-mapa-vivo');
  if (btnMapa) btnMapa.style.display = gestao ? 'flex' : 'none';
  const btnAreas = qs('#btn-areas');
  if (btnAreas) btnAreas.style.display = Permissoes.podeGerenciarRotas() ? 'flex' : 'none';
  const atalhoFrota = qs('#atalho-frota');
  if (atalhoFrota) atalhoFrota.style.display = podeGerenciarFrota() ? '' : 'none';

  // liga ou desliga o rastreamento em tempo real conforme houver turno ativo
  sincronizarRastreamento();

  if (!_turnoAtivoCache) {
    box.innerHTML = `
      <div class="card">
        <div class="card-title">Turno</div>
        <div class="text-label" style="font-size:13px;margin-bottom:12px">Nenhum turno em andamento.</div>
        <button class="btn btn-primary btn-hero" onclick="navigate('turno')">▶️ Iniciar Turno</button>
      </div>`;
  } else {
    const t = _turnoAtivoCache;
    const resumo = await Motorista.resumoTurno(t.id);
    box.innerHTML = `
      <div class="card">
        <div class="card-title">🟢 Turno em andamento</div>
        <div style="font-family:var(--display);font-weight:700;font-size:16px">🚛 ${t.equipamentoCodigo || 'Equipamento'}</div>
        <div class="text-label" style="font-size:12px;margin-top:2px">Iniciado às ${fmtHoraBR(t.iniciadoEm)}</div>
        <div class="stat-tiles cols2">
          <div class="stat-tile hl"><div class="v">${resumo.totalViagens}</div><div class="k">Viagens hoje</div></div>
          <div class="stat-tile"><div class="v">${fmtDuracao(resumo.tempoMedioMs)}</div><div class="k">Tempo médio</div></div>
        </div>
        <button class="btn btn-primary btn-hero" onclick="navigate('operacao')">🗺️ Operar agora</button>
        <button class="btn btn-ghost mt8" style="color:var(--iron)" onclick="abrirEncerrarTurno()">⏹️ Encerrar Turno</button>
      </div>`;
  }
}

// ---------- ENVIAR MINHA LOCALIZAÇÃO ("estou aqui") ----------
// Captura a posição atual do motorista e registra um ponto avulso,
// que sincroniza para a nuvem e fica disponível para a gestão.
async function enviarMinhaLocalizacaoUI() {
  if (typeof Geo === 'undefined' || !Geo.disponivel()) {
    showToast('GPS não disponível neste aparelho', 'var(--iron)');
    return;
  }
  showToast('📍 Obtendo sua localização...', 'var(--amber)', 4000);
  const pos = await Geo.capturar({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  if (!Geo.ehValida(pos)) {
    showToast(`❌ ${pos.mensagem || 'Não foi possível obter a localização'}`, 'var(--iron)', 4500);
    return;
  }
  abrirModalFormulario({
    titulo: '📍 Enviar localização',
    subtitulo: `Posição obtida: ${Geo.formatar(pos)}`,
    campos: [{ id: 'motivo', label: 'Motivo / observação (opcional)', placeholder: 'Ex: parado, quebra, estou aqui...' }],
    textoSalvar: 'Enviar',
    aoSalvar: async ({ motivo }) => {
      const u = Auth.usuarioAtual();
      const t = _turnoAtivoCache || await Motorista.turnoAtivo();
      const registro = {
        id: gerarId('local'),
        tipo: 'localizacao',
        motoristaId: u ? u.id : null,
        motoristaNome: u ? u.nome : null,
        equipamentoId: t ? t.equipamentoId : null,
        equipamentoCodigo: t ? t.equipamentoCodigo : null,
        turnoId: t ? t.id : null,
        lat: pos.lat,
        lng: pos.lng,
        precisao: pos.precisao,
        motivo: motivo || '',
        dia: todayKey(),
        criadoEm: agoraISO()
      };
      await DB.put('localizacoes', registro);
      if (typeof Sync !== 'undefined') Sync.enfileirar('localizacao', registro);
      showToast('✅ Localização enviada!', 'var(--green)');
    }
  });
}

// ---------- MAPA AO VIVO (gestão) ----------
async function renderMapa() {
  if (typeof Mapa === 'undefined') return;
  await Mapa.abrir();
}

// ---------- ÁREAS / POLÍGONOS (gestão) ----------
async function renderAreas() {
  if (typeof Areas === 'undefined') return;
  await Areas.abrir();
}

// ---------- TRAJETO (percurso de uma viagem/deslocamento) ----------
async function abrirTrajetoViagem(id) {
  const v = await DB.get('viagens', id);
  if (!v) return;
  _trajetoData = { reg: v, titulo: v.rotaNome || 'Viagem', tempoMs: v.tempoTotalMs };
  navigate('trajeto');
}
async function abrirTrajetoDeslocamento(id) {
  const d = await DB.get('deslocamentos', id);
  if (!d) return;
  _trajetoData = { reg: d, titulo: `${d.origem || 'Origem'} → ${d.destino || 'destino'}`, tempoMs: d.tempoTotalMs };
  navigate('trajeto');
}

function _distanciaKmPontos(pontos) {
  const R = 6371, toRad = (x) => x * Math.PI / 180;
  let km = 0;
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1], b = pontos[i];
    const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    km += 2 * R * Math.asin(Math.sqrt(s));
  }
  return km;
}

async function renderTrajeto() {
  const info = qs('#trajeto-info');
  if (typeof L === 'undefined') { if (info) info.textContent = 'Mapa indisponível — verifique a internet.'; return; }
  if (!_trajetoData) { navigate('viagens'); return; }
  const reg = _trajetoData.reg;

  if (!_trajetoMap) {
    _trajetoMap = L.map('trajeto-mapa').setView([-15.78, -47.93], 4);
    const ruas = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagens © Esri' });
    const relevo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap' });
    satelite.addTo(_trajetoMap);
    _trajetoAreas = L.layerGroup().addTo(_trajetoMap);
    _trajetoConteudo = L.layerGroup().addTo(_trajetoMap);
    L.control.layers({ '🛰️ Satélite': satelite, '⛰️ Relevo': relevo, '🗺️ Ruas': ruas }, { '📐 Áreas': _trajetoAreas }, { position: 'topright' }).addTo(_trajetoMap);
  }
  setTimeout(() => { if (_trajetoMap) _trajetoMap.invalidateSize(); }, 250);

  // áreas e acessos de contexto
  _trajetoAreas.clearLayers();
  (await DB.getAll('areas')).forEach(a => {
    const pts = Geo.pontosLatLng(a.pontos);
    if (pts.length >= 3) {
      L.polygon(pts, { color: '#12B886', weight: 2, fillColor: '#12B886', fillOpacity: 0.10 })
        .bindTooltip(a.codigo, { permanent: true, direction: 'center', className: 'mk-tooltip' }).addTo(_trajetoAreas);
    }
  });
  (await DB.getAll('acessos')).forEach(ac => {
    const pts = Geo.pontosLatLng(ac.pontos);
    if (pts.length >= 2) {
      L.polyline(pts, { color: '#F0A020', weight: 4, opacity: 0.85 })
        .bindTooltip('🛣️ ' + ac.nome, { permanent: false, direction: 'top', className: 'mk-tooltip' }).addTo(_trajetoAreas);
    }
  });

  // traço do percurso
  _trajetoConteudo.clearLayers();
  const trilha = Array.isArray(reg.trilha) ? reg.trilha.filter(p => p && typeof p.lat === 'number') : [];
  let pontos = trilha.map(p => [p.lat, p.lng]);
  let reta = false;
  if (pontos.length < 2) {
    pontos = [];
    if (reg.localInicio && typeof reg.localInicio.lat === 'number') pontos.push([reg.localInicio.lat, reg.localInicio.lng]);
    if (reg.localFim && typeof reg.localFim.lat === 'number') pontos.push([reg.localFim.lat, reg.localFim.lng]);
    reta = true;
  }

  if (pontos.length >= 2) {
    L.polyline(pontos, { color: '#2b7fff', weight: 4, opacity: 0.9, dashArray: reta ? '6,8' : null }).addTo(_trajetoConteudo);
  }
  if (pontos.length) {
    L.circleMarker(pontos[0], { radius: 8, color: '#fff', weight: 2, fillColor: '#12B886', fillOpacity: 1 }).bindTooltip('Início', { direction: 'top' }).addTo(_trajetoConteudo);
    L.circleMarker(pontos[pontos.length - 1], { radius: 8, color: '#fff', weight: 2, fillColor: '#C1440E', fillOpacity: 1 }).bindTooltip('Fim', { direction: 'top' }).addTo(_trajetoConteudo);
    _trajetoMap.fitBounds(pontos, { padding: [40, 40], maxZoom: 17 });
    const distKm = _distanciaKmPontos(pontos);
    if (info) info.textContent = `${_trajetoData.titulo} • ${fmtDuracao(_trajetoData.tempoMs || 0)}` + (distKm ? ` • ~${distKm.toFixed(2)} km${reta ? ' (linha reta)' : ''}` : '');
  } else {
    if (info) info.textContent = 'Sem localização registrada neste trajeto.';
  }
}

// Liga o rastreamento em tempo real quando há turno ativo; desliga quando não há.
// Chamado sempre que a home é renderizada (login, início e fim de turno passam por lá).
async function sincronizarRastreamento() {
  if (typeof Rastreamento === 'undefined') return;
  const t = _turnoAtivoCache || await Motorista.turnoAtivo();
  if (t) Rastreamento.iniciar(t);
  else Rastreamento.parar();
}

// ---------- INICIAR TURNO ----------
async function renderTurno() {
  const u = Auth.usuarioAtual();
  const equipamentos = await Equipamentos.ativos();
  qs('#turno-equip').innerHTML = '<option value="">Selecione...</option>' +
    equipamentos.map(e => `<option value="${e.id}">${e.codigo} — ${e.modelo}</option>`).join('');
  qs('#turno-km').value = '';
  qs('#turno-horimetro').value = '';
  qs('#turno-motorista-nome').textContent = u ? u.nome : '-';

  // KM/horímetro inicial vem automático do fechamento do turno anterior —
  // só Gerência/Encarregado/Supervisor/Administrador podem editar manualmente
  const podeEditar = Permissoes.nivelPeloMenos('Encarregado');
  qs('#turno-km').readOnly = !podeEditar;
  qs('#turno-horimetro').readOnly = !podeEditar;
  qs('#turno-km-aviso').classList.toggle('hidden', podeEditar);

  qs('#turno-checklist-lista').innerHTML = ITENS_CHECKLIST.map((nome, i) => `
    <div class="checklist-item" id="checklist-item-${i}">
      <div class="checklist-nome">${nome}</div>
      <div class="checklist-toggle">
        <button type="button" class="checklist-btn" onclick="marcarChecklist(${i}, true)">✅ OK</button>
        <button type="button" class="checklist-btn" onclick="marcarChecklist(${i}, false)">⚠️ Problema</button>
      </div>
    </div>
  `).join('');
}

function marcarChecklist(indice, ok) {
  const item = qs(`#checklist-item-${indice}`);
  item.dataset.ok = ok ? 'true' : 'false';
  item.classList.toggle('problema', !ok);
  const btnOk = item.querySelector('.checklist-btn:first-child');
  const btnProblema = item.querySelector('.checklist-btn:last-child');
  btnOk.classList.toggle('ativo-ok', ok);
  btnProblema.classList.toggle('ativo-problema', !ok);

  let campoObs = item.querySelector('.checklist-obs');
  if (!ok) {
    if (!campoObs) {
      campoObs = document.createElement('input');
      campoObs.className = 'checklist-obs';
      campoObs.placeholder = 'O que está errado? (opcional)';
      item.appendChild(campoObs);
      item.style.flexWrap = 'wrap';
    }
  } else if (campoObs) {
    campoObs.remove();
  }
}

function coletarRespostasChecklist() {
  return ITENS_CHECKLIST.map((nome, i) => {
    const item = qs(`#checklist-item-${i}`);
    const obsInput = item.querySelector('.checklist-obs');
    return {
      nome,
      ok: item.dataset.ok === 'true',
      respondido: item.dataset.ok !== undefined,
      observacao: obsInput ? obsInput.value.trim() : ''
    };
  });
}

function preencherKmHorimetroTurno() {
  const sel = qs('#turno-equip');
  const equipId = sel.value;
  DB.get('equipamentos', equipId).then(e => {
    if (!e) return;
    qs('#turno-km').value = e.kmAtual || 0;
    qs('#turno-horimetro').value = e.horimetroAtual || 0;
  });
}

async function confirmarIniciarTurno() {
  const u = Auth.usuarioAtual();
  const equipId = qs('#turno-equip').value;
  const km = qs('#turno-km').value;
  const horimetro = qs('#turno-horimetro').value;
  if (!equipId) { showToast('Selecione um equipamento', 'var(--iron)'); return; }

  const respostasChecklist = coletarRespostasChecklist();
  const faltando = respostasChecklist.filter(r => !r.respondido);
  if (faltando.length) { showToast(`Responda o checklist: falta "${faltando[0].nome}"`, 'var(--iron)'); return; }

  const equip = await DB.get('equipamentos', equipId);
  const resultado = await Motorista.iniciarTurno({
    motoristaId: u.id, motoristaNome: u.nome,
    equipamentoId: equipId, equipamentoCodigo: equip.codigo,
    kmInicial: km, horimetroInicial: horimetro
  });
  if (resultado && resultado.erro) { showToast(resultado.erro, 'var(--iron)'); return; }

  await Checklist.salvar({
    turnoId: resultado.id, equipamentoId: equipId, equipamentoCodigo: equip.codigo,
    motoristaId: u.id, motoristaNome: u.nome, itens: respostasChecklist
  });

  const problemas = respostasChecklist.filter(r => !r.ok);
  if (problemas.length) {
    showToast(`⚠️ ${problemas.length} problema(s) no checklist!`, 'var(--iron)', 4000);
    const nomesProblemas = problemas.map(p => p.nome).join(', ');
    if (confirm(`Problemas encontrados: ${nomesProblemas}.\n\nDeseja enviar o equipamento para manutenção agora?`)) {
      const motivo = `Checklist de pré-uso: ${nomesProblemas}`;
      await Equipamentos.alternarManutencao(equipId, motivo);
      showToast('🔧 Equipamento enviado para manutenção');
    }
  } else {
    showToast('✅ Turno iniciado!');
  }
  navigate('home');
}

async function abrirEncerrarTurno() {
  if (!confirm('Deseja encerrar o turno atual?')) return;
  const t = _turnoAtivoCache;
  const km = prompt('KM final:', t.kmInicial || 0);
  if (km === null) return;
  const horimetro = prompt('Horímetro final:', t.horimetroInicial || 0);
  if (horimetro === null) return;

  const kmNum = Number(km);
  const horimetroNum = Number(horimetro);
  if (isNaN(kmNum) || kmNum < (t.kmInicial || 0)) {
    showToast(`KM final não pode ser menor que o inicial (${t.kmInicial || 0})`, 'var(--iron)');
    return;
  }
  if (isNaN(horimetroNum) || horimetroNum < (t.horimetroInicial || 0)) {
    showToast(`Horímetro final não pode ser menor que o inicial (${t.horimetroInicial || 0})`, 'var(--iron)');
    return;
  }

  await Motorista.encerrarTurno(t.id, { kmFinal: kmNum, horimetroFinal: horimetroNum });
  _setCtxCarregamento(false);
  showToast('🔒 Turno encerrado!');
  navigate('home');
}

// ---------- OPERAÇÃO (rotas + cronômetro) ----------
async function renderOperacao() {
  const area = qs('#operacao-area');
  if (!_turnoAtivoCache) {
    area.innerHTML = `<div class="empty-state"><span class="emoji">🚧</span>Inicie um turno para começar a operar.</div>`;
    return;
  }

  const viagemAtiva = await Operacao.viagemEmAndamento(_turnoAtivoCache.id);
  if (viagemAtiva) {
    renderTimerViagem(viagemAtiva);
    return;
  }

  const deslocAtivo = await Operacao.deslocamentoEmAndamento(_turnoAtivoCache.id);
  if (deslocAtivo) {
    renderTimerDeslocamento(deslocAtivo, deslocAtivo.origem || 'Origem', deslocAtivo.destino || '…', deslocAtivo.motivo);
    return;
  }

  const rotas = await Operacao.listarRotas();
  const rotasDesloc = await Operacao.listarRotasDeslocamento();
  const gestaoRotas = Permissoes.podeGerenciarRotas();
  const podeAtrasado = Permissoes.podeLancarAtrasado();
  const totalAreas = (await DB.getAll('areas')).length;
  const paradaAtiva = await Operacao.paradaEmAndamento(_turnoAtivoCache.id);
  const emCarreg = _emCarregamento();
  const btnsPorGrupo = (grupo) => (typeof TIPOS_PARADA !== 'undefined' ? TIPOS_PARADA : [])
    .filter(tp => tp.grupo === grupo)
    .map(tp => `<button class="btn btn-outline" onclick="iniciarParadaUI('${tp.subtipo}')">${tp.icone} ${tp.nome}${tp.min != null ? ` (${tp.min} min)` : ''}</button>`)
    .join('');
  const paradasBtns = btnsPorGrupo('parada');
  const carregBtns = btnsPorGrupo('carregamento');

  const secaoParadas = `
    <button class="btn btn-paradas mt16" id="btn-paradas" onclick="toggleParadas()">⏱️ Paradas ▾</button>
    <div id="paradas-box" class="hub-grupo hidden">${paradasBtns}</div>`;

  const miolo = emCarreg
    ? `
    <div class="card-title mt16">🏗️ No carregamento</div>
    <div class="hub-grupo">${carregBtns}</div>

    <div class="card-title mt16">📦 Caminhão carregado</div>
    <button class="btn btn-primary btn-hero" onclick="iniciarViagemAutoUI()">🚀 Iniciar viagem</button>

    <div class="card-title mt16">🚛 Caminhão vazio</div>
    <button class="btn btn-secondary" onclick="iniciarDeslocamentoAutoUI('Oficina')">🔧 Deslocamento para oficina</button>
    <button class="btn btn-secondary" onclick="iniciarDeslocamentoAutoUI('Deslocamento')">🚚 Novo deslocamento</button>

    ${secaoParadas}`
    : `
    ${secaoParadas}

    <div class="card-title mt16">🚛 Caminhão vazio</div>
    <button class="btn btn-secondary" onclick="iniciarDeslocamentoAutoUI('Carregamento')">🚚 Deslocamento para carregamento</button>
    <button class="btn btn-secondary" onclick="iniciarDeslocamentoAutoUI('Oficina')">🔧 Deslocamento para oficina</button>
    <button class="btn btn-secondary" onclick="iniciarDeslocamentoAutoUI('Deslocamento')">🚚 Novo deslocamento</button>

    <div class="card-title mt16">📦 Caminhão carregado</div>
    <button class="btn btn-primary btn-hero" onclick="iniciarViagemAutoUI()">🚀 Iniciar viagem</button>`;

  area.innerHTML = `
    ${_turnoAtivoCache.teste ? `
    <div class="card" style="border-color:var(--amber);background:rgba(245,166,35,.10)">
      <div style="font-weight:700;color:var(--amber)">🧪 MODO TESTE</div>
      <div class="text-label" style="font-size:12px;margin-top:2px">Nada disto conta nos relatórios. Ao terminar, encerre e apague os dados de teste.</div>
      <div class="btn-row mt8">
        <button class="btn btn-outline btn-sm" onclick="abrirEncerrarTurno()">⏹️ Encerrar teste</button>
        <button class="btn btn-danger btn-sm" onclick="apagarDadosTesteUI()">🧹 Apagar dados de teste</button>
      </div>
    </div>` : ''}
    <div class="card op-hero">
      <div class="op-hero-equip">🚛 ${_turnoAtivoCache.equipamentoCodigo || 'Equipamento'}</div>
      ${totalAreas === 0 && !_turnoAtivoCache.teste ? `<div class="op-aviso">⚠️ Nenhuma área definida ainda — as rotas sairão como "Local não identificado".</div>` : ''}
    </div>

    <div id="parada-ativa-box"></div>
    ${miolo}

    <button class="btn btn-ghost mt16" id="btn-rotas-manuais" onclick="toggleRotasManuais()">🗺️ Escolher rota manualmente ▾</button>
    <div id="rotas-manuais" class="hidden">
      ${gestaoRotas ? `<button class="btn btn-outline mt8" onclick="abrirNovaRota()">➕ Cadastrar Rota</button>` : ''}
      ${podeAtrasado ? `<button class="btn btn-ghost" onclick="abrirLancamentoAtrasadoUI()">🕐 Lançar Rota Atrasada</button>` : ''}

    <div class="card-title mt16">Rotas</div>
    ${rotas.length ? rotas.map(r => {
      const podeEditar = Permissoes.podeEditarRota(r);
      return `
      <div class="list-item" style="${r.status === 'inativa' ? 'opacity:.55' : ''}">
        <div>
          <div class="li-main">${r.nome}${r.status === 'inativa' ? ' (inativa)' : ''}</div>
          <div class="li-sub">${r.origem} → ${r.destino}${r.material ? ' • ' + r.material : ''}${r.equipamentoCargaCodigo ? ' • Carga: ' + r.equipamentoCargaCodigo : ''}${r.distancia ? ' • ' + r.distancia + ' km' : ''}</div>
          ${r.criadoPorNome ? `<div class="li-sub" style="font-size:11px">Criada por ${r.criadoPorNome}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="li-fav ${r.favorita ? 'on' : ''}" onclick="event.stopPropagation();alternarFavoritaUI('${r.id}')">★</button>
          ${podeEditar ? `<button class="btn btn-outline btn-sm" onclick="alternarStatusRotaUI('${r.id}')">${r.status === 'inativa' ? 'Ativar' : 'Desativar'}</button>` : ''}
          ${podeEditar ? `<button class="li-fav" onclick="apagarRotaUI('${r.id}')">🗑️</button>` : ''}
          ${r.status !== 'inativa' ? `<button class="btn btn-primary btn-sm" onclick="iniciarViagemUI('${r.id}')">Iniciar</button>` : ''}
        </div>
      </div>`;
    }).join('') : `<div class="empty-state"><span class="emoji">🗺️</span>Nenhuma rota cadastrada ainda.</div>`}

    <div class="card-title mt16">🚚 Rotas de Deslocamento</div>
    ${gestaoRotas ? `<button class="btn btn-outline" onclick="abrirNovaRotaDeslocamento()">➕ Cadastrar Rota de Deslocamento</button>` : ''}
    ${rotasDesloc.length ? rotasDesloc.map(r => {
      const podeEditar = Permissoes.podeEditarRota(r);
      return `
      <div class="list-item" style="${r.status === 'inativa' ? 'opacity:.55' : ''}">
        <div>
          <div class="li-main">${r.nome}${r.status === 'inativa' ? ' (inativa)' : ''}</div>
          <div class="li-sub">${r.origem} → ${r.destino}${r.motivo ? ' • ' + r.motivo : ''}</div>
          ${r.criadoPorNome ? `<div class="li-sub" style="font-size:11px">Criada por ${r.criadoPorNome}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="li-fav ${r.favorita ? 'on' : ''}" onclick="event.stopPropagation();alternarFavoritaDeslocUI('${r.id}')">★</button>
          ${podeEditar ? `<button class="btn btn-outline btn-sm" onclick="alternarStatusRotaDeslocUI('${r.id}')">${r.status === 'inativa' ? 'Ativar' : 'Desativar'}</button>` : ''}
          ${podeEditar ? `<button class="li-fav" onclick="apagarRotaDeslocUI('${r.id}')">🗑️</button>` : ''}
          ${r.status !== 'inativa' ? `<button class="btn btn-primary btn-sm" onclick="iniciarDeslocamentoUI('${r.id}')">Iniciar</button>` : ''}
        </div>
      </div>`;
    }).join('') : `<div class="empty-state"><span class="emoji">🚚</span>Nenhuma rota de deslocamento cadastrada ainda.</div>`}
    </div>
  `;

  _renderParadaAtiva(paradaAtiva);
}

// Cronômetro da parada em andamento, no topo do hub. Mostra atraso se passar do previsto.
function _renderParadaAtiva(parada) {
  clearInterval(_paradaTimerHandle);
  const box = qs('#parada-ativa-box');
  if (!box) return;
  if (!parada) { box.innerHTML = ''; return; }
  const previstoMs = parada.tempoPrevistoMin != null ? parada.tempoPrevistoMin * 60000 : null;
  box.innerHTML = `
    <div class="card text-center">
      <div class="card-title">${parada.nome} — em andamento</div>
      <div class="parada-digits" id="parada-digits">00:00</div>
      <div class="text-label" id="parada-info">${previstoMs != null ? 'previsto ' + fmtDuracao(previstoMs) : 'sem tempo definido'}</div>
      <button class="btn btn-danger mt8" onclick="encerrarParadaUI('${parada.id}')">⏹️ Encerrar parada</button>
    </div>`;
  const atualizar = () => {
    const el = qs('#parada-digits');
    if (!el) { clearInterval(_paradaTimerHandle); return; }
    const decorrido = Date.now() - new Date(parada.inicioEm).getTime();
    el.textContent = fmtDuracao(decorrido);
    if (previstoMs != null) {
      const over = decorrido - previstoMs;
      const info = qs('#parada-info');
      if (over > 0) {
        el.classList.add('parada-atraso');
        if (info) info.innerHTML = `<span class="parada-atraso">⚠️ Atraso +${fmtDuracao(over)}</span>`;
      } else {
        el.classList.remove('parada-atraso');
        if (info) info.textContent = `previsto ${fmtDuracao(previstoMs)}`;
      }
    }
  };
  atualizar();
  _paradaTimerHandle = setInterval(atualizar, 1000);
}

async function iniciarParadaUI(subtipo) {
  const t = _turnoAtivoCache;
  if (!t) { showToast('Inicie um turno primeiro', 'var(--iron)'); return; }
  const u = Auth.usuarioAtual();
  const ativa = await Operacao.paradaEmAndamento(t.id);
  if (ativa) await Operacao.finalizarParada(ativa.id); // só uma parada por vez
  await Operacao.iniciarParada({
    turnoId: t.id, motoristaId: u.id, motoristaNome: u.nome,
    equipamentoId: t.equipamentoId, equipamentoCodigo: t.equipamentoCodigo, subtipo, teste: !!t.teste
  });
  renderOperacao();
}

async function encerrarParadaUI(id) {
  const p = await Operacao.finalizarParada(id);
  clearInterval(_paradaTimerHandle);
  if (p) showToast(`⏹️ ${p.nome} — ${fmtDuracao(p.tempoTotalMs)}${p.atrasoMs > 0 ? ' (atraso +' + fmtDuracao(p.atrasoMs) + ')' : ''}`);
  renderOperacao();
}

// Finaliza a parada ativa (se houver) ao iniciar uma viagem/deslocamento.
async function _finalizarParadaSePreciso() {
  if (!_turnoAtivoCache) return;
  const ativa = await Operacao.paradaEmAndamento(_turnoAtivoCache.id);
  if (ativa) { await Operacao.finalizarParada(ativa.id); clearInterval(_paradaTimerHandle); }
}

// Mostra/esconde as opções de parada (particular, inspeção, limpeza).
function toggleParadas() {
  const box = qs('#paradas-box');
  const btn = qs('#btn-paradas');
  if (!box) return;
  const escondido = box.classList.toggle('hidden');
  if (btn) btn.innerHTML = `⏱️ Paradas ${escondido ? '▾' : '▴'}`;
}

// Mostra/esconde a seção de rotas manuais (plano B — o padrão é a rota automática por GPS)
function toggleRotasManuais() {
  const box = qs('#rotas-manuais');
  const btn = qs('#btn-rotas-manuais');
  if (!box) return;
  const escondido = box.classList.toggle('hidden');
  if (btn) btn.innerHTML = `🗺️ Escolher rota manualmente ${escondido ? '▾' : '▴'}`;
}

function renderTimerViagem(viagem) {
  const area = qs('#operacao-area');
  area.innerHTML = `
    <div class="timer-wrap">
      <div class="timer-rota">${viagem.rotaNome}</div>
      <div class="timer-ring" id="timer-ring">
        <svg width="220" height="220">
          <circle class="track" cx="110" cy="110" r="96" stroke-width="10" fill="none"/>
          <circle class="progress" id="timer-circle" cx="110" cy="110" r="96" stroke-width="10" fill="none"
            stroke-dasharray="603" stroke-dashoffset="603"/>
        </svg>
        <div class="timer-digits" id="timer-digits">00:00</div>
        <div class="timer-label">em viagem</div>
      </div>
      <div class="timer-actions">
        <button class="btn btn-primary" onclick="descarregarUI('${viagem.id}')">📦 Descarregar</button>
      </div>
    </div>
  `;

  clearInterval(_viagemTimerHandle);
  const referenciaPromise = viagem.rotaId
    ? Operacao.estatisticasRota(viagem.rotaId, viagem.dia)
    : Promise.resolve({ tempoMedioMs: 0 });
  const raio = 96, circ = 2 * Math.PI * raio;

  const atualizar = async () => {
    const stats = await referenciaPromise;
    const referenciaMs = stats.tempoMedioMs || (20 * 60 * 1000);
    const decorridoMs = Date.now() - new Date(viagem.inicioEm).getTime();
    const digits = qs('#timer-digits');
    digits.textContent = fmtDuracao(decorridoMs);
    const excedeu = stats.tempoMedioMs > 0 && decorridoMs > referenciaMs;
    digits.classList.toggle('over', excedeu);
    const fracao = Math.min(decorridoMs / referenciaMs, 1);
    const offset = circ * (1 - fracao);
    const circle = qs('#timer-circle');
    if (circle) {
      circle.style.strokeDasharray = circ;
      circle.style.strokeDashoffset = offset;
      circle.classList.toggle('over', excedeu);
    }
  };
  atualizar();
  _viagemTimerHandle = setInterval(atualizar, 1000);
}

async function iniciarViagemUI(rotaId) {
  const rota = await DB.get('rotas', rotaId);
  const u = Auth.usuarioAtual();
  const t = _turnoAtivoCache;
  await Operacao.iniciarViagem({
    turnoId: t.id, motoristaId: u.id, motoristaNome: u.nome,
    equipamentoId: t.equipamentoId, equipamentoCodigo: t.equipamentoCodigo,
    rotaId: rota.id, rotaNome: rota.nome, teste: !!t.teste
  });
  renderOperacao();
}

// Compara o tempo atual com o recorde (menor tempo) do trajeto e devolve
// a mensagem/cor de feedback (recompensa ou aviso). Null nunca — sempre retorna algo.
function _feedbackRecorde(atualMs, recordeMs) {
  if (!recordeMs || recordeMs <= 0) {
    return { msg: `⏱️ Primeiro tempo neste trajeto: ${fmtDuracao(atualMs)}`, cor: 'var(--blue)', dur: 4000 };
  }
  if (atualMs < recordeMs) {
    return { msg: `🏆 Novo recorde! ${fmtDuracao(recordeMs - atualMs)} abaixo do melhor tempo`, cor: 'var(--green)', dur: 5000 };
  }
  if (atualMs > recordeMs) {
    return { msg: `🔴 ${fmtDuracao(atualMs - recordeMs)} acima do melhor tempo (${fmtDuracao(recordeMs)})`, cor: 'var(--iron)', dur: 4500 };
  }
  return { msg: '🎯 Empatou o melhor tempo!', cor: 'var(--green)', dur: 4000 };
}

// Captura a posição atual e já identifica (offline) a área em que ela cai.
async function _capturarLocalAtual() {
  if (typeof Geo === 'undefined' || !Geo.disponivel()) return null;
  const pos = await Geo.capturar({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  if (!Geo.ehValida(pos)) return null;
  const area = await Geo.codigoAreaDePonto(pos.lat, pos.lng);
  if (area) pos.area = area;
  return pos;
}

// ---------- VIAGEM / DESLOCAMENTO AUTOMÁTICOS (por GPS) ----------
async function iniciarViagemAutoUI() {
  const t = _turnoAtivoCache;
  if (!t) { showToast('Inicie um turno primeiro', 'var(--iron)'); return; }
  _setCtxCarregamento(false); // ciclo de carregamento encerrado ao sair em viagem
  await _finalizarParadaSePreciso();
  const u = Auth.usuarioAtual();
  showToast('📍 Obtendo localização de origem...', 'var(--amber)', 4000);
  const pos = await _capturarLocalAtual();
  if (!pos) showToast('Sem GPS agora — a viagem inicia sem origem identificada', 'var(--iron)', 3500);
  await Operacao.iniciarViagemAutomatica({
    turnoId: t.id, motoristaId: u.id, motoristaNome: u.nome,
    equipamentoId: t.equipamentoId, equipamentoCodigo: t.equipamentoCodigo,
    posInicio: pos, teste: !!t.teste
  });
  showToast(pos && pos.area ? `🚀 Viagem iniciada em ${pos.area}` : '🚀 Viagem iniciada');
  renderOperacao();
}

async function iniciarDeslocamentoAutoUI(motivo, destinoEsperado) {
  const t = _turnoAtivoCache;
  if (!t) { showToast('Inicie um turno primeiro', 'var(--iron)'); return; }
  // Deslocamento para carregamento tem um destino esperado (ponto de carregamento).
  if (motivo === 'Carregamento' && !destinoEsperado) {
    destinoEsperado = await Operacao.ultimoPontoCarregamento(t.id);
    if (!destinoEsperado) {
      const areas = await DB.getAll('areas');
      if (areas.length) {
        abrirModalFormulario({
          titulo: '🏗️ Ponto de carregamento',
          subtitulo: 'Para qual área você vai carregar?',
          campos: [{ id: 'area', label: 'Área de carregamento', tipo: 'select', valor: areas[0].codigo, opcoes: areas.map(a => ({ valor: a.codigo, texto: a.codigo })) }],
          textoSalvar: 'Iniciar deslocamento',
          aoSalvar: ({ area }) => _iniciarDeslocAuto('Carregamento', area)
        });
        return;
      }
    }
  }
  _iniciarDeslocAuto(motivo, destinoEsperado);
}

async function _iniciarDeslocAuto(motivo, destinoEsperado) {
  const t = _turnoAtivoCache;
  if (!t) return;
  await _finalizarParadaSePreciso();
  _setCtxCarregamento(false);
  showToast('📍 Obtendo localização de origem...', 'var(--amber)', 4000);
  const pos = await _capturarLocalAtual();
  if (!pos) showToast('Sem GPS agora — o deslocamento inicia sem origem identificada', 'var(--iron)', 3500);
  const d = await Operacao.iniciarDeslocamentoAutomatico({
    turnoId: t.id, motoristaId: t.motoristaId, equipamentoId: t.equipamentoId,
    posInicio: pos, motivo: motivo || '', destinoEsperado: destinoEsperado || null, teste: !!t.teste
  });
  showToast(pos && pos.area ? `🚚 Deslocamento iniciado em ${pos.area}` : '🚚 Deslocamento iniciado');
  renderTimerDeslocamento(d, d.origem || 'Origem', destinoEsperado || '…', d.motivo || '');
}

async function descarregarUI(viagemId) {
  const atual = await DB.get('viagens', viagemId);
  let viagem;
  if (atual && atual.automatica) {
    showToast('📍 Obtendo localização de destino...', 'var(--amber)', 4000);
    const pos = await _capturarLocalAtual();
    viagem = await Operacao.descarregarAutomatica(viagemId, pos);
  } else {
    viagem = await Operacao.descarregar(viagemId);
  }
  _ultimaViagemConcluidaId = viagem.id;
  showToast(`✅ Viagem concluída — ${fmtDuracao(viagem.tempoTotalMs)}`);
  clearInterval(_viagemTimerHandle);
  // recompensa/aviso comparando com o melhor tempo (recorde) do trajeto
  const recorde = await Operacao.melhorTempoRota(viagem.rotaId, viagem.id);
  const fb = _feedbackRecorde(viagem.tempoTotalMs, recorde);
  setTimeout(() => showToast(fb.msg, fb.cor, fb.dur), 400);
  // Inicia automaticamente o deslocamento para carregamento; o destino esperado
  // é onde esta viagem carregou (origemArea). Há botão "Preciso parar / oficina".
  iniciarDeslocamentoAutoUI('Carregamento', viagem.origemArea);
}

async function repetirViagemUI(viagemId) {
  await Operacao.repetirViagem(viagemId);
  renderOperacao();
}

async function abrirNovaRota() {
  if (!Permissoes.podeGerenciarRotas()) { showToast('Apenas a gestão pode cadastrar rotas', 'var(--iron)'); return; }
  abrirModalFormulario({
    titulo: '➕ Cadastrar Rota',
    subtitulo: 'Preencha os dados da rota de viagem',
    campos: [
      { id: 'nome', label: 'Nome da rota', placeholder: 'Ex: F01 → Britador' },
      { id: 'origem', label: 'Origem', placeholder: 'Ex: Frente 01' },
      { id: 'destino', label: 'Destino', placeholder: 'Ex: Britador' },
      { id: 'material', label: 'Material transportado', placeholder: 'Ex: Minério' },
      { id: 'cargaCodigo', label: 'Equipamento de carga (código)', placeholder: 'Ex: PC-02 — opcional' },
      { id: 'distancia', label: 'Distância (km)', tipo: 'number', placeholder: 'Opcional' }
    ],
    aoSalvar: async (v) => {
      if (!v.nome) { showToast('Informe o nome da rota', 'var(--iron)'); return; }
      let equipamentoCargaId = '', equipamentoCargaCodigo = '';
      if (v.cargaCodigo) {
        const equipamentos = await Equipamentos.listar();
        const encontrado = equipamentos.find(e => e.codigo.toLowerCase() === v.cargaCodigo.toLowerCase());
        if (encontrado) { equipamentoCargaId = encontrado.id; equipamentoCargaCodigo = encontrado.codigo; }
        else { equipamentoCargaCodigo = v.cargaCodigo; }
      }
      const res = await Operacao.salvarRota({
        nome: v.nome, origem: v.origem, destino: v.destino, material: v.material,
        equipamentoCargaId, equipamentoCargaCodigo, distancia: v.distancia
      });
      if (res && res.erro) { showToast(res.erro, 'var(--iron)'); return; }
      showToast('✅ Rota cadastrada!');
      renderOperacao();
    }
  });
}

function alternarStatusRotaUI(id) {
  Operacao.alternarStatusRota(id).then(r => {
    if (r && r.erro) { showToast(r.erro, 'var(--iron)'); return; }
    renderOperacao();
  });
}

async function apagarRotaUI(id) {
  if (!confirm('Apagar esta rota?')) return;
  const r = await Operacao.removerRota(id);
  if (r && r.erro) { showToast(r.erro, 'var(--iron)'); return; }
  showToast('🗑️ Rota apagada');
  renderOperacao();
}

function alternarFavoritaUI(id) {
  Operacao.alternarFavorita(id).then(renderOperacao);
}

// ---------- LANÇAMENTO ATRASADO (viagem ou deslocamento esquecido) ----------
async function abrirLancamentoAtrasadoUI() {
  if (!Permissoes.podeLancarAtrasado()) { showToast('Apenas a gestão pode fazer lançamento atrasado', 'var(--iron)'); return; }
  if (!_turnoAtivoCache) { showToast('Inicie um turno primeiro', 'var(--iron)'); return; }

  const tipoTxt = prompt('Lançar rota atrasada de:\n1) Viagem\n2) Deslocamento\n\nDigite 1 ou 2:');
  if (tipoTxt === null) return;
  const tipo = tipoTxt.trim();

  if (tipo === '1') {
    await lancarViagemAtrasadaUI();
  } else if (tipo === '2') {
    await lancarDeslocamentoAtrasadoUI();
  } else {
    showToast('Opção inválida', 'var(--iron)');
  }
}

function _horaParaISOHoje(horaTxt) {
  if (!horaTxt || !/^\d{1,2}:\d{2}$/.test(horaTxt.trim())) return null;
  const hoje = new Date().toISOString().slice(0, 10);
  return new Date(`${hoje}T${horaTxt.trim()}:00`).toISOString();
}

async function lancarViagemAtrasadaUI() {
  const rotas = (await Operacao.listarRotas()).filter(r => r.status !== 'inativa');
  if (!rotas.length) { showToast('Nenhuma rota cadastrada', 'var(--iron)'); return; }

  const lista = rotas.map((r, i) => `${i + 1}) ${r.nome} (${r.origem} → ${r.destino})`).join('\n');
  const escolhaTxt = prompt(`Qual rota?\n${lista}\n\nDigite o número:`);
  if (escolhaTxt === null) return;
  const idx = parseInt(escolhaTxt.trim()) - 1;
  const rota = rotas[idx];
  if (!rota) { showToast('Rota inválida', 'var(--iron)'); return; }

  const horaInicioTxt = prompt('Horário de início (ex: 08:15):');
  if (horaInicioTxt === null) return;
  const horaFimTxt = prompt('Horário de término (ex: 08:40):');
  if (horaFimTxt === null) return;

  const inicioEm = _horaParaISOHoje(horaInicioTxt);
  const fimEm = _horaParaISOHoje(horaFimTxt);
  if (!inicioEm || !fimEm) { showToast('Horário inválido — use o formato HH:MM', 'var(--iron)'); return; }
  if (new Date(fimEm) <= new Date(inicioEm)) { showToast('Horário de término deve ser depois do início', 'var(--iron)'); return; }

  const t = _turnoAtivoCache;
  await Operacao.lancarViagemAtrasada({
    turnoId: t.id, motoristaId: t.motoristaId, motoristaNome: t.motoristaNome,
    equipamentoId: t.equipamentoId, equipamentoCodigo: t.equipamentoCodigo,
    rotaId: rota.id, rotaNome: rota.nome, inicioEm, fimEm
  });
  showToast('✅ Viagem atrasada lançada!');
  renderOperacao();
}

async function lancarDeslocamentoAtrasadoUI() {
  const rotas = (await Operacao.listarRotasDeslocamento()).filter(r => r.status !== 'inativa');
  if (!rotas.length) { showToast('Nenhuma rota de deslocamento cadastrada', 'var(--iron)'); return; }

  const lista = rotas.map((r, i) => `${i + 1}) ${r.nome} (${r.origem} → ${r.destino})`).join('\n');
  const escolhaTxt = prompt(`Qual rota de deslocamento?\n${lista}\n\nDigite o número:`);
  if (escolhaTxt === null) return;
  const idx = parseInt(escolhaTxt.trim()) - 1;
  const rota = rotas[idx];
  if (!rota) { showToast('Rota inválida', 'var(--iron)'); return; }

  const horaInicioTxt = prompt('Horário de início (ex: 08:15):');
  if (horaInicioTxt === null) return;
  const horaFimTxt = prompt('Horário de término (ex: 08:40):');
  if (horaFimTxt === null) return;

  const inicioEm = _horaParaISOHoje(horaInicioTxt);
  const fimEm = _horaParaISOHoje(horaFimTxt);
  if (!inicioEm || !fimEm) { showToast('Horário inválido — use o formato HH:MM', 'var(--iron)'); return; }
  if (new Date(fimEm) <= new Date(inicioEm)) { showToast('Horário de término deve ser depois do início', 'var(--iron)'); return; }

  const t = _turnoAtivoCache;
  await Operacao.lancarDeslocamentoAtrasado({
    turnoId: t.id, motoristaId: t.motoristaId, equipamentoId: t.equipamentoId,
    rotaDeslocId: rota.id, inicioEm, fimEm
  });
  showToast('✅ Deslocamento atrasado lançado!');
  renderOperacao();
}

function abrirNovaRotaDeslocamento() {
  if (!Permissoes.podeGerenciarRotas()) { showToast('Apenas a gestão pode cadastrar rotas de deslocamento', 'var(--iron)'); return; }
  abrirModalFormulario({
    titulo: '➕ Cadastrar Rota de Deslocamento',
    subtitulo: 'Deslocamento sem carga — não conta como produção',
    campos: [
      { id: 'origem', label: 'Origem', placeholder: 'Ex: Oficina' },
      { id: 'destino', label: 'Destino', placeholder: 'Ex: Frente 01' },
      { id: 'motivo', label: 'Motivo', placeholder: 'Ex: Início de turno' },
      { id: 'nome', label: 'Nome da rota (opcional)', placeholder: 'Deixe em branco para gerar automático' }
    ],
    aoSalvar: (v) => {
      if (!v.origem) { showToast('Informe a origem', 'var(--iron)'); return; }
      const nome = v.nome || `${v.origem} -> ${v.destino}`;
      Operacao.salvarRotaDeslocamento({ nome, origem: v.origem, destino: v.destino, motivo: v.motivo }).then((res) => {
        if (res && res.erro) { showToast(res.erro, 'var(--iron)'); return; }
        showToast('✅ Rota de deslocamento cadastrada!');
        renderOperacao();
      });
    }
  });
}

function alternarFavoritaDeslocUI(id) {
  Operacao.alternarFavoritaDeslocamento(id).then(renderOperacao);
}

function alternarStatusRotaDeslocUI(id) {
  Operacao.alternarStatusRotaDeslocamento(id).then(r => {
    if (r && r.erro) { showToast(r.erro, 'var(--iron)'); return; }
    renderOperacao();
  });
}

async function apagarRotaDeslocUI(id) {
  if (!confirm('Apagar esta rota de deslocamento?')) return;
  const r = await Operacao.removerRotaDeslocamento(id);
  if (r && r.erro) { showToast(r.erro, 'var(--iron)'); return; }
  showToast('🗑️ Rota de deslocamento apagada');
  renderOperacao();
}

async function iniciarDeslocamentoUI(rotaDeslocId) {
  const rota = await DB.get('rotasDeslocamento', rotaDeslocId);
  if (!rota) return;
  const t = _turnoAtivoCache;
  const d = await Operacao.iniciarDeslocamento({
    turnoId: t.id, motoristaId: t.motoristaId, equipamentoId: t.equipamentoId,
    origem: rota.origem, destino: rota.destino, motivo: rota.motivo, teste: !!t.teste
  });
  showToast('🚚 Deslocamento iniciado');
  renderTimerDeslocamento(d, rota.origem, rota.destino, rota.motivo);
}

function renderTimerDeslocamento(d, origem, destino, motivo) {
  const area = qs('#operacao-area');
  area.innerHTML = `
    <div class="card text-center">
      <div class="card-title">🚚 Deslocamento em andamento</div>
      <div class="text-label mt8">${origem} → ${destino}</div>
      ${motivo ? `<div class="text-label" style="font-size:12px">${motivo}</div>` : ''}
      <div style="font-family:var(--mono);font-size:30px;font-weight:700;margin:14px 0" id="desloc-digits">00:00</div>
      <button class="btn btn-primary" onclick="finalizarDeslocamentoUI('${d.id}')">🏁 Finalizar Deslocamento</button>
      ${motivo === 'Carregamento' ? `<button class="btn btn-outline mt8" onclick="pararParaHub('${d.id}')">⏸️ Preciso parar / ir pra oficina</button>` : ''}
      <button class="btn btn-danger mt8" onclick="cancelarDeslocamentoUI('${d.id}')">✖ Cancelar</button>
    </div>`;

  clearInterval(_viagemTimerHandle);
  const atualizar = () => {
    const el = qs('#desloc-digits');
    if (!el) { clearInterval(_viagemTimerHandle); return; }
    el.textContent = fmtDuracao(Date.now() - new Date(d.inicioEm).getTime());
  };
  atualizar();
  _viagemTimerHandle = setInterval(atualizar, 1000);
}

async function finalizarDeslocamentoUI(id) {
  const atual = await DB.get('deslocamentos', id);
  let d;
  if (atual && atual.automatica) {
    showToast('📍 Obtendo localização de destino...', 'var(--amber)', 4000);
    const pos = await _capturarLocalAtual();
    d = await Operacao.finalizarDeslocamentoAutomatico(id, pos);
  } else {
    d = await Operacao.finalizarDeslocamento(id);
  }
  clearInterval(_viagemTimerHandle);
  showToast(`✅ Deslocamento finalizado — ${fmtDuracao(d.tempoTotalMs)}`);
  // recompensa/aviso comparando com o melhor tempo (recorde) do mesmo trajeto
  const recorde = await Operacao.melhorTempoDeslocamento(d.origem, d.destino, d.id);
  const fb = _feedbackRecorde(d.tempoTotalMs, recorde);
  setTimeout(() => showToast(fb.msg, fb.cor, fb.dur), 400);
  // aviso de "saiu da rota" (chegou numa área diferente da esperada)
  if (d.saiuDaRota) {
    setTimeout(() => showToast(`⚠️ Saiu da rota — esperado ${d.destinoEsperado}, chegou em ${d.destino}`, 'var(--iron)', 5500), 900);
  }
  // se foi um deslocamento para carregamento, entra no contexto "no carregamento"
  _setCtxCarregamento(d.motivo === 'Carregamento');
  renderOperacao();
}

async function cancelarDeslocamentoUI(id) {
  if (!confirm('Cancelar este deslocamento?')) return;
  clearInterval(_viagemTimerHandle);
  await Operacao.removerDeslocamento(id);
  showToast('✖ Deslocamento cancelado');
  renderOperacao();
}

// Desvia do deslocamento para carregamento (para parar ou ir pra oficina):
// remove o deslocamento em curso, sem confirmação, e volta ao hub vazio.
async function pararParaHub(id) {
  clearInterval(_viagemTimerHandle);
  _setCtxCarregamento(false);
  await Operacao.removerDeslocamento(id);
  renderOperacao();
}

// ---------- VIAGENS (histórico) ----------
async function renderViagens() {
  qs('#btn-lancar-rotas').classList.toggle('hidden', !podeGerenciarFrota());

  const eqBox = qs('#viagens-equip');
  const campoDia = qs('#viagens-dia') ? qs('#viagens-dia').closest('.field') : null;
  const resumoBox = qs('#viagens-resumo');
  const tituloHist = qs('#viagens-hist-titulo');
  const listaBox = qs('#viagens-lista');
  const gestao = Permissoes.podeVerTudoOperacional();

  if (gestao) {
    // Gestão: SÓ os cartões dos equipamentos → entra no cartão para ver o histórico.
    if (campoDia) campoDia.classList.add('hidden');
    if (resumoBox) resumoBox.classList.add('hidden');
    if (tituloHist) tituloHist.classList.add('hidden');
    if (listaBox) { listaBox.classList.add('hidden'); listaBox.innerHTML = ''; }
    if (eqBox) {
      const porEquip = await Dashboard.resumoPorEquipamento();
      eqBox.innerHTML = `<div class="card-title">🚛 Por equipamento</div>${_htmlGridEquip(porEquip, 'viagens')}`;
    }
    return;
  }

  // Motorista: linha do tempo pessoal (viagens, deslocamentos, paradas, abastecimentos) + médias.
  if (eqBox) eqBox.innerHTML = '';
  if (campoDia) campoDia.classList.remove('hidden');
  if (resumoBox) resumoBox.classList.remove('hidden');
  if (tituloHist) { tituloHist.classList.remove('hidden'); tituloHist.textContent = 'Meu histórico'; }
  if (listaBox) listaBox.classList.remove('hidden');

  const dias = await Viagens.diasComRegistro();
  const selDia = qs('#viagens-dia');
  const diaAtual = todayKey();
  const todosDias = [...new Set([diaAtual, ...dias])];
  selDia.innerHTML = todosDias.map(d => `<option value="${d}" ${d === diaAtual ? 'selected' : ''}>${d}</option>`).join('');

  await renderTimelineMotorista(diaAtual);
}

async function renderListaViagensDoDia(dia) {
  let [viagens, deslocamentos, stats] = await Promise.all([
    Viagens.historicoDoDia(dia),
    Operacao.deslocamentosDoDia(dia),
    Viagens.totalPorDia(dia)
  ]);

  // Motorista só enxerga os próprios registros; demais perfis veem tudo
  viagens = Permissoes.filtrarPorVisibilidade(viagens, 'motoristaId');
  deslocamentos = Permissoes.filtrarPorVisibilidade(deslocamentos, 'motoristaId');
  if (!Permissoes.podeVerTudoOperacional()) {
    const totalViagensConcluidas = viagens.filter(v => v.status === 'concluida');
    const tempoTotalMs = totalViagensConcluidas.reduce((a, v) => a + (v.tempoTotalMs || 0), 0);
    stats = { totalViagens: totalViagensConcluidas.length, tempoMedioMs: totalViagensConcluidas.length ? tempoTotalMs / totalViagensConcluidas.length : 0 };
  }

  qs('#viagens-resumo').innerHTML = `
    <div class="row-kv"><span class="k">Viagens concluídas</span><span class="v">${stats.totalViagens}</span></div>
    <div class="row-kv"><span class="k">Tempo médio</span><span class="v">${fmtDuracao(stats.tempoMedioMs)}</span></div>
    <div class="row-kv"><span class="k">Deslocamentos</span><span class="v">${deslocamentos.length}</span></div>`;

  const itensViagem = viagens.map(v => ({ tipo: 'viagem', dado: v, quando: v.inicioEm }));
  const itensDesloc = deslocamentos.map(d => ({ tipo: 'deslocamento', dado: d, quando: d.inicioEm }));
  const itens = [...itensViagem, ...itensDesloc].sort((a, b) => new Date(b.quando) - new Date(a.quando));

  qs('#viagens-lista').innerHTML = itens.length ? itens.map(item => {
    if (item.tipo === 'viagem') {
      const v = item.dado;
      return `
      <div class="list-item">
        <div>
          <div class="li-main">${v.rotaNome}</div>
          <div class="li-sub">${v.motoristaNome} • ${v.equipamentoCodigo} • ${fmtHoraBR(v.inicioEm)}${v.descarregadoEm ? ' → ' + fmtHoraBR(v.descarregadoEm) : ' (em andamento)'}${v.editadoEm ? ' • ✏️ editada' : ''}${v.lancamentoManual ? ' • 🕐 lançamento atrasado' : ''}${typeof Geo !== 'undefined' && v.localInicio ? ' • ' + Geo.chipMapa(v.localInicio, '📍 ' + (v.localInicio.area || 'início')) : ''}${typeof Geo !== 'undefined' && v.localFim ? ' → ' + Geo.chipMapa(v.localFim, '📍 ' + (v.localFim.area || 'fim')) : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="v" style="font-family:var(--mono)">${v.tempoTotalMs ? fmtDuracao(v.tempoTotalMs) : '—'}</div>
          ${(v.trilha && v.trilha.length >= 2) || (v.localInicio && v.localFim) ? `<button class="li-fav" onclick="abrirTrajetoViagem('${v.id}')" title="Ver trajeto">🗺️</button>` : ''}
          <button class="li-fav" onclick="editarViagemUI('${v.id}')">✏️</button>
          <button class="li-fav" onclick="apagarViagemUI('${v.id}')">🗑️</button>
        </div>
      </div>`;
    } else {
      const d = item.dado;
      return `
      <div class="list-item" style="opacity:.8;border-style:dashed">
        <div>
          <div class="li-main">🚚 Deslocamento — ${d.origem} → ${d.destino}</div>
          <div class="li-sub">${d.motivo ? d.motivo + ' • ' : ''}${fmtHoraBR(d.inicioEm)}${d.fimEm ? ' → ' + fmtHoraBR(d.fimEm) : ' (em andamento)'} • não conta como produção${d.lancamentoManual ? ' • 🕐 lançamento atrasado' : ''}${typeof Geo !== 'undefined' && d.localInicio ? ' • ' + Geo.chipMapa(d.localInicio, '📍 ' + (d.localInicio.area || 'início')) : ''}${typeof Geo !== 'undefined' && d.localFim ? ' → ' + Geo.chipMapa(d.localFim, '📍 ' + (d.localFim.area || 'fim')) : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="v" style="font-family:var(--mono)">${d.tempoTotalMs ? fmtDuracao(d.tempoTotalMs) : '—'}</div>
          ${(d.trilha && d.trilha.length >= 2) || (d.localInicio && d.localFim) ? `<button class="li-fav" onclick="abrirTrajetoDeslocamento('${d.id}')" title="Ver trajeto">🗺️</button>` : ''}
          <button class="li-fav" onclick="apagarDeslocamentoUI('${d.id}')">🗑️</button>
        </div>
      </div>`;
    }
  }).join('') : `<div class="empty-state"><span class="emoji">📭</span>Nenhum registro neste dia.</div>`;
}

// Uma viagem é "não identificada" quando a origem/destino não caíram em nenhuma área
// (rotaNome sai como "... → Local não identificado"). Só nesse caso o motorista pode editá-la.
function _viagemNaoIdentificada(v) {
  return !!v && /n[ãa]o identificad/i.test(v.rotaNome || '');
}

// Linha do tempo pessoal do motorista: tudo dele (viagens, deslocamentos, paradas,
// abastecimentos) em ordem cronológica, com as médias do turno no topo.
async function renderTimelineMotorista(dia) {
  const u = Auth.usuarioAtual();
  const uid = u ? u.id : null;

  let [viagens, deslocamentos, paradas, abasts, medias] = await Promise.all([
    Viagens.historicoDoDia(dia),
    Operacao.deslocamentosDoDia(dia),
    Operacao.paradasDoDia(dia),
    Abastecimento.doDia(dia),
    uid ? Dashboard.resumoMotorista(uid) : Promise.resolve(null)
  ]);

  // Só os registros do próprio motorista
  viagens = Permissoes.filtrarPorVisibilidade(viagens, 'motoristaId');
  deslocamentos = Permissoes.filtrarPorVisibilidade(deslocamentos, 'motoristaId');
  paradas = Permissoes.filtrarPorVisibilidade(paradas, 'motoristaId');
  abasts = (abasts || []).filter(a => !uid || a.motoristaId === uid);

  // Resumo com médias
  const concl = viagens.filter(v => v.status === 'concluida');
  const tempoMedio = concl.length ? concl.reduce((a, v) => a + (v.tempoTotalMs || 0), 0) / concl.length : 0;
  const mediaKmL = medias && medias.mediaKmL != null ? _fmtNum(medias.mediaKmL, 2) + ' km/L' : '—';
  const mediaLh = medias && medias.mediaLh != null ? _fmtNum(medias.mediaLh, 2) + ' L/h' : '—';
  qs('#viagens-resumo').innerHTML = `
    <div class="row-kv"><span class="k">Viagens concluídas</span><span class="v">${concl.length}</span></div>
    <div class="row-kv"><span class="k">Tempo médio</span><span class="v">${fmtDuracao(tempoMedio)}</span></div>
    <div class="row-kv"><span class="k">Deslocamentos</span><span class="v">${deslocamentos.length}</span></div>
    <div class="row-kv"><span class="k">Média consumo</span><span class="v">${mediaKmL}</span></div>
    <div class="row-kv"><span class="k">Média por hora</span><span class="v">${mediaLh}</span></div>`;

  // Resumo por trajeto do dia + melhor tempo por trajeto (p/ marcar recorde 🏆)
  const resumo = _resumoPorTrajeto(concl);
  const melhorPorTrajeto = {};
  resumo.forEach(t => { melhorPorTrajeto[t.trajeto] = t.melhorMs; });

  // Itens cronológicos (linha do tempo com trilho)
  const itens = [];
  viagens.forEach(v => {
    const podeEditar = _viagemNaoIdentificada(v);
    const temTrajeto = (v.trilha && v.trilha.length >= 2) || (v.localInicio && v.localFim);
    const recorde = v.tempoTotalMs && melhorPorTrajeto[v.rotaNome] === v.tempoTotalMs;
    itens.push({
      quando: v.inicioEm, cls: 'v',
      t: `🚛 ${v.rotaNome}`,
      s: `${v.equipamentoCodigo || ''} · ${fmtHoraBR(v.inicioEm)}${v.descarregadoEm ? ' → ' + fmtHoraBR(v.descarregadoEm) : ' (em andamento)'}${v.editadoEm ? ' · ✏️ editada' : ''}`,
      durHtml: _durBadge(v.tempoTotalMs, recorde ? 'good' : ''),
      actionsHtml: `${temTrajeto ? `<button class="li-fav" onclick="abrirTrajetoViagem('${v.id}')" title="Ver trajeto">🗺️</button>` : ''}${podeEditar ? `<button class="li-fav" onclick="editarViagemUI('${v.id}')" title="Corrigir local não identificado">✏️</button>` : ''}`
    });
  });
  deslocamentos.forEach(d => {
    const temTrajeto = (d.trilha && d.trilha.length >= 2) || (d.localInicio && d.localFim);
    itens.push({
      quando: d.inicioEm, cls: 'd', desl: true,
      t: `🚚 ${d.origem} → ${d.destino}`,
      s: `Deslocamento${d.motivo ? ' · ' + d.motivo : ''} · ${fmtHoraBR(d.inicioEm)}${d.fimEm ? ' → ' + fmtHoraBR(d.fimEm) : ' (em andamento)'}`,
      durHtml: _durBadge(d.tempoTotalMs, ''),
      actionsHtml: `${temTrajeto ? `<button class="li-fav" onclick="abrirTrajetoDeslocamento('${d.id}')" title="Ver trajeto">🗺️</button>` : ''}`
    });
  });
  paradas.forEach(p => {
    itens.push({
      quando: p.inicioEm, cls: p.subtipo === 'carregamento' ? 'f' : 'p',
      t: `${p.icone || '⏱️'} ${p.nome || 'Parada'}`,
      s: `${p.equipamentoCodigo ? p.equipamentoCodigo + ' · ' : ''}${fmtHoraBR(p.inicioEm)}`,
      durHtml: _durBadge(p.tempoTotalMs || 0, p.atrasoMs > 0 ? 'bad' : '') + (p.atrasoMs > 0 ? ` <span class="dur-badge bad">+${fmtDuracao(p.atrasoMs)}</span>` : '')
    });
  });
  abasts.forEach(a => {
    itens.push({
      quando: a.criadoEm, cls: 'p',
      t: `⛽ Abastecimento`,
      s: `${a.litros} L${a.equipamentoCodigo ? ' · ' + a.equipamentoCodigo : ''} · ${fmtHoraBR(a.criadoEm)}`
    });
  });

  qs('#viagens-lista').innerHTML = _htmlResumoTrajeto(resumo, '🚛 Trajetos do dia') + _htmlTimeline(itens);
}

async function editarViagemUI(id) {
  const v = await DB.get('viagens', id);
  if (!v) return;
  // Motorista só pode editar quando a viagem está como "Local não identificado"
  if (!Permissoes.podeVerTudoOperacional() && !_viagemNaoIdentificada(v)) {
    showToast('Você só pode editar viagens sem local identificado', 'var(--iron)', 3500);
    return;
  }
  const novaRota = prompt('Nome da rota:', v.rotaNome) ?? v.rotaNome;
  const novoInicio = prompt('Horário de início (ex: 08:30):', fmtHoraBR(v.inicioEm)) ?? null;
  const novaDescarga = v.descarregadoEm ? (prompt('Horário de descarga (ex: 09:10):', fmtHoraBR(v.descarregadoEm)) ?? null) : null;

  const campos = { rotaNome: novaRota };
  const dataBase = v.inicioEm.slice(0, 10);
  if (novoInicio && /^\d{1,2}:\d{2}$/.test(novoInicio)) {
    campos.inicioEm = new Date(`${dataBase}T${novoInicio}:00`).toISOString();
  }
  if (novaDescarga && /^\d{1,2}:\d{2}$/.test(novaDescarga)) {
    campos.descarregadoEm = new Date(`${dataBase}T${novaDescarga}:00`).toISOString();
  }
  await Operacao.editarViagem(id, campos);
  showToast('✏️ Viagem atualizada');
  _refreshAposMexerViagem();
}

// Atualiza a tela ativa depois de editar/apagar uma viagem ou deslocamento.
function _refreshAposMexerViagem() {
  const pe = qs('#screen-painel-equip');
  if (pe && pe.classList.contains('active')) {
    const box = qs('#painel-equip-historico');
    if (box && !box.classList.contains('hidden')) { alternarHistoricoEquipamentoUI(); alternarHistoricoEquipamentoUI(); }
    return;
  }
  const sv = qs('#screen-viagens');
  if (sv && sv.classList.contains('active')) {
    if (Permissoes.podeVerTudoOperacional()) renderViagens();
    else renderTimelineMotorista(qs('#viagens-dia').value);
  }
}

async function apagarViagemUI(id) {
  if (!Permissoes.podeVerTudoOperacional()) { showToast('Apenas a gestão pode apagar viagens', 'var(--iron)'); return; }
  if (!confirm('Apagar esta viagem? Essa ação não pode ser desfeita.')) return;
  await Operacao.removerViagem(id);
  Log.registrar('excluir', { tipo: 'viagem', id });
  showToast('🗑️ Viagem apagada');
  _refreshAposMexerViagem();
}

async function apagarDeslocamentoUI(id) {
  if (!Permissoes.podeVerTudoOperacional()) { showToast('Apenas a gestão pode apagar deslocamentos', 'var(--iron)'); return; }
  if (!confirm('Apagar este deslocamento?')) return;
  await Operacao.removerDeslocamento(id);
  showToast('🗑️ Deslocamento apagado');
  _refreshAposMexerViagem();
}

// ---------- LANÇAR ROTAS (lote administrativo) ----------
let _loteContadorLinha = 0;

async function renderLancarRotas() {
  const campoData = qs('#lote-dia');
  if (!campoData.value) campoData.value = new Date().toISOString().slice(0, 10);

  const equipamentos = await Equipamentos.listar();
  qs('#lote-equip').innerHTML = '<option value="">Selecione...</option>' +
    equipamentos.map(e => `<option value="${e.id}">${e.codigo} — ${e.modelo}</option>`).join('');

  const usuarios = await Auth.listarUsuarios();
  qs('#lote-motorista').innerHTML = '<option value="">Selecione...</option>' +
    usuarios.map(u => `<option value="${u.id}">${u.nome} (${u.nivel})</option>`).join('');

  qs('#lote-rotas-lista').innerHTML = '';
  qs('#lote-deslocamentos-lista').innerHTML = '';
  _loteContadorLinha = 0;
  await adicionarLinhaLoteRota();
}

async function adicionarLinhaLoteRota() {
  const rotas = (await Operacao.listarRotas()).filter(r => r.status !== 'inativa');
  const idLinha = `lote-linha-${_loteContadorLinha++}`;
  const div = document.createElement('div');
  div.className = 'card';
  div.id = idLinha;
  div.innerHTML = `
    <div class="field">
      <label>Rota</label>
      <select class="lote-rota-select" onchange="atualizarTotalLote()">
        <option value="">Selecione...</option>
        ${rotas.map(r => `<option value="${r.id}" data-nome="${r.nome}">${r.nome} (${r.origem} → ${r.destino})</option>`).join('')}
      </select>
    </div>
    <div class="btn-row">
      <div class="field" style="flex:1"><label>Quantidade de viagens</label><input type="number" class="lote-qtd-input" value="1" min="0" oninput="atualizarTotalLote()"></div>
      <div class="field" style="flex:1"><label>Horário (opcional)</label><input type="time" class="lote-horario-input"></div>
    </div>
    <button class="btn btn-ghost" style="font-size:12.5px" onclick="document.getElementById('${idLinha}').remove(); atualizarTotalLote();">🗑️ Remover esta rota</button>
  `;
  qs('#lote-rotas-lista').appendChild(div);
  atualizarTotalLote();
}

async function adicionarLinhaLoteDeslocamento() {
  const rotasDesloc = (await Operacao.listarRotasDeslocamento()).filter(r => r.status !== 'inativa');
  const idLinha = `lote-desloc-linha-${_loteContadorLinha++}`;
  const div = document.createElement('div');
  div.className = 'card';
  div.id = idLinha;
  div.innerHTML = `
    <div class="field">
      <label>Rota de Deslocamento</label>
      <select class="lote-desloc-select" onchange="atualizarTotalLote()">
        <option value="">Selecione...</option>
        ${rotasDesloc.map(r => `<option value="${r.id}">${r.nome} (${r.origem} → ${r.destino})</option>`).join('')}
      </select>
    </div>
    <div class="btn-row">
      <div class="field" style="flex:1"><label>Quantidade</label><input type="number" class="lote-desloc-qtd-input" value="1" min="0" oninput="atualizarTotalLote()"></div>
      <div class="field" style="flex:1"><label>Horário (opcional)</label><input type="time" class="lote-desloc-horario-input"></div>
    </div>
    <button class="btn btn-ghost" style="font-size:12.5px" onclick="document.getElementById('${idLinha}').remove(); atualizarTotalLote();">🗑️ Remover este deslocamento</button>
  `;
  qs('#lote-deslocamentos-lista').appendChild(div);
  atualizarTotalLote();
}

function atualizarTotalLote() {
  const qtdInputs = qsa('#lote-rotas-lista .lote-qtd-input');
  const total = qtdInputs.reduce((soma, input) => soma + (parseInt(input.value) || 0), 0);
  qs('#lote-total-viagens').textContent = total;

  const qtdDeslocInputs = qsa('#lote-deslocamentos-lista .lote-desloc-qtd-input');
  const totalDesloc = qtdDeslocInputs.reduce((soma, input) => soma + (parseInt(input.value) || 0), 0);
  qs('#lote-total-deslocamentos').textContent = totalDesloc;
}

async function salvarLancamentoLoteUI() {
  const dia = qs('#lote-dia').value;
  const equipId = qs('#lote-equip').value;
  const motoristaId = qs('#lote-motorista').value;
  const kmInicial = qs('#lote-km-inicial').value;
  const kmFinal = qs('#lote-km-final').value;
  const horInicial = qs('#lote-hor-inicial').value;
  const horFinal = qs('#lote-hor-final').value;

  if (!dia) { showToast('Selecione o dia', 'var(--iron)'); return; }
  if (!equipId) { showToast('Selecione o equipamento', 'var(--iron)'); return; }
  if (!motoristaId) { showToast('Selecione o operador', 'var(--iron)'); return; }

  const linhas = qsa('#lote-rotas-lista > .card');
  const rotasComQtd = [];
  for (const linha of linhas) {
    const select = linha.querySelector('.lote-rota-select');
    const qtdInput = linha.querySelector('.lote-qtd-input');
    const horarioInput = linha.querySelector('.lote-horario-input');
    if (select.value && parseInt(qtdInput.value) > 0) {
      rotasComQtd.push({ rotaId: select.value, quantidade: qtdInput.value, horario: horarioInput.value || null });
    }
  }

  const linhasDesloc = qsa('#lote-deslocamentos-lista > .card');
  const deslocamentosComQtd = [];
  for (const linha of linhasDesloc) {
    const select = linha.querySelector('.lote-desloc-select');
    const qtdInput = linha.querySelector('.lote-desloc-qtd-input');
    const horarioInput = linha.querySelector('.lote-desloc-horario-input');
    if (select.value && parseInt(qtdInput.value) > 0) {
      deslocamentosComQtd.push({ rotaDeslocId: select.value, quantidade: qtdInput.value, horario: horarioInput.value || null });
    }
  }

  if (!rotasComQtd.length && !deslocamentosComQtd.length) {
    showToast('Adicione ao menos uma rota ou deslocamento com quantidade', 'var(--iron)');
    return;
  }

  const equip = await DB.get('equipamentos', equipId);
  const motorista = await DB.get('usuarios', motoristaId);
  const [ano, mes, diaNum] = dia.split('-');
  const diaKey = `${diaNum}-${mes}-${ano}`;

  const r = await Operacao.lancarDiaCompleto({
    dia: diaKey, equipamentoId: equipId, equipamentoCodigo: equip.codigo,
    motoristaId, motoristaNome: motorista ? motorista.nome : '—',
    kmInicial, kmFinal, horimetroInicial: horInicial, horimetroFinal: horFinal,
    rotasComQtd, deslocamentosComQtd
  });

  showToast(`✅ ${r.totalViagens} viagem(ns) e ${r.totalDeslocamentos} deslocamento(s) lançado(s) com sucesso!`);
  navigate('viagens');
}

function mudarDiaViagens() {
  renderTimelineMotorista(qs('#viagens-dia').value);
}

// ---------- FROTA (equipamentos + abastecimento + lubrificação) ----------
async function renderFrota() {
  const equipamentos = await Equipamentos.listar();
  const gestao = podeGerenciarFrota();
  qs('#frota-cadastrar-btn').classList.toggle('hidden', !gestao);

  qs('#frota-lista').innerHTML = equipamentos.length ? equipamentos.map(e => `
    <div class="list-item">
      <div style="cursor:pointer" onclick="abrirPainelEquipamento('${e.id}')">
        <div class="li-main">${e.codigo} — ${e.modelo}</div>
        <div class="li-sub">${e.categoria} • KM ${e.kmAtual} • Hor ${e.horimetroAtual} • ${e.status === 'manutencao' ? '🔧 Em manutenção' : (e.status === 'reserva' ? '🅿️ Em reserva' : (e.ativo === false ? '⏸ Desativado' : '✅ Ativo'))}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-outline btn-sm" onclick="alternarManutencaoUI('${e.id}')">${e.status === 'manutencao' ? 'Retornar' : 'Manutenção'}</button>
        ${gestao ? `<button class="li-fav" onclick="apagarEquipamentoUI('${e.id}')">🗑️</button>` : ''}
      </div>
    </div>`).join('') : `<div class="empty-state"><span class="emoji">🚛</span>Nenhum equipamento cadastrado.</div>`;
}

// Tela Serviços (Abastecimento + Lubrificação) — preenche os seletores de equipamento.
async function renderServicos() {
  const equipamentos = await Equipamentos.listar();
  const options = '<option value="">Selecione...</option>' + equipamentos.map(e => `<option value="${e.id}">${e.codigo}</option>`).join('');
  ['abast-equip', 'lub-equip'].forEach(id => { const s = qs('#' + id); if (s) s.innerHTML = options; });
}

function alternarManutencaoUI(id) {
  if (!Permissoes.podeAlternarManutencao()) { showToast('Acesso restrito', 'var(--iron)'); return; }
  DB.get('equipamentos', id).then(e => {
    if (e.status !== 'manutencao') {
      abrirModalFormulario({
        titulo: '🔧 Enviar para Manutenção',
        subtitulo: e.codigo,
        campos: [{ id: 'motivo', label: 'Motivo', placeholder: 'Ex: Troca de pneu, revisão programada...' }],
        textoSalvar: 'Confirmar',
        aoSalvar: (v) => Equipamentos.alternarManutencao(id, v.motivo).then(renderFrota)
      });
    } else {
      Equipamentos.alternarManutencao(id).then(renderFrota);
    }
  });
}

async function apagarEquipamentoUI(id) {
  if (!podeGerenciarFrota()) { showToast('Acesso restrito', 'var(--iron)'); return; }
  if (!confirm('Apagar este equipamento? O histórico de viagens/abastecimentos ligado a ele será mantido, mas o cadastro será removido definitivamente.')) return;
  await Equipamentos.remover(id);
  Log.registrar('excluir', { tipo: 'equipamento', id });
  showToast('🗑️ Equipamento apagado');
  renderFrota();
}

function abrirNovoEquipamento() {
  if (!podeGerenciarFrota()) { showToast('Acesso restrito a Administrador, Gerência, Supervisor ou Encarregado', 'var(--iron)'); return; }
  abrirModalFormulario({
    titulo: '➕ Cadastrar Equipamento',
    campos: [
      { id: 'codigo', label: 'Código / placa', placeholder: 'Ex: CB-07' },
      { id: 'modelo', label: 'Modelo', placeholder: 'Ex: Volvo FMX 500' },
      { id: 'categoria', label: 'Categoria', tipo: 'select', valor: 'Caminhão', opcoes: [
        { valor: 'Caminhão', texto: 'Caminhão' },
        { valor: 'Escavadeira', texto: 'Escavadeira' },
        { valor: 'Pá-carregadeira', texto: 'Pá-carregadeira' },
        { valor: 'Perfuratriz', texto: 'Perfuratriz' },
        { valor: 'Outro', texto: 'Outro' }
      ]},
      { id: 'kmAtual', label: 'KM atual', tipo: 'number', valor: 0 },
      { id: 'horimetroAtual', label: 'Horímetro atual', tipo: 'number', valor: 0 },
      { id: 'expedienteInicio', label: 'Início do expediente', tipo: 'time', valor: '07:00' },
      { id: 'expedienteFim', label: 'Fim do expediente', tipo: 'time', valor: '19:00' }
    ],
    aoSalvar: (v) => {
      if (!v.codigo) { showToast('Informe o código/placa', 'var(--iron)'); return; }
      Equipamentos.salvar(v).then(() => {
        showToast('✅ Equipamento cadastrado!');
        renderFrota();
      });
    }
  });
}

async function registrarAbastecimentoUI() {
  const equipId = qs('#abast-equip').value;
  const litros = qs('#abast-litros').value;
  const km = qs('#abast-km').value;
  const horimetro = qs('#abast-horimetro').value;
  const situacao = qs('#abast-situacao').value;
  if (!equipId || !litros) { showToast('Selecione o equipamento e informe os litros', 'var(--iron)'); return; }
  const equip = await DB.get('equipamentos', equipId);
  const u = Auth.usuarioAtual();
  await Abastecimento.registrar({
    equipamentoId: equipId, equipamentoCodigo: equip.codigo, motoristaId: u.id,
    litros, kmAtual: km || equip.kmAtual, horimetroAtual: horimetro || equip.horimetroAtual, situacao
  });
  showToast('⛽ Abastecimento registrado!');
  qs('#abast-litros').value = ''; qs('#abast-km').value = ''; qs('#abast-horimetro').value = '';
  renderServicos();
}

async function registrarLubrificacaoUI() {
  const equipId = qs('#lub-equip').value;
  const tipoServico = qs('#lub-tipo').value;
  const horimetro = qs('#lub-horimetro').value;
  if (!equipId) { showToast('Selecione o equipamento', 'var(--iron)'); return; }
  const equip = await DB.get('equipamentos', equipId);
  await Lubrificacao.registrar({ equipamentoId: equipId, equipamentoCodigo: equip.codigo, tipoServico, horimetroAtual: horimetro });
  showToast('🛢️ Lubrificação registrada!');
  qs('#lub-horimetro').value = '';
  renderServicos();
}

// ---------- RELATÓRIO PDF ----------
async function gerarRelatorioPDFUI() {
  const campoData = qs('#relatorio-data');
  const dataISO = (campoData && campoData.value) || new Date().toISOString().slice(0, 10);
  const [ano, mes, dia] = dataISO.split('-');
  const diaKey = `${dia}-${mes}-${ano}`;

  showToast('📄 Gerando relatório...', 'var(--amber)');
  try {
    const blob = await Relatorio.gerarPDF(diaKey);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `STRACTA_Relatorio_${diaKey}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('✅ Relatório gerado!');
  } catch (e) {
    showToast('Erro ao gerar relatório: ' + e.message, 'var(--iron)');
  }
}

async function gerarExcelDiaUI() {
  const campoData = qs('#relatorio-data');
  const dataISO = (campoData && campoData.value) || new Date().toISOString().slice(0, 10);
  const [ano, mes, dia] = dataISO.split('-');
  const diaKey = `${dia}-${mes}-${ano}`;

  showToast('📊 Gerando Excel...', 'var(--amber)');
  try {
    const nomeArquivo = await RelatorioExcel.gerarExcelDia(diaKey);
    if (nomeArquivo) showToast('✅ Excel gerado!');
  } catch (e) {
    showToast('Erro ao gerar Excel: ' + e.message, 'var(--iron)');
  }
}

function _lerPeriodoSelecionado() {
  const inicio = qs('#relatorio-periodo-inicio').value;
  const fim = qs('#relatorio-periodo-fim').value;
  if (!inicio || !fim) { showToast('Escolha as duas datas do período', 'var(--iron)'); return null; }
  if (new Date(fim) < new Date(inicio)) { showToast('A data final deve ser depois da inicial', 'var(--iron)'); return null; }
  return { inicio, fim };
}

async function gerarRelatorioPeriodoUI() {
  const periodo = _lerPeriodoSelecionado();
  if (!periodo) return;
  showToast('📄 Gerando relatório de período...', 'var(--amber)');
  try {
    const blob = await Relatorio.gerarPDFPeriodo(periodo.inicio, periodo.fim);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `STRACTA_Relatorio_Periodo_${periodo.inicio}_a_${periodo.fim}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('✅ Relatório de período gerado!');
  } catch (e) {
    showToast('Erro ao gerar relatório: ' + e.message, 'var(--iron)');
  }
}

async function gerarExcelPeriodoUI() {
  const periodo = _lerPeriodoSelecionado();
  if (!periodo) return;
  showToast('📊 Gerando Excel do período...', 'var(--amber)');
  try {
    const nomeArquivo = await RelatorioExcel.gerarExcelPeriodo(periodo.inicio, periodo.fim);
    if (nomeArquivo) showToast('✅ Excel gerado!');
  } catch (e) {
    showToast('Erro ao gerar Excel: ' + e.message, 'var(--iron)');
  }
}

// ---------- PAINEL (dashboard) ----------
async function renderPainel() {
  const campoData = qs('#relatorio-data');
  if (campoData && !campoData.value) campoData.value = new Date().toISOString().slice(0, 10);

  const relBox = qs('#painel-relatorios');
  const subt = qs('#painel-subtitulo');

  // Motorista vê um painel simplificado, só com os números do turno dele
  if (!Permissoes.podeVerTudoOperacional()) {
    if (relBox) relBox.style.display = 'none';           // sem relatórios da frota
    if (subt) subt.textContent = 'Os seus números do turno';
    await renderPainelMotorista();
    return;
  }
  if (relBox) relBox.style.display = '';
  if (subt) subt.textContent = 'Resumo de produção — toque no dia para trocar';

  const campo = qs('#relatorio-data');
  const dia = (campo && campo.value) ? campo.value : todayKey();
  await renderPainelGestao(dia);
}

let _painelDia = null;
let _painelPorEquip = [];

// Troca o dia do painel (ligado ao onchange do seletor "Escolher o dia").
function mudarDiaPainel() {
  const campo = qs('#relatorio-data');
  const dia = (campo && campo.value) ? campo.value : todayKey();
  renderPainelGestao(dia);
}

async function renderPainelGestao(dia) {
  _painelDia = dia;
  const [r, porEquip] = await Promise.all([Dashboard.resumoDoDia(dia), Dashboard.resumoPorEquipamento()]);
  _painelPorEquip = porEquip;

  // contagem da frota por status (estado ao vivo)
  const cont = { op: 0, rota: 0, falta: 0, manut: 0, fora: 0 };
  porEquip.forEach(item => {
    const cls = _statusEquip(item.equipamento, item).cls;
    if (cls === 'st-operando') cont.op++;
    else if (cls === 'st-rota') cont.rota++;
    else if (cls === 'st-falta') cont.falta++;
    else if (cls === 'st-manut') cont.manut++;
    else cont.fora++;
  });

  qs('#painel-conteudo').innerHTML = `
    <div class="painel-top2">
      <div class="card">
        <div class="card-title">🚚 Frota agora</div>
        <div class="fleet-chips">
          <div class="fchip" onclick="detalhePainel('frota-op')"><span class="fdot fd-op"></span>Operando<span class="fn">${cont.op}</span></div>
          <div class="fchip" onclick="detalhePainel('frota-rota')"><span class="fdot fd-rota"></span>Em rota<span class="fn">${cont.rota}</span></div>
          <div class="fchip" onclick="detalhePainel('frota-falta')"><span class="fdot fd-falta"></span>Falta operador<span class="fn">${cont.falta}</span></div>
          <div class="fchip" onclick="detalhePainel('frota-manut')"><span class="fdot fd-manut"></span>Manutenção<span class="fn">${cont.manut}</span></div>
          <div class="fchip" onclick="detalhePainel('frota-fora')"><span class="fdot fd-fora"></span>Fora<span class="fn">${cont.fora}</span></div>
        </div>
        <div class="painel-turnos" onclick="detalhePainel('turnos')">Turnos ativos<b>${r.turnosAtivos}</b></div>
      </div>
      <div class="card">
        <div class="card-title">📦 Produção · ${r.dia}</div>
        <div class="prod-big" onclick="detalhePainel('viagens')" style="cursor:pointer">${r.totalViagens}</div>
        <div class="prod-lb">viagens concluídas ›</div>
        <div class="prod-sec">
          <div class="r">Tempo médio<b>${fmtDuracao(r.tempoMedioMs)}</b></div>
          <div class="r">Tempo total<b>${fmtDuracao(r.tempoTotalMs)}</b></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Operação do dia</div>
      <div class="stat-tiles">
        <div class="stat-tile click" onclick="detalhePainel('deslocamentos')"><div class="v">${r.totalDeslocamentos}</div><div class="k">Deslocamentos</div></div>
        <div class="stat-tile click" onclick="detalhePainel('deslocamentos')"><div class="v">${fmtDuracao(r.tempoDeslocamentoMs)}</div><div class="k">Tempo desloc.</div></div>
        <div class="stat-tile warn"><div class="v">${fmtDuracao(r.tempoParadoMs)}</div><div class="k">Tempo parado</div></div>
      </div>
      <div class="stat-tiles" style="margin-top:8px">
        <div class="stat-tile click" onclick="detalhePainel('paradas')"><div class="v">${r.totalParadas || 0}</div><div class="k">Paradas</div></div>
        <div class="stat-tile click" onclick="detalhePainel('abastecimentos')"><div class="v">${_fmtNum(r.totalLitros)}<small> L</small></div><div class="k">Abastecim.</div></div>
        <div class="stat-tile click" onclick="detalhePainel('lubrificacoes')"><div class="v">${r.totalLubrificacoes}</div><div class="k">Lubrificações</div></div>
      </div>
      <div class="stat-tiles" style="margin-top:8px">
        <div class="stat-tile info click" onclick="detalhePainel('equipamentos')"><div class="v">${r.equipamentosAtivos}/${r.equipamentosTotal}</div><div class="k">Equip. ativos</div></div>
        <div class="stat-tile click" onclick="detalhePainel('manutencao')"><div class="v">${r.equipamentosManutencao}</div><div class="k">Em manutenção</div></div>
        <div class="stat-tile click" onclick="detalhePainel('paradas')"><div class="v">${fmtDuracao(r.tempoParadasMs || 0)}</div><div class="k">Tempo paradas</div></div>
      </div>
    </div>

    <div class="card-title mt16">🚛 Por Equipamento</div>
    <div id="painel-equip-grid">${_htmlGridEquip(porEquip, 'painel')}</div>
  `;
}

// Abre o detalhe (lista) de um quadro do painel, para o dia selecionado.
async function detalhePainel(tipo) {
  const dia = _painelDia || todayKey();
  const vazio = `<div class="empty-state"><span class="emoji">📭</span>Nenhum registro.</div>`;
  let titulo = '', conteudo = '';

  const listaEquip = (itens) => itens.length ? itens.map(item => {
    const e = item.equipamento || item;
    const st = _statusEquip(e, item.equipamento ? item : { });
    return `<div class="list-item"><div><div class="li-main">${e.codigo}</div><div class="li-sub">${e.modelo || ''}${item.motoristaAtual ? ' · 👤 ' + item.motoristaAtual : ''}${item.rotaAtualNome ? ' · ' + item.rotaAtualNome : ''}</div></div><span class="status-badge ${st.cls}"><span class="dot"></span>${st.txt}</span></div>`;
  }).join('') : vazio;

  const frotaFiltro = (cls) => _painelPorEquip.filter(item => _statusEquip(item.equipamento, item).cls === cls);

  if (tipo === 'viagens') {
    const vs = (await Viagens.historicoDoDia(dia)).filter(v => v.status === 'concluida');
    titulo = '🚛 Viagens concluídas';
    conteudo = _htmlTimeline(vs.map(v => ({ quando: v.inicioEm, cls: 'v', t: `🚛 ${v.rotaNome}`, s: `${v.equipamentoCodigo || ''}${v.motoristaNome ? ' · ' + v.motoristaNome : ''} · ${fmtHoraBR(v.inicioEm)}${v.descarregadoEm ? ' → ' + fmtHoraBR(v.descarregadoEm) : ''}`, durHtml: _durBadge(v.tempoTotalMs, '') })));
  } else if (tipo === 'deslocamentos') {
    const ds = await Operacao.deslocamentosDoDia(dia);
    titulo = '🚚 Deslocamentos';
    conteudo = _htmlTimeline(ds.map(d => ({ quando: d.inicioEm, cls: 'd', desl: true, t: `🚚 ${d.origem} → ${d.destino}`, s: `${d.motivo ? d.motivo + ' · ' : ''}${fmtHoraBR(d.inicioEm)}${d.fimEm ? ' → ' + fmtHoraBR(d.fimEm) : ''}`, durHtml: _durBadge(d.tempoTotalMs, '') })));
  } else if (tipo === 'paradas') {
    const ps = await Operacao.paradasDoDia(dia);
    titulo = '⏱️ Paradas';
    conteudo = _htmlTimeline(ps.map(p => ({ quando: p.inicioEm, cls: p.subtipo === 'carregamento' ? 'f' : 'p', t: `${p.icone || '⏱️'} ${p.nome || 'Parada'}`, s: `${p.equipamentoCodigo ? p.equipamentoCodigo + ' · ' : ''}${p.motoristaNome ? p.motoristaNome + ' · ' : ''}${fmtHoraBR(p.inicioEm)}`, durHtml: _durBadge(p.tempoTotalMs || 0, p.atrasoMs > 0 ? 'bad' : '') })));
  } else if (tipo === 'abastecimentos') {
    const as = await Abastecimento.doDia(dia);
    titulo = '⛽ Abastecimentos';
    conteudo = _htmlTimeline(as.map(a => ({ quando: a.criadoEm, cls: 'p', t: `⛽ ${_fmtNum(a.litros)} L`, s: `${a.equipamentoCodigo || ''} · ${fmtHoraBR(a.criadoEm)}` })));
  } else if (tipo === 'lubrificacoes') {
    const ls = await Lubrificacao.doDia(dia);
    titulo = '🛠 Lubrificações';
    conteudo = _htmlTimeline(ls.map(l => ({ quando: l.criadoEm, cls: 'p', t: `🛠 ${l.tipoServico || 'Lubrificação'}`, s: `${l.equipamentoCodigo || ''} · ${fmtHoraBR(l.criadoEm)}` })));
  } else if (tipo === 'manutencao') {
    titulo = '🔧 Em manutenção';
    conteudo = listaEquip(frotaFiltro('st-manut'));
  } else if (tipo === 'equipamentos') {
    titulo = '🚛 Equipamentos ativos';
    conteudo = listaEquip(_painelPorEquip.filter(item => item.equipamento.status !== 'manutencao' && item.equipamento.ativo !== false));
  } else if (tipo === 'turnos') {
    const ts = await DB.getByIndex('turnos', 'status', 'ativo');
    titulo = '🟢 Turnos ativos';
    conteudo = ts.length ? ts.map(t => `<div class="list-item"><div><div class="li-main">${t.motoristaNome || '—'}</div><div class="li-sub">${t.equipamentoCodigo || ''} · desde ${fmtHoraBR(t.iniciadoEm)}</div></div></div>`).join('') : vazio;
  } else if (tipo.startsWith('frota-')) {
    const mapa = { 'frota-op': ['st-operando', '🟢 Operando'], 'frota-rota': ['st-rota', '🚚 Em rota'], 'frota-falta': ['st-falta', '🔴 Falta operador'], 'frota-manut': ['st-manut', '🔧 Manutenção'], 'frota-fora': ['st-off', '🌙 Fora / desativado'] };
    const [cls, tit] = mapa[tipo] || ['st-off', 'Frota'];
    titulo = tit;
    conteudo = listaEquip(tipo === 'frota-fora'
      ? _painelPorEquip.filter(item => !['st-operando', 'st-rota', 'st-falta', 'st-manut'].includes(_statusEquip(item.equipamento, item).cls))
      : frotaFiltro(cls));
  } else {
    titulo = 'Detalhe'; conteudo = vazio;
  }

  abrirModalDetalhe({ titulo, subtitulo: `Dia ${dia}`, conteudo });
}

// Grade de equipamentos (reusada no Painel e nas Viagens da gestão).
// origem: 'painel' abre o painel do equipamento; 'viagens' abre já com o histórico.
// Status do equipamento → { txt, cls } para o badge colorido do cartão.
function _statusEquip(e, item) {
  if (e.status === 'manutencao') return { txt: 'Manutenção', cls: 'st-manut' };
  if (e.status === 'reserva') return { txt: 'Reserva', cls: 'st-reserva' };
  if (e.ativo === false) return { txt: 'Desativado', cls: 'st-off' };
  if (item.emRota) return { txt: 'Em rota', cls: 'st-rota' };
  if (item.temTurnoAtivo || item.motoristaAtual) return { txt: 'Operando', cls: 'st-operando' };
  if (Equipamentos.dentroDoExpediente(e)) return { txt: 'Falta operador', cls: 'st-falta' };
  return { txt: 'Fora de expediente', cls: 'st-off' };
}

function _htmlGridEquip(porEquip, origem) {
  if (!porEquip.length) return `<div class="empty-state"><span class="emoji">🚛</span>Nenhum equipamento cadastrado.</div>`;
  return porEquip.map(item => {
    const e = item.equipamento;
    const st = _statusEquip(e, item);
    const onclick = origem === 'viagens'
      ? `abrirPainelEquipamento('${e.id}', {origem:'viagens', historico:true})`
      : `abrirPainelEquipamento('${e.id}')`;
    const tempoMedio = item.tempoMedioMs ? fmtDuracao(item.tempoMedioMs) : '—';
    const consumo = item.consumoKmL != null ? _fmtNum(item.consumoKmL, 1) : '—';
    return `
      <div class="equip-card" onclick="${onclick}">
        <div class="eq-top">
          <div>
            <div class="eq-code">${e.codigo}</div>
            <div class="eq-sub">${e.modelo || '—'} • ${item.motoristaAtual ? '👤 <b>' + item.motoristaAtual + '</b>' : 'sem operador'}</div>
          </div>
          <span class="status-badge ${st.cls}"><span class="dot"></span>${st.txt}</span>
        </div>
        ${item.emRota && item.rotaAtualNome ? `<div class="eq-rota">🚚 ${item.rotaAtualNome}</div>` : ''}
        <div class="stat-tiles">
          <div class="stat-tile hl"><div class="v">${item.viagensHoje || 0}</div><div class="k">Viagens hoje</div></div>
          <div class="stat-tile"><div class="v">${tempoMedio}</div><div class="k">Tempo médio</div></div>
          <div class="stat-tile"><div class="v">${consumo}<small> km/L</small></div><div class="k">Consumo</div></div>
        </div>
        <div class="eq-meta">
          <span>🛞 <b>${_fmtNum(e.kmAtual)}</b> km</span>
          <span>⏱ <b>${_fmtNum(e.horimetroAtual, 1)}</b> h</span>
          <span>🕒 última <b>${item.ultimaViagemEm ? fmtHoraBR(item.ultimaViagemEm) : '—'}</b></span>
        </div>
      </div>`;
  }).join('');
}

// ---------- HELPERS COMPARTILHADOS: TIMELINE + RESUMO POR TRAJETO ----------
// Badge de duração; kind: 'good' (recorde 🏆), 'bad' (mais lento) ou neutro.
function _durBadge(ms, kind) {
  if (!ms) return '';
  const cls = kind === 'good' ? ' good' : kind === 'bad' ? ' bad' : '';
  const pre = kind === 'good' ? '🏆 ' : '';
  return `<span class="dur-badge${cls}">${pre}${fmtDuracao(ms)}</span>`;
}

// Agrupa viagens concluídas por trajeto (rotaNome). Retorna [{trajeto, qtd, melhorMs, mediaMs}].
function _resumoPorTrajeto(viagens) {
  const mapa = {};
  (viagens || []).filter(v => v.status === 'concluida').forEach(v => {
    const key = v.rotaNome || '—';
    if (!mapa[key]) mapa[key] = { trajeto: key, qtd: 0, tempos: [] };
    mapa[key].qtd++;
    if (v.tempoTotalMs > 0) mapa[key].tempos.push(v.tempoTotalMs);
  });
  return Object.values(mapa).map(g => ({
    trajeto: g.trajeto,
    qtd: g.qtd,
    melhorMs: g.tempos.length ? Math.min(...g.tempos) : null,
    mediaMs: g.tempos.length ? g.tempos.reduce((a, b) => a + b, 0) / g.tempos.length : null
  })).sort((a, b) => b.qtd - a.qtd);
}

function _htmlResumoTrajeto(lista, titulo) {
  if (!lista.length) return '';
  return `<div class="card-title mt16">${titulo || '🚛 Resumo por trajeto'}</div>
    <div class="traj-resumo">` + lista.map(t => `
      <div class="traj-row">
        <div>
          <div class="tr-main">${t.trajeto}</div>
          <div class="tr-sub">${t.melhorMs ? '🏆 ' + fmtDuracao(t.melhorMs) : 'sem tempo'}${t.mediaMs ? ' · média ' + fmtDuracao(t.mediaMs) : ''}</div>
        </div>
        <div class="tr-qtd">${t.qtd}<small> ${t.qtd === 1 ? 'viagem' : 'viagens'}</small></div>
      </div>`).join('') + `</div>`;
}

// Renderiza itens numa linha do tempo com trilho, agrupada por dia.
// itens: [{quando, cls, t (título HTML), s (sub HTML), durHtml, actionsHtml, desl}]
function _htmlTimeline(itens) {
  if (!itens.length) return `<div class="empty-state"><span class="emoji">📭</span>Nenhum registro.</div>`;
  const ordenados = itens.slice().sort((a, b) => new Date(b.quando) - new Date(a.quando));
  const grupos = [];
  let atual = null;
  ordenados.forEach(it => {
    const dia = fmtDataBR(it.quando);
    if (!atual || atual.dia !== dia) { atual = { dia, itens: [] }; grupos.push(atual); }
    atual.itens.push(it);
  });
  return grupos.map(g => `
    <div class="tl-day">${g.dia}</div>
    <div class="tl2">
      ${g.itens.map(it => `
        <div class="tl-it ${it.cls || ''}${it.desl ? ' desl' : ''}">
          <div class="tl-t">${it.t}${it.durHtml || ''}${it.actionsHtml ? `<span class="tl-actions">${it.actionsHtml}</span>` : ''}</div>
          <div class="tl-s">${it.s}</div>
        </div>`).join('')}
    </div>`).join('');
}

// ---------- PAINEL DO MOTORISTA (simplificado + WhatsApp) ----------
function _fmtNum(n, dec = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

async function renderPainelMotorista() {
  const u = Auth.usuarioAtual();
  const cont = qs('#painel-conteudo');
  const r = await Dashboard.resumoMotorista(u.id);

  if (!r.turno) {
    cont.innerHTML = `<div class="empty-state"><span class="emoji">📊</span>Você ainda não tem turno registrado.<br>Inicie um turno para ver seus números aqui.</div>`;
    return;
  }
  const t = r.turno;
  const periodo = `${fmtHoraBR(t.iniciadoEm)} → ${r.emAndamento ? 'em andamento' : fmtHoraBR(t.encerradoEm)}`;
  const parcial = r.emAndamento ? ' (parcial)' : '';

  cont.innerHTML = `
    <div class="card">
      <div class="card-title">Meu turno — ${fmtDataBR(t.iniciadoEm)}</div>
      <div class="row-kv"><span class="k">Equipamento</span><span class="v">${t.equipamentoCodigo || '—'}</span></div>
      <div class="row-kv"><span class="k">Período</span><span class="v">${periodo}</span></div>
      <div class="row-kv"><span class="k">Viagens concluídas</span><span class="v">${r.viagensConcluidas}</span></div>
    </div>
    <div class="card">
      <div class="card-title">KM & Horímetro</div>
      <div class="row-kv"><span class="k">KM inicial</span><span class="v">${_fmtNum(r.kmInicial)}</span></div>
      <div class="row-kv"><span class="k">KM final${parcial}</span><span class="v">${_fmtNum(r.kmFinal)}</span></div>
      <div class="row-kv"><span class="k">KM rodados</span><span class="v">${_fmtNum(r.kmRodados)}</span></div>
      <div class="row-kv"><span class="k">Horímetro inicial</span><span class="v">${_fmtNum(r.horInicial, 1)}</span></div>
      <div class="row-kv"><span class="k">Horímetro final${parcial}</span><span class="v">${_fmtNum(r.horFinal, 1)}</span></div>
      <div class="row-kv"><span class="k">Horas trabalhadas</span><span class="v">${_fmtNum(r.horas, 1)}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Combustível</div>
      <div class="row-kv"><span class="k">Litros abastecidos</span><span class="v">${_fmtNum(r.litros, 1)} L</span></div>
      <div class="row-kv"><span class="k">Média consumo</span><span class="v">${r.mediaKmL != null ? _fmtNum(r.mediaKmL, 2) + ' km/L' : '—'}</span></div>
      <div class="row-kv"><span class="k">Média por hora</span><span class="v">${r.mediaLh != null ? _fmtNum(r.mediaLh, 2) + ' L/h' : '—'}</span></div>
    </div>
    <button class="btn btn-primary" onclick="enviarPainelWhatsApp()">📲 Enviar no WhatsApp</button>
  `;
}

function _textoPainelMotorista(u, r) {
  const t = r.turno;
  const parcial = r.emAndamento ? ' (parcial)' : '';
  return [
    `${(window.MARCA && MARCA.nome) || 'STRACTA'} — Resumo do turno`,
    `Motorista: ${u ? u.nome : '—'}`,
    `Equipamento: ${t.equipamentoCodigo || '—'}`,
    `Data: ${fmtDataBR(t.iniciadoEm)}`,
    `Período: ${fmtHoraBR(t.iniciadoEm)} → ${r.emAndamento ? 'em andamento' : fmtHoraBR(t.encerradoEm)}`,
    '',
    `KM inicial: ${_fmtNum(r.kmInicial)}`,
    `KM final${parcial}: ${_fmtNum(r.kmFinal)}`,
    `KM rodados: ${_fmtNum(r.kmRodados)}`,
    `Horímetro inicial: ${_fmtNum(r.horInicial, 1)}`,
    `Horímetro final${parcial}: ${_fmtNum(r.horFinal, 1)}`,
    `Horas trabalhadas: ${_fmtNum(r.horas, 1)}`,
    '',
    `Litros abastecidos: ${_fmtNum(r.litros, 1)} L`,
    `Média consumo: ${r.mediaKmL != null ? _fmtNum(r.mediaKmL, 2) + ' km/L' : '—'}`,
    `Média por hora: ${r.mediaLh != null ? _fmtNum(r.mediaLh, 2) + ' L/h' : '—'}`,
    `Viagens concluídas: ${r.viagensConcluidas}`
  ].join('\n');
}

async function enviarPainelWhatsApp() {
  const u = Auth.usuarioAtual();
  const r = await Dashboard.resumoMotorista(u.id);
  if (!r.turno) { showToast('Sem turno para enviar', 'var(--iron)'); return; }
  const texto = _textoPainelMotorista(u, r);
  // copia como reserva, caso o WhatsApp não abra
  if (navigator.clipboard) navigator.clipboard.writeText(texto).catch(() => {});
  // whatsapp:// abre o app direto — funciona mesmo sem internet (o WhatsApp
  // envia sozinho quando reconectar). Sem depender de carregar página externa.
  window.location.href = `whatsapp://send?text=${encodeURIComponent(texto)}`;
}

// ---------- PAINEL DO EQUIPAMENTO ----------
async function abrirPainelEquipamento(equipamentoId, opts) {
  opts = opts || {};
  _equipamentoSelecionadoId = equipamentoId;
  _origemPainelEquip = opts.origem || 'painel';
  _abrirHistoricoEquip = !!opts.historico;
  navigate('painel-equip');
}

async function renderPainelEquip() {
  if (!_equipamentoSelecionadoId) { navigate('painel'); return; }
  const d = await Dashboard.detalheEquipamento(_equipamentoSelecionadoId);
  if (!d.equipamento) { showToast('Equipamento não encontrado', 'var(--iron)'); navigate('painel'); return; }
  const e = d.equipamento;

  const st = _statusEquip(e, { emRota: d.emRota, temTurnoAtivo: !!d.motoristaAtual, motoristaAtual: d.motoristaAtual });
  // Linha de contexto do status: rota atual, expediente, ou motorista.
  let infoStatus;
  if (d.emRota) infoStatus = `🚚 ${d.rotaAtualNome || 'Em rota'}`;
  else if (d.motoristaAtual) infoStatus = `👤 <b style="color:var(--white)">${d.motoristaAtual}</b>${d.turnoAtivoDesde ? ' · desde ' + fmtHoraBR(d.turnoAtivoDesde) : ''}`;
  else if (e.status === 'manutencao') infoStatus = '🔧 Em manutenção';
  else if (e.status === 'reserva') infoStatus = '🅿️ Em reserva';
  else infoStatus = `🌙 Expediente ${e.expedienteInicio || '-'} às ${e.expedienteFim || '-'} · sem turno ativo`;

  qs('#painel-equip-conteudo').innerHTML = `
    <div class="equip-card" style="cursor:default">
      <div class="eq-top">
        <div>
          <div class="eq-code">${e.codigo}</div>
          <div class="eq-sub">${e.modelo || '—'}${e.categoria ? ' • ' + e.categoria : ''}</div>
        </div>
        <span class="status-badge ${st.cls}"><span class="dot"></span>${st.txt}</span>
      </div>
      <div class="eq-info">${infoStatus}</div>
    </div>

    ${d.motoristaAtual && d.turnoAtivoId && podeGerenciarFrota() ? `<button class="btn btn-danger" onclick="tirarMotoristaUI('${d.turnoAtivoId}', '${(d.motoristaAtual || '').replace(/'/g, '')}')">🚫 Tirar motorista do equipamento</button>` : ''}

    <div class="card">
      <div class="stat-tiles cols2">
        <div class="stat-tile"><div class="v">${_fmtNum(e.kmAtual, 0)}</div><div class="k">KM</div></div>
        <div class="stat-tile"><div class="v">${_fmtNum(e.horimetroAtual, 0)}</div><div class="k">Horímetro</div></div>
      </div>
      <div class="stat-tiles">
        <div class="stat-tile"><div class="v">${d.totalViagens}</div><div class="k">Viagens</div></div>
        <div class="stat-tile"><div class="v">${d.totalAbastecimentos}</div><div class="k">Abastec.</div></div>
        <div class="stat-tile"><div class="v">${d.totalLubrificacoes}</div><div class="k">Lubrific.</div></div>
      </div>
      <div class="eq-meta"><span>📅 Última manutenção <b>${d.ultimaManutencao ? fmtDataBR(d.ultimaManutencao.entradaEm) : '—'}</b></span></div>
    </div>
    <button class="btn btn-outline" onclick="alternarManutencaoEquipPainelUI('${e.id}')">${e.status === 'manutencao' ? '🔧 Retornar da Manutenção' : '🔧 Enviar para Manutenção'}</button>
    ${e.status !== 'manutencao' ? `<button class="btn btn-outline" onclick="alternarReservaUI('${e.id}')">${e.status === 'reserva' ? '▶️ Tirar da Reserva' : '🅿️ Colocar em Reserva'}</button>` : ''}
    <button class="btn btn-secondary" onclick="alternarHistoricoEquipamentoUI()">📋 Histórico</button>
    <div id="painel-equip-historico" class="hidden"></div>
    ${podeGerenciarFrota() ? `
    <div class="btn-row mt12">
      <button class="btn btn-outline" onclick="editarEquipamentoUI('${e.id}')">✏️ Editar</button>
      <button class="btn ${e.ativo === false ? 'btn-primary' : 'btn-danger'}" onclick="alternarAtivoEquipamentoUI('${e.id}')">${e.ativo === false ? '▶️ Ativar' : '⏸ Desativar'}</button>
    </div>` : ''}
    <button class="btn btn-ghost" onclick="navigate('${_origemPainelEquip || 'painel'}')">Voltar</button>
  `;

  // Se veio das Viagens ("ver histórico do equipamento"), já abre o histórico
  if (_abrirHistoricoEquip) {
    _abrirHistoricoEquip = false;
    alternarHistoricoEquipamentoUI();
  }
}

// Gestão encerra o turno do motorista (libera o equipamento)
async function tirarMotoristaUI(turnoId, motoristaNome) {
  if (!podeGerenciarFrota()) { showToast('Acesso restrito à gestão', 'var(--iron)'); return; }
  if (!confirm(`Tirar ${motoristaNome || 'o motorista'} deste equipamento?\n\nO turno será encerrado e o equipamento ficará livre.`)) return;
  const r = await Motorista.encerrarTurnoPorGestao(turnoId);
  if (r && r.erro) { showToast(r.erro, 'var(--iron)'); return; }
  if (typeof Log !== 'undefined') Log.registrar('editar', { tipo: 'turno_encerrado_gestao', turnoId });
  showToast('✅ Motorista removido — equipamento liberado');
  renderPainelEquip();
}

function alternarManutencaoEquipPainelUI(id) {
  if (!Permissoes.podeAlternarManutencao()) { showToast('Acesso restrito', 'var(--iron)'); return; }
  DB.get('equipamentos', id).then(e => {
    // ao ENTRAR em manutenção, pergunta o motivo; ao RETORNAR, não precisa
    if (e.status !== 'manutencao') {
      abrirModalFormulario({
        titulo: '🔧 Enviar para Manutenção',
        subtitulo: e.codigo,
        campos: [{ id: 'motivo', label: 'Motivo', placeholder: 'Ex: Troca de pneu, revisão programada...' }],
        textoSalvar: 'Confirmar',
        aoSalvar: (v) => {
          Equipamentos.alternarManutencao(id, v.motivo).then(() => {
            showToast('🔧 Equipamento em manutenção');
            renderPainelEquip();
          });
        }
      });
    } else {
      Equipamentos.alternarManutencao(id).then(() => {
        showToast('✅ Retornou da manutenção');
        renderPainelEquip();
      });
    }
  });
}

function alternarReservaUI(id) {
  if (!Permissoes.podeAlternarManutencao()) { showToast('Acesso restrito', 'var(--iron)'); return; }
  Equipamentos.alternarReserva(id).then(() => {
    showToast('✅ Atualizado');
    renderPainelEquip();
  });
}

async function alternarHistoricoEquipamentoUI() {
  const box = qs('#painel-equip-historico');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  const d = await Dashboard.detalheEquipamento(_equipamentoSelecionadoId);

  const gestao = Permissoes.podeVerTudoOperacional();
  const viagensVisiveis = Permissoes.filtrarPorVisibilidade(d.viagens, 'motoristaId');
  const deslocVisiveis = Permissoes.filtrarPorVisibilidade(d.deslocamentos, 'motoristaId');

  // Resumo por trajeto (viagens de hoje) + melhor tempo por trajeto (p/ marcar recorde 🏆)
  const hoje = todayKey();
  const viagensHoje = viagensVisiveis.filter(v => v.dia === hoje);
  const resumo = _resumoPorTrajeto(viagensHoje);
  const melhorPorTrajeto = {};
  resumo.forEach(t => { melhorPorTrajeto[t.trajeto] = t.melhorMs; });

  // ---- OPERAÇÃO: viagens, deslocamentos e paradas em sequência ----
  const opItens = [];
  viagensVisiveis.forEach(v => {
    const temTrajeto = (v.trilha && v.trilha.length >= 2) || (v.localInicio && v.localFim);
    const recorde = v.tempoTotalMs && melhorPorTrajeto[v.rotaNome] === v.tempoTotalMs;
    opItens.push({
      quando: v.inicioEm, cls: 'v',
      t: `🚛 ${v.rotaNome}`,
      s: `Viagem · ${fmtHoraBR(v.inicioEm)}${v.descarregadoEm ? ' → ' + fmtHoraBR(v.descarregadoEm) : ' (em andamento)'}${v.motoristaNome ? ' · ' + v.motoristaNome : ''}`,
      durHtml: _durBadge(v.tempoTotalMs, recorde ? 'good' : ''),
      actionsHtml: `${temTrajeto ? `<button class="li-fav" onclick="abrirTrajetoViagem('${v.id}')" title="Ver trajeto">🗺️</button>` : ''}${gestao ? `<button class="li-fav" onclick="editarViagemUI('${v.id}')">✏️</button><button class="li-fav" onclick="apagarViagemUI('${v.id}')">🗑️</button>` : ''}`
    });
  });
  deslocVisiveis.forEach(x => {
    const temTrajeto = (x.trilha && x.trilha.length >= 2) || (x.localInicio && x.localFim);
    opItens.push({
      quando: x.inicioEm, cls: 'd', desl: true,
      t: `🚚 ${x.origem} → ${x.destino}`,
      s: `Deslocamento${x.motivo ? ' · ' + x.motivo : ''} · ${fmtHoraBR(x.inicioEm)}${x.fimEm ? ' → ' + fmtHoraBR(x.fimEm) : ''}`,
      durHtml: _durBadge(x.tempoTotalMs, ''),
      actionsHtml: `${temTrajeto ? `<button class="li-fav" onclick="abrirTrajetoDeslocamento('${x.id}')" title="Ver trajeto">🗺️</button>` : ''}${gestao ? `<button class="li-fav" onclick="apagarDeslocamentoUI('${x.id}')">🗑️</button>` : ''}`
    });
  });
  (d.paradas || []).forEach(p => {
    opItens.push({
      quando: p.inicioEm, cls: p.subtipo === 'carregamento' ? 'f' : 'p',
      t: `${p.icone || '⏱️'} ${p.nome || 'Parada'}`,
      s: `${fmtHoraBR(p.inicioEm)}${p.motoristaNome ? ' · ' + p.motoristaNome : ''}`,
      durHtml: _durBadge(p.tempoTotalMs || 0, p.atrasoMs > 0 ? 'bad' : '') + (p.atrasoMs > 0 ? ` <span class="dur-badge bad">+${fmtDuracao(p.atrasoMs)}</span>` : '')
    });
  });

  // ---- MANUTENÇÃO: manutenções, abastecimentos e lubrificações ----
  const podeApagarManutencao = podeGerenciarFrota();
  const mntItens = [
    ...d.manutencoes.map(m => ({
      quando: m.entradaEm, cls: 'm',
      t: `🔧 Manutenção${m.motivo ? ' — ' + m.motivo : ''}`,
      s: `Entrou ${fmtDataHoraBR(m.entradaEm)}${m.saidaEm ? ' · retornou ' + fmtDataHoraBR(m.saidaEm) : ' · ainda em manutenção'}`,
      actionsHtml: (podeApagarManutencao ? `<button class="li-fav" onclick="apagarManutencaoUI('${m.id}')">🗑️</button>` : '')
    })),
    ...d.abasts.map(a => ({ quando: a.criadoEm, cls: 'p', t: `⛽ Abastecimento`, s: `${a.litros} L · ${fmtHoraBR(a.criadoEm)}` })),
    ...d.lubs.map(l => ({ quando: l.criadoEm, cls: 'p', t: `🛠 Lubrificação`, s: `${l.tipoServico} · ${fmtHoraBR(l.criadoEm)}` }))
  ];

  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="btn-row mt16" style="gap:8px">
      <button class="btn btn-sm btn-primary" id="hist-tab-op" onclick="_abaHistEquip('operacao')">🚛 Operação</button>
      <button class="btn btn-sm btn-outline" id="hist-tab-mnt" onclick="_abaHistEquip('manutencao')">🔧 Manutenção</button>
    </div>
    <div id="hist-op" class="mt8">${_htmlResumoTrajeto(resumo, '🚛 Trajetos de hoje')}${_htmlTimeline(opItens)}</div>
    <div id="hist-mnt" class="mt8 hidden">${_htmlTimeline(mntItens)}</div>`;
}

// Alterna entre as abas Operação / Manutenção do histórico do equipamento.
function _abaHistEquip(qual) {
  const op = qs('#hist-op'), mnt = qs('#hist-mnt');
  const tabOp = qs('#hist-tab-op'), tabMnt = qs('#hist-tab-mnt');
  const ativo = qual === 'manutencao';
  if (op) op.classList.toggle('hidden', ativo);
  if (mnt) mnt.classList.toggle('hidden', !ativo);
  if (tabOp) { tabOp.classList.toggle('btn-primary', !ativo); tabOp.classList.toggle('btn-outline', ativo); }
  if (tabMnt) { tabMnt.classList.toggle('btn-primary', ativo); tabMnt.classList.toggle('btn-outline', !ativo); }
}

async function apagarManutencaoUI(id) {
  if (!confirm('Apagar este lançamento de manutenção? Use isso se foi lançado por engano.')) return;
  const r = await Equipamentos.removerManutencao(id);
  if (r && r.erro) { showToast(r.erro, 'var(--iron)'); return; }
  showToast('🗑️ Lançamento de manutenção apagado');
  // fecha e reabre pra recarregar a lista com os dados atualizados
  alternarHistoricoEquipamentoUI();
  alternarHistoricoEquipamentoUI();
}

function editarEquipamentoUI(id) {
  if (!podeGerenciarFrota()) { showToast('Acesso restrito', 'var(--iron)'); return; }
  DB.get('equipamentos', id).then(e => {
    abrirModalFormulario({
      titulo: '✏️ Editar Equipamento',
      campos: [
        { id: 'codigo', label: 'Código / placa', valor: e.codigo },
        { id: 'modelo', label: 'Modelo', valor: e.modelo },
        { id: 'categoria', label: 'Categoria', tipo: 'select', valor: e.categoria, opcoes: [
          { valor: 'Caminhão', texto: 'Caminhão' },
          { valor: 'Escavadeira', texto: 'Escavadeira' },
          { valor: 'Pá-carregadeira', texto: 'Pá-carregadeira' },
          { valor: 'Perfuratriz', texto: 'Perfuratriz' },
          { valor: 'Outro', texto: 'Outro' }
        ]},
        { id: 'kmAtual', label: 'KM atual', tipo: 'number', valor: e.kmAtual },
        { id: 'horimetroAtual', label: 'Horímetro atual', tipo: 'number', valor: e.horimetroAtual },
        { id: 'expedienteInicio', label: 'Início do expediente', tipo: 'time', valor: e.expedienteInicio || '07:00' },
        { id: 'expedienteFim', label: 'Fim do expediente', tipo: 'time', valor: e.expedienteFim || '19:00' }
      ],
      aoSalvar: (v) => {
        Equipamentos.salvar({ id: e.id, ...v, status: e.status }).then(() => {
          showToast('✅ Equipamento atualizado');
          renderPainelEquip();
        });
      }
    });
  });
}

function alternarAtivoEquipamentoUI(id) {
  if (!podeGerenciarFrota()) { showToast('Acesso restrito', 'var(--iron)'); return; }
  Equipamentos.alternarAtivo(id).then(() => {
    showToast('✅ Atualizado');
    renderPainelEquip();
  });
}

// ---------- CONFIGURAÇÕES / SINCRONIZAÇÃO ----------
async function renderConfig() {
  const apiUrl = await DB.getConfig('api_url', '');
  qs('#config-api-url').value = apiUrl;
  qs('#config-token').value = await DB.getConfig('sync_token', '');
  const pendentes = await Sync.pendentes();
  const ultima = await DB.getConfig('ultima_sincronizacao', null);
  const tema = await DB.getConfig('tema', 'escuro');
  const marcaNome = (window.MARCA && MARCA.nome) || 'STRACTA';
  qs('#config-versao').textContent = `${marcaNome} · v${APP_VERSION} · por GP2T`;
  qs('#config-tema-btn').textContent = tema === 'escuro' ? '🌙 Tema Escuro (tocar para claro)' : '☀️ Tema Claro (tocar para escuro)';

  const usuarioAtual = Auth.usuarioAtual();
  qs('#btn-diagnostico').classList.toggle('hidden', !Permissoes.podeVerDiagnostico());
  qs('#btn-usuarios').classList.toggle('hidden', !Permissoes.podeGerenciarUsuarios());
  const bTest = qs('#btn-testar-operacao'); if (bTest) bTest.classList.toggle('hidden', !Permissoes.podeVerDiagnostico());
  const bApag = qs('#btn-apagar-teste'); if (bApag) bApag.classList.toggle('hidden', !Permissoes.podeVerDiagnostico());

  // Identidade da empresa (white-label) — só Administrador
  const idBox = qs('#config-identidade');
  if (idBox) {
    idBox.classList.toggle('hidden', !Permissoes.podeGerenciarUsuarios());
    qs('#cfg-empresa-nome').value = await DB.getConfig('empresa_nome', 'STRACTA');
    qs('#cfg-empresa-slogan').value = await DB.getConfig('empresa_slogan', 'Controle operacional da frota');
  }

  let statusLinha;
  if (!estaOnline()) {
    statusLinha = `<span style="color:var(--iron)">🔴 Sem internet</span>`;
  } else if (pendentes.length > 0) {
    statusLinha = `<span style="color:var(--amber)">🟡 ${pendentes.length} pendente${pendentes.length > 1 ? 's' : ''}</span>`;
  } else {
    statusLinha = `<span style="color:var(--green)">🟢 Sincronizado</span>`;
  }

  qs('#config-status').innerHTML = `
    <div class="row-kv"><span class="k">☁ Status</span><span class="v">${statusLinha}</span></div>
    <div class="row-kv"><span class="k">Última sincronização</span><span class="v">${ultima ? fmtDataHoraBR(ultima) : '—'}</span></div>`;

  // status do Firebase (Fase 1 — modo híbrido)
  const firebaseCfg = await DB.getConfig('firebase_config', null);
  const campoFirebase = qs('#config-firebase');
  if (campoFirebase && !campoFirebase.value && firebaseCfg) {
    campoFirebase.value = JSON.stringify(firebaseCfg, null, 2);
  }
  const statusFirebase = qs('#config-firebase-status');
  if (statusFirebase) {
    if (!firebaseCfg) {
      statusFirebase.innerHTML = `<div class="row-kv"><span class="k">Status</span><span class="v text-label">Não configurado</span></div>`;
    } else {
      const ok = typeof FirebaseSync !== 'undefined' && FirebaseSync._pronto;
      statusFirebase.innerHTML = `<div class="row-kv"><span class="k">Status</span><span class="v" style="color:${ok ? 'var(--green)' : 'var(--amber)'}">${ok ? '🟢 Conectado (tempo real ativo)' : '🟡 Configurado — conectando...'}</span></div>`;
    }
  }
}

async function salvarFirebaseConfigUI() {
  const texto = qs('#config-firebase').value.trim();
  if (!texto) {
    await DB.setConfig('firebase_config', null);
    showToast('Configuração do Firebase removida');
    renderConfig();
    return;
  }
  let cfg;
  try {
    // aceita tanto JSON válido quanto o objeto "cru" que o Firebase mostra no console
    cfg = Function('"use strict"; return (' + texto + ')')();
  } catch (e) {
    showToast('Não consegui ler essa configuração — confira se copiou certinho', 'var(--iron)');
    return;
  }
  if (!cfg || !cfg.projectId) {
    showToast('Configuração incompleta — falta o projectId', 'var(--iron)');
    return;
  }
  await DB.setConfig('firebase_config', cfg);
  showToast('✅ Configuração do Firebase salva! Conectando...');
  const ok = await FirebaseSync.iniciar();
  if (ok) {
    showToast('🔥 Firebase conectado — enviando dados existentes...');
    const r = await Sync.reenviarTudoParaFirebase();
    if (r.sucesso) showToast(`✅ ${r.total} registro(s) enviado(s) para o Firebase!`);
    Sync.sincronizarTudo();
  } else {
    showToast('Não consegui conectar ao Firebase — confira a configuração', 'var(--iron)');
  }
  renderConfig();
}

async function salvarApiUrl() {
  const url = qs('#config-api-url').value.trim();
  const token = qs('#config-token').value.trim();
  await DB.setConfig('api_url', url);
  await DB.setConfig('sync_token', token);
  showToast('✅ Endereço salvo');
  if (url && estaOnline()) Sync.sincronizarTudo();
}

async function sincronizarAgora() {
  showToast('🔄 Sincronizando...', 'var(--amber)');
  const mudou = await Sync.sincronizarTudo();
  await renderConfig();
  await atualizarStatusConexao();
  showToast(mudou ? '✅ Dados atualizados de outros aparelhos!' : '✅ Sincronização concluída');
  // atualiza a tela atual caso ela dependa de dados que podem ter mudado
  const telaAtiva = qs('.screen.active');
  if (telaAtiva) {
    const id = telaAtiva.id.replace('screen-', '');
    const renderers = { home: renderHome, operacao: renderOperacao, viagens: renderViagens, frota: renderFrota, painel: renderPainel, 'painel-equip': renderPainelEquip };
    if (renderers[id]) renderers[id]();
  }
}

// ---------- USUÁRIOS ----------
async function renderUsuarios() {
  const usuarios = await Auth.listarUsuarios();
  const atual = Auth.usuarioAtual();
  qs('#usuarios-lista').innerHTML = usuarios.length ? usuarios.map(u => `
    <div class="list-item">
      <div>
        <div class="li-main">${u.nome}${atual && atual.id === u.id ? ' (você)' : ''}</div>
        <div class="li-sub">${u.usuario} • ${u.nivel}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-outline btn-sm" onclick="resetarSenhaUI('${u.id}')">🔑 Senha</button>
        ${atual && atual.id !== u.id ? `<button class="li-fav" onclick="apagarUsuarioUI('${u.id}')">🗑️</button>` : ''}
      </div>
    </div>`).join('') : `<div class="empty-state"><span class="emoji">👤</span>Nenhum usuário cadastrado.</div>`;
}

async function resetarSenhaUI(id) {
  const novaSenha = prompt('Nova senha para este usuário (mínimo 4 caracteres):');
  if (!novaSenha) return;
  const r = await Auth.resetarSenha(id, novaSenha);
  if (!r.sucesso) { showToast(r.erro, 'var(--iron)'); return; }
  Log.registrar('editar', { tipo: 'usuario_senha', id });
  showToast('🔑 Senha atualizada!');
}

async function criarUsuarioUI() {
  const nome = qs('#user-nome').value.trim();
  const usuario = qs('#user-login').value.trim();
  const senha = qs('#user-senha').value;
  const nivel = qs('#user-nivel').value;

  const r = await Auth.criarUsuario({ usuario, senha, nome, nivel });
  if (!r.sucesso) { showToast(r.erro, 'var(--iron)'); return; }
  Log.registrar('criar', { tipo: 'usuario', usuario, nivel });

  showToast(`✅ Usuário ${nome} criado!`);
  qs('#user-nome').value = ''; qs('#user-login').value = ''; qs('#user-senha').value = '';
  renderUsuarios();
}

async function apagarUsuarioUI(id) {
  if (!confirm('Remover este usuário?')) return;
  const r = await Auth.removerUsuario(id);
  if (!r.sucesso) { showToast(r.erro, 'var(--iron)'); return; }
  Log.registrar('excluir', { tipo: 'usuario', id });
  showToast('🗑️ Usuário removido');
  renderUsuarios();
}

// ---------- DIAGNÓSTICO (só Desenvolvedor) ----------
async function renderDiagnostico() {
  qs('#diagnostico-progresso').textContent = '';
  qs('#diagnostico-resultado').innerHTML = `<div class="empty-state"><span class="emoji">🧪</span>Toque em "Rodar Diagnóstico" para testar o sistema.</div>`;
}

async function reenviarFirebaseUI() {
  const progresso = qs('#diagnostico-progresso');
  progresso.textContent = 'Enviando dados existentes...';
  const r = await Sync.reenviarTudoParaTudo((origem, i, total, tipo, qtd) => {
    progresso.textContent = `[${origem}] Enviando ${tipo} (${qtd} registro(s))... (${i}/${total})`;
  });
  const partes = [];
  if (r.firebase.sucesso) partes.push(`Firebase: ${r.firebase.total}`); else partes.push(`Firebase: ${r.firebase.erro}`);
  if (r.sheets.sucesso) partes.push(`Sheets: ${r.sheets.total}`); else partes.push(`Sheets: ${r.sheets.erro}`);
  progresso.textContent = `✅ Concluído — ${partes.join(' • ')}`;
  showToast(`🔥 Reenviado! ${partes.join(' • ')}`);
}

// Zera todos os dados locais deste aparelho (mantém a configuração de
// conexão — link do Sheets, token, config do Firebase — pra não precisar
// reconfigurar). Usado antes de começar a operação de verdade, depois de
// já ter limpado o Firebase e o Sheets, pra não sincronizar sujeira de volta.
async function resetarDadosLocaisUI() {
  const confirmacao = prompt('Isso vai apagar os dados de operação deste aparelho (viagens, turnos, deslocamentos, etc). Os USUÁRIOS e a configuração de conexão são mantidos. Se você só quer atualizar o app, use "🔄 Atualizar" — não precisa apagar nada. Digite CONFIRMAR para prosseguir:');
  if (!confirmacao || confirmacao.trim().toUpperCase() !== 'CONFIRMAR') { showToast('Cancelado'); return; }
  await executarResetLocal();
  setTimeout(() => window.location.reload(), 1200);
}

// A limpeza de verdade — reaproveitada tanto pelo botão manual quanto
// pelo reset automático disparado remotamente por outro aparelho.
async function executarResetLocal() {
  // NÃO limpa 'usuarios' — os logins são preservados mesmo ao zerar os dados.
  const storesParaLimpar = [
    'motoristas', 'equipamentos', 'rotas', 'rotasDeslocamento', 'viagens',
    'deslocamentos', 'abastecimentos', 'lubrificacoes', 'manutencoes',
    'turnos', 'logs', 'syncQueue'
  ];
  for (const store of storesParaLimpar) {
    await DB.clear(store);
  }
  for (const tipo of Object.keys(Sync._storePorTipo)) {
    await DB.setConfig(`ultima_busca_${tipo}`, '');
  }
  await DB.setConfig('ultima_sincronizacao', null);
  localStorage.removeItem('stracta_viagens_sessao');
  localStorage.removeItem('stracta_viagens_turno_ativo_id');
  showToast('🗑️ Dados locais zerados! Recarregando...');
}

// Força a atualização do app SEM apagar dados: limpa apenas o cache do Service
// Worker e desregistra o SW, depois recarrega. O IndexedDB (viagens, turnos,
// usuários...) NÃO é tocado — nada é perdido.
async function forcarAtualizacaoUI() {
  showToast('🔄 Atualizando o aplicativo...', 'var(--blue)', 4000);
  try {
    if ('caches' in window) {
      const chaves = await caches.keys();
      await Promise.all(chaves.map(c => caches.delete(c)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) { console.warn('Falha ao limpar cache', e); }
  setTimeout(() => window.location.reload(), 900);
}

// Pede que TODOS os aparelhos conectados se atualizem (sem apagar dados).
async function dispararAtualizacaoRemotaUI() {
  if (!Permissoes.podeVerTudoOperacional()) { showToast('Acesso restrito à gestão', 'var(--iron)'); return; }
  if (!confirm('Atualizar o app em TODOS os aparelhos conectados? Ninguém perde dados (viagens, turnos, etc.) — só pega a versão nova.')) return;
  const usuario = Auth.usuarioAtual();
  const r = await FirebaseSync.dispararAtualizacaoRemota(usuario ? usuario.nome : 'Gestão');
  if (!r || !r.sucesso) { showToast((r && r.erro) || 'Falha ao enviar', 'var(--iron)'); return; }
  showToast('📡 Atualização enviada! Os aparelhos vão se atualizar em instantes (sem perder dados).');
}

// Escuta comandos remotos (por um gestor em qualquer aparelho) e reage sozinho:
// - resetEm     → limpa os dados locais (mantendo usuários) e recarrega
// - atualizarEm → só atualiza o app (limpa cache do SW), SEM apagar dados
async function iniciarEscutaResetRemoto() {
  if (typeof FirebaseSync === 'undefined') return;
  const configurado = await FirebaseSync.configurado();
  if (!configurado) return;
  FirebaseSync.escutarComandoReset(async (comando) => {
    const jaReset = await DB.getConfig('ultimo_reset_processado', '');
    if (comando.resetEm && comando.resetEm > jaReset) {
      await DB.setConfig('ultimo_reset_processado', comando.resetEm);
      showToast(`🗑️ Reset remoto disparado por ${comando.disparadoPor} — limpando...`, 'var(--iron)', 4000);
      await executarResetLocal();
      setTimeout(() => window.location.reload(), 2000);
      return;
    }
    const jaAtualizou = await DB.getConfig('ultima_atualizacao_processada', '');
    if (comando.atualizarEm && comando.atualizarEm > jaAtualizou) {
      await DB.setConfig('ultima_atualizacao_processada', comando.atualizarEm);
      showToast(`🔄 Atualização enviada por ${comando.atualizadoPor || 'gestão'} — atualizando...`, 'var(--blue)', 4000);
      await forcarAtualizacaoUI();
    }
  });
}

// Dispara o reset em TODOS os aparelhos conectados de uma vez (Desenvolvedor)
async function dispararResetRemotoUI() {
  if (!Permissoes.podeVerDiagnostico()) { showToast('Acesso restrito', 'var(--iron)'); return; }
  const confirmacao = prompt('Isso vai apagar os dados locais de TODOS os aparelhos conectados ao Firebase (cada um vai se limpar sozinho ao detectar o comando). Digite CONFIRMAR para prosseguir:');
  if (!confirmacao || confirmacao.trim().toUpperCase() !== 'CONFIRMAR') { showToast('Cancelado'); return; }
  const usuario = Auth.usuarioAtual();
  const r = await FirebaseSync.dispararResetRemoto(usuario ? usuario.nome : 'Desenvolvedor');
  if (!r.sucesso) { showToast(r.erro, 'var(--iron)'); return; }
  showToast('📡 Comando enviado! Os aparelhos conectados vão se limpar sozinhos em instantes.');
  // este próprio aparelho também reage ao seu comando, como os outros
}

async function rodarDiagnosticoUI() {
  const progresso = qs('#diagnostico-progresso');
  const area = qs('#diagnostico-resultado');
  area.innerHTML = '';
  progresso.textContent = 'Iniciando...';

  const r = await Diagnostico.rodar((i, total, tipo) => {
    progresso.textContent = `Verificando ${tipo}... (${i}/${total})`;
  });

  progresso.textContent = `Concluído em ${fmtDataHoraBR(r.geradoEm)}`;

  const corSaude = { ok: 'var(--green)', atencao: 'var(--amber)', erro: 'var(--iron)' }[r.saudeGeral.nivel];

  let html = `
    <div class="card text-center">
      <div style="font-size:16px;font-weight:700;color:${corSaude}">${r.saudeGeral.texto}</div>
    </div>
    <div class="card">
      <div class="row-kv"><span class="k">Conexão</span><span class="v">${r.online ? '🟢 Online' : '🔴 Offline'}</span></div>
      <div class="row-kv"><span class="k">Google Sheets (backup)</span><span class="v">${r.sheetsConfigurado ? '✅ Configurado' : '⚪ Não configurado'}</span></div>
      <div class="row-kv"><span class="k">Firebase</span><span class="v">${r.firebaseConfigurado ? '✅ Configurado' : '⚪ Não configurado'}</span></div>
      <div class="row-kv"><span class="k">Listeners em tempo real</span><span class="v">${r.listenersAtivos ? '🟢 Ativos' : '⚪ Inativos'}</span></div>
      <div class="row-kv"><span class="k">UID Firebase</span><span class="v" style="font-size:11px">${r.firebaseUid || '—'}</span></div>
      <div class="row-kv"><span class="k">ID do aparelho</span><span class="v" style="font-size:11px">${r.dispositivo}</span></div>
      <div class="row-kv"><span class="k">Versão do app</span><span class="v">${r.versao}</span></div>
      <div class="row-kv"><span class="k">Pendentes na fila</span><span class="v">${r.pendentesFila}</span></div>
      <div class="row-kv"><span class="k">Pendentes com erro</span><span class="v" style="color:${r.erroPendentes ? 'var(--iron)' : 'inherit'}">${r.erroPendentes}</span></div>
    </div>
    <div class="card-title mt16">Comparativo por tipo</div>
  `;

  html += r.porTipo.map(t => {
    const fmt = (res) => res.ok ? res.total : (res.motivo === 'Não configurado' ? '—' : `❌ ${res.motivo}`);
    return `
    <div class="list-item" style="flex-direction:column;align-items:stretch">
      <div class="li-main">${t.tipo}${t.divergente ? ' ⚠️' : ''}</div>
      <div class="li-sub" style="${t.divergente ? 'color:var(--amber)' : ''}">
        IndexedDB: ${t.local ?? '—'} • Sheets (backup): ${fmt(t.sheets)} (${t.sheets.ms ?? '—'}ms) • Firebase: ${fmt(t.firebase)} (${t.firebase.ms ?? '—'}ms)
      </div>
    </div>`;
  }).join('');

  area.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', iniciarApp);
