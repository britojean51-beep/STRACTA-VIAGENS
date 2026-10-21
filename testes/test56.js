/* Bug 2: o ouvinte de "operacao" troca db.paradas INTEIRO pelo que vem da nuvem.
   Parada criada com a nuvem desligada só existia no aparelho e morria calada na
   primeira leitura depois de religar. Desde o r55 a parada alimenta o desconto de
   manutenção das horas pagas: parada perdida é dinheiro pago a mais. */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
const URL = 'http://localhost:8130/index.html';

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = []; let falhas = 0;
  const ok = (n, c, extra) => { if (!c) falhas++;
    console.log((c ? '  OK  ' : ' FALHA ') + n + (extra !== undefined ? ' → ' + extra : '')); };
  const perto = (a, b) => Math.abs(a - b) < 0.02;

  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));
  const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await ligar(p); await p.addInitScript(SDK);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#btnEntrar');
  await p.fill('#loginEmail', 'jean'); await p.fill('#loginSenha', '123456');
  await p.click('#btnEntrar'); await p.waitForTimeout(1400);
  await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });

  const MES = '2026-09';
  const paradasDe = eq => p.evaluate(e => Object.values(DB.load().paradas)
    .filter(x => x.equipamento === e).length, eq);
  const desconto = eq => p.evaluate(([e, m]) => DB.pagamentoMes(e, m).desconto, [eq, MES]);

  // a nuvem existe e já tem documento de operação (é o caso real dele)
  await p.evaluate(() => { DB.setStatus('CB-11', 'reserva', { dia: DB.hojeISO(), hora: '08:00' }); });
  await p.waitForTimeout(800);
  ok('a nuvem já tem o documento de operação',
     !!api.get('frota/gp2t/cadastro/operacao'), String(!!api.get('frota/gp2t/cadastro/operacao')));

  /* ---- 1. desliga a nuvem e lança a manutenção, como no pátio sem sinal ---- */
  await p.evaluate(() => { DB.setConfig({ nuvem: false, nuvemManual: true }); Cloud.parar(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    DB.setTipoEquip('CB-17', 'km_horimetro');
    DB.addAbastecimento('2026-09-02', { equipamento: 'CB-17', motorista: 'Saulo', hora: '08:00',
      horimetroInicial: 0, horimetroFinal: 0, horasTrabalhadas: '170',
      kmInicial: 0, kmFinal: 100, kmRodado: 100, litros: 50, combustivel: 'S-10',
      litrosArla: 0, media: '2,00', unidadeMedia: 'km/L', situacao: 'Operando' });
    // 8h de manutencao numa terça-feira (08/09/2026), pelo caminho real do app
    DB.registrarManutencao('CB-17', { dia: '2026-09-08', horaIni: '08:00', horaFim: '16:00' });
  });
  await p.waitForTimeout(400);
  ok('com a nuvem desligada a parada fica gravada no aparelho', await paradasDe('CB-17') === 1,
     await paradasDe('CB-17'));
  const dAntes = await desconto('CB-17');
  ok('e o desconto de manutenção já conta 8h', perto(dAntes, 8), dAntes + ' h');
  ok('a parada NÃO chegou à nuvem (é o que cria o risco)',
     !((JSON.parse(api.get('frota/gp2t/cadastro/operacao') || '{}').paradas) || {})[Object.keys(
       JSON.parse(api.get('frota/gp2t/cadastro/operacao') || '{}').paradas || {})[0]] ||
     Object.keys(JSON.parse(api.get('frota/gp2t/cadastro/operacao') || '{}').paradas || {}).length === 0,
     JSON.stringify(Object.keys(JSON.parse(api.get('frota/gp2t/cadastro/operacao') || '{}').paradas || {})));

  /* ---- 2. religa a nuvem: é aqui que a parada morria ---- */
  await p.evaluate(() => { DB.setConfig({ nuvem: true }); Cloud.iniciar(); });
  await p.waitForTimeout(2200);

  ok('depois de religar a nuvem a parada CONTINUA no aparelho',
     await paradasDe('CB-17') === 1, await paradasDe('CB-17'));
  const dDepois = await desconto('CB-17');
  ok('e o desconto de manutenção continua 8h — nenhum dinheiro a mais',
     perto(dDepois, 8), dAntes + ' h → ' + dDepois + ' h');
  const naNuvem = Object.keys(JSON.parse(api.get('frota/gp2t/cadastro/operacao') || '{}').paradas || {});
  ok('a parada subiu para a nuvem, em vez de ser descartada', naNuvem.length === 1, JSON.stringify(naNuvem));

  /* ---- 3. e o outro celular recebe ---- */
  const p2 = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
  p2.on('pageerror', e => errors.push('P2 PAGEERROR: ' + e.message));
  await ligar(p2); await p2.addInitScript(SDK);
  await p2.goto(URL, { waitUntil: 'networkidle' });
  await p2.evaluate(() => localStorage.clear());
  await p2.reload({ waitUntil: 'networkidle' });
  await p2.waitForSelector('#btnEntrar');
  await p2.fill('#loginEmail', 'jean'); await p2.fill('#loginSenha', '123456');
  await p2.click('#btnEntrar'); await p2.waitForTimeout(2200);
  const no2 = await p2.evaluate(() => Object.values(DB.load().paradas)
    .filter(x => x.equipamento === 'CB-17').length);
  ok('o segundo celular recebe a parada', no2 === 1, no2);

  /* ---- 4. aparelho velho não empurra horímetro antigo por cima do novo ---- */
  /* O aparelho 1 fica com a nuvem DESLIGADA e grava um valor velho só nele; a
     nuvem, pelo aparelho 2, tem o valor novo. Ao religar, o _semear não pode
     empurrar o velho por cima: só as paradas sobem, estado e status não. */
  await p.evaluate(() => { DB.setConfig({ nuvem: false }); Cloud.parar(); });
  await p.waitForTimeout(400);
  await p2.evaluate(() => { DB.setUltimo('CB-11', 50000, 5000); });
  await p2.waitForTimeout(1000);
  await p.evaluate(() => { DB.setUltimo('CB-11', 10, 10); });     // nuvem off: fica só aqui
  ok('o aparelho 1, offline, está com o valor velho',
     await p.evaluate(() => DB.ultimo('CB-11').kmFinal) === 10);
  await p.evaluate(() => { DB.setConfig({ nuvem: true }); Cloud.iniciar(); });
  await p.waitForTimeout(2400);
  const km = await p.evaluate(() => DB.ultimo('CB-11').kmFinal);
  ok('religar NÃO empurra horímetro/KM velho por cima do novo (só paradas sobem)',
     km === 50000, km + ' (esperado 50000)');

  /* ---- 5. parada apagada de propósito não ressuscita ---- */
  const idp = await p.evaluate(() => Object.keys(DB.load().paradas)
    .find(k => DB.load().paradas[k].equipamento === 'CB-17'));
  await p.evaluate(i => DB.removerParada(i), idp);
  await p.waitForTimeout(900);
  await p.evaluate(() => { Cloud.parar(); Cloud.iniciar(); });
  await p.waitForTimeout(2200);
  ok('parada apagada de propósito não volta ao religar', await paradasDe('CB-17') === 0,
     await paradasDe('CB-17'));

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
