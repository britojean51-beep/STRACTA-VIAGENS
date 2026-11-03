/* Voltar: da lubrificação de um equipamento volta para a lista de equipamentos
   (pelo ‹ do app e pelo botão voltar do celular), sem cair no Início. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };
const titulo = p => p.textContent('#titulo');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript(SDK);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem('__ck_banco__', JSON.stringify({
    'usuarios/jean@gp2t.local': { nome: 'Jean', perfil: 'gestor' },
    'checklist_equipamentos/e1': { prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' },
    'checklist_equipamentos/e2': { prefixo: 'CB-20', placa: 'GHI7J89', tipo: 'caminhao' } })));
  await page.reload();
  await page.fill('#lgUsuario', 'jean'); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');

  console.log('1. botão ‹ do app');
  await page.click('[data-ir="cadastros"]'); await page.click('[data-ir="servicos"]');
  await page.click('[data-sv="e1"]');
  await page.fill('#svProx', '2099-01-10'); await page.click('#svAgenda button.btn');
  await page.waitForTimeout(300);
  ok((await titulo(page)).includes('CB-12'), 'marcou a lubrificação do CB-12');
  await page.click('#btnVoltar');
  await page.waitForSelector('[data-sv="e2"]');
  ok((await titulo(page)).includes('LUBRIFICAÇÃO'), 'voltou para a lista de equipamentos');
  await page.click('[data-sv="e2"]');
  ok((await titulo(page)).includes('CB-20'), 'abriu o outro equipamento');

  console.log('2. botão voltar do celular');
  await page.goBack();
  await page.waitForSelector('[data-sv="e1"]');
  ok((await titulo(page)).includes('LUBRIFICAÇÃO'), 'voltar do celular: lista de equipamentos');
  await page.goBack();
  await page.waitForSelector('[data-ir="cad-equip"]');
  ok((await titulo(page)).includes('CADASTROS'), 'mais um voltar: Cadastros');

  console.log('3. voltar do celular com janela aberta só fecha a janela');
  await page.click('[data-ir="conta"]'); await page.click('#ctSair');
  await page.waitForSelector('.mdl-fundo');
  await page.goBack();
  await page.waitForTimeout(200);
  ok(!(await page.$('.mdl-fundo')) && (await titulo(page)).includes('CONTA'), 'janela fechada, continua na Conta');

  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
