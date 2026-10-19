/* Atualização automática com o service worker DE VERDADE (o do celular):
   com o app aberto, "publica" uma versão nova (troca o CACHE do sw.js no
   servidor de teste) e confere que o app recarrega sozinho com ela.
   O sw.js original é restaurado no fim, aconteça o que acontecer.
   Sirva a raiz do repositório em 8131. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const ORIGINAL = fs.readFileSync(__dirname + '/../checklist/sw.js', 'utf8');
let falhou = false;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ serviceWorkers: 'allow' });
  await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const SW = __dirname + '/../checklist/sw.js';
  await ctx.addInitScript(SDK);
  const p = await ctx.newPage();
  await p.goto('http://localhost:8131/checklist/index.html');
  await p.evaluate(() => { localStorage.setItem('__ck_banco__', JSON.stringify({ 'usuarios/jean@gp2t.local': { nome: 'Jean', perfil: 'gestor' } })); });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();                                   // agora a página é controlada pelo SW
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p.fill('#lgUsuario', 'jean'); await p.fill('#lgSenha', '123456'); await p.click('#lgEntrar');
  await p.waitForSelector('#btnNovo');
  const ctl = await p.evaluate(() => !!navigator.serviceWorker.controller);
  console.log((ctl ? '  ✔ ' : '  ✖ ') + 'app controlado pelo service worker'); falhou = falhou || !ctl;
  await p.evaluate(() => { window.__marca = 1; });
  fs.writeFileSync(SW, fs.readFileSync(SW, 'utf8').replace(/const CACHE = "ck-v\d+";/, 'const CACHE = "ck-v99";'));  // "publicou" versão nova
  const recarregou = p.waitForEvent('load', { timeout: 20000 }).then(() => true).catch(() => false);
  await p.evaluate(() => Atualizacao.procurar());     // o mesmo que voltar para o app / 30 min
  const rec = await recarregou;
  console.log((rec ? '  ✔ ' : '  ✖ ') + 'versão nova publicada: o app aberto recarregou sozinho'); falhou = falhou || !rec;
  await p.waitForSelector('#btnNovo');
  const ks = await p.evaluate(() => caches.keys());
  const novo = ks.includes('ck-v99') && !ks.some(k => k !== 'ck-v99' && k.startsWith('ck-'));
  console.log((novo ? '  ✔ ' : '  ✖ ') + 'cache da versão antiga trocado pelo novo (' + ks.join(', ') + ')'); falhou = falhou || !novo;
  await b.close();
})().catch(e => { console.error(e); falhou = true; })
  .finally(() => { fs.writeFileSync(__dirname + '/../checklist/sw.js', ORIGINAL); process.exit(falhou ? 1 : 0); });
