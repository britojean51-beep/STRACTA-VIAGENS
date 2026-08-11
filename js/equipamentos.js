/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — equipamentos.js
   Cadastro de equipamentos da frota.
   ══════════════════════════════════════════════════════════ */

const EQUIP_TESTE_ID = 'equip-teste';

const Equipamentos = {
  async listar() {
    const todos = await DB.getAll('equipamentos');
    // o equipamento de teste não aparece nas listas normais (frota, painel, seletores)
    return todos
      .filter(e => !e.teste)
      .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
  },

  // Cria (uma vez) e retorna o equipamento fictício de teste, usado só no Modo Teste.
  async garantirEquipTeste() {
    let e = await DB.get('equipamentos', EQUIP_TESTE_ID);
    if (!e) {
      e = {
        id: EQUIP_TESTE_ID, tipo: 'equipamento', codigo: 'TESTE',
        modelo: 'Equipamento de teste', categoria: 'Caminhão',
        kmAtual: 0, horimetroAtual: 0, status: 'ativo', ativo: true,
        teste: true, expedienteInicio: '00:00', expedienteFim: '23:59',
        criadoEm: agoraISO()
      };
      await DB.put('equipamentos', e);
    }
    return e;
  },

  async ativos() {
    const todos = await this.listar();
    return todos.filter(e => e.status !== 'manutencao' && e.status !== 'reserva' && e.ativo !== false);
  },

  async emManutencao() {
    const todos = await this.listar();
    return todos.filter(e => e.status === 'manutencao');
  },

  async salvar({ id, codigo, modelo, categoria, kmAtual, horimetroAtual, status, expedienteInicio, expedienteFim }) {
    const existente = id ? await DB.get('equipamentos', id) : null;
    const equip = {
      id: id || gerarId('equip'),
      tipo: 'equipamento',
      codigo,
      modelo: modelo || '',
      categoria: categoria || 'Caminhão',
      kmAtual: Number(kmAtual) || 0,
      horimetroAtual: Number(horimetroAtual) || 0,
      status: status || 'ativo', // 'ativo' | 'manutencao' | 'reserva'
      // horário de expediente — fora dele, "sem operador" não é tratado como alerta
      expedienteInicio: expedienteInicio || (existente ? existente.expedienteInicio : '07:00'),
      expedienteFim: expedienteFim || (existente ? existente.expedienteFim : '19:00'),
      ativo: true,
      atualizadoEm: agoraISO()
    };
    await DB.put('equipamentos', equip);
    if (typeof Sync !== 'undefined') Sync.enfileirar('equipamento', equip);
    return equip;
  },

  // Verifica se o horário atual está dentro do expediente configurado desse
  // equipamento (lida com expediente que passa da meia-noite, tipo 19h-07h)
  dentroDoExpediente(equip) {
    if (!equip.expedienteInicio || !equip.expedienteFim) return true;
    const agora = new Date();
    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const [hI, mI] = equip.expedienteInicio.split(':').map(Number);
    const [hF, mF] = equip.expedienteFim.split(':').map(Number);
    const minutosInicio = hI * 60 + mI;
    const minutosFim = hF * 60 + mF;
    if (minutosInicio <= minutosFim) {
      return minutosAgora >= minutosInicio && minutosAgora <= minutosFim;
    }
    // expediente vira a noite (ex: 19h às 07h)
    return minutosAgora >= minutosInicio || minutosAgora <= minutosFim;
  },

  // ---------- MANUTENÇÃO (com histórico de entrada/saída) ----------
  async manutencaoAberta(equipamentoId) {
    const registros = await DB.getByIndex('manutencoes', 'equipamentoId', equipamentoId);
    return registros.find(m => !m.saidaEm) || null;
  },

  async historicoManutencoes(equipamentoId) {
    const registros = await DB.getByIndex('manutencoes', 'equipamentoId', equipamentoId);
    return registros.sort((a, b) => new Date(b.entradaEm) - new Date(a.entradaEm));
  },

  async enviarParaManutencao(equipamentoId, motivo = '') {
    const equip = await DB.get('equipamentos', equipamentoId);
    if (!equip) return null;
    const jaAberta = await this.manutencaoAberta(equipamentoId);
    if (!jaAberta) {
      const registro = {
        id: gerarId('manut'),
        tipo: 'manutencao',
        equipamentoId,
        equipamentoCodigo: equip.codigo,
        motivo: motivo || '',
        entradaEm: agoraISO(),
        saidaEm: null
      };
      await DB.put('manutencoes', registro);
      if (typeof Sync !== 'undefined') Sync.enfileirar('manutencao', registro);
    }
    equip.status = 'manutencao';
    equip.atualizadoEm = agoraISO();
    await DB.put('equipamentos', equip);
    if (typeof Sync !== 'undefined') Sync.enfileirar('equipamento', equip);
    return equip;
  },

  async retornarDaManutencao(equipamentoId) {
    const equip = await DB.get('equipamentos', equipamentoId);
    if (!equip) return null;
    const aberta = await this.manutencaoAberta(equipamentoId);
    if (aberta) {
      aberta.saidaEm = agoraISO();
      await DB.put('manutencoes', aberta);
      if (typeof Sync !== 'undefined') Sync.enfileirar('manutencao', aberta);
    }
    equip.status = 'ativo';
    equip.atualizadoEm = agoraISO();
    await DB.put('equipamentos', equip);
    if (typeof Sync !== 'undefined') Sync.enfileirar('equipamento', equip);
    return equip;
  },

  async alternarManutencao(id, motivo = '') {
    const equip = await DB.get('equipamentos', id);
    if (!equip) return null;
    return equip.status === 'manutencao' ? this.retornarDaManutencao(id) : this.enviarParaManutencao(id, motivo);
  },

  // Apaga um lançamento de manutenção feito errado (não mexe no status atual do equipamento)
  async removerManutencao(id) {
    const registro = await DB.get('manutencoes', id);
    if (!registro) return { erro: 'Registro não encontrado' };
    await DB.delete('manutencoes', id);
    if (typeof Sync !== 'undefined') Sync.enfileirarExclusao('manutencao', id);
    return { sucesso: true };
  },

  // ---------- RESERVA (equipamento parado de propósito, sem ser manutenção) ----------
  async alternarReserva(id) {
    const equip = await DB.get('equipamentos', id);
    if (!equip) return null;
    equip.status = equip.status === 'reserva' ? 'ativo' : 'reserva';
    equip.atualizadoEm = agoraISO();
    await DB.put('equipamentos', equip);
    if (typeof Sync !== 'undefined') Sync.enfileirar('equipamento', equip);
    return equip;
  },

  // ---------- ATIVAR / DESATIVAR (soft — some da operação sem apagar o histórico) ----------
  async alternarAtivo(id) {
    const equip = await DB.get('equipamentos', id);
    if (!equip) return null;
    equip.ativo = equip.ativo === false ? true : false;
    equip.atualizadoEm = agoraISO();
    await DB.put('equipamentos', equip);
    if (typeof Sync !== 'undefined') Sync.enfileirar('equipamento', equip);
    return equip;
  },

  // ---------- APAGAR (remoção definitiva do cadastro) ----------
  async remover(id) {
    await DB.delete('equipamentos', id);
    if (typeof Sync !== 'undefined') Sync.enfileirarExclusao('equipamento', id);
    return true;
  },

  async atualizarKmHorimetro(id, km, horimetro) {
    const equip = await DB.get('equipamentos', id);
    if (!equip) return null;
    equip.kmAtual = Number(km) || equip.kmAtual;
    equip.horimetroAtual = Number(horimetro) || equip.horimetroAtual;
    equip.atualizadoEm = agoraISO();
    await DB.put('equipamentos', equip);
    if (typeof Sync !== 'undefined') Sync.enfileirar('equipamento', equip);
    return equip;
  },

};

window.Equipamentos = Equipamentos;
