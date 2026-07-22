/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — operacao.js
   Cadastro de rotas + ciclo de vida da viagem: iniciar,
   descarregar, repetir, deslocamento e cronômetro.
   ══════════════════════════════════════════════════════════ */

const Operacao = {
  // ---------- ROTAS ----------
  async listarRotas() {
    const rotas = await DB.getAll('rotas');
    return rotas.sort((a, b) =>
      (a.status === 'inativa' ? 1 : 0) - (b.status === 'inativa' ? 1 : 0) ||
      (b.favorita ? 1 : 0) - (a.favorita ? 1 : 0) ||
      (a.nome || '').localeCompare(b.nome || '')
    );
  },

  async salvarRota({ id, nome, origem, destino, material, equipamentoCargaId, equipamentoCargaCodigo, distancia, status }) {
    const existente = id ? await DB.get('rotas', id) : null;
    const usuario = Permissoes.usuarioAtual();
    const rota = {
      id: id || gerarId('rota'),
      tipo: 'rota',
      nome, origem, destino,
      material: material || '',
      equipamentoCargaId: equipamentoCargaId || '',
      equipamentoCargaCodigo: equipamentoCargaCodigo || '',
      distancia: distancia !== undefined && distancia !== '' ? Number(distancia) : null,
      status: status || (existente ? existente.status : 'ativa'), // 'ativa' | 'inativa'
      favorita: existente ? existente.favorita : false,
      // dono da rota — só é definido na criação, nunca muda numa edição
      criadoPorId: existente ? existente.criadoPorId : (usuario ? usuario.id : null),
      criadoPorNome: existente ? existente.criadoPorNome : (usuario ? usuario.nome : null),
      criadoEm: existente ? existente.criadoEm : agoraISO()
    };
    await DB.put('rotas', rota);
    if (typeof Sync !== 'undefined') Sync.enfileirar('rota', rota);
    return rota;
  },

  async alternarStatusRota(id) {
    const rota = await DB.get('rotas', id);
    if (!rota) return null;
    if (!Permissoes.podeEditarRota(rota)) return { erro: 'Você só pode alterar rotas criadas por você' };
    rota.status = rota.status === 'inativa' ? 'ativa' : 'inativa';
    await DB.put('rotas', rota);
    if (typeof Sync !== 'undefined') Sync.enfileirar('rota', rota);
    return rota;
  },

  async alternarFavorita(id) {
    const rota = await DB.get('rotas', id);
    if (!rota) return null;
    // favoritar é uma preferência pessoal de uso — qualquer motorista pode marcar,
    // não é uma edição do cadastro da rota em si
    rota.favorita = !rota.favorita;
    await DB.put('rotas', rota);
    if (typeof Sync !== 'undefined') Sync.enfileirar('rota', rota);
    return rota;
  },

  async removerRota(id) {
    const rota = await DB.get('rotas', id);
    if (!rota) return { erro: 'Rota não encontrada' };
    if (!Permissoes.podeEditarRota(rota)) return { erro: 'Você só pode apagar rotas criadas por você' };
    await DB.delete('rotas', id);
    if (typeof Sync !== 'undefined') Sync.enfileirarExclusao('rota', id);
    return { sucesso: true };
  },

  // ---------- ROTAS DE DESLOCAMENTO ----------
  // Mesmo sistema das rotas de viagem: qualquer motorista pode cadastrar,
  // lista única compartilhada por todos; editar/apagar só quem criou ou
  // Encarregado pra cima.
  async listarRotasDeslocamento() {
    const rotas = await DB.getAll('rotasDeslocamento');
    return rotas.sort((a, b) =>
      (a.status === 'inativa' ? 1 : 0) - (b.status === 'inativa' ? 1 : 0) ||
      (b.favorita ? 1 : 0) - (a.favorita ? 1 : 0) ||
      (a.nome || '').localeCompare(b.nome || '')
    );
  },

  async salvarRotaDeslocamento({ id, nome, origem, destino, motivo, status }) {
    const existente = id ? await DB.get('rotasDeslocamento', id) : null;
    const usuario = Permissoes.usuarioAtual();
    const rota = {
      id: id || gerarId('rotadesloc'),
      tipo: 'rotaDeslocamento',
      nome: nome || `${origem} -> ${destino}`,
      origem, destino,
      motivo: motivo || '',
      status: status || (existente ? existente.status : 'ativa'),
      favorita: existente ? existente.favorita : false,
      criadoPorId: existente ? existente.criadoPorId : (usuario ? usuario.id : null),
      criadoPorNome: existente ? existente.criadoPorNome : (usuario ? usuario.nome : null),
      criadoEm: existente ? existente.criadoEm : agoraISO()
    };
    await DB.put('rotasDeslocamento', rota);
    if (typeof Sync !== 'undefined') Sync.enfileirar('rotaDeslocamento', rota);
    return rota;
  },

  async alternarFavoritaDeslocamento(id) {
    const rota = await DB.get('rotasDeslocamento', id);
    if (!rota) return null;
    rota.favorita = !rota.favorita;
    await DB.put('rotasDeslocamento', rota);
    if (typeof Sync !== 'undefined') Sync.enfileirar('rotaDeslocamento', rota);
    return rota;
  },

  async alternarStatusRotaDeslocamento(id) {
    const rota = await DB.get('rotasDeslocamento', id);
    if (!rota) return null;
    if (!Permissoes.podeEditarRota(rota)) return { erro: 'Você só pode alterar rotas de deslocamento criadas por você' };
    rota.status = rota.status === 'inativa' ? 'ativa' : 'inativa';
    await DB.put('rotasDeslocamento', rota);
    if (typeof Sync !== 'undefined') Sync.enfileirar('rotaDeslocamento', rota);
    return rota;
  },

  async removerRotaDeslocamento(id) {
    const rota = await DB.get('rotasDeslocamento', id);
    if (!rota) return { erro: 'Rota de deslocamento não encontrada' };
    if (!Permissoes.podeEditarRota(rota)) return { erro: 'Você só pode apagar rotas de deslocamento criadas por você' };
    await DB.delete('rotasDeslocamento', id);
    if (typeof Sync !== 'undefined') Sync.enfileirarExclusao('rotaDeslocamento', id);
    return { sucesso: true };
  },

  // ---------- CICLO DA VIAGEM ----------
  // Cria uma viagem em andamento (cronômetro correndo)
  async iniciarViagem({ turnoId, motoristaId, motoristaNome, equipamentoId, equipamentoCodigo, rotaId, rotaNome }) {
    const rota = await DB.get('rotas', rotaId);
    const viagem = {
      id: gerarId('viagem'),
      turnoId, motoristaId, motoristaNome,
      equipamentoId, equipamentoCodigo,
      rotaId, rotaNome,
      material: rota ? rota.material : '',
      equipamentoCargaId: rota ? rota.equipamentoCargaId : '',
      equipamentoCargaCodigo: rota ? rota.equipamentoCargaCodigo : '',
      tipo: 'viagem',
      dia: todayKey(),
      status: 'em_andamento',       // em_andamento | concluida
      inicioEm: agoraISO(),
      descarregadoEm: null,
      tempoTotalMs: null
    };
    await DB.put('viagens', viagem);
    return viagem;
  },

  // Marca a descarga e calcula o tempo total automaticamente
  async descarregar(viagemId) {
    const viagem = await DB.get('viagens', viagemId);
    if (!viagem) return null;
    viagem.descarregadoEm = agoraISO();
    viagem.status = 'concluida';
    viagem.tempoTotalMs = new Date(viagem.descarregadoEm) - new Date(viagem.inicioEm);
    await DB.put('viagens', viagem);
    await Sync.enfileirar('viagem', viagem);
    return viagem;
  },

  // Repete a última viagem da mesma rota/equipamento/turno, já iniciando o cronômetro de novo
  async repetirViagem(viagemAnteriorId) {
    const anterior = await DB.get('viagens', viagemAnteriorId);
    if (!anterior) return null;
    return this.iniciarViagem({
      turnoId: anterior.turnoId,
      motoristaId: anterior.motoristaId,
      motoristaNome: anterior.motoristaNome,
      equipamentoId: anterior.equipamentoId,
      equipamentoCodigo: anterior.equipamentoCodigo,
      rotaId: anterior.rotaId,
      rotaNome: anterior.rotaNome
    });
  },

  async viagemEmAndamento(turnoId) {
    const viagens = await DB.getByIndex('viagens', 'turnoId', turnoId);
    return viagens.find(v => v.status === 'em_andamento') || null;
  },

  // ---------- DESLOCAMENTO (sem carga, ex: deslocamento até a frente de serviço) ----------
  // Não conta como produção — é registrado separadamente das viagens.
  async iniciarDeslocamento({ turnoId, motoristaId, equipamentoId, origem, destino, motivo }) {
    const deslocamento = {
      id: gerarId('desloc'),
      turnoId, motoristaId, equipamentoId,
      origem: origem || '', destino: destino || '',
      motivo: motivo || '',
      tipo: 'deslocamento',
      inicioEm: agoraISO(),
      fimEm: null,
      tempoTotalMs: null,
      dia: todayKey()
    };
    await DB.put('deslocamentos', deslocamento);
    return deslocamento;
  },

  async finalizarDeslocamento(id) {
    const d = await DB.get('deslocamentos', id);
    if (!d) return null;
    d.fimEm = agoraISO();
    d.tempoTotalMs = new Date(d.fimEm) - new Date(d.inicioEm);
    await DB.put('deslocamentos', d);
    await Sync.enfileirar('deslocamento', d);
    return d;
  },

  async deslocamentosDoDia(dia = todayKey()) {
    const todos = await DB.getAll('deslocamentos');
    return todos.filter(d => d.dia === dia).sort((a, b) => new Date(b.inicioEm) - new Date(a.inicioEm));
  },

  async deslocamentosPorEquipamento(equipamentoId) {
    const todos = await DB.getByIndex('deslocamentos', 'equipamentoId', equipamentoId);
    return todos.sort((a, b) => new Date(b.inicioEm) - new Date(a.inicioEm));
  },

  async removerDeslocamento(id) {
    await DB.delete('deslocamentos', id);
    if (typeof Sync !== 'undefined') Sync.enfileirarExclusao('deslocamento', id);
    return true;
  },

  // ---------- EDIÇÃO / EXCLUSÃO DE VIAGEM ----------
  async editarViagem(id, campos) {
    const viagem = await DB.get('viagens', id);
    if (!viagem) return null;
    const atualizada = { ...viagem, ...campos };
    // recalcula o tempo total se início ou descarga foram alterados
    if (atualizada.inicioEm && atualizada.descarregadoEm) {
      atualizada.tempoTotalMs = new Date(atualizada.descarregadoEm) - new Date(atualizada.inicioEm);
    }
    atualizada.editadoEm = agoraISO();
    await DB.put('viagens', atualizada);
    await Sync.enfileirar('viagem', atualizada);
    return atualizada;
  },

  async removerViagem(id) {
    await DB.delete('viagens', id);
    if (typeof Sync !== 'undefined') Sync.enfileirarExclusao('viagem', id);
    return true;
  },

  // ---------- LANÇAMENTO ATRASADO (viagem ou deslocamento que o motorista esqueceu de iniciar ao vivo) ----------
  async lancarDiaCompleto({ dia, equipamentoId, equipamentoCodigo, motoristaId, motoristaNome, kmInicial, kmFinal, horimetroInicial, horimetroFinal, rotasComQtd, deslocamentosComQtd }) {
    const usuarioLancou = Permissoes.usuarioAtual();

    // cria um turno "histórico" só de referência — não mexe no KM/horímetro
    // atual do equipamento, é só pra agrupar essas viagens de um dia passado
    const turno = {
      id: gerarId('turno'),
      tipo: 'turno',
      motoristaId, motoristaNome,
      equipamentoId, equipamentoCodigo,
      kmInicial: Number(kmInicial) || 0,
      kmFinal: Number(kmFinal) || 0,
      horimetroInicial: Number(horimetroInicial) || 0,
      horimetroFinal: Number(horimetroFinal) || 0,
      dia,
      status: 'encerrado',
      iniciadoEm: `${diaKeyParaISO(dia)}T00:00:00.000Z`,
      encerradoEm: `${diaKeyParaISO(dia)}T23:59:00.000Z`,
      lancamentoManual: true,
      lancadoPorNome: usuarioLancou ? usuarioLancou.nome : null
    };
    await DB.put('turnos', turno);
    if (typeof Sync !== 'undefined') await Sync.enfileirar('turno', turno);

    let totalCriado = 0;
    for (const item of (rotasComQtd || [])) {
      const rota = await DB.get('rotas', item.rotaId);
      if (!rota) continue;
      const quantidade = Math.max(0, parseInt(item.quantidade) || 0);
      for (let i = 0; i < quantidade; i++) {
        const viagem = {
          id: gerarId('viagem'),
          turnoId: turno.id, motoristaId, motoristaNome,
          equipamentoId, equipamentoCodigo,
          rotaId: rota.id, rotaNome: rota.nome,
          material: rota.material || '',
          equipamentoCargaId: rota.equipamentoCargaId || '',
          equipamentoCargaCodigo: rota.equipamentoCargaCodigo || '',
          tipo: 'viagem',
          dia,
          status: 'concluida',
          inicioEm: item.horario ? `${diaKeyParaISO(dia)}T${item.horario}:00.000Z` : `${diaKeyParaISO(dia)}T12:00:00.000Z`,
          descarregadoEm: null,
          tempoTotalMs: null,
          lancamentoManual: true,
          lancamentoLote: true
        };
        await DB.put('viagens', viagem);
        if (typeof Sync !== 'undefined') await Sync.enfileirar('viagem', viagem);
        totalCriado++;
      }
    }

    let totalDeslocamentosCriados = 0;
    for (const item of (deslocamentosComQtd || [])) {
      const rotaDesloc = await DB.get('rotasDeslocamento', item.rotaDeslocId);
      if (!rotaDesloc) continue;
      const quantidade = Math.max(0, parseInt(item.quantidade) || 0);
      for (let i = 0; i < quantidade; i++) {
        const deslocamento = {
          id: gerarId('desloc'),
          turnoId: turno.id, motoristaId, equipamentoId,
          origem: rotaDesloc.origem || '', destino: rotaDesloc.destino || '',
          motivo: rotaDesloc.motivo || '',
          tipo: 'deslocamento',
          dia,
          inicioEm: item.horario ? `${diaKeyParaISO(dia)}T${item.horario}:00.000Z` : `${diaKeyParaISO(dia)}T12:00:00.000Z`,
          fimEm: null,
          tempoTotalMs: null,
          lancamentoManual: true,
          lancamentoLote: true
        };
        await DB.put('deslocamentos', deslocamento);
        if (typeof Sync !== 'undefined') await Sync.enfileirar('deslocamento', deslocamento);
        totalDeslocamentosCriados++;
      }
    }

    return { sucesso: true, turno, totalViagens: totalCriado, totalDeslocamentos: totalDeslocamentosCriados };
  },

  async lancarViagemAtrasada({ turnoId, motoristaId, motoristaNome, equipamentoId, equipamentoCodigo, rotaId, rotaNome, inicioEm, fimEm }) {
    const rota = await DB.get('rotas', rotaId);
    const viagem = {
      id: gerarId('viagem'),
      turnoId, motoristaId, motoristaNome,
      equipamentoId, equipamentoCodigo,
      rotaId, rotaNome,
      material: rota ? rota.material : '',
      equipamentoCargaId: rota ? rota.equipamentoCargaId : '',
      equipamentoCargaCodigo: rota ? rota.equipamentoCargaCodigo : '',
      tipo: 'viagem',
      dia: todayKey(),
      status: 'concluida',
      inicioEm, descarregadoEm: fimEm,
      tempoTotalMs: new Date(fimEm) - new Date(inicioEm),
      lancamentoManual: true
    };
    await DB.put('viagens', viagem);
    if (typeof Sync !== 'undefined') await Sync.enfileirar('viagem', viagem);
    return viagem;
  },

  async lancarDeslocamentoAtrasado({ turnoId, motoristaId, equipamentoId, rotaDeslocId, inicioEm, fimEm }) {
    const rota = await DB.get('rotasDeslocamento', rotaDeslocId);
    const deslocamento = {
      id: gerarId('desloc'),
      turnoId, motoristaId, equipamentoId,
      origem: rota ? rota.origem : '', destino: rota ? rota.destino : '',
      motivo: rota ? rota.motivo : '',
      tipo: 'deslocamento',
      inicioEm, fimEm,
      tempoTotalMs: new Date(fimEm) - new Date(inicioEm),
      dia: todayKey(),
      lancamentoManual: true
    };
    await DB.put('deslocamentos', deslocamento);
    if (typeof Sync !== 'undefined') await Sync.enfileirar('deslocamento', deslocamento);
    return deslocamento;
  },

  // ---------- ESTATÍSTICAS POR ROTA ----------
  async estatisticasRota(rotaId, dia = null) {
    const viagens = (await DB.getByIndex('viagens', 'rotaId', rotaId))
      .filter(v => v.status === 'concluida' && (!dia || v.dia === dia));
    const tempoTotalMs = viagens.reduce((a, v) => a + (v.tempoTotalMs || 0), 0);
    return {
      totalViagens: viagens.length,
      tempoTotalMs,
      tempoMedioMs: viagens.length ? tempoTotalMs / viagens.length : 0
    };
  }
};

window.Operacao = Operacao;
