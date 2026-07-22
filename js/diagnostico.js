/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — diagnostico.js
   Ferramenta de diagnóstico (só para Desenvolvedor). Testa as
   três fontes de dados (IndexedDB, Google Sheets, Firebase),
   compara quantidades e mostra um relatório de saúde do sistema.
   Não altera nenhum dado — é só leitura.
   ══════════════════════════════════════════════════════════ */

const Diagnostico = {
  _tipos: ['viagem', 'deslocamento', 'abastecimento', 'lubrificacao', 'turno', 'usuario', 'equipamento', 'rota', 'rotaDeslocamento', 'manutencao'],

  _storePorTipo: {
    viagem: 'viagens', deslocamento: 'deslocamentos', abastecimento: 'abastecimentos',
    lubrificacao: 'lubrificacoes', turno: 'turnos', usuario: 'usuarios',
    equipamento: 'equipamentos', rota: 'rotas', rotaDeslocamento: 'rotasDeslocamento', manutencao: 'manutencoes'
  },

  // Conta registros locais (IndexedDB) por tipo
  async contarLocal(tipo) {
    try {
      const todos = await DB.getAll(this._storePorTipo[tipo]);
      return todos.length;
    } catch (e) { return null; }
  },

  // Testa a conexão com o Google Sheets e conta os registros (sem aplicar filtro incremental)
  async testarSheets(tipo) {
    const apiUrl = await Sync.apiUrl();
    if (!apiUrl) return { ok: false, motivo: 'Não configurado', total: null, ms: null };
    const token = await Sync.token();
    const inicio = Date.now();
    try {
      const params = new URLSearchParams({ modo: 'sync', tipo });
      if (token) params.set('token', token);
      const resp = await fetch(`${apiUrl}?${params.toString()}`);
      const ms = Date.now() - inicio;
      const json = await resp.json();
      if (!resp.ok || !json || json.sucesso === false) {
        return { ok: false, motivo: (json && json.erro) || `HTTP ${resp.status}`, total: null, ms };
      }
      return { ok: true, total: (json.registros || []).filter(r => !r._removido).length, ms };
    } catch (e) {
      return { ok: false, motivo: String(e.message || e), total: null, ms: Date.now() - inicio };
    }
  },

  // Testa a conexão com o Firebase e conta os registros
  async testarFirebase(tipo) {
    if (typeof FirebaseSync === 'undefined') return { ok: false, motivo: 'Módulo indisponível', total: null, ms: null };
    const configurado = await FirebaseSync.configurado();
    if (!configurado) return { ok: false, motivo: 'Não configurado', total: null, ms: null };
    const inicio = Date.now();
    try {
      const pronto = await FirebaseSync.iniciar();
      if (!pronto) return { ok: false, motivo: 'Falha ao conectar', total: null, ms: Date.now() - inicio };
      const registros = await FirebaseSync.buscarTudo(tipo);
      const ms = Date.now() - inicio;
      return { ok: true, total: registros.filter(r => !r._removido).length, ms };
    } catch (e) {
      return { ok: false, motivo: String(e.message || e), total: null, ms: Date.now() - inicio };
    }
  },

  // Roda o diagnóstico completo — só leitura, não altera nada
  async rodar(aoAtualizarProgresso) {
    const resultado = {
      geradoEm: agoraISO(),
      porTipo: [],
      pendentesFila: 0,
      erroPendentes: 0,
      sheetsConfigurado: !!(await Sync.apiUrl()),
      firebaseConfigurado: typeof FirebaseSync !== 'undefined' && (await FirebaseSync.configurado()),
      online: estaOnline(),
      versao: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '—',
      dispositivo: (typeof dispositivoId === 'function') ? dispositivoId() : '—',
      firebaseUid: null,
      listenersAtivos: (typeof Sync !== 'undefined') ? Sync._tempoRealLigado : false
    };

    if (resultado.firebaseConfigurado && typeof firebase !== 'undefined') {
      try {
        await FirebaseSync.iniciar();
        const usuarioFirebase = firebase.auth().currentUser;
        resultado.firebaseUid = usuarioFirebase ? usuarioFirebase.uid : null;
      } catch (e) { /* sem uid disponível — mostra "—" */ }
    }

    const fila = await DB.getAll('syncQueue');
    resultado.pendentesFila = fila.filter(i => i.status === 'pendente').length;
    resultado.erroPendentes = fila.filter(i => i.status === 'erro').length;

    for (let i = 0; i < this._tipos.length; i++) {
      const tipo = this._tipos[i];
      if (aoAtualizarProgresso) aoAtualizarProgresso(i + 1, this._tipos.length, tipo);

      const [local, sheets, firebase] = await Promise.all([
        this.contarLocal(tipo),
        resultado.sheetsConfigurado ? this.testarSheets(tipo) : Promise.resolve({ ok: false, motivo: 'Não configurado', total: null, ms: null }),
        resultado.firebaseConfigurado ? this.testarFirebase(tipo) : Promise.resolve({ ok: false, motivo: 'Não configurado', total: null, ms: null })
      ]);

      // Sheets agora é só backup — a divergência que importa de verdade é
      // entre o que está no aparelho e o que está no Firebase (fonte de leitura)
      const contagensCriticas = [local, firebase.ok ? firebase.total : null].filter(n => n !== null);
      const divergente = contagensCriticas.length > 1 && new Set(contagensCriticas).size > 1;

      resultado.porTipo.push({ tipo, local, sheets, firebase, divergente });
    }

    resultado.saudeGeral = this._calcularSaude(resultado);
    return resultado;
  },

  _calcularSaude(resultado) {
    // Sheets é backup silencioso — falha ou atraso nele não conta mais como
    // erro do sistema, só o Firebase (que é a fonte de leitura de verdade)
    const algumErroConexao = resultado.firebaseConfigurado && resultado.porTipo.some(t => !t.firebase.ok);
    const algumaDivergencia = resultado.porTipo.some(t => t.divergente);

    if (!resultado.online) return { nivel: 'erro', texto: '🔴 Sem conexão com a internet' };
    if (algumErroConexao) return { nivel: 'erro', texto: '🔴 Falha de conexão com o Firebase' };
    if (algumaDivergencia || resultado.erroPendentes > 0) return { nivel: 'atencao', texto: '🟡 Atenção — divergências ou pendências com erro' };
    if (resultado.pendentesFila > 0) return { nivel: 'atencao', texto: '🟡 Há registros aguardando sincronizar' };
    return { nivel: 'ok', texto: '🟢 Tudo certo' };
  }
};

window.Diagnostico = Diagnostico;
