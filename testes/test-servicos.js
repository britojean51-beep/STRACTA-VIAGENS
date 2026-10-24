/* Lubrificação e inspeção: a gestão agenda a próxima lubrificação e lança o que
   foi feito; o motorista vê a última lubrificação/inspeção e o aviso ao escolher o equipamento. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
const SHOTS = process.env.SHOTS || '';
const CONTRASTE = require('./contraste.js');
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };
const banco = page => page.evaluate(() => JSON.parse(localStorage.getItem('__ck_banco__') || '{}'));
const EMOJI = /[\u{1F300}-\u{1FAFF}☀-➿️]/u;
const shot = async (page, nome) => {
  const ruim = await page.evaluate(`(${CONTRASTE})(4.5)`);
  ok(!ruim.length && !EMOJI.test(await page.textContent('body')), nome + ': contraste ≥ 4,5:1 e sem emoji' + (ruim.length ? ': ' + ruim.join(' | ') : ''));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/' + nome + '.png', fullPage: true });
};
async function entrar(page, u) {
  await page.waitForSelector('#lgUsuario');
  await page.fill('#lgUsuario', u); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');
}
async function sair(page) { await page.click('[data-ir="conta"]'); await page.click('#ctSair'); await page.click('#mdlOk'); await page.waitForSelector('#lgUsuario'); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', serviceWorkers: 'block' });
  await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript(SDK);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem('__ck_banco__', JSON.stringify({
    'usuarios/jean@gp2t.local': { nome: 'Jean', perfil: 'gestor' },
    'checklist_usuarios/ze@gp2t.local': { nome: 'Zé Motorista', perfil: 'motorista' },
    'checklist_equipamentos/e1': { prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' },
    'checklist_equipamentos/e2': { prefixo: 'ESC-03', tipo: 'maquina' }
  })));
  await page.reload();
  const hoje = await page.evaluate(() => diaDe(Date.now()));
  const amanha = await page.evaluate(() => diaDe(Date.now() + 864e5));
  const br = d => d.split('-').reverse().join('/');

  console.log('1. administração agenda e lança');
  await entrar(page, 'jean');
  await page.click('[data-ir="cadastros"]');
  await page.click('[data-ir="servicos"]');
  await page.click('[data-sv="e1"]');
  await page.waitForSelector('#svProx');
  await page.fill('#svProx', amanha);
  await page.click('#svAgenda button.btn');
  await page.waitForFunction(d => JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_equipamentos/e1'].proxLubrificacao === d, amanha);
  ok(true, 'lubrificação marcada para amanhã fica no equipamento');
  await page.check('[name=lubrificacao]'); await page.check('[name=inspecao]');
  await page.fill('[name=descricao]', 'Graxa nos pinos da báscula e revisão dos freios');
  await page.click('#svLanca button.btn');
  await page.waitForFunction(() => document.querySelectorAll('#svHist .srv-hist').length === 1);
  let b = await banco(page);
  const lanc = Object.entries(b).filter(([k]) => k.startsWith('checklist_servicos/')).map(([, v]) => v);
  ok(lanc.length === 1 && lanc[0].lubrificacao && lanc[0].inspecao && lanc[0].descricao.includes('báscula') && lanc[0].por === 'Jean' && lanc[0].data === hoje,
    'lançamento gravado: dia, lubrificado, inspecionado, o que foi feito e quem lançou');
  await page.waitForFunction(d => { const e = JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_equipamentos/e1']; return e.ultLubrificacao === d && e.ultInspecao === d; }, hoje);
  ok((await banco(page))['checklist_equipamentos/e1'].proxLubrificacao === amanha, 'resumo no equipamento: última lubrificação e inspeção = hoje; a de amanhã continua marcada');
  ok((await page.textContent('#svHist')).includes('Lubrificado') && (await page.textContent('#svHist')).includes('báscula'), 'histórico mostra o lançamento');
  await page.click('#svLanca button.btn');
  ok((await page.textContent('#toast')).includes('Marque Lubrificado'), 'lançamento vazio não vai');
  await shot(page, 'sv1-gestao');
  await sair(page);

  console.log('2. motorista vê ao escolher o equipamento');
  await entrar(page, 'ze');
  await page.click('#btnNovo');
  await page.waitForSelector('.equip');
  ok((await page.textContent('.equip:has-text("CB-12")')).includes('Lubrificar ' + br(amanha).slice(0, 5)), 'cartão do CB-12 avisa a lubrificação marcada');
  ok(!(await page.textContent('.equip:has-text("ESC-03")')).includes('Lubrificar'), 'equipamento sem agendamento não avisa');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('.equip:has-text("CB-12")');
  await page.waitForSelector('.srv-card');
  const card = await page.textContent('.srv-card');
  ok(card.includes('Última lubrificação') && card.includes(br(hoje)) && card.includes('Última inspeção') && card.includes('amanhã'),
    'checklist mostra a última lubrificação, a última inspeção e "Lubrificação marcada para amanhã"');
  await shot(page, 'sv2-motorista');
  await page.click('#btnVoltar').catch(() => {});
  await page.evaluate(() => { Estado.rascunho = null; localStorage.removeItem('ck_rascunho:ze@gp2t.local'); Telas.ir('inicio'); });
  await sair(page);

  console.log('3. lubrificou no dia marcado: o aviso sai; apagar refaz o resumo');
  await entrar(page, 'jean');
  await page.evaluate(() => Telas.ir('servicos', 'e1'));
  await page.waitForSelector('#svProx');
  await page.fill('#svProx', hoje); await page.click('#svAgenda button.btn');
  await page.waitForFunction(d => JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_equipamentos/e1'].proxLubrificacao === d, hoje);
  await page.waitForSelector('.srv-prox.perigo');
  ok((await page.textContent('.srv-prox')).includes('hoje'), 'marcada para hoje: aviso em destaque');
  await page.check('[name=lubrificacao]'); await page.click('#svLanca button.btn');
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_equipamentos/e1'].proxLubrificacao);
  ok(true, 'lançou a lubrificação do dia: o agendamento sai sozinho');
  await page.waitForFunction(() => document.querySelectorAll('#svHist .srv-hist').length === 2);
  for (let i = 0; i < 2; i++) {
    await page.click('[data-sv-apagar]'); await page.click('#mdlOk');
    await page.waitForFunction(n => document.querySelectorAll('#svHist .srv-hist').length === n, 1 - i);
  }
  await page.waitForFunction(() => { const e = JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_equipamentos/e1']; return !e.ultLubrificacao && !e.ultInspecao; });
  ok(true, 'apagou os lançamentos: última lubrificação e inspeção voltam a "sem registro"');
  await page.click('[data-ir="painel"]');
  ok(await page.isVisible('[data-ir-servicos]'), 'Painel tem o atalho "Lubrificação e inspeção"');

  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
