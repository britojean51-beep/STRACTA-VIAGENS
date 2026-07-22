/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — dashboard.js
   Painel de produção: viagens, tempo médio, deslocamentos,
   abastecimentos, lubrificações, equipamentos ativos/manutenção.
   ══════════════════════════════════════════════════════════ */

const Dashboard = {
  async resumoDoDia(dia = todayKey()) {
    const [viagensStats, litros, lubs, deslocamentos, equipamentos, equipManutencao, turnosAtivos] = await Promise.all([
      Viagens.totalPorDia(dia),
      Abastecimento.totalLitros(dia),
      Lubrificacao.doDia(dia),
      DB.getAll('deslocamentos'),
      Equipamentos.listar(),
      Equipamentos.emManutencao(),
      DB.getByIndex('turnos', 'status', 'ativo')
    ]);

    const deslocamentosDoDia = deslocamentos.filter(d => d.dia === dia);
    const tempoDeslocamentoMs = deslocamentosDoDia.reduce((a, d) => a + (d.tempoTotalMs || 0), 0);
    const equipamentosAtivos = equipamentos.filter(e => e.status !== 'manutencao' && e.ativo !== false);

    // Tempo parado: para os turnos do dia, tempo total do turno menos tempo em viagem e em deslocamento
    const turnosDoDia = (await DB.getAll('turnos')).filter(t => t.dia === dia);
    let tempoParadoMs = 0;
    for (const t of turnosDoDia) {
      const fimTurno = t.encerradoEm ? new Date(t.encerradoEm) : new Date();
      const duracaoTurnoMs = fimTurno - new Date(t.iniciadoEm);
      const viagensTurno = await Viagens.historicoPorTurno(t.id);
      const tempoViagensMs = viagensTurno.filter(v => v.status === 'concluida').reduce((a, v) => a + (v.tempoTotalMs || 0), 0);
      const deslocTurno = deslocamentos.filter(d => d.turnoId === t.id);
      const tempoDeslocTurnoMs = deslocTurno.reduce((a, d) => a + (d.tempoTotalMs || 0), 0);
      tempoParadoMs += Math.max(0, duracaoTurnoMs - tempoViagensMs - tempoDeslocTurnoMs);
    }

    return {
      dia,
      totalViagens: viagensStats.totalViagens,
      tempoMedioMs: viagensStats.tempoMedioMs,
      tempoTotalMs: viagensStats.tempoTotalMs,
      totalLitros: litros,
      totalLubrificacoes: lubs.length,
      totalDeslocamentos: deslocamentosDoDia.length,
      tempoDeslocamentoMs,
      tempoParadoMs,
      equipamentosAtivos: equipamentosAtivos.length,
      equipamentosManutencao: equipManutencao.length,
      equipamentosTotal: equipamentos.length,
      turnosAtivos: turnosAtivos.length
    };
  },

  // Um cartão-resumo por caminhão, para o Painel dividido por equipamento
  async resumoPorEquipamento() {
    const [equipamentos, turnosAtivos] = await Promise.all([
      Equipamentos.listar(),
      DB.getByIndex('turnos', 'status', 'ativo')
    ]);
    const resultado = [];
    for (const e of equipamentos) {
      const [viagens, abasts, lubs] = await Promise.all([
        DB.getByIndex('viagens', 'equipamentoId', e.id),
        Abastecimento.porEquipamento(e.id),
        Lubrificacao.porEquipamento(e.id)
      ]);
      const viagemEmRota = viagens.find(v => v.status === 'em_andamento') || null;
      const temTurnoAtivo = turnosAtivos.some(t => t.equipamentoId === e.id);
      resultado.push({
        equipamento: e,
        totalViagens: viagens.filter(v => v.status === 'concluida').length,
        totalAbastecimentos: abasts.length,
        totalLubrificacoes: lubs.length,
        emRota: !!viagemEmRota,
        rotaAtualNome: viagemEmRota ? viagemEmRota.rotaNome : null,
        temTurnoAtivo
      });
    }
    return resultado;
  },

  // Painel completo de um único equipamento (tela "Painel do Equipamento")
  async detalheEquipamento(equipamentoId) {
    const [equip, viagens, deslocamentos, abasts, lubs, manutencoes, turnosAtivos] = await Promise.all([
      DB.get('equipamentos', equipamentoId),
      DB.getByIndex('viagens', 'equipamentoId', equipamentoId),
      Operacao.deslocamentosPorEquipamento(equipamentoId),
      Abastecimento.porEquipamento(equipamentoId),
      Lubrificacao.porEquipamento(equipamentoId),
      Equipamentos.historicoManutencoes(equipamentoId),
      DB.getByIndex('turnos', 'status', 'ativo')
    ]);
    const ultimaManutencao = manutencoes.find(m => m.saidaEm) || manutencoes[0] || null;
    const turnoAtivo = turnosAtivos.find(t => t.equipamentoId === equipamentoId) || null;
    const viagemEmRota = viagens.find(v => v.status === 'em_andamento') || null;
    return {
      equipamento: equip,
      totalViagens: viagens.filter(v => v.status === 'concluida').length,
      totalAbastecimentos: abasts.length,
      totalLubrificacoes: lubs.length,
      ultimaManutencao,
      motoristaAtual: turnoAtivo ? turnoAtivo.motoristaNome : null,
      turnoAtivoDesde: turnoAtivo ? turnoAtivo.iniciadoEm : null,
      emRota: !!viagemEmRota,
      rotaAtualNome: viagemEmRota ? viagemEmRota.rotaNome : null,
      viagemEmRotaDesde: viagemEmRota ? viagemEmRota.inicioEm : null,
      viagens, deslocamentos, abasts, lubs, manutencoes
    };
  }
};

window.Dashboard = Dashboard;
