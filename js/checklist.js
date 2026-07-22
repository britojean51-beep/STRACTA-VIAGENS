/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — checklist.js
   Checklist de pré-uso do equipamento, feito antes de iniciar
   o turno (pneus, freios, óleo, luzes, etc).
   ══════════════════════════════════════════════════════════ */

const ITENS_CHECKLIST = [
  'Pneus',
  'Freios',
  'Óleo do motor',
  'Nível de combustível',
  'Luzes / Faróis',
  'Buzina',
  'Cinto de segurança',
  'Extintor de incêndio',
  'Espelhos retrovisores',
  'Sistema de direção',
  'Vazamentos visíveis'
];

const Checklist = {
  async salvar({ turnoId, equipamentoId, equipamentoCodigo, motoristaId, motoristaNome, itens }) {
    const temProblema = itens.some(i => !i.ok);
    const registro = {
      id: gerarId('checklist'),
      tipo: 'checklist',
      turnoId, equipamentoId, equipamentoCodigo, motoristaId, motoristaNome,
      itens,
      temProblema,
      dia: todayKey(),
      criadoEm: agoraISO()
    };
    await DB.put('checklists', registro);
    if (typeof Sync !== 'undefined') await Sync.enfileirar('checklist', registro);
    return registro;
  },

  async porEquipamento(equipamentoId) {
    const todos = await DB.getByIndex('checklists', 'equipamentoId', equipamentoId);
    return todos.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  },

  async porTurno(turnoId) {
    const todos = await DB.getAll('checklists');
    return todos.find(c => c.turnoId === turnoId) || null;
  }
};

window.ITENS_CHECKLIST = ITENS_CHECKLIST;
window.Checklist = Checklist;
