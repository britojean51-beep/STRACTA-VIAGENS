/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — relatorio-excel.js
   Exportação em Excel (.xlsx), usando SheetJS via CDN.
   Precisa de internet na hora de gerar (a biblioteca é externa),
   diferente do PDF, que é 100% offline.
   ══════════════════════════════════════════════════════════ */

const RelatorioExcel = {
  _linhaResumoEquip(a) {
    return {
      'Equipamento': a.equipamento ? a.equipamento.codigo : a.codigo,
      'Modelo': a.equipamento ? a.equipamento.modelo : '',
      'Viagens': a.totalViagens || 0,
      'Deslocamentos': a.deslocamentos ? a.deslocamentos.length : (a.totalDeslocamentos || 0),
      'KM Rodado': a.kmRodados ?? a.kmRodadosTotal ?? '',
      'Média (km/L)': (a.mediaConsumo ?? a.mediaConsumoPeriodo) != null ? Number((a.mediaConsumo ?? a.mediaConsumoPeriodo).toFixed(2)) : '',
      'Horas Trabalhadas': a.horasTrabalhadas ?? a.horasTrabalhadasTotal ?? '',
      'Litros Abastecidos': a.totalLitrosDia ?? a.totalLitros ?? 0,
      'Lubrificações': a.lubrificacoes ? a.lubrificacoes.length : (a.totalLubrificacoes || 0)
    };
  },

  async gerarExcelDia(dia) {
    if (typeof XLSX === 'undefined') {
      showToast('Sem internet para carregar o gerador de Excel — tente novamente online', 'var(--iron)');
      return null;
    }
    const porEquip = await Relatorio.dadosPorEquipamento(dia);
    const wb = XLSX.utils.book_new();

    const resumo = porEquip.map(a => this._linhaResumoEquip(a));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo do Dia');

    const viagensLinhas = [];
    porEquip.forEach(item => {
      item.viagens.forEach(v => viagensLinhas.push({
        'Equipamento': item.equipamento.codigo,
        'Rota': v.rotaNome || '',
        'Motorista': v.motoristaNome || '',
        'Início': fmtHoraBR(v.inicioEm),
        'Descarga': v.descarregadoEm ? fmtHoraBR(v.descarregadoEm) : '',
        'Duração (min)': v.tempoTotalMs ? Math.round(v.tempoTotalMs / 60000) : ''
      }));
    });
    if (viagensLinhas.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(viagensLinhas), 'Viagens');

    const abastLinhas = [];
    porEquip.forEach(item => {
      item.abastecimentos.forEach(a => abastLinhas.push({
        'Equipamento': item.equipamento.codigo,
        'Horário': fmtHoraBR(a.criadoEm),
        'Litros': a.litros,
        'Situação': a.situacao || ''
      }));
    });
    if (abastLinhas.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(abastLinhas), 'Abastecimentos');

    const nomeArquivo = `STRACTA_Relatorio_${dia}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    return nomeArquivo;
  },

  async gerarExcelPeriodo(inicioISO, fimISO) {
    if (typeof XLSX === 'undefined') {
      showToast('Sem internet para carregar o gerador de Excel — tente novamente online', 'var(--iron)');
      return null;
    }
    const agregados = await Relatorio.dadosPorEquipamentoPeriodo(inicioISO, fimISO);
    const wb = XLSX.utils.book_new();
    const linhas = agregados.map(a => this._linhaResumoEquip(a));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Resumo do Período');

    const nomeArquivo = `STRACTA_Relatorio_Periodo_${inicioISO}_a_${fimISO}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    return nomeArquivo;
  }
};

window.RelatorioExcel = RelatorioExcel;
