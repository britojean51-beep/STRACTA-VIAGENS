/* Os dois apps são separados: o operador liberado SÓ no checklist
   (checklist_usuarios) não entra no app de frota. Sirva a raiz em 8130. */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await ligar(p); await p.addInitScript(SDK);
  api.limpar();
  api.set('checklist_usuarios/op@gp2t.local', { nome: 'Operador', perfil: 'inspetor', ativo: true });
  await p.goto('http://localhost:8130/index.html', { waitUntil: 'networkidle' });
  await p.fill('#loginEmail', 'op'); await p.fill('#loginSenha', '123456');
  await p.click('#btnEntrar'); await p.waitForTimeout(1500);
  const msg = await p.textContent('#loginMsg').catch(() => '');
  const naTelaDeLogin = await p.isVisible('#loginEmail');
  const ok = naTelaDeLogin && /não liberado/i.test(msg);
  console.log((ok ? '  ✔ ' : '  ✖ ') + 'operador só do checklist é barrado no app de frota (' + msg.trim() + ')');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
