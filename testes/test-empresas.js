/* Várias empresas: o dono cria uma empresa nova com o primeiro administrador;
   quem é dela entra com o código da empresa e só vê os dados dela; a STRACTA
   continua entrando como sempre (sem código) e com os dados de sempre.
   SHOTS=pasta guarda as imagens. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
const SHOTS = process.env.SHOTS || '';
const CONTRASTE = require('./contraste.js');

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };
const banco = page => page.evaluate(() => JSON.parse(localStorage.getItem('__ck_banco__') || '{}'));
const contas = page => page.evaluate(() => JSON.parse(localStorage.getItem('__ck_users__') || '[]').map(u => u.email));
const shot = async (page, nome) => {
  const ruim = await page.evaluate(`(${CONTRASTE})(4.5)`);
  ok(!ruim.length, 'contraste ≥ 4,5:1 em ' + nome + (ruim.length ? ': ' + ruim.join(' | ') : ''));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/' + nome + '.png', fullPage: true });
};
async function entrar(page, usuario, empresa) {
  await page.waitForSelector('#lgUsuario');
  if (empresa !== undefined) {
    if (await page.isHidden('#lgEmpresa')) await page.click('#lgOutraEmpresa');
    await page.fill('#lgEmpresa', empresa);
  }
  await page.fill('#lgUsuario', usuario);
  await page.fill('#lgSenha', '123456');
  await page.click('#lgEntrar');
}
async function sair(page) {
  await page.click('[data-ir="conta"]');
  await page.click('#ctSair');
  await page.click('#mdlOk');
  await page.waitForSelector('#lgUsuario');
}
const prefixos = page => page.$$eval('.equip b', l => l.map(b => b.textContent.trim()));

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
  await page.evaluate(() => localStorage.setItem('__ck_banco__', JSON.stringify({
    'usuarios/jean@gp2t.local': { nome: 'Jean', perfil: 'gestor' },
    'checklist_usuarios/ze@gp2t.local': { nome: 'Zé', perfil: 'motorista' },
    'checklist_equipamentos/e1': { prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' }
  })));
  await page.reload();

  console.log('1. STRACTA entra como sempre (sem código)');
  await page.waitForSelector('#lgUsuario');
  ok(await page.isHidden('#lgEmpresa'), 'campo Empresa escondido');
  ok(await page.isVisible('#lgOutraEmpresa'), 'link "Entrar em outra empresa" aparece');
  await shot(page, 'e1-login');
  await entrar(page, 'jean');
  await page.waitForSelector('#btnNovo');
  await page.click('#btnNovo');
  ok((await prefixos(page)).includes('CB-12'), 'vê o CB-12 da STRACTA');

  console.log('2. o dono cria a empresa Acme');
  await page.click('[data-ir="cadastros"]');
  ok(await page.isVisible('[data-ir="empresas"]'), 'dono vê "Empresas" em Cadastros');
  await page.click('[data-ir="empresas"]');
  await page.waitForSelector('#fEmp');
  await page.waitForSelector('#empLista .secao');
  await shot(page, 'e2-empresas-vazia');
  await page.fill('#fEmp [name=codigo]', 'stracta');
  await page.fill('#fEmp [name=nome]', 'Outra');
  await page.fill('#fEmp [name=admUsuario]', 'x');
  await page.fill('#fEmp [name=admNome]', 'X');
  await page.fill('#fEmp [name=admSenha]', '123456');
  await page.click('#empCriar');
  await page.waitForSelector('.toast:has-text("Código inválido")');
  ok(true, 'código "stracta" recusado');
  await page.fill('#fEmp [name=codigo]', 'acme');
  await page.fill('#fEmp [name=nome]', 'Acme Transportes');
  await page.fill('#fEmp [name=cnpj]', '12.345.678/0001-90');
  await page.fill('#fEmp [name=admUsuario]', 'maria');
  await page.fill('#fEmp [name=admNome]', 'Maria Souza');
  await page.click('#empCriar');
  await page.waitForSelector('#empLista .item:has-text("Acme Transportes")');
  let b = await banco(page);
  ok(b['empresas/acme'] && b['empresas/acme'].nome === 'Acme Transportes' && b['empresas/acme'].ativo === true, 'ficha da empresa gravada');
  ok(b['empresas/acme/usuarios/maria@acme.gp2t.local'] && b['empresas/acme/usuarios/maria@acme.gp2t.local'].perfil === 'admin', '1º administrador cadastrado dentro da Acme');
  ok((await contas(page)).includes('maria@acme.gp2t.local'), 'login maria@acme.gp2t.local criado');
  ok(!b['checklist_usuarios/maria@acme.gp2t.local'], 'nada da Acme nas coleções da STRACTA');
  await shot(page, 'e3-empresas');
  await sair(page);

  console.log('3. a administradora da Acme entra com o código');
  await entrar(page, 'maria');
  await page.waitForSelector('#lgErro:not(:empty)');
  ok(true, 'sem o código da empresa não entra');
  await entrar(page, 'maria', 'ACME');
  await page.waitForSelector('#btnNovo');
  ok(true, 'com o código entra (maiúscula não importa)');
  await page.click('[data-ir="cadastros"]');
  ok(!(await page.$('[data-ir="empresas"]')), 'admin de empresa NÃO vê "Empresas"');
  await page.click('[data-ir="cad-equip"]');
  await page.fill('#fEq [name=prefixo]', 'AC-01');
  await page.fill('#fEq [name=placa]', 'XYZ9K88');
  await page.click('#fEq button.btn:not([type=button])');
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('__ck_banco__'))).some(k => k.startsWith('empresas/acme/equipamentos/')));
  ok(true, 'equipamento gravado em empresas/acme/equipamentos');
  await page.click('[data-ir="novo"]');
  const lista = await prefixos(page);
  ok(lista.includes('AC-01') && !lista.includes('CB-12'), 'vê o AC-01 e NÃO vê o CB-12 da STRACTA');
  await page.click('[data-ir="cadastros"]'); await page.click('[data-ir="cad-usuarios"]');
  await page.waitForSelector('#usLista .secao');
  ok((await page.textContent('#fUs')).includes('acme'), 'tela de usuários lembra o código da empresa');
  const nomes = await page.$$eval('#usLista .item b', l => l.map(x => x.textContent));
  ok(nomes.length === 1 && nomes[0] === 'Maria Souza', 'lista só os usuários da Acme');
  await page.fill('#fUs [name=usuario]', 'joao');
  await page.fill('#fUs [name=nome]', 'João');
  await page.fill('#fUs [name=senha]', '123456');
  await page.click('#usCriar');
  await page.waitForSelector('#usLista .item:has-text("João")');
  b = await banco(page);
  ok(!!b['empresas/acme/usuarios/joao@acme.gp2t.local'] && (await contas(page)).includes('joao@acme.gp2t.local'), 'motorista criado na Acme (joao@acme.gp2t.local)');
  await page.click('[data-ir="conta"]');
  ok((await page.textContent('#app')).includes('empresa acme'), 'Conta mostra a empresa');
  await sair(page);

  console.log('4. o celular lembra a empresa');
  ok(await page.isVisible('#lgEmpresa') && (await page.inputValue('#lgEmpresa')) === 'acme', 'campo Empresa já vem com "acme"');
  await shot(page, 'e4-login-empresa');
  await entrar(page, 'joao');
  await page.waitForSelector('#btnNovo');
  await page.click('#btnNovo');
  ok((await prefixos(page)).join() === 'AC-01', 'motorista da Acme vê só o AC-01');
  await sair(page);

  console.log('5. de volta à STRACTA: apagar o código');
  await entrar(page, 'ze', '');
  await page.waitForSelector('#btnNovo');
  await page.click('#btnNovo');
  ok((await prefixos(page)).join() === 'CB-12', 'Zé (STRACTA) vê só o CB-12');
  await sair(page);
  ok(await page.isHidden('#lgEmpresa'), 'voltou ao login normal da STRACTA');

  console.log('6. dono suspende a Acme');
  await entrar(page, 'jean');
  await page.waitForSelector('#btnNovo');
  await page.click('[data-ir="cadastros"]'); await page.click('[data-ir="empresas"]');
  await page.click('[data-emp="acme"]'); await page.click('#mdlOk');
  await page.waitForSelector('#empLista .tag:has-text("Suspensa")');
  ok((await banco(page))['empresas/acme'].ativo === false, 'Acme suspensa');

  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
