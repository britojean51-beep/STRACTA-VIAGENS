/* Depois de enviar o checklist, o motorista aponta problema que apareceu durante o
   serviço, item por item (com foto). Item que obriga parada põe em manutenção. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
const SHOTS = process.env.SHOTS || '';
const CONTRASTE = require('./contraste.js');
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };
const banco = page => page.evaluate(() => JSON.parse(localStorage.getItem('__ck_banco__') || '{}'));
const shot = async (page, nome) => {
  const ruim = await page.evaluate(`(${CONTRASTE})(4.5)`);
  ok(!ruim.length, nome + ': contraste ≥ 4,5:1' + (ruim.length ? ': ' + ruim.join(' | ') : ''));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/' + nome + '.png', fullPage: true });
};
async function foto(page) {
  const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600;
    const x = c.getContext('2d'); x.fillStyle = '#357'; x.fillRect(0, 0, 800, 600); return c.toDataURL('image/png').split(',')[1]; });
  return { name: 'f.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

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
  await page.evaluate(() => {
    const eq = { id: 'e1', prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' };
    const itens = [{ id: 'i1', texto: 'Freios', critico: true, st: 'ok', obs: '' }, { id: 'i2', texto: 'Retrovisores', critico: false, st: 'ok', obs: '' },
      { id: 'i3', texto: 'Buzina', critico: false, st: 'na', obs: '' }];
    localStorage.setItem('__ck_banco__', JSON.stringify({
      'checklist_usuarios/ze@gp2t.local': { nome: 'Zé Motorista', perfil: 'motorista' },
      'checklist_equipamentos/e1': { prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' },
      'checklist_inspecoes/hoje': { criadoPor: 'ze@gp2t.local', criadoNome: 'Zé Motorista', criadoEm: Math.max(new Date().setHours(0, 0, 1, 0), Date.now() - 3600000), equipamento: eq,   // hoje mesmo logo após a meia-noite
        modelo: { id: 'm', nome: 'Caminhão' }, resultado: 'liberado', defeitos: 0, tratativa: null, midias: {}, itens },
      'checklist_inspecoes/ontem': { criadoPor: 'ze@gp2t.local', criadoNome: 'Zé Motorista', criadoEm: Date.now() - 30 * 3600000, equipamento: eq,
        modelo: { id: 'm', nome: 'Caminhão' }, resultado: 'liberado', defeitos: 0, tratativa: null, midias: {}, itens }
    }));
  });
  await page.reload();
  await page.fill('#lgUsuario', 'ze'); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');

  console.log('1. atalho no Início');
  await page.waitForSelector('.apontar-hoje [data-ver="hoje"]');
  ok(!(await page.$('.apontar-hoje [data-ver="ontem"]')), 'Início: "Apareceu problema durante o serviço?" só com o checklist de hoje');
  await page.click('.apontar-hoje [data-ver="hoje"]');
  await page.waitForSelector('#dtVisto');
  ok(await page.$$eval('[data-apontar]', l => l.map(b => b.dataset.apontar).join()) === 'i1,i2,i3', 'cada item OK ou N/A tem "Apontar problema"');

  console.log('2. aponta problema que não obriga parada, com foto');
  await page.click('[data-apontar="i2"]');
  await page.click('#apConfirmar');
  ok((await page.textContent('#toast')).includes('Descreva o problema'), 'sem descrição não aponta');
  await page.fill('#rsNota', 'Retrovisor esquerdo trincou na manobra');
  page.once('filechooser', async fc => fc.setFiles(await foto(page)));
  await page.click('#rsFoto');
  await page.waitForSelector('.apontando .mini-midia img[src^="blob:"]');
  await shot(page, 'ap1-apontando');
  await page.click('#apConfirmar');
  await page.waitForFunction(() => { const d = JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_inspecoes/hoje'];
    return d.apontamentos && d.apontamentos.i2 && Object.values(d.midias || {}).some(m => m.item === 'i2' && m.ok); });
  let d = (await banco(page))['checklist_inspecoes/hoje'];
  ok(d.apontamentos.i2.obs.includes('trincou') && d.apontamentos.i2.por === 'Zé Motorista' && d.itens[1].st === 'ok',
    'gravado à parte (apontamentos): a resposta original não muda; foto subiu ligada ao item');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_equipamentos/e1'].pendencias?.hoje === 'restricao');
  ok(await page.evaluate(() => situacaoDe(Estado.equipamentos[0])) === 'operacional', 'não obriga parada: equipamento segue Operando, checklist fica NÃO CONFORME');
  ok((await page.textContent('[data-item="i2"]')).includes('Apontado durante o serviço') && (await page.textContent('.resultado h2')).includes('OPERANDO'),
    'item mostra "Apontado durante o serviço"; o resultado original continua no topo');

  console.log('3. aponta problema que obriga parada');
  await page.click('[data-apontar="i1"]');
  ok((await page.textContent('.apontando')).includes('obriga parada'), 'avisa antes que o item obriga parada');
  await page.fill('#rsNota', 'Freio puxando para a direita');
  await page.click('#apConfirmar');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_equipamentos/e1'].pendencias?.hoje === 'bloqueado');
  ok((await page.textContent('#toast')).includes('Acione a manutenção'), 'obriga parada: "Acione a manutenção" e o equipamento entra em manutenção');
  ok((await page.textContent('#dtSituacao')).includes('MANUTENÇÃO') && (await page.$$eval('.ck-item', l => l.map(e => e.dataset.item))).slice(0, 2).join() === 'i1,i2',
    '"Agora: MANUTENÇÃO" e os itens apontados sobem para o topo');
  await shot(page, 'ap2-apontado');

  console.log('4. checklist de outro dia não aceita apontamento');
  await page.evaluate(() => Telas.ir('detalhe', 'ontem'));
  await page.waitForSelector('#dtVisto');
  ok(!(await page.$('[data-apontar]')), 'checklist de ontem: sem "Apontar problema"');

  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
