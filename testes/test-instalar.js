/* Instalar o app no Android: o cartão certo para cada navegador. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };
const UA = {
  whatsapp: 'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 WhatsApp/2.24',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  chrome: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
};
(async () => {
  const browser = await chromium.launch();
  for (const [nome, ua] of Object.entries(UA)) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, serviceWorkers: 'block' });
    await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await ctx.addInitScript(SDK);
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.waitForSelector('#lgUsuario');
    const t = (await p.textContent('[data-slot-instalar]')) || '';
    if (nome === 'whatsapp') ok(t.includes('Abra no Chrome') && (await p.getAttribute('.instalar a.btn', 'href')).startsWith('intent://'), 'aberto pelo WhatsApp: "Abrir no Chrome"');
    if (nome === 'samsung') ok(t.includes('Adicionar página a') && t.includes('Tela inicial'), 'navegador Samsung: o caminho pelo menu dele');
    if (nome === 'chrome') ok(t.includes('Instalar app') && t.includes('Abrir no app'), 'Chrome sem convite: o caminho pelo menu, e o aviso de "já instalado"');
    await ctx.close();
  }
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
