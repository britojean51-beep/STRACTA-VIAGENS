/* Segurança e LGPD do app de checklist: cabeçalhos de proteção (configurados no
   checklist/firebase.json), Política de privacidade e Termos de uso acessíveis
   antes e depois do login, foco visível no teclado e nenhum script de rastreamento. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
const SHOTS = process.env.SHOTS || '';
const CONTRASTE = require('./contraste.js');

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };

(async () => {
  console.log('1. cabeçalhos de segurança no firebase.json do checklist');
  const cab = {};
  JSON.parse(fs.readFileSync(__dirname + '/../checklist/firebase.json', 'utf8')).hosting.headers
    .filter(x => x.source === '**').forEach(x => x.headers.forEach(y => { cab[y.key] = y.value; }));
  const csp = cab['Content-Security-Policy'] || '';
  ok(/frame-ancestors 'none'/.test(csp) && cab['X-Frame-Options'] === 'DENY', 'não abre dentro de outro site (clickjacking)');
  ok(/object-src 'none'/.test(csp) && /script-src 'self' https:\/\/www\.gstatic\.com/.test(csp) && !/script-src[^;]*unsafe/.test(csp), 'scripts só do próprio app e do Firebase');
  ok(/max-age=\d{7,}/.test(cab['Strict-Transport-Security'] || '') && cab['X-Content-Type-Options'] === 'nosniff', 'HTTPS obrigatório e nosniff');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', serviceWorkers: 'block' });
  await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript(SDK);
  const page = await ctx.newPage();
  const erros = [], externos = new Set();
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('request', r => { const h = new globalThis.URL(r.url()).host; if (!/^localhost|^www\.gstatic\.com$/.test(h)) externos.add(h); });

  await page.goto(URL);
  const resp = await page.request.get(URL);
  ok(/frame-ancestors/.test(resp.headers()['content-security-policy'] || ''), 'servidor de teste entrega a mesma política (CSP) do site');
  await page.evaluate(() => localStorage.setItem('__ck_banco__', JSON.stringify({ 'usuarios/jean@gp2t.local': { nome: 'Jean', perfil: 'gestor' } })));
  await page.reload();
  await page.waitForSelector('#lgUsuario');

  console.log('2. privacidade e termos antes de entrar');
  ok((await page.textContent('.legal')).includes('Termos de uso') && (await page.textContent('.legal')).includes('Política de privacidade'), 'login avisa e liga para Termos e Privacidade');
  await page.click('.legal [data-doc="privacidade"]');
  await page.waitForSelector('.doc');
  const pol = await page.textContent('.doc');
  ok(pol.includes('13.709') && pol.includes('localização') && pol.includes('não usa cookies de propaganda') && pol.includes('Seus direitos'),
    'política: lei, quais dados (inclui localização), sem rastreamento e direitos do titular');
  const ruim = await page.evaluate(`(${CONTRASTE})(4.5)`);
  ok(!ruim.length, 'contraste ≥ 4,5:1 na política' + (ruim.length ? ': ' + ruim.join(' | ') : ''));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/s1-privacidade.png' });
  await page.keyboard.press('Escape');
  ok(!(await page.$('.doc')), 'Esc fecha');
  await page.click('.legal [data-doc="termos"]');
  ok((await page.textContent('.doc')).includes('uso interno'), 'termos de uso abrem');
  await page.click('.doc [data-doc="privacidade"]');
  ok((await page.textContent('.doc')).includes('Política de privacidade'), 'dos termos vai para a política');
  await page.click('.doc [data-fechar]');
  ok(!(await page.$('.doc-fundo')), 'botão Fechar fecha');

  console.log('3. teclado');
  await page.focus('#lgSenha'); await page.keyboard.press('Tab');
  const contorno = await page.evaluate(() => { const b = document.activeElement; return b.tagName + ' ' + getComputedStyle(b).outlineStyle + ' ' + getComputedStyle(b).outlineWidth; });
  ok(/^BUTTON solid 3px/.test(contorno), 'Tab: botão com foco aparece contornado (' + contorno + ')');

  console.log('4. depois de entrar');
  await page.fill('#lgUsuario', 'jean'); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');
  await page.click('[data-ir="conta"]');
  await page.click('.legal [data-doc="privacidade"]');
  ok(await page.isVisible('.doc'), 'Conta também abre a política');
  await page.click('.doc [data-fechar]');
  await page.evaluate(() => localStorage.setItem('ck_historico:jean@gp2t.local', '[{"id":"x","equip":"CB-12","criadoEm":1,"enviado":true}]'));
  await page.click('#ctSair'); await page.click('#mdlOk');
  await page.waitForSelector('#lgUsuario');
  ok(!(await page.evaluate(() => localStorage.getItem('ck_historico:jean@gp2t.local'))), 'ao sair, a lista de checklists sai do celular');

  ok(!externos.size, 'nenhum acesso a site de rastreamento/terceiros' + (externos.size ? ': ' + [...externos].join(', ') : ''));
  ok(erros.length === 0, 'nenhum erro de JavaScript nem bloqueio da CSP' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
