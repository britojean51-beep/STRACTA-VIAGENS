/* r56 — o peso TOTAL da rota é digitado, não mais derivado de peso × viagens.
   O risco da mudança é multiplicar duas vezes: digitar 450 t e a tonelagem do dia
   virar 6.750 t. É esse assert que importa aqui. */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
const STUB = fs.readFileSync(__dirname + '/fetchstub.js', 'utf8');
const URL = 'http://localhost:8130/index.html';

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = []; let falhas = 0;
  const ok = (n, c, extra) => { if (!c) falhas++;
    console.log((c ? '  OK  ' : ' FALHA ') + n + (extra !== undefined ? ' → ' + extra : '')); };
  const perto = (a, b) => Math.abs(a - b) < 0.05;

  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));
  const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await ligar(p); await p.addInitScript(SDK); await p.addInitScript(STUB);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#btnEntrar');
  await p.fill('#loginEmail', 'jean'); await p.fill('#loginSenha', '123456');
  await p.click('#btnEntrar'); await p.waitForTimeout(1300);
  await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });
  const hoje = await p.evaluate(() => DB.hojeISO());

  const rota = async (eq, orig, dest, qtd, peso) => {
    await p.evaluate(() => navegar('viagens')); await p.waitForTimeout(500);
    await p.fill('#vEquip', eq); await p.dispatchEvent('#vEquip', 'change'); await p.waitForTimeout(250);
    await p.evaluate(() => { $('#vMot').value = 'Saulo'; });
    await p.fill('#vOrig', orig); await p.fill('#vDest', dest); await p.fill('#vQtd', String(qtd));
    if (peso !== null) await p.fill('#vPeso', peso);
    await p.click('#btnAdd'); await p.waitForTimeout(400);
  };

  /* ---- 1. o rótulo mudou ---- */
  await p.evaluate(() => navegar('viagens')); await p.waitForTimeout(500);
  const rotulo = await p.evaluate(() => document.getElementById('app').innerText);
  ok('o campo agora é "Peso total da rota"', /Peso total da rota/.test(rotulo),
     (rotulo.match(/Peso.*\(t\)/) || ['não achei'])[0]);
  ok('e o "Peso por viagem" saiu da tela', !/Peso por viagem/.test(rotulo));

  /* ---- 2. a dica mostra a média por viagem ---- */
  await p.fill('#vQtd', '15'); await p.fill('#vPeso', '450');
  await p.waitForTimeout(300);
  const dica = await p.evaluate(() => {
    const el = document.getElementById('vPesoTotal');
    return { visivel: el.style.display !== 'none', txt: el.innerText };
  });
  ok('a dica mostra 450 t em 15 viagens = 30 t por viagem',
     dica.visivel && /30,0 t/.test(dica.txt) && /por viagem/.test(dica.txt), dica.txt);

  /* ---- 3. grava o total digitado, e NÃO multiplica ---- */
  await p.evaluate(() => { $('#vOrig').value = ''; $('#vDest').value = ''; $('#vQtd').value = ''; $('#vPeso').value = ''; });
  await rota('CB-17', '01', '02', 15, '450');
  await p.click('#btnSalvar'); await p.waitForTimeout(900);
  const v1 = await p.evaluate(d => (DB.getDia(d).viagens || [])[0], hoje);
  ok('grava pesoTotal = 450', perto(DB_toN(v1.pesoTotal), 450), v1.pesoTotal);
  ok('e NÃO grava pesoViagem', v1.pesoViagem === undefined, JSON.stringify(v1.pesoViagem));
  const ton = await p.evaluate(([e, d]) => DB.tonEquipDia(e, d), ['CB-17', hoje]);
  ok('a tonelagem do dia é 450 t — e não 450 × 15 = 6.750', perto(ton, 450), ton + ' t');

  /* ---- 4. o L/ton usa o total digitado ---- */
  await p.evaluate(([e, d]) => {
    DB.setTipoEquip(e, 'km_horimetro');
    DB.addAbastecimento(d, { equipamento: e, motorista: 'Saulo', hora: '08:00',
      horimetroInicial: 1000, horimetroFinal: 1008, horasTrabalhadas: '8,0',
      kmInicial: 0, kmFinal: 300, kmRodado: 300, litros: 90, combustivel: 'S-10',
      litrosArla: 0, media: '3,33', unidadeMedia: 'km/L', situacao: 'Operando' });
  }, ['CB-17', hoje]);
  await p.waitForTimeout(400);
  const lton = await p.evaluate(([e, d]) => DB.ltonEquipDia(e, d), ['CB-17', hoje]);
  ok('o L/ton usa o total digitado (90 L ÷ 450 t = 0,20)', perto(lton, 0.2), lton);

  /* ---- 5. "1.200" é mil e duzentos (o bug do r51 num campo que mudou) ---- */
  await rota('CB-22', '03', '04', 10, '1.200');
  await p.click('#btnSalvar'); await p.waitForTimeout(900);
  const t22 = await p.evaluate(([e, d]) => DB.tonEquipDia(e, d), ['CB-22', hoje]);
  ok('"1.200" no peso vira 1.200 t, não 1,2 t', perto(t22, 1200), t22 + ' t');

  /* ---- 6. rota sem peso continua podendo ser lançada ---- */
  await rota('CB-11', '05', '06', 8, null);
  await p.click('#btnSalvar'); await p.waitForTimeout(900);
  const semPeso = await p.evaluate(([d]) => (DB.getDia(d).viagens || []).find(v => v.equipamento === 'CB-11'), [hoje]);
  ok('rota sem peso é lançada, com pesoTotal nulo', !!semPeso && !semPeso.pesoTotal,
     JSON.stringify(semPeso && semPeso.pesoTotal));
  const t11 = await p.evaluate(([e, d]) => DB.tonEquipDia(e, d), ['CB-11', hoje]);
  ok('e a tonelagem dela não quebra', t11 === 0, t11);

  /* ---- 7. ROTA ANTIGA, gravada com pesoViagem, continua certa ---- */
  await p.evaluate(d => {
    DB.addViagem(d, { equipamento: 'RD-01', motorista: 'José', origem: '07', destino: '08',
      quantidade: 12, material: 'Estéril', pesoViagem: 25, pesoTotal: 300 });
  }, hoje);
  await p.waitForTimeout(400);
  const tAntiga = await p.evaluate(([e, d]) => DB.tonEquipDia(e, d), ['RD-01', hoje]);
  ok('rota antiga (com pesoViagem) continua valendo 300 t', perto(tAntiga, 300), tAntiga + ' t');
  await p.evaluate(() => navegar('viagens')); await p.waitForTimeout(700);
  const naLista = await p.evaluate(() => document.getElementById('app').innerText);
  ok('e aparece na lista do dia com as 300 t', /300 t/.test(naLista),
     (naLista.match(/RD-01[\s\S]{0,70}/) || [''])[0].replace(/\n/g, ' '));

  /* ---- 8. relatório, folha e Índice contam a mesma coisa ---- */
  const conf = await p.evaluate(d => {
    const r = DB.resumoDia(d);
    const folha = dadosDaFolha([d], 'R');
    const achar = rot => (folha.totais.find(t => t.rot === rot) || {}).val;
    return { db: r.toneladas, folha: achar('PRODUÇÃO'),
             texto: (gerarRelatorioTexto(d).match(/Peso Transportado:.*/) || [''])[0],
             viagFolha: folha.viag.length };
  }, hoje);
  ok('a produção da folha bate com o resumoDia',
     conf.folha === (await p.evaluate(n => fmt(n), conf.db)), conf.folha + ' vs ' + conf.db);
  ok('e o relatório de texto traz o peso transportado', /\d/.test(conf.texto), conf.texto || 'sem linha');
  ok('as viagens aparecem detalhadas na folha', conf.viagFolha >= 3, conf.viagFolha);

  /* ---- 9. a planilha, rodando o Codigo.gs de verdade ---- */
  const envios = await p.evaluate(() => window.__TODOS__);
  fs.writeFileSync(__dirname + '/payloads.json', JSON.stringify(envios));
  const { execSync } = require('child_process');
  const saida = execSync('/opt/node22/bin/node ' + __dirname + '/simgs.js Viagens', { encoding: 'utf8' });
  const cab = saida.split('\n').find(l => l.includes('Peso')) || '';
  const linha17 = saida.split('\n').find(l => l.includes('CB-17')) || '';
  ok('a aba Viagens sai com o peso total certo', /\b450\b/.test(linha17), linha17.trim());
  ok('e a coluna de peso por viagem vai vazia', /Peso\/viagem/.test(cab), cab.trim().slice(0, 110));

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);

  function DB_toN(v) { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
})();
