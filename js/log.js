/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — log.js
   Log de auditoria: login, logout, cadastro, alteração,
   exclusão, erro, sincronização, offline/online.
   Grava local (IndexedDB) e sincroniza com Firebase/Sheets
   como qualquer outro registro (tipo: 'log').
   ══════════════════════════════════════════════════════════ */

const Log = {
  async registrar(evento, detalhes = {}) {
    try {
      const usuario = (typeof Auth !== 'undefined') ? Auth.usuarioAtual() : null;
      const entrada = {
        id: gerarId('log'),
        tipo: 'log',
        evento, // login | logout | criar | editar | excluir | erro | sync_online | sync_offline
        usuarioId: usuario ? usuario.id : null,
        usuarioNome: usuario ? usuario.nome : 'anônimo',
        dispositivo: (typeof dispositivoId === 'function') ? dispositivoId() : null,
        detalhes: typeof detalhes === 'string' ? detalhes : JSON.stringify(detalhes),
        criadoEm: agoraISO()
      };
      await DB.put('logs', entrada);
      if (typeof Sync !== 'undefined') Sync.enfileirar('log', entrada);
      return entrada;
    } catch (e) {
      // o log nunca pode travar o app
      console.log('Falha ao registrar log:', e);
    }
  },

  async listar(limite = 100) {
    const todos = await DB.getAll('logs');
    return todos.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm)).slice(0, limite);
  }
};

window.Log = Log;
