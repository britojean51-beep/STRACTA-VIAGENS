/* r51 — os litros do tanque.
   Só o LANÇAR mexia no tanque. Editar, trocar o combustível e excluir não mexiam,
   e "4.250" digitado virava 4,25 litros. São quatro furos da mesma família: o
   número de litros que ele vê na tela não era o número que o app guardava. */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
const STUB = fs.readFileSync(__dirname + '/fetchstub.js', 'utf8');
const URL = 'http://localhost:8130/index.html';

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  let falhas = 0;
  const ok = (n, c, extra) => { if (!c) falhas++;
    console.log((c ? '  OK  ' : ' FALHA ') + n + (extra !== undefined ? ' → ' + extra : '')); };

  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));
  const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await ligar(p); await p.addInitScript(SDK); await p.addInitScript(STUB);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#btnEntrar');
  await p.fill('#loginEmail', 'jean'); await p.fill('#loginSenha', '123456');
  await p.click('#btnEntrar'); await p.waitForTimeout(1300);
  await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });

  const tanque = () => p.evaluate(() => JSON.parse(JSON.stringify(DB.load().estoque)));

  /* ---- 1. o número escrito do jeito que o app mostra ---- */
  const lidos = await p.evaluate(() => ({
    milhar: DB.toN('4.250'), milharDec: DB.toN('1.500,5'), decimal: DB.toN('120,1'),
    seco: DB.toN('3000'), pontoDecimal: DB.toN('1008.5'), milhao: DB.toN('1.234.567'),
    vazio: DB.toN(''), numero: DB.toN(120.5)
  }));
  ok('"4.250" é quatro mil duzentos e cinquenta', lidos.milhar === 4250, lidos.milhar);
  ok('"1.500,5" é mil e quinhentos e meio', lidos.milharDec === 1500.5, lidos.milharDec);
  ok('"120,1" continua cento e vinte vírgula um', lidos.decimal === 120.1, lidos.decimal);
  ok('"1008.5" (ponto decimal) continua valendo', lidos.pontoDecimal === 1008.5, lidos.pontoDecimal);
  ok('"1.234.567" lê o milhão', lidos.milhao === 1234567, lidos.milhao);
  ok('"3000" e vazio seguem como antes', lidos.seco === 3000 && lidos.vazio === 0 && lidos.numero === 120.5,
     JSON.stringify([lidos.seco, lidos.vazio, lidos.numero]));

  /* o caminho de verdade: definir litros digitando como está na tela */
  await p.evaluate(() => { DB.setTipoEquip('CB-17', 'km_horimetro'); DB.setUltimo('CB-17', 12000, 1000);
    DB.setEstoque('s10', 0); DB.setEstoque('s500', 2000); });
  await p.evaluate(() => navegar('abastecimento')); await p.waitForTimeout(500);
  await p.fill('#tqSet', '4.250'); await p.click('#btnTqSet'); await p.waitForTimeout(700);
  const t0 = await tanque();
  ok('definir litros com "4.250" põe 4.250 no tanque', t0.s10 === 4250, JSON.stringify(t0));
  const naTela = await p.evaluate(() => document.getElementById('app').innerText);
  ok('e a aba do combustível mostra 4.250', /4\.250/.test(naTela),
     (naTela.match(/Diesel S-10[\s\S]{0,20}/) || [''])[0].replace(/\n/g, ' '));

  /* ---- 2. editar a litragem mexe no tanque ---- */
  await p.fill('#fEquip', 'CB-17'); await p.dispatchEvent('#fEquip', 'change'); await p.waitForTimeout(300);
  await p.fill('#fHoriFim', '1008'); await p.fill('#fKmFim', '12300'); await p.fill('#fLitros', '100');
  await p.evaluate(() => { $('#fMot').value = 'Saulo'; });
  await p.click('#btnSalvar'); await p.waitForTimeout(900);
  ok('lançar 100 L desconta do tanque', (await tanque()).s10 === 4150, JSON.stringify(await tanque()));

  const editar = async mudar => {
    await p.evaluate(() => navegar('corrigir')); await p.waitForTimeout(700);
    await p.evaluate(() => { const el = document.querySelector('[data-edit]'); if (el) el.click(); });
    await p.waitForTimeout(700);
    await mudar();
    await p.click('#btnSalvar'); await p.waitForTimeout(900);
  };
  await editar(async () => { await p.fill('#fLitros', '200'); });
  const t1 = await tanque();
  ok('editar de 100 para 200 L desconta os 100 a mais', t1.s10 === 4050, JSON.stringify(t1));

  await editar(async () => { await p.fill('#fLitros', '50'); });
  const t2 = await tanque();
  ok('editar de 200 para 50 L devolve os litros', t2.s10 === 4200, JSON.stringify(t2));

  /* ---- 3. trocar o combustível move entre tanques ---- */
  await editar(async () => { await p.evaluate(() => { $('#fComb').value = 'S-500'; }); });
  const t3 = await tanque();
  ok('trocar S-10 por S-500 devolve num tanque e desconta no outro',
     t3.s10 === 4250 && t3.s500 === 1950, JSON.stringify(t3));

  /* ---- 4. excluir devolve os litros ---- */
  await p.evaluate(() => navegar('corrigir')); await p.waitForTimeout(700);
  await p.evaluate(() => { const el = document.querySelector('[data-del-ab]'); if (el) el.click(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });
  await p.waitForTimeout(900);
  const t4 = await tanque();
  ok('excluir o lançamento devolve os litros ao tanque',
     t4.s10 === 4250 && t4.s500 === 2000, JSON.stringify(t4));

  /* ---- 5. o ARLA anda junto ---- */
  await p.evaluate(() => { DB.setEstoque('arla', 500); });
  await p.evaluate(() => navegar('abastecimento')); await p.waitForTimeout(500);
  await p.fill('#fEquip', 'CB-17'); await p.dispatchEvent('#fEquip', 'change'); await p.waitForTimeout(300);
  await p.fill('#fHoriFim', '1020'); await p.fill('#fKmFim', '12500'); await p.fill('#fLitros', '80');
  await p.evaluate(() => { $('#fMot').value = 'Saulo';
    $('#fArla').value = 'sim'; $('#fArla').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.fill('#fArlaLitros', '20');
  await p.click('#btnSalvar'); await p.waitForTimeout(900);
  ok('lançar com ARLA desconta o ARLA', (await tanque()).arla === 480, JSON.stringify(await tanque()));
  await editar(async () => { await p.fill('#fArlaLitros', '50'); });
  ok('editar o ARLA acerta o tanque de ARLA', (await tanque()).arla === 450, JSON.stringify(await tanque()));

  /* ---- 6. o celular e a nuvem contam a mesma coisa ---- */
  const local = await tanque();
  const nuvem = JSON.parse(api.get('frota/gp2t/cadastro/estoque') || '{}');
  ok('o tanque do celular bate com o da nuvem',
     local.s10 === nuvem.s10 && local.s500 === nuvem.s500 && local.arla === nuvem.arla,
     'celular ' + JSON.stringify(local) + ' · nuvem ' + JSON.stringify(nuvem));

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
