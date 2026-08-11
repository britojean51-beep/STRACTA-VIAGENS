/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — viagens.js
   Histórico e relatórios de viagens: por dia, por motorista,
   por equipamento.
   ══════════════════════════════════════════════════════════ */

const Viagens = {
  async historicoDoDia(dia = todayKey()) {
    const viagens = await DB.getByIndex('viagens', 'dia', dia);
    // viagens de teste não entram nos relatórios/listas do dia
    return viagens.filter(v => !v.teste).sort((a, b) => new Date(b.inicioEm) - new Date(a.inicioEm));
  },

  async historicoPorMotorista(motoristaId) {
    const todas = await DB.getAll('viagens');
    return todas
      .filter(v => v.motoristaId === motoristaId)
      .sort((a, b) => new Date(b.inicioEm) - new Date(a.inicioEm));
  },

  async historicoPorEquipamento(equipamentoId) {
    const todas = await DB.getAll('viagens');
    return todas
      .filter(v => v.equipamentoId === equipamentoId)
      .sort((a, b) => new Date(b.inicioEm) - new Date(a.inicioEm));
  },

  async historicoPorRota(rotaId) {
    const todas = await DB.getAll('viagens');
    return todas
      .filter(v => v.rotaId === rotaId)
      .sort((a, b) => new Date(b.inicioEm) - new Date(a.inicioEm));
  },

  async historicoPorTurno(turnoId) {
    const todas = await DB.getAll('viagens');
    return todas
      .filter(v => v.turnoId === turnoId)
      .sort((a, b) => new Date(b.inicioEm) - new Date(a.inicioEm));
  },

  async totalPorDia(dia = todayKey()) {
    const viagens = (await this.historicoDoDia(dia)).filter(v => v.status === 'concluida');
    const tempoTotalMs = viagens.reduce((a, v) => a + (v.tempoTotalMs || 0), 0);
    return {
      totalViagens: viagens.length,
      tempoTotalMs,
      tempoMedioMs: viagens.length ? tempoTotalMs / viagens.length : 0
    };
  },

  async diasComRegistro() {
    const todas = await DB.getAll('viagens');
    return [...new Set(todas.filter(v => !v.teste).map(v => v.dia))].sort().reverse();
  }
};

window.Viagens = Viagens;
