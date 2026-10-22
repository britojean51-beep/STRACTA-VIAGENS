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
// chips da "Situação da frota", por grupo (perigo = manutenção, ok = operando, sem = sem checklist)
const grupos = page => page.evaluate(() => Object.fromEntries(['perigo', 'ok', 'sem'].map(k =>
  [k, [...document.querySelectorAll('#pFrota .grupo-frota.' + k + ' .chip-eq')].map(b => b.textContent.replace(/\s+/g, ' ').trim())])));
const banco = page => page.evaluate(() => JSON.parse(localStorage.getItem('__ck_banco__') || '{}'));
// defeitos em aberto gravados no equipamento (é deles que sai a situação)
const pendencias = (page, P) => page.evaluate(P => (Object.entries(JSON.parse(localStorage.getItem('__ck_banco__'))).find(([k, d]) => k.startsWith('checklist_equipamentos/') && d.prefixo === P)[1]).pendencias || {}, P);
const comEmoji = [];   // app profissional: nenhum emoji na tela
const EMOJI = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u2B00-\u2BFF\u2190-\u21FF\u2300-\u23FF\uFE0F\u25A0-\u25FF]/u;
const shot = async (page, nome, inteira = true) => {
  (await page.evaluate(`(${CONTRASTE})(4.5)`)).forEach(t => contrasteRuim.push(nome + ': ' + t));
  const txt = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[placeholder],[aria-label]')].map(e => e.placeholder || e.getAttribute('aria-label')).join(' '));
  const m = txt.match(EMOJI); if (m) comEmoji.push(nome + ': "' + m[0] + '"');
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
  // aqui o service worker fica desligado: sem sinal a imagem do cartão não carrega (no celular ela vem do cache,
  // ver test-atualizacao.js); isso não é erro do app
  page.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED/.test(m.text())) erros.push(m.text()); });

  // o gestor do app de frota existe; nada do checklist ainda
  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.setItem('__ck_banco__', JSON.stringify({ 'usuarios/jean@gp2t.local': { nome: 'Jean', perfil: 'gestor' } }));
  });
  await page.reload();

  console.log('1. login rápido e acesso');
  await page.waitForSelector('#lgUsuario');
  await shot(page, '01-login');
  const corpo = await page.textContent('body');
  ok(!/STRACTA|🚛|👁|✅ CHECKLIST/.test(corpo) && corpo.includes('Checklist de Frota') && corpo.includes('Acesse sua conta'),
    'login profissional: "Checklist de Frota", sem o nome STRACTA e sem emojis');
  ok(await page.$eval('#lgEntrar', b => getComputedStyle(b).opacity) === '1' && !(await page.isVisible('#topo')) && !(await page.isVisible('#abas')),
    'botão Entrar com cor cheia; topo e abas escondidos no login');
  ok(!(await page.isVisible('#lgRede')), 'com internet não mostra aviso de rede');
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForSelector('#lgRede', { state: 'visible' });
  await shot(page, '01b-login-sem-internet');
  ok((await page.textContent('#lgRede')).includes('Sem internet'), 'sem internet: aviso claro no login');
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForSelector('#lgRede', { state: 'hidden' });
  await page.click('#lgOlho');
  ok(await page.$eval('#lgSenha', e => e.type) === 'text' && await page.$eval('#lgOlho', e => e.getAttribute('aria-pressed')) === 'true', 'olho mostra a senha');
  await page.click('#lgOlho');
  await page.fill('#lgUsuario', 'ze'); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForFunction(() => document.querySelector('#lgErro').textContent.length > 0);
  ok((await page.textContent('#lgErro')).includes('não liberado'), 'quem não foi liberado não entra');
  await page.fill('#lgSenha', 'errada'); await page.click('#lgEntrar');
  await page.waitForFunction(() => document.querySelector('#lgErro').textContent.includes('incorretos'));
  ok(true, 'senha errada avisa');
  await entrar(page, 'Jean');
  ok(await page.isVisible('[data-ir="painel"]'), 'gestor da frota entra como admin (vê Painel)');
  ok(await page.$$eval('.aba span svg', l => l.length) === 5 && !/[🏠➕📊🗂👤]/.test(await page.textContent('#abas')), 'abas com ícones de traço (sem emoji)');
  ok(!!(await page.$('#topo .logo svg')) && !(await page.textContent('#titulo')).includes('✅'), 'topo com o logo, sem emoji no título');
  await shot(page, '01c-inicio');
  await page.reload();
  await page.waitForSelector('#btnNovo');
  ok(true, 'continua logado depois de fechar e abrir');

  console.log('2. admin cadastra equipamento e as funções');
  await page.click('[data-ir="cadastros"]');
  await page.click('[data-ir="cad-equip"]');
  await page.fill('[name=prefixo]', 'cb-12'); await page.fill('[name=placa]', 'abc1d23');
  await page.fill('[name=descricao]', 'Scania basculante');
  await page.selectOption('[name=modeloId]', 'padrao-caminhao');   // o resto do teste usa o "Caminhão — diário"
  await page.click('#fEq button.btn:not([type=button])');
  await page.waitForSelector('[data-ed]');
  await page.fill('[name=prefixo]', 'ESC-03'); await page.selectOption('[name=tipo]', 'maquina');
  await page.click('#fEq button.btn:not([type=button])');
  await page.waitForFunction(() => document.querySelectorAll('[data-ed]').length === 2);
  const b1 = await banco(page);
  ok(Object.values(b1).some(d => d.prefixo === 'CB-12' && d.placa === 'ABC1D23'), 'equipamento gravado em maiúsculas');
  await page.fill('[name=prefixo]', 'CB-12'); await page.click('#fEq button.btn:not([type=button])');
  ok((await page.textContent('#toast')).includes('Já existe'), 'não deixa cadastrar prefixo repetido');
  await page.fill('[name=prefixo]', '');
  await page.click('#btnVoltar');
  await page.click('[data-ir="cad-usuarios"]');
  await page.fill('[name=usuario]', 'Zé'); await page.fill('[name=nome]', 'Zé Motorista');
  await page.fill('[name=senha]', '123456');
  await page.click('#usCriar');
  await page.waitForFunction(() => /1 usuário/.test(document.querySelector('#usLista').textContent));
  ok(await page.$$eval('[name=perfil] option', o => o.map(x => x.textContent).join(',')) === 'Motorista,Operador,Técnico de Segurança,Gestor,Administrador',
    'funções: Motorista, Operador, Técnico de Segurança, Gestor, Administrador');
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
  ok((await page.textContent('.ck-item:nth-child(1) .aviso-critico')).trim() === 'Acione a manutenção'
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
  await page.$eval('#ckFinalizar', b => { b.click(); b.click(); });   // toque duplo
  ok(!(await page.$('.mdl')), 'Finalizar envia direto, sem perguntar');
  await page.waitForSelector('.resultado');
  ok((await page.textContent('.resultado h2')).includes('MANUTENÇÃO'), 'defeito crítico = MANUTENÇÃO');
  await page.waitForTimeout(300);
  ok(Object.keys(await banco(page)).filter(k => k.startsWith('checklist_inspecoes/')).length === 1, 'toque duplo em Finalizar não envia duas vezes');
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
  const textos = await page.$$eval('.ck-item .ck-txt', l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(textos.length === 22 && textos[0].includes('Condição do condutor, CNH e treinamentos válidos')
    && textos[21].includes('Dispositivo de controle de ruído do escapamento e emissão de fumaça preta'),
    'escavadeira usa o checklist de segurança de máquinas (22 itens, igual à folha)');
  ok(await page.$$eval('.ck-item .critico', l => l.length) === 7, '7 itens críticos (condutor, extintor/cinto, pneus, vazamento, partes móveis, buzina/ré, freio)');
  await page.click('.ck-item:nth-child(10) [data-st="nok"]');
  await page.fill('.ck-item:nth-child(10) .ck-obs', 'Dente da caçamba quebrado');
  ok(!(await page.$('.ck-item:nth-child(10) .aviso-critico')), 'item com observação não conforme: sem "Acione a manutenção"');
  page.once('filechooser', async fc => fc.setFiles(await foto(page)));
  await page.click('[data-foto="geral"]');
  await page.waitForSelector('.card .mini-midia img[src^="blob:"]');
  await page.click('#ckTudoOk');
  await page.click('#ckFinalizar');
  await page.waitForSelector('.resultado');
  ok((await page.textContent('.resultado h2')).includes('NÃO CONFORME') && (await page.textContent('.resultado')).includes('segue operando'), 'defeito que não obriga parada: checklist NÃO CONFORME, equipamento segue operando');
  ok((await page.textContent('.resultado + p')).includes('Sem sinal'), 'avisa que ficou guardado');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('__ck_banco__') || '{}')).filter(k => k.startsWith('checklist_fotos/')).length) === 1, 'sem sinal a foto não sobe');
  ok((await page.textContent('#rede')).includes('sem sinal · 1'), 'topo mostra "sem sinal · 1" pendente');
  await page.click('#rsInicio');
  ok(await page.evaluate(() => [...document.querySelectorAll('#app .item .dir small')].some(x => x.textContent.trim() === 'na fila')), 'início mostra o checklist "na fila"');
  await shot(page, '05-sem-sinal');
  // rede volta
  await page.context().setOffline(false);
  await page.evaluate(() => window.__redeVoltou());
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('__ck_banco__') || '{}')).filter(k => k.startsWith('checklist_fotos/')).length === 2);
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('__ck_banco__')))
    .filter(d => d.resultado && d.pendentes === 0).length === 2);
  ok(true, 'rede voltou: foto subiu sozinha e o checklist foi marcado');
  ok(Object.values(await pendencias(page, 'ESC-03')).join() === 'restricao', 'ESC-03 (defeito que não obriga parada) fica anotado e segue operando');
  await page.waitForFunction(() => ![...document.querySelectorAll('#app .item .dir small')].some(x => x.textContent.trim() === 'na fila'));
  ok(true, 'início passa para "enviado"');
  const filaIDB = await page.evaluate(() => Midia.pendentes());
  ok(filaIDB === 0, 'gaveta do aparelho esvaziou depois do envio');

  console.log('4b. motorista acompanha a manutenção do caminhão dele (ao vivo)');
  await page.waitForSelector('.acompanhe');
  const cards = await page.$$eval('.acompanhe', l => l.map(e => e.textContent.replace(/\s+/g, ' ')));
  ok(cards.length === 2 && cards.some(c => c.includes('CB-12') && c.includes('Em manutenção') && c.includes('0 de 2'))
    && cards.some(c => c.includes('ESC-03') && c.includes('Não conforme')), 'Início: "Acompanhe hoje" com CB-12 em manutenção (0 de 2) e ESC-03 não conforme');
  await page.click(`.acompanhe [data-ver="${insp.id}"]`);
  await page.waitForSelector('#dtSituacao');
  ok(!(await page.$('[data-resolver]')) && !(await page.$('[data-solicitar]')) && !(await page.$('#dtApagar')) && !(await page.$('[data-reabrir]')),
    'motorista vê o andamento, mas sem Resolver/Solicitação/Apagar');
  ok((await page.textContent('#app')).includes('Aguardando a manutenção') && (await page.textContent('#dtSituacao')).includes('atualiza sozinha'),
    'itens em aberto aparecem como "Aguardando a manutenção"');
  await shot(page, '15-motorista-acompanha');
  // a gestora resolve o pneu e pede a lâmpada, de OUTRO celular: a tela do Zé muda sozinha
  await page.evaluate(id => firebase.firestore().collection('checklist_inspecoes').doc(id).update({
    'resolucoes.i1': { nota: 'Pneu trocado na borracharia', por: 'Ana Gestora', em: Date.now(), fotos: [] },
    'solicitacoes.i5': { nota: 'Lâmpada do farol pedida', por: 'Ana Gestora', em: Date.now() } }), insp.id);
  await page.waitForSelector('[data-item="i1"] .resolvido');
  ok((await page.textContent('[data-item="i1"] .resolvido')).includes('Pneu trocado na borracharia')
    && (await page.textContent('[data-item="i5"] .solicitado')).includes('Lâmpada do farol pedida'),
    'sem recarregar: o detalhe mostra o pneu resolvido e a lâmpada solicitada');
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('voltou a operar'));
  ok(true, 'aviso "CB-12 voltou a operar" (só falta item que não obriga parada)');
  await page.click('#btnVoltar');
  await page.waitForSelector('.acompanhe');
  const cb = await page.$eval(`.acompanhe:has([data-ver="${insp.id}"])`, e => e.textContent.replace(/\s+/g, ' '));
  ok(cb.includes('Não conforme') && cb.includes('1 de 2') && cb.includes('1 aguardando peça'), 'cartão do CB-12: não conforme, 1 de 2 e 1 aguardando peça');
  await shot(page, '16-acompanhe-hoje');
  await page.evaluate(id => firebase.firestore().collection('checklist_inspecoes').doc(id).update({
    'resolucoes.i5': { nota: 'Lâmpada trocada', por: 'Ana Gestora', em: Date.now(), fotos: [] } }), insp.id);
  await page.waitForFunction(id => (document.querySelector(`.acompanhe:has([data-ver="${id}"])`) || {}).textContent.includes('Voltou a operar'), insp.id);
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('voltou a operar'));
  ok(true, 'tudo resolvido: cartão verde "Voltou a operar" e aviso');
  // checklist de outra pessoa: não abre
  await page.evaluate(() => { const b = JSON.parse(localStorage.getItem('__ck_banco__'));
    b['checklist_inspecoes/alheio'] = { criadoPor: 'beto@gp2t.local', criadoEm: Date.now(), resultado: 'liberado', equipamento: { prefixo: 'ZZ-9' }, itens: [] };
    localStorage.setItem('__ck_banco__', JSON.stringify(b)); Telas.ir('detalhe', 'alheio'); });
  await page.waitForSelector('#btnNovo');
  ok((await page.textContent('#toast')).includes('outra pessoa'), 'motorista não abre checklist de outra pessoa');
  // desfaz a simulação: o passo 5 é a gestora resolvendo de verdade
  await page.evaluate(id => { const db = firebase.firestore(), del = firebase.firestore.FieldValue.delete();
    db.collection('checklist_inspecoes').doc(id).update({ resolucoes: del, solicitacoes: del });
    const b = JSON.parse(localStorage.getItem('__ck_banco__')); delete b['checklist_inspecoes/alheio']; localStorage.setItem('__ck_banco__', JSON.stringify(b)); }, insp.id);
  await page.waitForTimeout(200);
  await sair(page);

  console.log('5. gestor no painel: vê tudo e resolve, mas não apaga');
  // um terceiro equipamento que nunca fez checklist
  await page.evaluate(() => { const b = JSON.parse(localStorage.getItem('__ck_banco__'));
    b['checklist_equipamentos/semck'] = { prefixo: 'PC-09', placa: '', tipo: 'maquina' };
    // e um checklist dele de 3 dias atrás, ainda em manutenção
    const d = new Date(); d.setDate(d.getDate() - 3); d.setHours(9, 0, 0, 0);
    b['checklist_inspecoes/antigo'] = { equipamento: { id: 'semck', prefixo: 'PC-09', placa: '', tipo: 'maquina' }, criadoEm: d.getTime(),
      criadoPor: 'carlos@gp2t.local', criadoNome: 'Carlos', resultado: 'bloqueado', defeitos: 1, tratativa: { status: 'aberto' },
      itens: [{ id: 'x', texto: 'Esteira', critico: true, st: 'nok', obs: 'Rolete quebrado' }], midias: {} };
    b['checklist_equipamentos/semck'].pendencias = { antigo: 'bloqueado' };
    localStorage.setItem('__ck_banco__', JSON.stringify(b)); });
  await entrar(page, 'ana');
  ok(await page.isVisible('[data-ir="painel"]') && !(await page.isVisible('[data-ir="cadastros"]')), 'gestor vê Painel, não vê Cadastros');
  await page.click('[data-ir="painel"]');
  await page.waitForSelector('[data-abrir]');
  ok(await page.$$eval('#pLista .item', l => l.length) === 2, 'painel mostra os 2 checklists de hoje');
  ok((await page.textContent('#pLista')).includes('não visualizado'), 'painel marca o que ainda não foi visualizado');
  const frota = await page.textContent('#pFrota');
  const g = await grupos(page);
  ok(g.perigo.join() === 'CB-12' && g.ok.join() === 'ESC-03 1 NC' && !/restri/i.test(frota),
    'situação da frota: só Em manutenção (CB-12) e Operando (ESC-03, marcado com 1 não conforme); sem "restrição"');
  ok(g.sem.join() === 'PC-09 parado', 'equipamento sem checklist hoje NÃO conta como Operando: fica em "Sem checklist hoje"');
  await shot(page, '06-painel');
  ok(await page.$eval('#pFrota .chip-eq.perigo-borda', b => b.dataset.abrir === 'antigo'), 'hoje sem checklist, mas parado desde outro dia: destaca e abre o checklist que parou');
  ok(!(await page.$('[data-d]')) && await page.isVisible('#pDia'), 'escolhe o dia (sem "7 dias" / "30 dias")');
  const tres = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 3); return diaDe(d.getTime()); });
  await page.fill('#pDia', tres);
  await page.waitForFunction(() => document.querySelectorAll('#pLista .item').length === 1);
  const frota3 = await page.textContent('#pFrota');
  const g3 = await grupos(page);
  ok(frota3.includes(tres.split('-').reverse().join('/')) && g3.perigo.join() === 'PC-09'
    && g3.sem.length === 2 && g3.ok.length === 0 && frota3.includes('Sem checklist no dia') && (await page.textContent('#pLista')).includes('PC-09'),
    'dia escolhido: só os checklists e a situação daquele dia');
  await shot(page, '06b-painel-dia');
  await page.click('[data-passo="-1"]');
  await page.waitForSelector('#pLista + .vazio');
  ok(await page.$$eval('#pLista .item', l => l.length) === 0, 'seta ‹ vai para o dia anterior');
  await page.click('[data-passo="0"]');
  await page.waitForFunction(() => document.querySelectorAll('#pLista .item').length === 2);
  ok((await page.textContent('#pFrota .frota-cab')).includes('hoje') && await page.isDisabled('[data-passo="1"]'), 'botão Hoje volta; não passa de hoje');
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
  const ordem = await page.$$eval('.ck-item', l => l.map(e => e.dataset.item));
  ok(ordem[0] === 'i1' && ordem[1] === 'i5' && ordem.length === 18, 'itens em atenção primeiro (crítico, depois observação), os ok depois');
  ok((await page.textContent('#dtVisto')).includes('Ainda não visualizado'), 'detalhe: ainda não visualizado');
  await page.click('#dtMarcarVisto');
  await page.waitForFunction(id => ((JSON.parse(localStorage.getItem('__ck_banco__'))['checklist_inspecoes/' + id].vistos || {})['ana@gp2t,local'] || {}).por === 'Ana Gestora', insp.id);
  ok((await page.textContent('#dtVisto')).includes('Visualizado por Ana Gestora') && !(await page.$('#dtMarcarVisto')),
    'gestora marca como visualizado: grava com nome e hora, e o botão some');
  await shot(page, '07b-visto');
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
  ok(true, 'resolvido o crítico: CB-12 sai de MANUTENÇÃO (o farol fica anotado no checklist)');
  const sit = await page.textContent('#dtSituacao');
  ok(sit.includes('NÃO CONFORME') && sit.includes('1 de 2'), 'detalhe mostra "agora" e 1 de 2 resolvidos');
  await page.waitForFunction(id => { const b = JSON.parse(localStorage.getItem('__ck_banco__')); const d = b['checklist_inspecoes/' + id];
    const f = ((d.resolucoes || {}).i1 || {}).fotos || []; return f.length === 1 && d.midias[f[0]].ok && b['checklist_fotos/' + f[0]]; }, insp.id);
  ok(true, 'foto da correção subiu e ficou ligada ao item');
  await page.waitForFunction(() => document.querySelector('[data-item="i1"] .resolvido img') && document.querySelector('[data-item="i1"] .resolvido img').src.startsWith('data:image/jpeg'));
  ok((await page.textContent('[data-item="i1"] .resolvido')).includes('Pneu trocado'), 'item resolvido mostra nota e foto');
  ok((await page.$$eval('.ck-item', l => l.map(e => e.dataset.item))).slice(0, 2).join() === 'i5,i1', 'resolvido desce: o que ainda está em aberto fica em cima');
  // 1b) solicitação no farol: registra o pedido, o item continua em aberto
  await page.click('[data-solicitar="i5"]');
  await page.click('#slConfirmar');
  ok((await page.textContent('#toast')).includes('Escreva o que foi solicitado'), 'solicitação sem texto não registra');
  await page.fill('#slNota', 'Solicitada a compra da lâmpada do farol');
  await page.click('#slConfirmar');
  await page.waitForSelector('[data-item="i5"] .solicitado');
  ok((await page.textContent('[data-item="i5"] .solicitado')).includes('Solicitada a compra da lâmpada do farol')
    && !!(await page.$('[data-item="i5"] [data-resolver]')) && !(await page.$('[data-item="i5"] .resolvido')),
    'solicitação aparece no item e ele continua em aberto (com "Resolver")');
  const d5s = (await banco(page))['checklist_inspecoes/' + insp.id];
  ok(d5s.solicitacoes.i5.nota === 'Solicitada a compra da lâmpada do farol' && d5s.solicitacoes.i5.por === 'Ana Gestora' && !(d5s.resolucoes || {}).i5,
    'solicitação gravada com nome; não conta como resolvido');
  // PDF do checklist: no computador baixa o arquivo (no celular abre o compartilhar)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dtPdf')]);
  const pdfPath = (SHOTS || require('os').tmpdir()) + '/checklist.pdf';
  await dl.saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath);
  ok(pdf.slice(0, 5).toString() === '%PDF-' && /checklist-CB-12-\d{4}-\d{2}-\d{2}\.pdf/.test(dl.suggestedFilename())
    && pdf.toString('latin1').includes('/Subtype /Image'), 'PDF do checklist gerado, com nome do equipamento e a foto (' + Math.round(pdf.length / 1024) + ' KB)');
  ok((await page.textContent('#dtPdf')).includes('Enviar em PDF') && !(await page.isDisabled('#dtPdf')), 'botão do PDF volta ao normal');
  ok(pdf.toString('latin1').includes('(Buzina)') && pdf.toString('latin1').includes('(Conforme)'), 'PDF traz também os itens OK');
  const zap = await page.evaluate(() => { let u = ''; const o = window.open; window.open = x => { u = x; }; document.querySelector('#dtZap').click(); window.open = o; return decodeURIComponent(u.split('text=')[1] || ''); });
  ok(zap.includes('*Itens OK (16):*') && zap.includes('• Buzina') && !/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(zap) && zap.includes('*Não conformes (2):*'), 'resumo do WhatsApp traz os não conformes e também os itens OK');
  ok(JSON.stringify(await page.evaluate(() => (Object.entries(JSON.parse(localStorage.getItem('__ck_banco__'))).find(([k, d]) => k.startsWith('checklist_equipamentos/') && d.prefixo === 'CB-12')[1].pendencias || {}))) === JSON.stringify({ [insp.id]: 'restricao' }),
    'com solicitação o farol continua em aberto no checklist');
  ok((await page.textContent('#dtSituacao')).includes('1 com solicitação'), 'detalhe avisa "1 com solicitação, aguardando"');
  await shot(page, '14-solicitado');
  // no Painel: marcador e filtro "Solicitado"
  await page.click('#btnVoltar');
  await page.click('[data-f="solicitado"]');
  const solLista = await page.textContent('#pLista');
  ok(await page.$$eval('#pLista .item', l => l.length) === 1 && solLista.includes('CB-12') && solLista.includes('1 solicitado(s)'),
    'Painel: filtro "Solicitado" mostra o CB-12 com "1 solicitado(s)"');
  await page.click('[data-f="todos"]');
  await page.click('#pLista .item:has-text("CB-12")');
  await page.waitForSelector('[data-item="i5"] .solicitado');

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
  ok(true, 'reabrir o farol: volta a ficar em aberto');
  await page.click('[data-resolver="i5"]');
  await page.fill('#rsNota', 'Lâmpada trocada');
  await page.click('#rsConfirmar');
  await page.waitForFunction(() => Object.keys((Object.entries(JSON.parse(localStorage.getItem('__ck_banco__'))).find(([k, d]) => k.startsWith('checklist_equipamentos/') && d.prefixo === 'CB-12')[1].pendencias || {})).length === 0);
  ok(!(await page.evaluate(id => Historico.lista().some(x => x.id === id), insp.id)),
    'o Início da gestora não mostra o checklist do motorista (lista é de cada pessoa)');
  ok((await page.textContent('[data-item="i5"] .resolvido')).includes('Antes: solicitado'), 'resolvido guarda a solicitação no histórico do item');
  const b5 = await banco(page);
  const d5 = b5['checklist_inspecoes/' + insp.id];
  ok(d5.resolucoes.i1.nota === 'Pneu trocado' && d5.resolucoes.i1.por === 'Ana Gestora' && d5.resolucoes.i5.nota === 'Lâmpada trocada'
    && d5.tratativa.status === 'resolvido', 'resolução por item gravada com nota e nome; tratativa resolvida');
  await page.click('#btnVoltar');
  await page.click('[data-f="todos"]');
  await page.waitForFunction(() => [...document.querySelectorAll('#pFrota .grupo-frota.ok .chip-eq')].some(b => b.textContent.trim() === 'CB-12'));
  const g9 = await grupos(page);
  ok(g9.sem.join() === 'PC-09 parado', 'resolvido o CB-12: Operando e o PC-09 continua sem checklist');
  ok(g9.perigo.length === 0, 'resolvido sai de "Em manutenção" no Painel');
  await page.click('[data-f="bloqueado"]');
  ok((await page.textContent('#pFiltro')).includes('Manutenção') && !(await page.textContent('#app')).includes('Bloquead'),
    'filtro "Manutenção" (não aparece mais "Bloqueado")');
  ok(await page.$$eval('#pLista .item', l => l.length) === 0, 'resolvido sai da aba Manutenção');
  await page.click('[data-f="liberado"]');
  ok((await page.textContent('#pFiltro')).includes('Operando') && !(await page.textContent('#pFiltro')).includes('Liberad'),
    'aba "Liberados" agora se chama "Operando"');
  const operando = await page.textContent('#pLista');
  ok(operando.includes('CB-12') && operando.includes('era manutenção') && operando.includes('resolvido'), 'resolvido aparece na aba Operando (com o que era)');
  ok((await page.$$eval('.kpi', k => k.map(x => x.textContent.replace(/\s+/g, ' ').trim()))).join('|').includes("2operando"),
    'contador "operando": CB-12 resolvido + ESC-03 (não conforme que não obriga parada)');
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
  ok(Object.keys(await pendencias(page, 'ESC-03')).length === 0, 'apagar o checklist tira a pendência do ESC-03');
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
  await page.waitForSelector('[data-md]');
  const lista = await page.textContent('#app');
  ok(lista.includes('Máquina — checklist de segurança (22 itens)') && lista.includes('Caminhão — diário'), 'modelos padrão aparecem, incluindo o de 22 itens');
  // padrão apagado some (e não volta)
  await page.click('[data-md="padrao-maquina"]');
  await page.click('#mdApagar'); await page.click('#mdlOk');
  await page.waitForFunction(() => !document.querySelector('[data-md="padrao-maquina"]'));
  ok((await banco(page))['checklist_modelos/padrao-maquina'].removido === true, 'apagar um padrão marca como removido e ele some da lista');
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
  await page.waitForSelector('.resultado');
  ok((await page.textContent('.resultado h2')).includes('NÃO CONFORME'), 'defeito em item que não obriga parada = checklist NÃO CONFORME (segue operando)');
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('__ck_banco__')))
    .some(d => d.prefixo === 'CB-12' && Object.values(d.pendencias || {}).join() === 'restricao'));
  ok(await page.evaluate(() => situacaoDe(Estado.equipamentos.find(e => e.prefixo === 'CB-12'))) === 'operacional', 'CB-12 segue Operando (o não conforme fica no checklist)');
  await shot(page, '08-modelos');

  console.log('7. Início: os MEUS checklists, inclusive de outro celular; apagado some');
  await page.click('[data-ir="inicio"]');
  const hist = await page.evaluate(() => Historico.lista().filter(x => x.enviado).map(x => x.id));
  ok(hist.length >= 1, 'Início do admin tem ' + hist.length + ' checklist(s) dele');
  // um checklist do jean feito em OUTRO celular (só existe no servidor)
  await page.evaluate(() => { const b = JSON.parse(localStorage.getItem('__ck_banco__'));
    b['checklist_inspecoes/outroCel'] = { criadoPor: 'jean@gp2t.local', criadoNome: 'Jean', criadoEm: Date.now() - 60000,
      resultado: 'bloqueado', defeitos: 1, equipamento: { prefixo: 'XX-01' }, tratativa: { status: 'aberto' },
      itens: [{ id: 'i1', texto: 'Pneus', critico: true, st: 'nok', obs: 'furado' }],
      vistos: { 'ana@gp2t,local': { por: 'Ana Gestora', em: Date.now() - 30000 } } };
    localStorage.setItem('__ck_banco__', JSON.stringify(b)); });
  await page.reload();
  await page.waitForSelector('#btnNovo');
  await page.waitForFunction(() => Historico.lista().some(x => x.id === 'outroCel'));
  await page.waitForFunction(() => document.querySelector('#app').textContent.includes('XX-01'));
  ok(true, 'checklist que ele fez em outro celular aparece no Início');
  ok((await page.textContent('#app')).includes('Visto por Ana Gestora'), 'quem fez vê no Início que a gestão visualizou');
  // "outro celular" apaga direto no servidor
  await page.evaluate(() => { const b = JSON.parse(localStorage.getItem('__ck_banco__')); delete b['checklist_inspecoes/outroCel'];
    localStorage.setItem('__ck_banco__', JSON.stringify(b)); });
  await page.reload();
  await page.waitForSelector('#btnNovo');
  await page.waitForFunction(() => !Historico.lista().some(x => x.id === 'outroCel'));
  const resto = await page.evaluate(() => Historico.lista().map(x => x.id));
  ok(hist.every(id => resto.includes(id)) && !resto.includes('outroCel'), 'ao abrir, o apagado sumiu e os outros ficaram');

  console.log('8. resolvido em OUTRO celular: o Início mostra Operando');
  const ultimo = await page.evaluate(() => Historico.lista().find(x => x.enviado && x.resultado !== 'liberado' && !x.resolvido));
  ok(!!ultimo, 'há um checklist com não conforme ainda aberto no Início (' + (ultimo && ultimo.resultado) + ')');
  ok((await page.textContent('#app')).includes((ultimo.resultado === 'bloqueado' ? 'MANUTENÇÃO' : 'NÃO CONFORME')),
    'antes: Início mostra o resultado do checklist');
  await page.evaluate(id => { const b = JSON.parse(localStorage.getItem('__ck_banco__'));
    b['checklist_inspecoes/' + id].tratativa = { status: 'resolvido', por: 'Ana Gestora', em: Date.now() };
    localStorage.setItem('__ck_banco__', JSON.stringify(b)); }, ultimo.id);
  await page.reload();
  await page.waitForSelector('#btnNovo');
  await page.waitForFunction(id => (Historico.lista().find(x => x.id === id) || {}).resolvido === true, ultimo.id);
  await page.waitForFunction(() => document.querySelector('#app').textContent.includes('resolvido'));
  const itemTxt = await page.$$eval('#app .item', l => l.map(e => e.textContent.replace(/\s+/g, ' ')).join(' | '));
  ok(!/MANUTENÇÃO|NÃO CONFORME/.test(itemTxt) && itemTxt.includes('OPERANDO'),
    'depois de resolvido: Início mostra OPERANDO (com o que era)');
  await shot(page, '11-inicio-operando');

  console.log('9. caminhão sem modelo escolhido usa o FO.09.STR.018 (veículos pesados)');
  await page.click('[data-ir="novo"]');
  await page.click('#avulso summary');
  await page.fill('#avPlaca', 'TR-77');
  await page.selectOption('#avTipo', 'caminhao');
  await page.click('#avIr');
  await page.waitForSelector('.ck-item');
  const tx = await page.$$eval('.ck-item .ck-txt', l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(tx.length === 18 && tx[0].includes('Condição do condutor, CNH e treinamentos válidos')
    && tx[3].includes('Cinto de segurança para todos os ocupantes do veículo')
    && tx[17].includes('Dispositivo de controle de ruído do escapamento e emissão de fumaça preta'),
    'checklist de veículos pesados: 18 itens iguais à folha');
  ok((await page.textContent('#subtitulo')).includes('FO.09.STR.018'), 'nome do modelo com o código do formulário');
  ok(await page.$$eval('.ck-item .critico', l => l.length) === 6, '6 itens críticos (condutor, extintor, cinto, pneus, buzina/ré, faróis/freio/ré)');
  // foto da galeria (sem forçar a câmera)
  ok(await page.$eval('#inGaleria', e => !e.hasAttribute('capture')) && await page.$eval('#inFoto', e => e.getAttribute('capture') === 'environment'),
    'botão 🖼️ abre a galeria (sem capture); 📷 continua na câmera');
  page.once('filechooser', async fc => fc.setFiles(await foto(page)));
  await page.click('.ck-item:nth-child(1) [data-galeria]');
  await page.waitForSelector('.ck-item:nth-child(1) .mini-midia img[src^="blob:"]');
  ok(await page.evaluate(() => Object.values(Estado.rascunho.midias).some(m => m.origem === 'galeria')), 'foto da galeria entra no item, marcada como "galeria"');
  await page.click('[data-ir="inicio"]');
  await page.click('#btnDescartar'); await page.click('#mdlOk');
  await page.waitForFunction(() => !document.querySelector('#btnContinuar'));

  console.log('10. instalar o aplicativo');
  ok(!(await page.$('#btnInstalar')), 'sem oferta do navegador, não mostra o botão no Início');
  await page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__pediuInstalar = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await page.waitForSelector('#btnInstalar');
  ok((await page.textContent('.instalar')).includes('Baixe o aplicativo'), 'celular oferece instalar: aparece "📲 Instalar o app" no Início');
  await page.click('#btnInstalar');
  await page.waitForFunction(() => window.__pediuInstalar === true);
  ok(true, 'o botão abre a janela de instalação do celular');
  await page.click('[data-ir="conta"]');
  ok((await page.textContent('.instalar')).includes('Instalar app'), 'Conta mostra como instalar pelo menu ⋮');
  const man = await page.evaluate(async () => { const m = await (await fetch('manifest.json')).json();
    const st = await Promise.all(m.icons.map(i => fetch(i.src).then(r => i.sizes + ':' + r.status))); return { m, st }; });
  ok(man.m.icons.some(i => i.sizes === '192x192') && man.m.icons.some(i => i.sizes === '512x512') && man.m.icons.some(i => i.purpose === 'maskable')
    && man.st.every(x => x.endsWith(':200')), 'manifesto com ícones 192/512/maskable e todos existem (' + man.st.join(', ') + ')');
  await page.click('[data-ir="inicio"]');

  console.log('11. cada motorista vê só os seus; motorista não cadastra equipamento');
  await sair(page);
  await entrar(page, 'beto');
  await page.waitForFunction(() => Historico._sincronizadoEm > 0);
  await page.waitForTimeout(200);
  ok((await page.textContent('#app')).includes('Nenhum checklist') && (await page.evaluate(() => Historico.lista().length)) === 0,
    'operador no mesmo celular: Início vazio (não vê os checklists dos outros)');
  await page.click('[data-ir="novo"]');
  await page.waitForSelector('.equip');
  ok(!(await page.$('#avulso')) && !(await page.$('#avIr')), 'operador não tem "Equipamento não está na lista?" (não cadastra)');
  await page.click('[data-ir="inicio"]');
  await sair(page);
  await entrar(page, 'ze');
  await page.waitForFunction(() => Historico.lista().length > 0);
  const zeHist = await page.evaluate(() => Historico.lista().map(x => x.equip).join(' | '));
  ok(zeHist.includes('CB-12') && !zeHist.includes('TR-77') && !zeHist.includes('XX-01'), 'o motorista vê só os dele (' + zeHist + ')');
  await page.click('[data-ir="novo"]');
  await page.waitForSelector('.equip');
  ok(!(await page.$('#avulso')), 'motorista também não tem a opção de equipamento à mão');
  await page.click('[data-ir="inicio"]');
  await sair(page);
  await entrar(page, 'jean');

  console.log('12. atualização automática em todos os aparelhos');
  // no meio de um checklist: espera
  await page.click('[data-ir="novo"]');
  await page.click('.equip:has-text("CB-12")');
  await page.waitForSelector('.ck-item');
  await page.evaluate(() => { window.__semRecarregar = 1; Atualizacao.chegou(); });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__semRecarregar === 1 && Atualizacao.pendente === true), 'versão nova no meio do checklist: espera (não recarrega)');
  // saiu do checklist: recarrega sozinho; o rascunho continua salvo
  await Promise.all([page.waitForEvent('load'), page.click('[data-ir="inicio"]')]);
  await page.waitForSelector('#btnContinuar');
  ok(await page.evaluate(() => window.__semRecarregar === undefined), 'ao sair do checklist o app recarregou sozinho e o rascunho continuou salvo');
  await page.click('#btnDescartar'); await page.click('#mdlOk');
  await page.waitForFunction(() => !document.querySelector('#btnContinuar'));
  // no Início: recarrega na hora e avisa
  await page.evaluate(() => { try { sessionStorage.setItem('__teste', '1'); } catch (e) {} });
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => { Atualizacao._antes = VERSAO; Atualizacao.chegou(); })]);
  await page.waitForSelector('#btnNovo');
  await page.evaluate(() => { sessionStorage.setItem('ck_atualizado_de', 'ck0'); });
  await page.reload(); await page.waitForSelector('#btnNovo');
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('App atualizado'));
  ok(true, 'no Início atualiza na hora e mostra "App atualizado ✔ versão …"');

  ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(255, 255, 255)',
    'fundo branco mesmo com o celular em modo escuro');
  ok(contrasteRuim.length === 0, 'contraste ≥ 4,5:1 em todas as telas fotografadas' + (contrasteRuim.length ? ': ' + contrasteRuim.join(' | ') : ''));
  ok(nativas.length === 0, 'nenhuma janela do navegador (confirm/alert)' + (nativas.length ? ': ' + nativas.join(' | ') : ''));
  ok(!comEmoji.length, 'nenhum emoji nas telas' + (comEmoji.length ? ': ' + comEmoji.join(' | ') : ''));
  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
