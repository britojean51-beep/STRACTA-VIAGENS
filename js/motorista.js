/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — motorista.js
   Fluxo do motorista: iniciar turno, selecionar equipamento,
   informar KM/horímetro, encerrar turno. Recupera automatica-
   mente um turno em aberto se o app for fechado no meio.
   ══════════════════════════════════════════════════════════ */

const TURNO_ATIVO_CHAVE = 'stracta_viagens_turno_ativo_id';

const Motorista = {
  async turnoAtivo() {
    const id = localStorage.getItem(TURNO_ATIVO_CHAVE);
    if (id) {
      const turno = await DB.get('turnos', id);
      if (turno && turno.status === 'ativo') return turno;
      localStorage.removeItem(TURNO_ATIVO_CHAVE);
    }
    // ponteiro local não existe (ex: login em outro aparelho) — procura no banco
    // (já sincronizado via Sync) se o usuário atual tem um turno ativo em outro lugar
    const usuario = Auth.usuarioAtual();
    if (!usuario) return null;
    const ativos = await DB.getByIndex('turnos', 'status', 'ativo');
    const doUsuario = ativos.find(t => t.motoristaId === usuario.id);
    if (doUsuario) {
      localStorage.setItem(TURNO_ATIVO_CHAVE, doUsuario.id);
      return doUsuario;
    }
    return null;
  },

  async iniciarTurno({ motoristaId, motoristaNome, equipamentoId, equipamentoCodigo, kmInicial, horimetroInicial }) {
    // impede dois motoristas com turno ativo no mesmo caminhão ao mesmo tempo
    const turnosAtivos = await DB.getByIndex('turnos', 'status', 'ativo');
    const jaEmUso = turnosAtivos.find(t => t.equipamentoId === equipamentoId && t.motoristaId !== motoristaId);
    if (jaEmUso) {
      return { erro: `Este equipamento já está em uso por ${jaEmUso.motoristaNome} desde ${fmtHoraBR(jaEmUso.iniciadoEm)}` };
    }

    const turno = {
      id: gerarId('turno'),
      tipo: 'turno',
      motoristaId, motoristaNome,
      equipamentoId, equipamentoCodigo,
      kmInicial: Number(kmInicial) || 0,
      horimetroInicial: Number(horimetroInicial) || 0,
      dia: todayKey(),
      status: 'ativo',
      iniciadoEm: agoraISO(),
      encerradoEm: null
    };
    await DB.put('turnos', turno);
    await Equipamentos.atualizarKmHorimetro(equipamentoId, kmInicial, horimetroInicial);
    localStorage.setItem(TURNO_ATIVO_CHAVE, turno.id);
    await Sync.enfileirar('turno', turno);
    return turno;
  },

  async encerrarTurno(turnoId, { kmFinal, horimetroFinal } = {}) {
    const turno = await DB.get('turnos', turnoId);
    if (!turno) return null;
    turno.status = 'encerrado';
    turno.encerradoEm = agoraISO();
    if (kmFinal != null) turno.kmFinal = Number(kmFinal);
    if (horimetroFinal != null) turno.horimetroFinal = Number(horimetroFinal);
    await DB.put('turnos', turno);
    if (kmFinal != null || horimetroFinal != null) {
      await Equipamentos.atualizarKmHorimetro(turno.equipamentoId, kmFinal, horimetroFinal);
    }
    localStorage.removeItem(TURNO_ATIVO_CHAVE);
    await Sync.enfileirar('turno', turno);
    return turno;
  },

  async viagensDoTurno(turnoId) {
    return DB.getByIndex('viagens', 'turnoId', turnoId);
  },

  async resumoTurno(turnoId) {
    const viagens = await this.viagensDoTurno(turnoId);
    const concluidas = viagens.filter(v => v.status === 'concluida');
    const tempoTotalMs = concluidas.reduce((acc, v) => acc + ((v.tempoTotalMs) || 0), 0);
    return {
      totalViagens: concluidas.length,
      tempoTotalMs,
      tempoMedioMs: concluidas.length ? tempoTotalMs / concluidas.length : 0
    };
  }
};

window.Motorista = Motorista;
