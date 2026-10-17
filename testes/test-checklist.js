/* App de Checklist (/checklist), de ponta a ponta, num navegador de verdade:
   admin cadastra equipamento, motorista, operador e gestor -> motorista faz checklist com foto ->
   checklist sem sinal fica na fila e sobe quando a rede volta -> admin vê no
   painel, abre a foto e dá a tratativa. Cobra também: nenhum erro de JS. */
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const URL = 'http://localhost:8131/checklist/index.html';
const SHOTS = process.env.SHOTS || '';
const CONTRASTE = require('./contraste.js');
const contrasteRuim = [];   // [tela, texto] — o app é usado ao sol: mínimo 4,5:1

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
// defeitos em aberto gravados no equipamento (é deles que sai a situação)
const pendencias = (page, P) => page.evaluate(P => (Object.entries(JSON.parse(localStorage.getItem('__ck_banco__'))).find(([k, d]) => k.startsWith('checklist_equipamentos/') && d.prefixo === P)[1]).pendencias || {}, P);
const shot = async (page, nome, inteira = true) => {
  (await page.evaluate(`(${CONTRASTE})(4.5)`)).forEach(t => contrasteRuim.push(nome + ': ' + t));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/' + nome + '.png', fullPage: inteira });
};

async function entrar(page, usuario) {
  await page.waitForSelector('#lgUsuario');
  await page.fill('#lgUsuario', usuario);
  await page.fill('#lgSenha', '123456');
  await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');
}
async function sair(page) {
  await page.click('[data-ir="conta"]');
  await page.click('#ctSair');
  await page.click('#mdlOk');
  await page.waitForSelector('#lgUsuario');
}

(async () => {
  const browser = await chromium.launch();
  // celular em modo escuro: o app tem que continuar branco (é usado ao sol)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark',
    serviceWorkers: 'block' });
  await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript(SDK);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  // janela cinza do navegador (confirm/alert) não pode mais aparecer
  const nativas = [];
  page.on('dialog', d => { nativas.push(d.message()); d.dismiss(); });
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
  ok((await page.textContent('.ck-item:nth-child(1) [data-st="nok"]')).includes('Não conforme'), 'botão "Não conforme"');
  await page.click('.ck-item:nth-child(1) [data-st="nok"]');
  ok((await page.textContent('.ck-item:nth-child(1) .aviso-critico')) === '🔧 Acione a manutenção'
    && (await page.textContent('#toast')).includes('Acione a manutenção'), 'item crítico não conforme: "Acione a manutenção" no item e no aviso');
  await page.fill('.ck-item:nth-child(1) .ck-obs', 'Pneu dianteiro esquerdo com corte');
  page.once('filechooser', async fc => fc.setFiles(await foto(page)));
  await page.click('.ck-item:nth-child(1) [data-foto]');
  await page.waitForSelector('.ck-item:nth-child(1) .mini-midia img[src^="blob:"]');
  ok(true, 'foto aparece na miniatura');
  await page.click('#ckFinalizar');
  ok((await page.textContent('#toast')).includes('Faltam'), 'não finaliza com item sem resposta');
  // faróis (item 5) é "com observação": não conforme junto com o pneu (crítico)
  await page.click('.ck-item:nth-child(5) [data-st="nok"]');
  await page.fill('.ck-item:nth-child(5) .ck-obs', 'Farol direito queimado');
  await page.click('#ckTudoOk');
  ok(await page.$eval('.ck-item:nth-child(1)', e => e.classList.contains('nok')), '"marcar os que faltam" não apaga o defeito');
  await shot(page, '03-checklist');
  // o rascunho sobrevive a fechar o app no meio
  await page.reload(); await page.waitForSelector('#btnContinuar');
  await page.click('#btnContinuar'); await page.waitForSelector('.ck-item:nth-child(1).nok');
  ok(await page.inputValue('#ckKm') === '152340', 'rascunho sobrevive ao fechar o app no meio');
  ok(!(await page.isVisible('#inFoto')) && !(await page.isVisible('#inVideo')), 'campos "Escolher arquivo" ficam escondidos');
  await page.click('#ckFinalizar');
  await page.waitForSelector('.mdl');
  const mdl = await page.textContent('.mdl');
  ok(mdl.includes('Enviar checklist?') && mdl.includes('MANUTENÇÃO') && mdl.includes('Pneus') && mdl.includes('CRÍTICO')
    && (await page.textContent('#mdlOk')) === 'Enviar' && (await page.textContent('#mdlCancel')) === 'Voltar',
    'janela do app: título, resultado, itens não conformes e botões Enviar/Voltar');
  await shot(page, '12-confirmar', false);
  await page.click('#mdlCancel');
  ok(!(await page.$('.mdl')) && !(await page.$('.resultado')), 'Voltar fecha a janela e não envia');
  await page.click('#ckFinalizar');
  await page.click('#mdlOk');
  await page.waitForSelector('.resultado');
  ok((await page.textContent('.resultado h2')).includes('MANUTENÇÃO'), 'defeito crítico = MANUTENÇÃO');
  ok((await page.textContent('.resultado .aviso-critico')).includes('Acione a manutenção'), 'tela final repete "Acione a manutenção"');
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
  ok(JSON.stringify(await pendencias(page, 'CB-12')) === JSON.stringify({ [insp.id]: 'bloqueado' }), 'CB-12 entra EM MANUTENÇÃO');

  console.log('4. sem sinal: checklist e foto ficam na fila');
  await page.evaluate(() => { window.__SEM_REDE__ = true; });
  await page.context().setOffline(true);
  await page.click('#rsNovo');
  ok((await page.textContent('.equip.sit-perigo')).includes('Em manutenção') && (await page.textContent('.equip.sit-perigo')).includes('CB-12'),
    'na escolha, CB-12 aparece marcado "Em manutenção"');
  await page.click('.equip:has-text("ESC-03")');
  await page.waitForSelector('.ck-item');
  ok(await page.$$eval('.ck-item', l => l.length) === 17, 'escavadeira usa o modelo de máquina');
  await page.click('.ck-item:nth-child(12) [data-st="nok"]');
  await page.fill('.ck-item:nth-child(12) .ck-obs', 'Dente da caçamba quebrado');
  ok(!(await page.$('.ck-item:nth-child(12) .aviso-critico')), 'item com observação não conforme: sem "Acione a manutenção"');
  page.once('filechooser', async fc => fc.setFiles(await foto(page)));
  await page.click('[data-foto="geral"]');
  await page.waitForSelector('.card .mini-midia img[src^="blob:"]');
  await page.click('#ckTudoOk');
  await page.click('#ckFinalizar');
  await page.click('#mdlOk');
  await page.waitForSelector('.resultado');
  ok((await page.textContent('.resultado h2')).includes('OPERACIONAL COM OBSERVAÇÃO'), 'defeito não crítico = OPERACIONAL COM OBSERVAÇÃO');
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
  ok(Object.values(await pendencias(page, 'ESC-03')).join() === 'restricao', 'ESC-03 (defeito operacional) fica COM RESTRIÇÃO e segue operando');
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
  const frota = await page.textContent('#pFrota');
  ok(/Em manutenção \(1\)\s*CB-12/.test(frota) && /Com restrição \(1\)\s*ESC-03/.test(frota) && frota.includes('Operando (0)'),
    'situação da frota: CB-12 em manutenção, ESC-03 com restrição');
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
  ok(await page.$$eval('[data-resolver]', l => l.map(b => b.dataset.resolver).join()) === 'i1,i5', 'cada item não conforme tem "Resolver este item"');
  ok(!(await page.$('#dtResolver')), 'não existe mais o botão geral de resolver');
  // 1) resolve o crítico (pneu), com nota e foto
  await page.click('[data-resolver="i1"]');
  await page.fill('#rsNota', 'Pneu trocado');
  page.once('filechooser', async fc => fc.setFiles(await foto(page)));
  await page.click('#rsFoto');
  await page.waitForSelector('.resolvendo .mini-midia img[src^="blob:"]');
  await shot(page, '13-resolvendo');
  await page.click('#rsConfirmar');
  await page.waitForSelector('[data-item="i1"] .resolvido');
  await page.waitForFunction(id => JSON.stringify((Object.entries(JSON.parse(localStorage.getItem('__ck_banco__'))).find(([k, d]) => k.startsWith('checklist_equipamentos/') && d.prefixo === 'CB-12')[1].pendencias || {})) === JSON.stringify({ [id]: 'restricao' }), insp.id);
  ok(true, 'resolvido o crítico: CB-12 sai de MANUTENÇÃO e fica COM RESTRIÇÃO (falta o farol)');
  const sit = await page.textContent('#dtSituacao');
  ok(sit.includes('OPERACIONAL COM OBSERVAÇÃO') && sit.includes('1 de 2'), 'detalhe mostra "agora" e 1 de 2 resolvidos');
  await page.waitForFunction(id => { const b = JSON.parse(localStorage.getItem('__ck_banco__')); const d = b['checklist_inspecoes/' + id];
    const f = ((d.resolucoes || {}).i1 || {}).fotos || []; return f.length === 1 && d.midias[f[0]].ok && b['checklist_fotos/' + f[0]]; }, insp.id);
  ok(true, 'foto da correção subiu e ficou ligada ao item');
  await page.waitForFunction(() => document.querySelector('[data-item="i1"] .resolvido img') && document.querySelector('[data-item="i1"] .resolvido img').src.startsWith('data:image/jpeg'));
  ok((await page.textContent('[data-item="i1"] .resolvido')).includes('Pneu trocado'), 'item resolvido mostra nota e foto');
  // 2) sem nota não confirma
  await page.click('[data-resolver="i5"]');
  await page.click('#rsConfirmar');
  ok((await page.textContent('#toast')).includes('Escreva o que foi feito'), 'sem nota não resolve');
  await page.fill('#rsNota', 'Lâmpada trocada');
  await page.click('#rsConfirmar');
  await page.waitForFunction(() => Object.keys((Object.entries(JSON.parse(localStorage.getItem('__ck_banco__'))).find(([k, d]) => k.startsWith('checklist_equipamentos/') && d.prefixo === 'CB-12')[1].pendencias || {})).length === 0);
  ok(true, 'todos os itens resolvidos: CB-12 volta a OPERANDO');
  // 3) reabrir um item volta a situação; resolver de novo
  await page.click('[data-reabrir="i5"]');
  await page.click('#mdlOk');
  await page.waitForFunction(id => JSON.stringify((Object.entries(JSON.parse(localStorage.getItem('__ck_banco__'))).find(([k, d]) => k.startsWith('checklist_equipamentos/') && d.prefixo === 'CB-12')[1].pendencias || {})) === JSON.stringify({ [id]: 'restricao' }), insp.id);
  ok(true, 'reabrir o farol: CB-12 volta a COM RESTRIÇÃO');
  await page.click('[data-resolver="i5"]');
  await page.fill('#rsNota', 'Lâmpada trocada');
  await page.click('#rsConfirmar');
  await page.waitForFunction(() => Object.keys((Object.entries(JSON.parse(localStorage.getItem('__ck_banco__'))).find(([k, d]) => k.startsWith('checklist_equipamentos/') && d.prefixo === 'CB-12')[1].pendencias || {})).length === 0);
  ok(await page.evaluate(id => Historico.lista().find(x => x.id === id).resolvido === true, insp.id),
    'quem resolveu neste aparelho: o Início já marca como resolvido');
  const b5 = await banco(page);
  const d5 = b5['checklist_inspecoes/' + insp.id];
  ok(d5.resolucoes.i1.nota === 'Pneu trocado' && d5.resolucoes.i1.por === 'Ana Gestora' && d5.resolucoes.i5.nota === 'Lâmpada trocada'
    && d5.tratativa.status === 'resolvido', 'resolução por item gravada com nota e nome; tratativa resolvida');
  await page.click('#btnVoltar');
  await page.click('[data-f="todos"]');
  await page.waitForFunction(() => document.querySelector('#pFrota').textContent.includes('Operando (1)'));
  ok(!(await page.textContent('#pFrota')).includes('Em manutenção'), 'resolvido sai de "Em manutenção" no Painel');
  await page.click('[data-f="bloqueado"]');
  ok((await page.textContent('#pFiltro')).includes('🔧 Manutenção') && !(await page.textContent('#app')).includes('Bloquead'),
    'filtro "Manutenção" (não aparece mais "Bloqueado")');
  ok(await page.$$eval('#pLista .item', l => l.length) === 0, 'resolvido sai da aba Manutenção');
  await page.click('[data-f="liberado"]');
  ok((await page.textContent('#pFiltro')).includes('✅ Operando') && !(await page.textContent('#pFiltro')).includes('Liberad'),
    'aba "Liberados" agora se chama "Operando"');
  const operando = await page.textContent('#pLista');
  ok(operando.includes('CB-12') && operando.includes('era manutenção') && operando.includes('✔ resolvido'), 'resolvido aparece na aba Operando (com o que era)');
  ok((await page.$$eval('.kpi', k => k.map(x => x.textContent.replace(/\s+/g, ' ').trim()))).join('|').includes("1operando"),
    'contador "operando" conta o resolvido');
  await page.click('[data-f="todos"]');
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
  await page.click(`[data-apagar="${escav.id}"]`);
  await page.click('#mdlOk');
  await page.waitForFunction(() => document.querySelectorAll('#pLista .item').length === 1);
  const depois = await banco(page);
  ok(!depois['checklist_inspecoes/' + escav.id] && !depois[fotoEscav], 'admin apagou o checklist e a foto dele');
  ok(!(await page.evaluate(() => Historico.lista().map(x => x.id))).includes(escav.id), 'apagado sai na hora de "Meus últimos checklists"');
  ok(Object.keys(await pendencias(page, 'ESC-03')).length === 0, 'apagar o checklist tira a restrição do ESC-03');
  await page.click('[data-apagar]');
  ok((await page.textContent('.mdl h2')) === 'Apagar checklist?' && await page.$eval('#mdlOk', b => b.classList.contains('btn-perigo')),
    'apagar: janela do app com botão vermelho');
  await page.click('#mdlCancel');
  ok(await page.$$eval('#pLista .item', l => l.length) === 1, 'cancelar não apaga');
  await page.click('#pLista .item');
  await page.waitForSelector('#dtApagar');
  ok(true, 'admin também apaga pelo detalhe');
  await page.click('[data-ir="cadastros"]');
  await page.click('[data-ir="cad-modelos"]');
  await page.click('#mdCopiar');
  await page.waitForSelector('[data-md]');
  await page.click('[data-md="padrao-caminhao"]');
  ok((await page.textContent('#app')).includes('põe o equipamento em manutenção'), 'tela de modelo explica os níveis');
  // o freio (item 2) passa de Crítico para Operacional; item novo entra como Crítico
  ok(await page.$eval('.md-item[data-n="1"] .md-nivel', e => e.value) === 'critico', 'freio vem como Crítico');
  await page.selectOption('.md-item[data-n="1"] .md-nivel', 'operacional');
  await page.fill('#mdNovoItem', 'Lona de cobertura da carga');
  await page.selectOption('#mdNovoNivel', 'critico');
  await page.click('#mdAdd');
  await shot(page, '10-niveis');
  await page.click('#mdSalvar');
  const b6 = await banco(page);
  ok(b6['checklist_modelos/padrao-caminhao'].itens.length === 19, 'item novo entra no modelo');
  const itensMod = b6['checklist_modelos/padrao-caminhao'].itens;
  ok(itensMod[1].critico === false && itensMod[18].texto === 'Lona de cobertura da carga' && itensMod[18].critico === true,
    'níveis salvos: freio Operacional, lona Crítico');
  // e o checklist novo já usa os níveis
  await page.click('[data-ir="novo"]');
  await page.click('.equip:has-text("CB-12")');
  await page.waitForSelector('.ck-item');
  const tags = await page.$$eval('.ck-item', l => l.map(e => !!e.querySelector('.critico')));
  ok(tags[1] === false && tags[18] === true, 'checklist novo: freio sem CRÍTICO, lona com CRÍTICO');
  // lona (crítico) com defeito -> manutenção; freio (operacional) com defeito -> só restrição
  await page.click('.ck-item:nth-child(2) [data-st="nok"]');
  await page.fill('.ck-item:nth-child(2) .ck-obs', 'Pedal duro');
  await page.click('#ckTudoOk');
  await page.click('#ckFinalizar');
  await page.click('#mdlOk');
  await page.waitForSelector('.resultado');
  ok((await page.textContent('.resultado h2')).includes('OPERACIONAL COM OBSERVAÇÃO'), 'defeito em item "com observação" = OPERACIONAL COM OBSERVAÇÃO (segue operando)');
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('__ck_banco__')))
    .some(d => d.prefixo === 'CB-12' && Object.values(d.pendencias || {}).join() === 'restricao'));
  ok(true, 'CB-12 passa a "Com restrição"');
  await shot(page, '08-modelos');

  console.log('7. checklist apagado em OUTRO celular some do Início ao abrir o app');
  await page.click('[data-ir="inicio"]');
  const hist = await page.evaluate(() => Historico.lista().filter(x => x.enviado).map(x => x.id));
  ok(hist.length >= 2, 'Início tem ' + hist.length + ' checklists enviados');
  const alvo = hist[hist.length - 1];
  // "outro celular" apaga direto no servidor
  await page.evaluate(id => { const b = JSON.parse(localStorage.getItem('__ck_banco__')); delete b['checklist_inspecoes/' + id];
    localStorage.setItem('__ck_banco__', JSON.stringify(b)); }, alvo);
  await page.reload();
  await page.waitForSelector('#btnNovo');
  await page.waitForFunction(id => !Historico.lista().some(x => x.id === id), alvo);
  const resto = await page.evaluate(() => Historico.lista().map(x => x.id));
  ok(resto.length === hist.length - 1, 'ao abrir, o apagado sumiu e os outros ficaram');
  await page.evaluate(() => { window.__SEM_REDE__ = true; });
  ok(await page.evaluate(() => Dados.estado('qualquer')) === null, 'sem sinal não muda nada na lista (não dá para saber)');
  await page.evaluate(() => { window.__SEM_REDE__ = false; });

  console.log('8. resolvido em OUTRO celular: o Início mostra Operando');
  const ultimo = await page.evaluate(() => Historico.lista().find(x => x.enviado && x.resultado !== 'liberado' && !x.resolvido));
  ok(!!ultimo, 'há um checklist com não conforme ainda aberto no Início (' + (ultimo && ultimo.resultado) + ')');
  ok((await page.textContent('#app')).includes((ultimo.resultado === 'bloqueado' ? 'MANUTENÇÃO' : 'OPERACIONAL COM OBSERVAÇÃO')),
    'antes: Início mostra o resultado do checklist');
  await page.evaluate(id => { const b = JSON.parse(localStorage.getItem('__ck_banco__'));
    b['checklist_inspecoes/' + id].tratativa = { status: 'resolvido', por: 'Ana Gestora', em: Date.now() };
    localStorage.setItem('__ck_banco__', JSON.stringify(b)); }, ultimo.id);
  await page.reload();
  await page.waitForSelector('#btnNovo');
  await page.waitForFunction(id => (Historico.lista().find(x => x.id === id) || {}).resolvido === true, ultimo.id);
  await page.waitForFunction(() => document.querySelector('#app').textContent.includes('✔ resolvido'));
  const itemTxt = await page.$$eval('#app .item', l => l.map(e => e.textContent.replace(/\s+/g, ' ')).join(' | '));
  ok(!/MANUTENÇÃO|OPERACIONAL COM OBSERVAÇÃO/.test(itemTxt) && itemTxt.includes('OPERANDO'),
    'depois de resolvido: Início mostra OPERANDO (com o que era)');
  await shot(page, '11-inicio-operando');

  ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(255, 255, 255)',
    'fundo branco mesmo com o celular em modo escuro');
  ok(contrasteRuim.length === 0, 'contraste ≥ 4,5:1 em todas as telas fotografadas' + (contrasteRuim.length ? ': ' + contrasteRuim.join(' | ') : ''));
  ok(nativas.length === 0, 'nenhuma janela do navegador (confirm/alert)' + (nativas.length ? ': ' + nativas.join(' | ') : ''));
  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
