/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — lubrificacao.js
   Registro de lubrificações da frota.
   ══════════════════════════════════════════════════════════ */

const Lubrificacao = {
  async registrar({ equipamentoId, equipamentoCodigo, tipoServico, horimetroAtual, observacoes }) {
    const registro = {
      id: gerarId('lub'),
      tipo: 'lubrificacao',
      equipamentoId, equipamentoCodigo,
      tipoServico: tipoServico || 'Lubrificação geral',
      horimetroAtual: Number(horimetroAtual) || 0,
      observacoes: observacoes || '',
      dia: todayKey(),
      criadoEm: agoraISO()
    };
    await DB.put('lubrificacoes', registro);
    await Sync.enfileirar('lubrificacao', registro);
    return registro;
  },

  async doDia(dia = todayKey()) {
    return (await DB.getAll('lubrificacoes')).filter(l => l.dia === dia);
  },

  async porEquipamento(equipamentoId) {
    const todos = await DB.getByIndex('lubrificacoes', 'equipamentoId', equipamentoId);
    return todos.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  }
};

window.Lubrificacao = Lubrificacao;
