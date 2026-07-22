/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — relatorio.js
   Monta o relatório diário detalhado por caminhão e gera o PDF
   (100% offline, usando pdf-lite.js).
   ══════════════════════════════════════════════════════════ */

const Relatorio = {
  // Gera a lista de dias (dd-mm-yyyy) entre duas datas ISO (yyyy-mm-dd), inclusive
  _diasEntre(inicioISO, fimISO) {
    const dias = [];
    let atual = new Date(inicioISO + 'T00:00:00');
    const fim = new Date(fimISO + 'T00:00:00');
    while (atual <= fim) {
      const dd = String(atual.getDate()).padStart(2, '0');
      const mm = String(atual.getMonth() + 1).padStart(2, '0');
      const yyyy = atual.getFullYear();
      dias.push(`${dd}-${mm}-${yyyy}`);
      atual.setDate(atual.getDate() + 1);
    }
    return dias;
  },

  // Agrega os dados de vários dias, por equipamento — usado nos relatórios de período
  async dadosPorEquipamentoPeriodo(inicioISO, fimISO) {
    const dias = this._diasEntre(inicioISO, fimISO);
    const porDia = await Promise.all(dias.map(d => this.dadosPorEquipamento(d)));

    const mapa = {};
    porDia.forEach(diaData => {
      diaData.forEach(item => {
        const id = item.equipamento.id;
        if (!mapa[id]) {
          mapa[id] = {
            equipamento: item.equipamento,
            totalViagens: 0, totalDeslocamentos: 0, totalLitros: 0,
            totalLubrificacoes: 0, kmRodadosTotal: 0, horasTrabalhadasTotal: 0,
            diasComAtividade: 0
          };
        }
        const agg = mapa[id];
        const viagensConcluidas = item.viagens.filter(v => v.status === 'concluida').length;
        agg.totalViagens += viagensConcluidas;
        agg.totalDeslocamentos += item.deslocamentos.length;
        agg.totalLitros += item.totalLitrosDia || 0;
        agg.totalLubrificacoes += item.lubrificacoes.length;
        if (item.kmRodados != null && item.kmRodados > 0) agg.kmRodadosTotal += item.kmRodados;
        if (item.horasTrabalhadas != null && item.horasTrabalhadas > 0) agg.horasTrabalhadasTotal += item.horasTrabalhadas;
        if (viagensConcluidas || item.deslocamentos.length) agg.diasComAtividade++;
      });
    });

    return Object.values(mapa).map(agg => ({
      ...agg,
      mediaConsumoPeriodo: agg.totalLitros > 0 ? agg.kmRodadosTotal / agg.totalLitros : null
    })).sort((a, b) => b.totalViagens - a.totalViagens);
  },

  async gerarPDFPeriodo(inicioISO, fimISO) {
    const agregados = await this.dadosPorEquipamentoPeriodo(inicioISO, fimISO);
    const doc = new PDFLite();
    const azulMarinho = [0.09, 0.15, 0.29];
    const laranja = [0.85, 0.5, 0.05];

    doc.cabecalhoMarca('Relatório de Período');
    doc.texto(`Período: ${fmtDataBR(inicioISO + 'T12:00:00')} a ${fmtDataBR(fimISO + 'T12:00:00')}`, { tamanho: 10 });
    doc.texto(`Gerado em: ${fmtDataHoraBR(agoraISO())}  •  ${APP_BUILD_NOME} — Build ${APP_VERSION}`, { tamanho: 8 });
    doc.espaco(6);
    doc.linhaHorizontal();

    doc.texto('Produção por Equipamento', { tamanho: 13, negrito: true, cor: azulMarinho });
    doc.espaco(4);

    // gráfico de barras simples — viagens por equipamento
    if (agregados.length) {
      const maxViagens = Math.max(...agregados.map(a => a.totalViagens), 1);
      const larguraMaxima = doc.pageWidth - 2 * doc.marginX - 90;
      doc.texto('Viagens por equipamento', { tamanho: 9.5, negrito: true, cor: laranja });
      doc.espaco(2);
      agregados.forEach(a => {
        doc._garantirEspaco(16);
        const largura = Math.max(2, (a.totalViagens / maxViagens) * larguraMaxima);
        doc.texto(a.equipamento.codigo, { tamanho: 8.5, x: doc.marginX, salto: 0 });
        doc.retanguloPreenchido(doc.marginX + 55, doc.y + 9, largura, 8, laranja);
        doc.texto(`${a.totalViagens}`, { tamanho: 8.5, x: doc.marginX + 60 + larguraMaxima, salto: 14 });
      });
      doc.espaco(8);
      doc.linhaHorizontal();
      doc.espaco(6);
    }

    const colX = { nome: doc.marginX, viagens: doc.marginX + 130, km: doc.marginX + 190, media: doc.marginX + 260, horas: doc.marginX + 330, litros: doc.marginX + 400 };
    doc.linhaColunas([
      { texto: 'Equipamento', x: colX.nome, negrito: true },
      { texto: 'Viagens', x: colX.viagens, negrito: true },
      { texto: 'KM rodado', x: colX.km, negrito: true },
      { texto: 'Média km/L', x: colX.media, negrito: true },
      { texto: 'Horas', x: colX.horas, negrito: true },
      { texto: 'Litros', x: colX.litros, negrito: true }
    ], { tamanho: 9, salto: 14, corPadrao: azulMarinho });
    doc.linhaHorizontal();

    agregados.forEach(a => {
      doc.linhaColunas([
        { texto: a.equipamento.codigo, x: colX.nome },
        { texto: String(a.totalViagens), x: colX.viagens },
        { texto: a.kmRodadosTotal ? String(a.kmRodadosTotal) : '-', x: colX.km },
        { texto: a.mediaConsumoPeriodo ? a.mediaConsumoPeriodo.toFixed(2) : '-', x: colX.media },
        { texto: a.horasTrabalhadasTotal ? String(a.horasTrabalhadasTotal) : '-', x: colX.horas },
        { texto: a.totalLitros ? String(a.totalLitros) : '-', x: colX.litros }
      ], { tamanho: 8.5, salto: 14 });
    });

    return doc.build();
  },
  async dadosPorEquipamento(dia) {
    const [equipamentos, viagensDia, deslocDia, abastDia, lubDia, todosTurnos] = await Promise.all([
      Equipamentos.listar(),
      Viagens.historicoDoDia(dia),
      Operacao.deslocamentosDoDia(dia),
      Abastecimento.doDia(dia),
      Lubrificacao.doDia(dia),
      DB.getAll('turnos')
    ]);
    const diaISO = diaKeyParaISO(dia);

    const resultado = [];
    for (const e of equipamentos) {
      const manutTodas = await Equipamentos.historicoManutencoes(e.id);
      const manutencoes = manutTodas.filter(m =>
        (m.entradaEm || '').slice(0, 10) === diaISO || (m.saidaEm || '').slice(0, 10) === diaISO
      );

      // KM/horímetro do dia: pega o inicial do primeiro turno e o final do
      // último turno encerrado — o final de um turno já vira o inicial do próximo.
      const turnosDia = todosTurnos
        .filter(t => t.dia === dia && t.equipamentoId === e.id)
        .sort((a, b) => new Date(a.iniciadoEm) - new Date(b.iniciadoEm));
      const primeiroTurno = turnosDia[0] || null;
      const ultimoEncerrado = [...turnosDia].reverse().find(t => t.status === 'encerrado' && t.kmFinal != null) || null;

      const kmInicialDia = primeiroTurno ? primeiroTurno.kmInicial : null;
      const kmFinalDia = ultimoEncerrado ? ultimoEncerrado.kmFinal : null;
      const horimetroInicialDia = primeiroTurno ? primeiroTurno.horimetroInicial : null;
      const horimetroFinalDia = ultimoEncerrado ? ultimoEncerrado.horimetroFinal : null;

      const abastecimentosDoEquip = abastDia.filter(a => a.equipamentoId === e.id);
      const totalLitrosDia = abastecimentosDoEquip.reduce((soma, a) => soma + (a.litros || 0), 0);

      const kmRodados = (kmInicialDia != null && kmFinalDia != null) ? (kmFinalDia - kmInicialDia) : null;
      const horasTrabalhadas = (horimetroInicialDia != null && horimetroFinalDia != null) ? (horimetroFinalDia - horimetroInicialDia) : null;
      const mediaConsumo = (kmRodados != null && totalLitrosDia > 0) ? (kmRodados / totalLitrosDia) : null;

      resultado.push({
        equipamento: e,
        viagens: viagensDia.filter(v => v.equipamentoId === e.id).sort((a, b) => new Date(a.inicioEm) - new Date(b.inicioEm)),
        deslocamentos: deslocDia.filter(d => d.equipamentoId === e.id).sort((a, b) => new Date(a.inicioEm) - new Date(b.inicioEm)),
        abastecimentos: abastecimentosDoEquip.sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm)),
        lubrificacoes: lubDia.filter(l => l.equipamentoId === e.id).sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm)),
        manutencoes,
        kmInicialDia, kmFinalDia, kmRodados,
        horimetroInicialDia, horimetroFinalDia, horasTrabalhadas,
        totalLitrosDia, mediaConsumo
      });
    }
    return resultado;
  },

  async gerarPDF(dia) {
    const [resumo, porEquip, todasRotas] = await Promise.all([
      Dashboard.resumoDoDia(dia),
      this.dadosPorEquipamento(dia),
      Operacao.listarRotas()
    ]);
    const rotasMapa = {};
    todasRotas.forEach(r => { rotasMapa[r.id] = r; });

    const doc = new PDFLite();

    doc.cabecalhoMarca('Relatório Diário de Operação');
    doc.texto(`Data do relatório: ${fmtDataBR(diaKeyParaISO(dia) + 'T12:00:00')}`, { tamanho: 10 });
    doc.texto(`Gerado em: ${fmtDataHoraBR(agoraISO())}  •  ${APP_BUILD_NOME} — Build ${APP_VERSION}`, { tamanho: 8 });
    doc.espaco(6);
    doc.linhaHorizontal();

    doc.texto('Resumo Geral', { tamanho: 13, negrito: true, cor: [0.09, 0.15, 0.29] });
    doc.texto(`Viagens concluídas: ${resumo.totalViagens}   •   Tempo médio: ${fmtDuracao(resumo.tempoMedioMs)}   •   Tempo total: ${fmtDuracao(resumo.tempoTotalMs)}`, { tamanho: 9.5 });
    doc.texto(`Deslocamentos: ${resumo.totalDeslocamentos}   •   Tempo em deslocamento: ${fmtDuracao(resumo.tempoDeslocamentoMs)}   •   Tempo parado: ${fmtDuracao(resumo.tempoParadoMs)}`, { tamanho: 9.5 });
    doc.texto(`Abastecimento: ${resumo.totalLitros} L   •   Lubrificações: ${resumo.totalLubrificacoes}`, { tamanho: 9.5 });
    doc.texto(`Equipamentos ativos: ${resumo.equipamentosAtivos}/${resumo.equipamentosTotal}   •   Em manutenção: ${resumo.equipamentosManutencao}`, { tamanho: 9.5 });
    doc.espaco(10);
    doc.linhaHorizontal();
    doc.espaco(4);

    doc.texto('Detalhamento por Caminhão', { tamanho: 13, negrito: true, cor: [0.09, 0.15, 0.29] });
    doc.espaco(4);

    const azulMarinho = [0.09, 0.15, 0.29];
    const laranja = [0.85, 0.5, 0.05];
    const fundoClaro = [0.955, 0.96, 0.965];
    const cinzaTexto = [0.35, 0.38, 0.42];

    // Estima quantos pontos de altura uma seção de caminhão vai ocupar,
    // pra desenhar o fundo colorido do tamanho certo ANTES do texto.
    function alturaCartao(item) {
      const temAtividade = item.viagens.length || item.deslocamentos.length || item.abastecimentos.length || item.lubrificacoes.length || item.manutencoes.length;
      let altura = 14 + 14; // linha do nome do caminhão + linha de KM/horímetro
      if (item.kmRodados != null || item.horasTrabalhadas != null) altura += 14;
      if (!temAtividade) altura += 14;
      [item.viagens, item.deslocamentos, item.abastecimentos, item.lubrificacoes, item.manutencoes].forEach(lista => {
        if (lista.length) altura += (1 + lista.length) * 12;
      });
      if (item.viagens.length) {
        const rotasDistintas = new Set(item.viagens.map(v => v.rotaId)).size;
        altura += (1 + rotasDistintas) * 12; // subseção "Totais por Rota"
      }
      return altura + 14; // respiro interno
    }

    const colX = { hora: doc.marginX + 6, desc: doc.marginX + 70, extra: doc.pageWidth - 140 };

    for (const item of porEquip) {
      const e = item.equipamento;
      const temAtividade = item.viagens.length || item.deslocamentos.length || item.abastecimentos.length || item.lubrificacoes.length || item.manutencoes.length;
      const alturaEstimada = alturaCartao(item);

      // garante que o cartão inteiro caiba na página atual — senão, quebra pra próxima
      if (doc.espacoDisponivel() < alturaEstimada + 20) doc._novaPagina();

      // fundo cinza-claro do cartão + friso lateral colorido (status do caminhão)
      const corFriso = e.status === 'manutencao' ? [0.75, 0.25, 0.1] : laranja;
      const yTopoCartao = doc.y;
      doc.retanguloPreenchido(doc.marginX - 6, yTopoCartao + 12, doc.pageWidth - 2 * doc.marginX + 12, alturaEstimada, fundoClaro);
      doc.retanguloPreenchido(doc.marginX - 6, yTopoCartao + 12, 3, alturaEstimada, corFriso);

      const statusTxt = e.status === 'manutencao' ? 'Em manutenção' : (e.ativo === false ? 'Desativado' : 'Operando');
      doc.texto(`${e.codigo} — ${e.modelo || ''}`, { tamanho: 12, negrito: true, cor: azulMarinho, x: doc.marginX + 4 });
      doc.texto(`${statusTxt}   •   KM: ${e.kmAtual}   •   Horímetro: ${e.horimetroAtual}`, { tamanho: 9, cor: cinzaTexto, x: doc.marginX + 4 });

      if (item.kmRodados != null || item.horasTrabalhadas != null) {
        const partes = [];
        if (item.kmRodados != null) partes.push(`KM rodados: ${item.kmRodados}`);
        if (item.mediaConsumo != null) partes.push(`Média: ${item.mediaConsumo.toFixed(2)} km/L`);
        if (item.horasTrabalhadas != null) partes.push(`Horas trabalhadas: ${item.horasTrabalhadas}h`);
        doc.texto(partes.join('   •   '), { tamanho: 9, cor: laranja, x: doc.marginX + 4 });
      }

      if (!temAtividade) {
        doc.texto('Sem atividade registrada nesta data.', { tamanho: 9, cor: cinzaTexto, x: doc.marginX + 4 });
      }

      if (item.viagens.length) {
        doc.texto(`Viagens (${item.viagens.length})`, { tamanho: 9.5, negrito: true, salto: 12, x: doc.marginX + 4, cor: azulMarinho });
        item.viagens.forEach(v => {
          const periodo = `${fmtHoraBR(v.inicioEm)}${v.descarregadoEm ? '-' + fmtHoraBR(v.descarregadoEm) : ' (andamento)'}`;
          const rota = rotasMapa[v.rotaId];
          const origemDestino = rota ? `${rota.origem || '-'} → ${rota.destino || '-'}` : '-';
          doc.linhaColunas([
            { texto: periodo, x: colX.hora, tamanho: 8.5 },
            { texto: `${origemDestino} — ${v.rotaNome || '-'}`, x: colX.desc, tamanho: 8.5 },
            { texto: v.tempoTotalMs ? fmtDuracao(v.tempoTotalMs) : '-', x: colX.extra, tamanho: 8.5, negrito: true }
          ]);
        });

        // Totais por rota — soma quantas viagens cada rota teve nesse caminhão nesse dia
        const totaisPorRota = {};
        item.viagens.forEach(v => {
          if (!totaisPorRota[v.rotaId]) totaisPorRota[v.rotaId] = { rotaNome: v.rotaNome, count: 0 };
          totaisPorRota[v.rotaId].count++;
        });
        doc.texto(`Totais por Rota`, { tamanho: 9.5, negrito: true, salto: 12, x: doc.marginX + 4, cor: laranja });
        Object.entries(totaisPorRota).forEach(([rotaId, info]) => {
          const rota = rotasMapa[rotaId];
          const origemDestino = rota ? `${rota.origem || '-'} → ${rota.destino || '-'}` : '-';
          doc.linhaColunas([
            { texto: `${origemDestino} — ${info.rotaNome || '-'}`, x: colX.hora, tamanho: 8.5 },
            { texto: `${info.count} viagem(ns)`, x: colX.extra, tamanho: 8.5, negrito: true }
          ]);
        });
      }

      if (item.deslocamentos.length) {
        doc.texto(`Deslocamentos (${item.deslocamentos.length})`, { tamanho: 9.5, negrito: true, salto: 12, x: doc.marginX + 4, cor: azulMarinho });
        item.deslocamentos.forEach(d => {
          const periodo = `${fmtHoraBR(d.inicioEm)}${d.fimEm ? '-' + fmtHoraBR(d.fimEm) : ' (andamento)'}`;
          doc.linhaColunas([
            { texto: periodo, x: colX.hora, tamanho: 8.5 },
            { texto: `${d.origem || '-'} -> ${d.destino || '-'}${d.motivo ? ' • ' + d.motivo : ''}`, x: colX.desc, tamanho: 8.5 },
            { texto: d.tempoTotalMs ? fmtDuracao(d.tempoTotalMs) : '-', x: colX.extra, tamanho: 8.5, negrito: true }
          ]);
        });
      }

      if (item.abastecimentos.length) {
        doc.texto(`Abastecimentos (${item.abastecimentos.length})`, { tamanho: 9.5, negrito: true, salto: 12, x: doc.marginX + 4, cor: azulMarinho });
        item.abastecimentos.forEach(a => {
          const situacaoTxt = { operacao: 'em operação', desloc_manutencao: 'foi p/ manutenção', retorno_manutencao: 'retorno manutenção' }[a.situacao] || '';
          doc.linhaColunas([
            { texto: fmtHoraBR(a.criadoEm), x: colX.hora, tamanho: 8.5 },
            { texto: situacaoTxt, x: colX.desc, tamanho: 8.5 },
            { texto: `${a.litros} L`, x: colX.extra, tamanho: 8.5, negrito: true }
          ]);
        });
      }

      if (item.lubrificacoes.length) {
        doc.texto(`Lubrificações (${item.lubrificacoes.length})`, { tamanho: 9.5, negrito: true, salto: 12, x: doc.marginX + 4, cor: azulMarinho });
        item.lubrificacoes.forEach(l => {
          doc.linhaColunas([
            { texto: fmtHoraBR(l.criadoEm), x: colX.hora, tamanho: 8.5 },
            { texto: l.tipoServico || 'Lubrificação', x: colX.desc, tamanho: 8.5 }
          ]);
        });
      }

      if (item.manutencoes.length) {
        doc.texto(`Manutenção`, { tamanho: 9.5, negrito: true, salto: 12, x: doc.marginX + 4, cor: azulMarinho });
        item.manutencoes.forEach(m => {
          const txt = m.saidaEm ? `Entrou ${fmtDataHoraBR(m.entradaEm)} • Retornou ${fmtDataHoraBR(m.saidaEm)}` : `Entrou ${fmtDataHoraBR(m.entradaEm)} • ainda em manutenção`;
          doc.linhaColunas([{ texto: txt, x: colX.hora, tamanho: 8.5 }]);
        });
      }

      doc.espaco(14);
    }

    return doc.build();
  }
};

window.Relatorio = Relatorio;
