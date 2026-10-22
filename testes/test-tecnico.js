/* Função "Técnico de Segurança": vê o Painel e todos os checklists, marca como
   visualizado e gera o PDF; não resolve, não solicita, não apaga, não cadastra. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
const SHOTS = process.env.SHOTS || '';
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript(SDK);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem('__ck_users__', JSON.stringify([{ email: 'tec@gp2t.local', senha: '123456' }])));
  await page.evaluate(() => localStorage.setItem('__ck_banco__', JSON.stringify({
    'checklist_usuarios/tec@gp2t.local': { nome: 'Rita Técnica', perfil: 'tecnico' },
    'checklist_equipamentos/e1': { prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao', pendencias: { c1: 'bloqueado' } },
    'checklist_inspecoes/c1': { criadoPor: 'ze@gp2t.local', criadoNome: 'Zé', criadoPerfil: 'motorista', criadoEm: Date.now() - 60000,
      equipamento: { id: 'e1', prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' }, modelo: { id: 'm', nome: 'Caminhão' },
      resultado: 'bloqueado', defeitos: 1, tratativa: { status: 'aberto' }, midias: {},
      itens: [{ id: 'i1', texto: 'Pneus', critico: true, st: 'nok', obs: 'corte' }, { id: 'i2', texto: 'Buzina', critico: false, st: 'ok' }] }
  })));
  await page.reload();
  await page.fill('#lgUsuario', 'tec'); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');
  ok(await page.isVisible('[data-ir="painel"]') && !(await page.isVisible('[data-ir="cadastros"]')), 'técnico vê o Painel e não vê Cadastros');
  await page.click('[data-ir="painel"]');
  await page.waitForSelector('#pLista .item');
  ok((await page.textContent('#pLista')).includes('CB-12') && (await page.textContent('#pLista')).includes('Zé'), 'vê o checklist de outra pessoa no Painel');
  ok(!(await page.$('[data-apagar]')), 'não tem o botão de apagar');
  await page.click('#pLista .item');
  await page.waitForSelector('#dtVisto');
  ok(!(await page.$('[data-resolver]')) && !(await page.$('[data-solicitar]')) && !(await page.$('#dtApagar')), 'não resolve, não solicita, não apaga');
  ok(await page.isVisible('#dtPdf'), 'pode gerar o PDF');
  if (SHOTS) await page.screenshot({ path: SHOTS + '/t1-tecnico-detalhe.png' });
  await page.click('#dtMarcarVisto');
  await page.waitForFunction(() => ((JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_inspecoes/c1'].vistos || {})['tec@gp2t,local'] || {}).por === 'Rita Técnica');
  ok((await page.textContent('#dtVisto')).includes('Visualizado por Rita Técnica'), 'marca como visualizado (aparece para todos)');
  ok(!(await page.evaluate(() => Telas.ir('cad-equip') || Telas.atual.nome === 'cad-equip')), 'não entra em Cadastros nem pelo endereço');
  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
