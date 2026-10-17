/* App de Checklist (/checklist), de ponta a ponta, num navegador de verdade:
   admin cadastra equipamento, motorista, operador e gestor -> motorista faz checklist com foto ->
   checklist sem sinal fica na fila e sobe quando a rede volta -> admin vê no
   painel, abre a foto e dá a tratativa. Cobra também: nenhum erro de JS. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
const SHOTS = process.env.SHOTS || '';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };

// uma foto qualquer (PNG 2400x1600 gerado na hora pelo próprio navegador)
async function foto(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
    const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 2400, 1600);
    x.fillStyle = '#fff'; x.font = '200px sans-serif'; x.fillText('PNEU', 600, 900);
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
const banco = page => page.evaluate(() => JSON.parse(localStorage.getItem('__ck_banco__') || '{}'));
const shot = async (page, nome) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + nome + '.png', fullPage: true }); };

async function entrar(page, usuario) {
  await page.waitForSelector('#lgUsuario');
  await page.fill('#lgUsuario', usuario);
  await page.fill('#lgSenha', '123456');
  await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');
}
async function sair(page) {
  page.once('dialog', d => d.accept());
  await page.click('[data-ir="conta"]');
  await page.click('#ctSair');
  await page.waitForSelector('#lgUsuario');
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    serviceWorkers: 'block' });
  await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript(SDK);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });

  // o gestor do app de frota existe; nada do checklist ainda
  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.setItem('__ck_banco__', JSON.stringify({ 'usuarios/jean@gp2t.local': { nome: 'Jean', perfil: 'gestor' } }));
  });
  await page.reload();

  console.log('1. login rápido e acesso');
  await page.waitForSelector('#lgUsuario');
  await shot(page, '01-login');
  await page.fill('#lgUsuario', 'ze'); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForFunction(() => document.querySelector('#lgErro').textContent.length > 0);
  ok((await page.textContent('#lgErro')).includes('não liberado'), 'quem não foi liberado não entra');
  await page.fill('#lgSenha', 'errada'); await page.click('#lgEntrar');
  await page.waitForFunction(() => document.querySelector('#lgErro').textContent.includes('incorretos'));
  ok(true, 'senha errada avisa');
  await entrar(page, 'Jean');
  ok(await page.isVisible('[data-ir="painel"]'), 'gestor da frota entra como admin (vê Painel)');
  await page.reload();
  await page.waitForSelector('#btnNovo');
  ok(true, 'continua logado depois de fechar e abrir');

  console.log('2. admin cadastra equipamento e as funções');
  await page.click('[data-ir="cadastros"]');
  await page.click('[data-ir="cad-equip"]');
  await page.fill('[name=prefixo]', 'cb-12'); await page.fill('[name=placa]', 'abc1d23');
  await page.fill('[name=descricao]', 'Scania basculante');
  await page.click('#fEq button.btn');
  await page.waitForSelector('[data-ed]');
  await page.fill('[name=prefixo]', 'ESC-03'); await page.selectOption('[name=tipo]', 'maquina');
  await page.click('#fEq button.btn');
  await page.waitForFunction(() => document.querySelectorAll('[data-ed]').length === 2);
  const b1 = await banco(page);
  ok(Object.values(b1).some(d => d.prefixo === 'CB-12' && d.placa === 'ABC1D23'), 'equipamento gravado em maiúsculas');
  await page.fill('[name=prefixo]', 'CB-12'); await page.click('#fEq button.btn');
  ok((await page.textContent('#toast')).includes('Já existe'), 'não deixa cadastrar prefixo repetido');
  await page.fill('[name=prefixo]', '');
  await page.click('#btnVoltar');
  await page.click('[data-ir="cad-usuarios"]');
  await page.fill('[name=usuario]', 'Zé'); await page.fill('[name=nome]', 'Zé Motorista');
  await page.fill('[name=senha]', '123456');
  await page.click('#usCriar');
  await page.waitForFunction(() => /1 usuário/.test(document.querySelector('#usLista').textContent));
  ok(await page.$$eval('[name=perfil] option', o => o.map(x => x.textContent).join(',')) === 'Motorista,Operador,Gestor,Administrador',
    'funções: Motorista, Operador, Gestor, Administrador');
  let qtd = 1;
  for (const [u, n, f] of [['ana', 'Ana Gestora', 'gestor'], ['beto', 'Beto Operador', 'operador']]) {
    await page.fill('[name=usuario]', u); await page.fill('[name=nome]', n);
    await page.fill('[name=senha]', '123456'); await page.selectOption('[name=perfil]', f);
    await page.click('#usCriar');
    qtd++;
    await page.waitForFunction(q => new RegExp(q + ' usuário').test(document.querySelector('#usLista').textContent), qtd);
  }
  await page.waitForFunction(() => /3 usuário/.test(document.querySelector('#usLista').textContent));
  const b2 = await banco(page);
  ok(b2['checklist_usuarios/ze@gp2t.local'] && b2['checklist_usuarios/ze@gp2t.local'].perfil === 'motorista',
    'motorista liberado ("Zé" vira ze@gp2t.local; senha já existente continua)');
  ok(b2['checklist_usuarios/ana@gp2t.local'].perfil === 'gestor' && b2['checklist_usuarios/beto@gp2t.local'].perfil === 'operador',
    'gestor e operador liberados');
  // trocar a função pela lista
  await page.selectOption('[data-perfil="beto@gp2t.local"]', 'motorista');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_usuarios/beto@gp2t.local'].perfil === 'motorista');
  await page.selectOption('[data-perfil="beto@gp2t.local"]', 'operador');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_usuarios/beto@gp2t.local'].perfil === 'operador');
  ok(true, 'função muda pela lista de usuários');
  await shot(page, '09-usuarios');
  ok(await page.evaluate(() => firebase.auth().currentUser.email) === 'jean@gp2t.local', 'admin não caiu ao criar usuário');
  await sair(page);

  console.log('3. motorista faz checklist com foto (com sinal)');
  await entrar(page, 'ze');
  ok(!(await page.isVisible('[data-ir="painel"]')) && !(await page.isVisible('[data-ir="cadastros"]')), 'motorista não vê Painel nem Cadastros');
  await page.click('#btnNovo');
  await page.waitForSelector('.equip');
  await shot(page, '02-escolher');
  await page.click('.equip:has-text("CB-12")');
  await page.waitForSelector('.ck-item');
  ok(!(await page.$('[data-video]')), 'sem Storage não oferece vídeo');
  const nItens = await page.$$eval('.ck-item', l => l.length);
  ok(nItens === 18, 'modelo padrão de caminhão (' + nItens + ' itens)');
  await page.fill('#ckKm', '152340');
  // pneu com defeito (crítico) + foto
  await page.click('.ck-item:nth-child(1) [data-st="nok"]');
  await page.fill('.ck-item:nth-child(1) .ck-obs', 'Pneu dianteiro esquerdo com corte');
  page.once('filechooser', async fc => fc.setFiles(await foto(page)));
  await page.click('.ck-item:nth-child(1) [data-foto]');
  await page.waitForSelector('.ck-item:nth-child(1) .mini-midia img[src^="blob:"]');
  ok(true, 'foto aparece na miniatura');
  await page.click('#ckFinalizar');
  ok((await page.textContent('#toast')).includes('Faltam'), 'não finaliza com item sem resposta');
  await page.click('#ckTudoOk');
  ok(await page.$eval('.ck-item:nth-child(1)', e => e.classList.contains('nok')), '"marcar os que faltam" não apaga o defeito');
  await shot(page, '03-checklist');
  // o rascunho sobrevive a fechar o app no meio
  await page.reload(); await page.waitForSelector('#btnContinuar');
  await page.click('#btnContinuar'); await page.waitForSelector('.ck-item:nth-child(1).nok');
  ok(await page.inputValue('#ckKm') === '152340', 'rascunho sobrevive ao fechar o app no meio');
  page.once('dialog', d => d.accept());
  await page.click('#ckFinalizar');
  await page.waitForSelector('.resultado');
  ok((await page.textContent('.resultado h2')).includes('BLOQUEADO'), 'defeito crítico = BLOQUEADO');
  await shot(page, '04-resultado');
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('__ck_banco__') || '{}')).filter(k => k.startsWith('checklist_fotos/')).length === 1);
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('__ck_banco__')))
    .some(d => d.resultado && d.pendentes === 0));
  const b3 = await banco(page);
  const insp = Object.values(b3).find(d => d.resultado);
  const [mid, m] = Object.entries(insp.midias)[0];
  ok(m.ok && m.item === 'i1' && m.path === 'checklist_fotos/' + mid, 'foto subiu (Firestore) e foi marcada no checklist');
  const fdoc = b3['checklist_fotos/' + mid];
  ok(fdoc && fdoc.inspecao === insp.id && fdoc.criadoPor === 'ze@gp2t.local', 'documento da foto ligado ao checklist e ao autor');
  ok(fdoc.dados.startsWith('data:image/jpeg;base64,') && fdoc.dados.length < 950000,
    'foto reduzida antes de subir (' + Math.round(fdoc.dados.length / 1024) + ' KB, jpeg; regra aceita até 950 KB)');
  ok(Object.keys(await page.evaluate(() => window.__STORAGE__)).length === 0, 'nada vai para o Storage (desligado)');
  ok(insp.km === 152340 && insp.criadoPor === 'ze@gp2t.local' && insp.criticos === 1 && insp.tratativa.status === 'aberto',
    'checklist gravado com KM, autor e tratativa aberta');

  console.log('4. sem sinal: checklist e foto ficam na fila');
  await page.evaluate(() => { window.__SEM_REDE__ = true; });
  await page.context().setOffline(true);
  await page.click('#rsNovo');
  await page.click('.equip:has-text("ESC-03")');
  await page.waitForSelector('.ck-item');
  ok(await page.$$eval('.ck-item', l => l.length) === 17, 'escavadeira usa o modelo de máquina');
  await page.click('.ck-item:nth-child(12) [data-st="nok"]');
  await page.fill('.ck-item:nth-child(12) .ck-obs', 'Dente da caçamba quebrado');
  page.once('filechooser', async fc => fc.setFiles(await foto(page)));
  await page.click('[data-foto="geral"]');
  await page.waitForSelector('.card .mini-midia img[src^="blob:"]');
  await page.click('#ckTudoOk');
  page.once('dialog', d => d.accept());
  await page.click('#ckFinalizar');
  await page.waitForSelector('.resultado');
  ok((await page.textContent('.resultado h2')).includes('RESTRIÇÃO'), 'defeito não crítico = LIBERADO COM RESTRIÇÃO');
  ok((await page.textContent('.resultado + p')).includes('Sem sinal'), 'avisa que ficou guardado');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__ck_banco__') || '{}')).filter(k => k.startsWith('checklist_fotos/')).length) === 1, 'sem sinal a foto não sobe');
  ok((await page.textContent('#rede')).includes('sem sinal · 1'), 'topo mostra "sem sinal · 1" pendente');
  await page.click('#rsInicio');
  ok((await page.textContent('#app')).includes('⏳ na fila'), 'início mostra o checklist "na fila"');
  await shot(page, '05-sem-sinal');
  // rede volta
  await page.context().setOffline(false);
  await page.evaluate(() => window.__redeVoltou());
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('__ck_banco__') || '{}')).filter(k => k.startsWith('checklist_fotos/')).length === 2);
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('__ck_banco__')))
    .filter(d => d.resultado && d.pendentes === 0).length === 2);
  ok(true, 'rede voltou: foto subiu sozinha e o checklist foi marcado');
  await page.waitForFunction(() => !document.querySelector('#app').textContent.includes('⏳ na fila'));
  ok(true, 'início passa para "enviado"');
  const filaIDB = await page.evaluate(() => Midia.pendentes());
  ok(filaIDB === 0, 'gaveta do aparelho esvaziou depois do envio');
  await sair(page);

  console.log('5. gestor no painel: vê tudo e resolve, mas não apaga');
  await entrar(page, 'ana');
  ok(await page.isVisible('[data-ir="painel"]') && !(await page.isVisible('[data-ir="cadastros"]')), 'gestor vê Painel, não vê Cadastros');
  await page.click('[data-ir="painel"]');
  await page.waitForSelector('[data-abrir]');
  ok(await page.$$eval('#pLista .item', l => l.length) === 2, 'painel mostra os 2 checklists de hoje');
  ok((await page.textContent('.perigo-borda')).includes('CB-12'), 'CB-12 aparece em "Parados por checklist"');
  await shot(page, '06-painel');
  await page.click('[data-f="bloqueado"]');
  ok(await page.$$eval('#pLista .item', l => l.length) === 1, 'filtro de bloqueados');
  await page.click('#pLista .item');
  await page.waitForSelector('.remota img');
  await page.waitForFunction(() => document.querySelector('.remota img').src.startsWith('data:image/jpeg'));
  ok(true, 'foto aparece no detalhe do gestor');
  ok(!(await page.$('#dtApagar')), 'gestor não tem o botão de apagar');
  ok((await page.textContent('#app')).includes('Pneu dianteiro esquerdo com corte'), 'observação do defeito aparece');
  await shot(page, '07-detalhe');
  await page.fill('#dtNota', 'Pneu trocado');
  await page.click('#dtResolver');
  await page.waitForSelector('#dtReabrir');
  const b5 = await banco(page);
  ok(Object.values(b5).some(d => d.tratativa && d.tratativa.status === 'resolvido' && d.tratativa.nota === 'Pneu trocado'
    && d.tratativa.por === 'Ana Gestora'), 'gestor resolveu (tratativa gravada com o nome dele)');
  await page.click('#btnVoltar');
  await page.click('[data-f="todos"]');
  ok(!(await page.$('.perigo-borda')), 'resolvido sai de "Parados por checklist"');
  ok(!(await page.$('[data-apagar]')), 'gestor não tem lixeira na lista');
  ok((await page.textContent('#pLista')).includes('(motorista)'), 'lista mostra a função de quem fez');
  await page.evaluate(() => Telas.ir('cad-usuarios'));
  ok(!(await page.$('#fUs')), 'gestor não abre Cadastros nem forçando');
  await sair(page);

  console.log('6. admin: apagar e modelos');
  await entrar(page, 'jean');
  await page.click('[data-ir="painel"]');
  await page.waitForSelector('[data-apagar]');
  ok(await page.$$eval('[data-apagar]', l => l.length) === 2, 'admin tem lixeira em cada checklist');
  const antes = await banco(page);
  const escav = Object.values(antes).find(d => d.resultado && d.equipamento.prefixo === 'ESC-03');
  const fotoEscav = Object.values(escav.midias)[0].path;
  page.once('dialog', d => d.accept());
  await page.click(`[data-apagar="${escav.id}"]`);
  await page.waitForFunction(() => document.querySelectorAll('#pLista .item').length === 1);
  const depois = await banco(page);
  ok(!depois['checklist_inspecoes/' + escav.id] && !depois[fotoEscav], 'admin apagou o checklist e a foto dele');
  page.once('dialog', d => d.dismiss());
  await page.click('[data-apagar]');
  ok(await page.$$eval('#pLista .item', l => l.length) === 1, 'cancelar não apaga');
  await page.click('#pLista .item');
  await page.waitForSelector('#dtApagar');
  ok(true, 'admin também apaga pelo detalhe');
  await page.click('[data-ir="cadastros"]');
  await page.click('[data-ir="cad-modelos"]');
  await page.click('#mdCopiar');
  await page.waitForSelector('[data-md]');
  await page.click('[data-md="padrao-caminhao"]');
  await page.fill('#mdNovoItem', 'Lona de cobertura da carga'); await page.click('#mdAdd');
  await page.click('#mdSalvar');
  const b6 = await banco(page);
  ok(b6['checklist_modelos/padrao-caminhao'].itens.length === 19, 'item novo entra no modelo');
  await shot(page, '08-modelos');

  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
