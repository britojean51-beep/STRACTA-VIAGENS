/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — sync.js (Enterprise)
   Fila de sincronização offline → online, em lote, incremental,
   com suporte a exclusão e token de segurança.
   ══════════════════════════════════════════════════════════ */

const DISPOSITIVO_CHAVE = 'stracta_viagens_dispositivo_id';

function dispositivoId() {
  let id = localStorage.getItem(DISPOSITIVO_CHAVE);
  if (!id) {
    id = gerarId('disp');
    localStorage.setItem(DISPOSITIVO_CHAVE, id);
  }
  return id;
}

const Sync = {
  _enviando: false,
  _listeners: [],

  onStatusChange(fn) { this._listeners.push(fn); },
  _notificar(status) { this._listeners.forEach(fn => { try { fn(status); } catch (e) {} }); },

  async apiUrl() { return DB.getConfig('api_url', ''); },
  async token() { return DB.getConfig('sync_token', ''); },

  async _usuarioLogin() {
    try {
      const u = JSON.parse(localStorage.getItem('stracta_viagens_sessao') || 'null');
      return u ? u.usuario : '';
    } catch (e) { return ''; }
  },

  // Adiciona uma operação à fila (chamado sempre que salvamos algo importante)
  async enfileirar(tipo, dados) {
    const item = {
      id: gerarId('sync'),
      tipo,
      dados,
      status: 'pendente', // pendente | enviado | erro
      criadoEm: agoraISO(),
      tentativas: 0
    };
    await DB.put('syncQueue', item);
    this._notificar({ tipo: 'enfileirado', item });
    if (estaOnline()) this.processarFila();

    // FASE 1 Firebase: além de enfileirar para o Sheets, envia também
    // em tempo real para o Firestore, se estiver configurado (não bloqueia,
    // não quebra nada se o Firebase não estiver configurado/disponível)
    if (typeof FirebaseSync !== 'undefined' && estaOnline()) {
      FirebaseSync.push(tipo, dados).catch(() => {});
    }
    return item;
  },

  // Marca uma exclusão para propagar aos outros aparelhos
  async enfileirarExclusao(tipo, id) {
    const item = {
      id: gerarId('sync'),
      tipo,
      exclusao: true,
      idAlvo: id,
      status: 'pendente',
      criadoEm: agoraISO(),
      tentativas: 0
    };
    await DB.put('syncQueue', item);
    if (estaOnline()) this.processarFila();

    if (typeof FirebaseSync !== 'undefined' && estaOnline()) {
      FirebaseSync.excluir(tipo, id).catch(() => {});
    }
    return item;
  },

  async pendentes() {
    const todos = await DB.getAll('syncQueue');
    return todos.filter(i => i.status === 'pendente' || i.status === 'erro');
  },

  // Envia tudo que está pendente em UM ÚNICO POST (lote), mais rápido que um por um.
  // Exclusões vão em chamadas separadas (protocolo diferente no backend).
  async processarFila() {
    if (this._enviando) return;
    const apiUrl = await this.apiUrl();
    if (!apiUrl) return; // sem backend configurado ainda — permanece só local, sem erro

    this._enviando = true;
    this._notificar({ tipo: 'sincronizando' });

    const pendentes = await this.pendentes();
    const usuario = await this._usuarioLogin();
    const dispositivo = dispositivoId();
    const token = await this.token();

    const exclusoes = pendentes.filter(i => i.exclusao);
    const envios = pendentes.filter(i => !i.exclusao);

    // ---- envio em lote ----
    if (envios.length) {
      try {
        const lote = envios.map(i => ({ tipo: i.tipo, registro: i.dados }));
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ modo: 'sync', lote, usuario, dispositivo, token })
        });
        const json = await resp.json().catch(() => null);
        if (resp.ok && json && json.sucesso !== false) {
          for (const item of envios) { item.status = 'enviado'; item.enviadoEm = agoraISO(); await DB.put('syncQueue', item); }
        } else {
          throw new Error((json && json.erro) || 'Falha ao enviar lote');
        }
      } catch (e) {
        for (const item of envios) {
          item.status = 'erro'; item.tentativas = (item.tentativas || 0) + 1; item.ultimoErro = String(e);
          await DB.put('syncQueue', item);
        }
      }
    }

    // ---- exclusões (uma chamada por item, protocolo modo:delete) ----
    for (const item of exclusoes) {
      try {
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ modo: 'delete', tipo: item.tipo, id: item.idAlvo, usuario, dispositivo, token })
        });
        const json = await resp.json().catch(() => null);
        if (resp.ok && json && json.sucesso !== false) {
          item.status = 'enviado'; item.enviadoEm = agoraISO(); await DB.put('syncQueue', item);
        } else {
          throw new Error((json && json.erro) || 'Falha ao excluir');
        }
      } catch (e) {
        item.status = 'erro'; item.tentativas = (item.tentativas || 0) + 1; item.ultimoErro = String(e);
        await DB.put('syncQueue', item);
      }
    }

    await DB.setConfig('ultima_sincronizacao', agoraISO());
    this._enviando = false;
    this._notificar({ tipo: 'sincronizado', enviados: envios.length + exclusoes.length, total: pendentes.length });
  },

  // Busca só o que mudou desde a última vez (por tipo), usando ?desde=
  async buscarRemoto(tipo) {
    const apiUrl = await this.apiUrl();
    if (!apiUrl || !estaOnline()) return [];
    try {
      const desde = await DB.getConfig(`ultima_busca_${tipo}`, '');
      const token = await this.token();
      const params = new URLSearchParams({ modo: 'sync', tipo, dispositivo: dispositivoId() });
      if (desde) params.set('desde', desde);
      if (token) params.set('token', token);
      const resp = await fetch(`${apiUrl}?${params.toString()}`);
      const json = await resp.json();
      return (json && json.sucesso && json.registros) || [];
    } catch (e) {
      return [];
    }
  },

  _storePorTipo: {
    viagem: 'viagens',
    deslocamento: 'deslocamentos',
    abastecimento: 'abastecimentos',
    lubrificacao: 'lubrificacoes',
    turno: 'turnos',
    usuario: 'usuarios',
    equipamento: 'equipamentos',
    rota: 'rotas',
    rotaDeslocamento: 'rotasDeslocamento',
    manutencao: 'manutencoes',
    checklist: 'checklists',
    localizacao: 'localizacoes',
    area: 'areas',
    log: 'logs'
  },

  _carimboRegistro(r) {
    return r.editadoEm || r.atualizadoEm || r.encerradoEm || r.fimEm || r.descarregadoEm || r.criadoEm || r.inicioEm || '';
  },

  // Mescla os registros vindos de outro aparelho no banco local.
  // Registros marcados com _removido são apagados localmente (exclusão propagada).
  async mesclarRemotos(tipo, remotos) {
    const storeName = this._storePorTipo[tipo];
    if (!storeName || !remotos || !remotos.length) return false;
    let mudou = false;
    let maiorCarimbo = await DB.getConfig(`ultima_busca_${tipo}`, '');

    for (const remoto of remotos) {
      const carimboRemoto = this._carimboRegistro(remoto);
      if (carimboRemoto && carimboRemoto > maiorCarimbo) maiorCarimbo = carimboRemoto;

      if (remoto._removido) {
        await DB.delete(storeName, remoto.id).catch(() => {});
        mudou = true;
        continue;
      }
      const local = await DB.get(storeName, remoto.id);
      if (!local) {
        await DB.put(storeName, remoto);
        mudou = true;
      } else if (carimboRemoto > this._carimboRegistro(local)) {
        await DB.put(storeName, remoto);
        mudou = true;
      }
    }
    if (maiorCarimbo) await DB.setConfig(`ultima_busca_${tipo}`, maiorCarimbo);
    return mudou;
  },

  // Sincronização completa: envia pendências (lote) e busca novidades (incremental) de todos os tipos.
  async sincronizarTudo() {
    // envia o que estiver pendente (para Firebase e Sheets, os dois) — nunca bloqueia
    await this.processarFila();
    // Sheets agora é só backup silencioso: não busca/compara dados de lá no
    // dia a dia (ele é mais lento e às vezes falha, e isso não deve travar
    // nem atrasar a sincronização do app). O Firebase é a fonte de leitura.
    const mudouFirebase = await this._sincronizarFirebaseUmaVez();
    await DB.setConfig('ultima_sincronizacao', agoraISO());
    this._notificar({ tipo: 'sincronizado_completo', mudou: mudouFirebase });
    return mudouFirebase;
  },

  // FASE 1 Firebase — busca tudo uma vez (usado no início / sync manual) e
  // liga os listeners em tempo real (só precisa ligar uma vez por sessão)
  async _sincronizarFirebaseUmaVez() {
    if (typeof FirebaseSync === 'undefined' || !(await FirebaseSync.configurado())) return false;
    let algumaMudanca = false;
    for (const tipo of Object.keys(this._storePorTipo)) {
      const remotos = await FirebaseSync.buscarTudo(tipo);
      const mudou = await this.mesclarRemotos(tipo, remotos);
      if (mudou) algumaMudanca = true;
    }
    this._ligarTempoRealFirebase();
    return algumaMudanca;
  },

  _tempoRealLigado: false,
  _ligarTempoRealFirebase() {
    if (this._tempoRealLigado || typeof FirebaseSync === 'undefined') return;
    this._tempoRealLigado = true;
    FirebaseSync.escutarTudo(async (tipo, mudancas) => {
      const mudou = await this.mesclarRemotos(tipo, mudancas);
      if (mudou) this._notificar({ tipo: 'tempo_real', origem: 'firebase', dataTipo: tipo });
    });
  },

  // Envia TUDO que já existe localmente para o Firebase — necessário rodar uma vez
  // ao configurar o Firebase pela primeira vez em um aparelho que já tinha dados
  // (sem isso, o Firebase começa "zerado" mesmo com o app cheio de registros).
  async reenviarTudoParaFirebase(aoAtualizarProgresso) {
    if (typeof FirebaseSync === 'undefined' || !(await FirebaseSync.configurado())) {
      return { sucesso: false, erro: 'Firebase não configurado' };
    }
    const ok = await FirebaseSync.iniciar();
    if (!ok) return { sucesso: false, erro: 'Não foi possível conectar ao Firebase' };

    const tipos = Object.keys(this._storePorTipo);
    let total = 0;
    for (let i = 0; i < tipos.length; i++) {
      const tipo = tipos[i];
      const storeName = this._storePorTipo[tipo];
      const registros = await DB.getAll(storeName);
      if (aoAtualizarProgresso) aoAtualizarProgresso(i + 1, tipos.length, tipo, registros.length);
      for (const registro of registros) {
        await FirebaseSync.push(tipo, registro);
        total++;
      }
    }
    this._ligarTempoRealFirebase();
    return { sucesso: true, total };
  },

  // Igual ao de cima, mas para o Google Sheets — envia tudo que já existe
  // localmente, em lotes, usando o mesmo protocolo do doPost.
  async reenviarTudoParaSheets(aoAtualizarProgresso) {
    const apiUrl = await this.apiUrl();
    if (!apiUrl) return { sucesso: false, erro: 'Google Sheets não configurado' };

    const usuario = await this._usuarioLogin();
    const dispositivo = dispositivoId();
    const token = await this.token();
    const tipos = Object.keys(this._storePorTipo);
    let total = 0;

    for (let i = 0; i < tipos.length; i++) {
      const tipo = tipos[i];
      const storeName = this._storePorTipo[tipo];
      const registros = await DB.getAll(storeName);
      if (aoAtualizarProgresso) aoAtualizarProgresso(i + 1, tipos.length, tipo, registros.length);
      if (!registros.length) continue;

      // manda em lotes de 50 pra não estourar o tamanho do POST
      for (let j = 0; j < registros.length; j += 50) {
        const pedaco = registros.slice(j, j + 50);
        const lote = pedaco.map(r => ({ tipo, registro: r }));
        try {
          const resp = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ modo: 'sync', lote, usuario, dispositivo, token })
          });
          const json = await resp.json().catch(() => null);
          if (resp.ok && json && json.sucesso !== false) total += pedaco.length;
        } catch (e) { /* segue tentando os próximos tipos, mesmo se um lote falhar */ }
      }
    }
    return { sucesso: true, total };
  },

  // Reenvia tudo para as duas fontes de uma vez (Firebase + Sheets)
  async reenviarTudoParaTudo(aoAtualizarProgresso) {
    const rFirebase = await this.reenviarTudoParaFirebase((i, t, tipo, q) => {
      if (aoAtualizarProgresso) aoAtualizarProgresso('firebase', i, t, tipo, q);
    });
    const rSheets = await this.reenviarTudoParaSheets((i, t, tipo, q) => {
      if (aoAtualizarProgresso) aoAtualizarProgresso('sheets', i, t, tipo, q);
    });
    return { firebase: rFirebase, sheets: rSheets };
  },

  iniciarMonitoramento() {
    window.addEventListener('online', () => {
      showToast('🌐 Conectado — sincronizando...', 'var(--green)');
      if (typeof Log !== 'undefined') Log.registrar('sync_online');
      this.sincronizarTudo();
    });
    window.addEventListener('offline', () => {
      showToast('📴 Sem conexão — os dados continuam sendo salvos localmente', 'var(--amber)');
      if (typeof Log !== 'undefined') Log.registrar('sync_offline');
    });
    setInterval(() => { if (estaOnline()) this.sincronizarTudo(); }, 30000);

    // liga os listeners em tempo real do Firebase IMEDIATAMENTE, sem esperar
    // o ciclo do Sheets terminar (antes ficava "pendurado" atrás do Sheets)
    if (estaOnline() && typeof FirebaseSync !== 'undefined') {
      FirebaseSync.configurado().then(configurado => {
        if (configurado) this._ligarTempoRealFirebase();
      });
    }

    if (estaOnline()) this.sincronizarTudo();
  }
};

window.Sync = Sync;
window.dispositivoId = dispositivoId;
