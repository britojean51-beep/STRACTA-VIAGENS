/* Notificação para quem fez o checklist quando a manutenção resolve um problema.
   O Notification do navegador é trocado por um gravador (headless não mostra). */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };

const GRAVADOR = `
  window.__notifs = [];
  window.__permissao = localStorage.getItem('__permissao') || 'default';
  window.Notification = function (t, o) { window.__notifs.push({ titulo: t, corpo: (o || {}).body || '', abrir: ((o || {}).data || {}).abrir }); };
  Object.defineProperty(window.Notification, 'permission', { get: () => window.__permissao });
  window.Notification.requestPermission = async () => { window.__permissao = 'granted'; localStorage.setItem('__permissao', 'granted'); return 'granted'; };
`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript(SDK);
  await ctx.addInitScript(GRAVADOR);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem('__ck_banco__', JSON.stringify({
    'checklist_usuarios/ze@gp2t.local': { nome: 'Zé Motorista', perfil: 'motorista' },
    'checklist_equipamentos/e1': { prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao', pendencias: { c1: 'bloqueado' } },
    'checklist_inspecoes/c1': { criadoPor: 'ze@gp2t.local', criadoNome: 'Zé Motorista', criadoEm: Date.now() - 3600000,
      equipamento: { id: 'e1', prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' }, modelo: { id: 'm', nome: 'Caminhão' },
      resultado: 'bloqueado', defeitos: 2, tratativa: { status: 'aberto' }, midias: {},
      itens: [{ id: 'i1', texto: 'Pneus', critico: true, st: 'nok', obs: 'corte' }, { id: 'i2', texto: 'Faróis', critico: false, st: 'nok', obs: 'queimado' },
        { id: 'i3', texto: 'Buzina', critico: false, st: 'ok' }] }
  })));
  await page.reload();
  await page.fill('#lgUsuario', 'ze'); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');

  console.log('1. pedir permissão');
  ok(await page.isVisible('#btnNotif'), 'Início convida a ativar as notificações');
  await page.click('#btnNotif');
  await page.waitForFunction(() => !document.querySelector('#btnNotif'));
  ok(await page.evaluate(() => Notification.permission) === 'granted', 'ativou: o convite some');
  await page.click('[data-ir="conta"]');
  ok((await page.textContent('#app')).includes('Ligadas'), 'Conta mostra que as notificações estão ligadas');
  await page.click('[data-ir="inicio"]');
  ok(await page.evaluate(() => window.__notifs.length) === 0, 'nada resolvido ainda: nenhuma notificação');

  console.log('2. a gestão resolve em outro celular');
  await page.evaluate(() => firebase.firestore().collection('checklist_inspecoes').doc('c1').update({
    'resolucoes.i1': { nota: 'Pneu trocado', por: 'Ana Gestora', em: Date.now(), fotos: [] } }));
  await page.waitForFunction(() => window.__notifs.length === 1);
  let n = await page.evaluate(() => window.__notifs[0]);
  ok(n.titulo === 'Problema resolvido · CB-12 · ABC1D23' && n.corpo.includes('Pneus: Pneu trocado (Ana Gestora)') && n.abrir === 'c1',
    'notificação: "Problema resolvido · CB-12", o item, o que foi feito e quem resolveu (' + n.corpo.replace(/\n/g, ' / ') + ')');
  ok(!n.corpo.includes('voltou a operar'), 'ainda falta um item: não diz que voltou a operar');

  console.log('3. reabrir o app não repete; o último item avisa que voltou a operar');
  await page.reload();
  await page.waitForSelector('#btnNovo');
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => window.__notifs.length) === 0, 'reabriu: não repete o aviso já dado');
  await page.evaluate(() => firebase.firestore().collection('checklist_inspecoes').doc('c1').update({
    'resolucoes.i2': { nota: 'Lâmpada trocada', por: 'Ana Gestora', em: Date.now(), fotos: [] } }));
  await page.waitForFunction(() => window.__notifs.length === 1);
  n = await page.evaluate(() => window.__notifs[0]);
  ok(n.corpo.includes('Faróis: Lâmpada trocada') && n.corpo.includes('voltou a operar'), 'último item resolvido: "O equipamento voltou a operar."');

  console.log('4. aberto pelo toque na notificação');
  await page.goto(URL + '?abrir=c1');
  await page.waitForSelector('#dtVisto');
  ok((await page.textContent('#titulo')).includes('CB-12') && !(await page.evaluate(() => location.search)), 'abre direto o checklist resolvido');

  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
