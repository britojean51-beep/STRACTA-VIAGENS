/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — abastecimento.js
   Registro de abastecimentos da frota.
   ══════════════════════════════════════════════════════════ */

const Abastecimento = {
  // situacao: 'operacao' (padrão) | 'desloc_manutencao' | 'retorno_manutencao'
  async registrar({ equipamentoId, equipamentoCodigo, motoristaId, litros, kmAtual, horimetroAtual, situacao }) {
    const registro = {
      id: gerarId('abast'),
      tipo: 'abastecimento',
      equipamentoId, equipamentoCodigo, motoristaId,
      litros: Number(litros) || 0,
      kmAtual: Number(kmAtual) || 0,
      horimetroAtual: Number(horimetroAtual) || 0,
      situacao: situacao || 'operacao',
      dia: todayKey(),
      criadoEm: agoraISO()
    };
    await DB.put('abastecimentos', registro);
    await Equipamentos.atualizarKmHorimetro(equipamentoId, kmAtual, horimetroAtual);

    if (situacao === 'desloc_manutencao') {
      await Equipamentos.enviarParaManutencao(equipamentoId, 'Registrado no abastecimento');
    } else if (situacao === 'retorno_manutencao') {
      await Equipamentos.retornarDaManutencao(equipamentoId);
    }

    await Sync.enfileirar('abastecimento', registro);
    if (typeof Geo !== 'undefined') Geo.anexarLocal('abastecimentos', registro.id, 'local', 'abastecimento');
    return registro;
  },

  async doDia(dia = todayKey()) {
    return (await DB.getAll('abastecimentos')).filter(a => a.dia === dia);
  },

  async totalLitros(dia = todayKey()) {
    const registros = await this.doDia(dia);
    return registros.reduce((a, r) => a + (r.litros || 0), 0);
  },

  async porEquipamento(equipamentoId) {
    const todos = await DB.getByIndex('abastecimentos', 'equipamentoId', equipamentoId);
    return todos.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  }
};

window.Abastecimento = Abastecimento;
