/* Cartões da escolha do equipamento: desenho do caminhão e da máquina, foto real
   posta pelo admin no cadastro, e o veículo saindo andando ao tocar.
   SHOTS=pasta guarda as imagens (e os quadros da animação). */
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
  ok(!ruim.length, 'contraste ≥ 4,5:1 em ' + nome + (ruim.length ? ': ' + ruim.join(' | ') : ''));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/' + nome + '.png' });
};

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
    'checklist_equipamentos/e1': { prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' },
    'checklist_equipamentos/e2': { prefixo: 'ESC-03', tipo: 'maquina', descricao: 'Escavadeira' },
    'checklist_equipamentos/e3': { prefixo: 'CB-20', placa: 'GHI7J89', tipo: 'caminhao', pendencias: { x: { item: 'Pneus', nivel: 'critico' } } },
    'checklist_equipamentos/e4': { prefixo: 'L-01', placa: 'JKL2M34', tipo: 'leve' }
  })));
  await page.reload();
  await page.waitForSelector('#lgUsuario');
  await page.fill('#lgUsuario', 'jean'); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');

  console.log('1. sem foto: desenho de cada tipo');
  await page.click('#btnNovo');
  await page.waitForSelector('.equip .vis img');
  const srcs = await page.$$eval('.equip', l => l.map(e => [e.querySelector('b').textContent, (e.querySelector('.vis img') || {}).src || 'svg']));
  const de = P => (srcs.find(s => s[0] === P) || [])[1] || '';
  ok(de('CB-12').endsWith('img/caminhao.jpg') && de('ESC-03').endsWith('img/maquina.svg') && de('L-01') === 'svg', 'caminhão, máquina e leve com o desenho certo');
  await page.waitForFunction(() => [...document.querySelectorAll('.vis img')].every(i => i.complete && i.naturalWidth > 0));
  ok(true, 'imagens carregam');
  await shot(page, 'v1-escolher');

  console.log('2. admin põe a foto real do CB-20');
  await page.click('[data-ir="cadastros"]'); await page.click('[data-ir="cad-equip"]');
  await page.click('[data-ed="e3"]');
  await page.waitForSelector('#eqGaleria');
  ok(await page.isHidden('#eqSemFoto'), 'sem foto ainda: não mostra "Tirar"');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1500; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 1500); g.addColorStop(0, '#9cc3e6'); g.addColorStop(.6, '#dbe7f0'); g.addColorStop(.61, '#8a7a62'); g.addColorStop(1, '#5d5141');
    x.fillStyle = g; x.fillRect(0, 0, 2000, 1500);
    x.fillStyle = '#e8b417'; x.fillRect(700, 520, 900, 380); x.fillStyle = '#f3f4f6'; x.fillRect(320, 450, 380, 450);
    x.fillStyle = '#1f2937'; [450, 1150, 1450].forEach(cx => { x.beginPath(); x.arc(cx, 960, 110, 0, 7); x.fill(); });
    return c.toDataURL('image/png').split(',')[1];
  });
  page.once('filechooser', fc => fc.setFiles({ name: 'cb20.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }));
  await page.click('#eqGaleria');
  await page.waitForSelector('.foto-eq .vis.foto img');
  ok(await page.isVisible('#eqSemFoto'), 'foto escolhida aparece na prévia');
  await shot(page, 'v2-cadastro-foto');
  await page.click('#fEq button.btn:not([type=button])');
  await page.waitForFunction(() => !document.querySelector('.foto-eq .vis.foto'));
  const foto = (await banco(page))['checklist_equipamentos/e3'].foto || '';
  ok(foto.startsWith('data:image/jpeg') && foto.length < 120000, 'foto gravada pequena no cadastro (' + Math.round(foto.length / 1024) + ' KB)');

  await page.click('[data-ir="novo"]');
  await page.waitForSelector('.equip:has-text("CB-20") .vis.foto img');
  ok(true, 'cartão do CB-20 mostra a foto real');
  await shot(page, 'v3-escolher-com-foto');

  console.log('3. tirar a foto volta ao desenho');
  await page.click('[data-ir="cadastros"]'); await page.click('[data-ir="cad-equip"]');
  await page.click('[data-ed="e3"]'); await page.click('#eqSemFoto');
  await page.click('#fEq button.btn:not([type=button])');
  await page.waitForFunction(() => !(JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_equipamentos/e3'].foto));
  ok(true, 'foto removida');
  await page.click('[data-ir="novo"]');
  await page.waitForSelector('.equip:has-text("CB-20") .vis img[src$="img/caminhao.jpg"]');
  ok(true, 'sem foto volta o desenho do caminhão');

  console.log('4. tocar: o caminhão sai andando e abre o checklist');
  const el = page.locator('.equip:has-text("CB-12")');
  if (SHOTS) {
    // quadros da animação: parada e adiantada até cada ponto (atraso negativo)
    await el.evaluate(e => e.classList.add('saindo'));
    const caixa = await page.$eval('#grade', g => { const r = g.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 520) }; });
    for (let i = 0; i <= 15; i++) {
      await el.evaluate((e, t) => { const im = e.querySelector('.vis img'); im.style.animationPlayState = 'paused'; im.style.animationDelay = -t + 'ms'; }, i * 40);
      await page.screenshot({ path: SHOTS + '/anim' + String(i).padStart(2, '0') + '.png', clip: caixa });
    }
    await el.evaluate(e => { const im = e.querySelector('.vis img'); im.style.animationPlayState = im.style.animationDelay = ''; });
    await el.evaluate(e => { e.classList.remove('saindo'); });
  }
  await el.click();
  ok(await el.evaluate(e => e.classList.contains('saindo')), 'cartão tocado anima');
  const anda = await el.evaluate(e => getComputedStyle(e.querySelector('.vis img')).animationName);
  ok(anda === 'sair', 'imagem com a animação de sair');
  await page.click('.equip:has-text("ESC-03")', { force: true });   // toque duplo não abre dois
  await page.waitForSelector('.ck-item');
  ok((await page.textContent('#titulo')).includes('CB-12'), 'abriu o checklist do CB-12');

  console.log('5. celular com "reduzir movimento": abre direto');
  await page.click('#btnVoltar').catch(() => {});
  await page.evaluate(() => { localStorage.clear(); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await ctx2.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx2.addInitScript(SDK);
  const p2 = await ctx2.newPage();
  await p2.goto(URL);
  await p2.evaluate(() => localStorage.setItem('__ck_banco__', JSON.stringify({
    'usuarios/jean@gp2t.local': { nome: 'Jean', perfil: 'gestor' },
    'checklist_equipamentos/e1': { prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' } })));
  await p2.reload();
  await p2.fill('#lgUsuario', 'jean'); await p2.fill('#lgSenha', '123456'); await p2.click('#lgEntrar');
  await p2.waitForSelector('#btnNovo'); await p2.click('#btnNovo');
  await p2.click('.equip:has-text("CB-12")');
  ok(await p2.isVisible('.ck-item'), 'sem animação abre na hora');

  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
