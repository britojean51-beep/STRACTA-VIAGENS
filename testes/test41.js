/* r47 — a aba Solicitações na planilha */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
const STUB = fs.readFileSync(__dirname + '/fetchstub.js', 'utf8');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const log = [], errors = [];
  const ok = (n, c, extra) => { const l = (c ? '  OK  ' : ' FALHA ') + n + (extra !== undefined ? ' → ' + extra : ''); log.push(l); console.log(l); };
  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));
  const c = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await ligar(p); await p.addInitScript(SDK); await p.addInitScript(STUB);
  await p.goto('http://localhost:8130/index.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#btnEntrar');
  await p.fill('#loginEmail', 'jean'); await p.fill('#loginSenha', '123456');
  await p.click('#btnEntrar'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });

  await p.evaluate(() => {
    DB.setConfig({ sheetsUrl: 'https://script.google.com/macros/s/FAKE/exec' });
    DB.addSolicitacao({ equipamento: 'CB-17', parte: 'Motor',
      descricao: 'Perdendo força e soltando fumaça preta',
      fotos: ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'],
      nFotos: 2, miniatura: 'data:image/jpeg;base64,MMM' });
    DB.addSolicitacao({ equipamento: 'PC-01', parte: 'Hidráulico',
      descricao: 'Vazando óleo no cilindro', fotos: [], nFotos: 0, miniatura: '' });
    window.__ENVIOS__ = [];
    Sync.pushSolicitacoes();
  });
  await p.waitForTimeout(1500);

  const envios = await p.evaluate(() => window.__ENVIOS__);
  const linhas = envios.filter(e => e.kind === 'solicitacao').flatMap(e => e.rows || []);
  ok('manda a aba de solicitações', linhas.length === 2, linhas.length + ' linha(s)');
  const cb = linhas.find(r => r.Equipamento === 'CB-17');
  ok('leva parte, problema e situação',
     cb && cb.Parte === 'Motor' && cb['Situação'] === 'Pendente' && /fumaça/.test(cb.Problema),
     JSON.stringify(cb && { p: cb.Parte, s: cb['Situação'] }));
  ok('leva quantas fotos, e NÃO a foto', cb && cb.Fotos === 2 && !JSON.stringify(cb).includes('base64'),
     'Fotos=' + (cb && cb.Fotos));
  ok('diz quem abriu', cb && cb['Aberta por'] === 'jean', cb && cb['Aberta por']);

  // conclusão vai junto ao marcar realizado
  await p.evaluate(() => {
    const id = DB.solicitacoesLista().find(x => x.equipamento === 'PC-01').id;
    DB.atualizarSolicitacao(id, { situacao: 'Realizado', conclusao: 'Trocada a mangueira' });
    window.__ENVIOS__ = []; Sync.pushSolicitacoes();
  });
  await p.waitForTimeout(1200);
  const pc = (await p.evaluate(() => window.__ENVIOS__))
    .filter(e => e.kind === 'solicitacao').flatMap(e => e.rows || [])
    .find(r => r.Equipamento === 'PC-01');
  ok('a conclusão vai para a planilha',
     pc && pc['Situação'] === 'Realizado' && pc['O que foi feito'] === 'Trocada a mangueira',
     JSON.stringify(pc && { s: pc['Situação'], f: pc['O que foi feito'] }));

  const todos = await p.evaluate(() => window.__TODOS__);
  fs.writeFileSync(__dirname + '/payloads.json', JSON.stringify(todos, null, 1));
  ok('guardou os envios para rodar no Codigo.gs', todos.length > 0, todos.length + ' envios');

  console.log('=== FALHAS: ' + log.filter(l => l.startsWith(' FALHA')).length + ' ===');
  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load/.test(e));
  console.log('=== ERROS JS REAIS: ' + reais.length + ' ===');
  await b.close();
})();
