/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — firebase-sync.js
   FASE 1 da migração: Firebase funciona em PARALELO ao Google
   Sheets (modo híbrido). Nada do que já existe é removido —
   isso só ADICIONA sincronização em tempo real via Firestore.

   Diferença chave em relação ao Google Sheets:
   o Firestore avisa o app IMEDIATAMENTE quando outro aparelho
   muda algo (onSnapshot), em vez de esperar o próximo ciclo de
   30 segundos.
   ══════════════════════════════════════════════════════════ */

const FirebaseSync = {
  _app: null,
  _db: null,
  _pronto: false,
  _listenersAtivos: {},

  _colecaoPorTipo: {
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
    parada: 'paradas',
    log: 'logs'
  },

  async configurado() {
    const cfg = await DB.getConfig('firebase_config', null);
    return !!cfg;
  },

  async iniciar() {
    if (this._pronto) return true;
    const cfg = await DB.getConfig('firebase_config', null);
    if (!cfg || typeof firebase === 'undefined') return false;

    try {
      this._app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
      this._db = firebase.firestore();
      try { await this._db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* já habilitado ou navegador não suporta — segue sem quebrar */ }

      // login anônimo — não substitui o login do app, é só para as regras
      // de segurança do Firestore exigirem "usuário autenticado"
      await firebase.auth().signInAnonymously().catch(() => {});

      this._pronto = true;
      return true;
    } catch (e) {
      console.log('Firebase indisponível:', e);
      return false;
    }
  },

  // Envia um registro para o Firestore (tempo real — os outros aparelhos recebem na hora)
  async push(tipo, registro) {
    const ok = await this.iniciar();
    if (!ok) return false;
    const colecao = this._colecaoPorTipo[tipo];
    if (!colecao) return false;
    try {
      await this._db.collection(colecao).doc(registro.id).set(
        { ...registro, _atualizadoEmFirestore: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return true;
    } catch (e) {
      console.log('Firebase push falhou:', e);
      return false;
    }
  },

  // Marca como removido (tombstone) — mantém histórico de que foi excluído
  async excluir(tipo, id) {
    const ok = await this.iniciar();
    if (!ok) return false;
    const colecao = this._colecaoPorTipo[tipo];
    if (!colecao) return false;
    try {
      await this._db.collection(colecao).doc(id).set(
        { _removido: true, _atualizadoEmFirestore: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return true;
    } catch (e) {
      return false;
    }
  },

  // Busca tudo uma vez (usado no primeiro carregamento / sincronização manual)
  async buscarTudo(tipo) {
    const ok = await this.iniciar();
    if (!ok) return [];
    const colecao = this._colecaoPorTipo[tipo];
    if (!colecao) return [];
    try {
      const snap = await this._db.collection(colecao).get();
      return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    } catch (e) {
      return [];
    }
  },

  // Escuta o Firestore pra um comando remoto de "resetar tudo" — usado quando
  // o Desenvolvedor dispara uma limpeza geral e quer que todos os aparelhos
  // se limpem sozinhos, sem precisar tocar em cada celular manualmente.
  async escutarComandoReset(aoReceber) {
    const ok = await this.iniciar();
    if (!ok) return;
    if (this._listenerReset) return; // já está escutando
    this._listenerReset = this._db.collection('sistema').doc('comandos').onSnapshot(doc => {
      if (doc.exists) aoReceber(doc.data());
    }, err => console.log('Listener de comando falhou:', err));
  },

  // Dispara o comando de reset — grava um carimbo de tempo que todos os
  // aparelhos conectados vão detectar e reagir sozinhos.
  async dispararResetRemoto(usuarioNome) {
    const ok = await this.iniciar();
    if (!ok) return { sucesso: false, erro: 'Firebase não conectado' };
    try {
      await this._db.collection('sistema').doc('comandos').set({
        resetEm: agoraISO(),
        disparadoPor: usuarioNome || 'desconhecido'
      });
      return { sucesso: true };
    } catch (e) {
      return { sucesso: false, erro: String(e) };
    }
  },
  async escutarTudo(aoReceber) {
    const ok = await this.iniciar();
    if (!ok) return;
    Object.entries(this._colecaoPorTipo).forEach(([tipo, colecao]) => {
      if (this._listenersAtivos[tipo]) return; // já está escutando
      this._listenersAtivos[tipo] = this._db.collection(colecao).onSnapshot(snap => {
        const mudancas = snap.docChanges().map(c => ({ ...c.doc.data(), id: c.doc.id }));
        if (mudancas.length) aoReceber(tipo, mudancas);
      }, err => console.log('Firebase listener erro:', tipo, err));
    });
  },

  // ---------- POSIÇÕES AO VIVO (rastreamento em tempo real) ----------
  // Coleção separada 'posicoes': um documento por turno ativo, sempre
  // sobrescrito com a última posição. NÃO entra no sync offline/CRUD —
  // é um canal leve e efêmero, só faz sentido em tempo real (online).
  async enviarPosicao(doc) {
    const ok = await this.iniciar();
    if (!ok || !doc || !doc.id) return false;
    try {
      await this._db.collection('posicoes').doc(String(doc.id)).set(
        { ...doc, _atualizadoEmFirestore: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return true;
    } catch (e) {
      return false;
    }
  },

  async removerPosicao(id) {
    const ok = await this.iniciar();
    if (!ok || !id) return false;
    try {
      await this._db.collection('posicoes').doc(String(id)).delete();
      return true;
    } catch (e) {
      return false;
    }
  },

  // Escuta a coleção de posições em tempo real. Retorna uma função para
  // cancelar a escuta (unsubscribe).
  escutarPosicoes(aoReceber) {
    let unsub = () => {};
    this.iniciar().then(ok => {
      if (!ok) return;
      unsub = this._db.collection('posicoes').onSnapshot(snap => {
        const posicoes = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        aoReceber(posicoes);
      }, err => console.log('Firebase posicoes erro:', err));
    });
    return () => { try { unsub(); } catch (e) {} };
  }
};

window.FirebaseSync = FirebaseSync;
