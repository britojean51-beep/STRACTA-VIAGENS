/* r49 — a limpeza do teste do r47.
   O que importa não é "sumiu da tela": é o localStorage voltar ao tamanho de
   antes. As fotos do teste eram base64 dentro da mesma caixa de ~5 MB em que
   mora o app inteiro; deixá-las lá encolhe o espaço de todo o resto. */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
const URL = 'http://localhost:8130/index.html';

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  let falhas = 0;
  const ok = (n, c, extra) => { if (!c) falhas++;
    console.log((c ? '  OK  ' : ' FALHA ') + n + (extra !== undefined ? ' → ' + extra : '')); };

  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));

  const c = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await ligar(p); await p.addInitScript(SDK);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#btnEntrar');
  await p.fill('#loginEmail', 'jean'); await p.fill('#loginSenha', '123456');
  await p.click('#btnEntrar'); await p.waitForTimeout(1300);
  await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });

  // um lançamento de verdade, para provar que a faxina não leva junto o que é dele
  await p.evaluate(() => {
    const iso = DB.hojeISO();
    DB.addAbastecimento(iso, { equipamento: 'CB-17', motorista: 'Saulo', hora: '08:00',
      horimetroInicial: 100, horimetroFinal: 108, horasTrabalhadas: '8,0',
      kmInicial: 0, kmFinal: 300, kmRodado: 300, litros: 120.5, combustivel: 'S-10',
      litrosArla: 0, media: '2,49', unidadeMedia: 'km/L', situacao: 'Operando' });
  });
  await p.waitForTimeout(400);
  const limpo = await p.evaluate(() => localStorage.getItem('stracta_frota_v1').length);

  /* Agora o aparelho fica como o dele ficou: com o resto do r47 gravado —
     três solicitações com miniatura, um envio preso na fila da nuvem (que as
     regras recusam para sempre) e uma linha na fila da planilha. */
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('stracta_frota_v1'));
    const mini = 'data:image/jpeg;base64,' + 'A'.repeat(11000);
    raw.solicitacoes = {};
    ['s1', 's2', 's3'].forEach(id => {
      raw.solicitacoes[id] = { id, equipamento: 'CB-17', parte: 'Motor',
        descricao: 'teste', situacao: 'pendente', miniatura: mini, nFotos: 2 };
    });
    raw.syncPend = [{ action: 'upsert', kind: 'solicitacao', row: { Equipamento: 'CB-17' } }];
    localStorage.setItem('stracta_frota_v1', JSON.stringify(raw));
    // o celular dele chega no r49 sem nenhuma faxina feita
    localStorage.removeItem('gp2t_limpou_solic');
    localStorage.setItem('gp2t_nuvem_pend', JSON.stringify([
      { t: 'push', col: 'solicitacoes', id: 's1', dados: {} },
      { t: 'push', col: 'abastecimentos', id: 'a1', dados: {} }
    ]));
  });
  // e a hipótese pior: alguma solicitação chegou mesmo a ser gravada na nuvem
  api.set('frota/gp2t/solicitacoes/s1', JSON.stringify({ equipamento: 'CB-17', parte: 'Motor' }));
  api.set('frota/gp2t/solicitacoes/s2', JSON.stringify({ equipamento: 'PC-01', parte: 'Pneu' }));
  const sujo = await p.evaluate(() => localStorage.getItem('stracta_frota_v1').length);
  ok('o teste do r47 realmente pesa no aparelho', sujo - limpo > 30000,
     '+' + Math.round((sujo - limpo) / 1024) + ' KB');

  // e agora ele abre o app no r49
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);

  const depois = await p.evaluate(() => ({
    solic: !!JSON.parse(localStorage.getItem('stracta_frota_v1')).solicitacoes,
    tam: localStorage.getItem('stracta_frota_v1').length,
    syncPend: JSON.parse(localStorage.getItem('stracta_frota_v1')).syncPend.length,
    nuvemPend: JSON.parse(localStorage.getItem('gp2t_nuvem_pend') || '[]'),
    abast: DB.load().dias[DB.hojeISO()].abastecimentos.length,
    marca: localStorage.getItem('gp2t_limpou_solic')
  }));

  ok('as solicitações sumiram do aparelho', depois.solic === false, String(depois.solic));
  ok('o localStorage voltou ao tamanho de antes', depois.tam <= limpo,
     depois.tam + ' bytes (antes do teste: ' + limpo + ')');
  ok('a fila da planilha não guarda mais a linha do r47', depois.syncPend === 0, depois.syncPend);
  /* A fila não pode ter sobrado nenhuma solicitação; o abastecimento que estava
     nela tem que ter subido de verdade (a fila esvaziar só prova que saiu dali). */
  ok('a fila da nuvem não guarda mais nenhuma solicitação',
     depois.nuvemPend.every(o => o.col !== 'solicitacoes'),
     JSON.stringify(depois.nuvemPend.map(o => o.col)));
  ok('o abastecimento que estava na fila subiu',
     api.get('frota/gp2t/abastecimentos/a1') !== null, api.get('frota/gp2t/abastecimentos/a1'));
  const restos = api.tudo().filter(c => c.indexOf('frota/gp2t/solicitacoes') === 0);
  ok('a nuvem ficou sem nenhuma solicitação', restos.length === 0, JSON.stringify(restos));
  ok('o abastecimento do dia continua lá', depois.abast === 1, depois.abast);
  ok('a faxina da nuvem rodou e não vai repetir', depois.marca === '1', depois.marca);

  // abrir de novo não pode quebrar nada nem ressuscitar o que saiu
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const d2 = await p.evaluate(() => ({
    solic: !!JSON.parse(localStorage.getItem('stracta_frota_v1')).solicitacoes,
    abast: DB.load().dias[DB.hojeISO()].abastecimentos.length
  }));
  ok('na segunda abertura segue limpo', d2.solic === false && d2.abast === 1,
     JSON.stringify(d2));

  /* O caso mais provável de verdade: as regras do Firestore dele nunca liberaram
     essa coleção, então a faxina da nuvem vai levar "permissão negada" na cara.
     Isso não pode virar aviso de erro na tela — é faxina, ele não pediu nada. */
  api.negar('frota/gp2t/solicitacoes');
  const p2 = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
  const erros2 = [];
  p2.on('pageerror', e => erros2.push('PAGEERROR: ' + e.message));
  await ligar(p2); await p2.addInitScript(SDK);
  await p2.goto(URL, { waitUntil: 'networkidle' });
  await p2.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stracta_frota_v1', JSON.stringify({
      solicitacoes: { s9: { id: 's9', equipamento: 'CB-17', miniatura: 'x'.repeat(9000) } }
    }));
  });
  await p2.reload({ waitUntil: 'networkidle' });
  await p2.waitForSelector('#btnEntrar');
  await p2.fill('#loginEmail', 'jean'); await p2.fill('#loginSenha', '123456');
  await p2.click('#btnEntrar'); await p2.waitForTimeout(1800);
  const neg = await p2.evaluate(() => ({
    solic: !!JSON.parse(localStorage.getItem('stracta_frota_v1')).solicitacoes,
    estado: (Cloud.estado() || {}).chave,
    erro: Cloud._erro || null
  }));
  ok('sem permissão na nuvem, a limpeza local acontece do mesmo jeito',
     neg.solic === false, String(neg.solic));
  ok('a recusa da nuvem não vira erro na tela', !neg.erro && neg.estado !== 'erro',
     neg.estado + ' / ' + neg.erro);
  ok('sem erro de JavaScript na recusa', erros2.length === 0, erros2.slice(0, 2).join(' | ') || 'nenhum');

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
