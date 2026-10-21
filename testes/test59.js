/* r58 — a tonelagem para de arredondar.
   fmt(x) sem casa decimal arredondava: 450,5 t virava 451 t na tela E na planilha.
   O valor gravado sempre esteve certo; só a exibição mentia. */
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

  /* ---- 1. o formatador ---- */
  const f = await p.evaluate(() => ({
    redondo: DB.fmtT(450), meio: DB.fmtT(450.5), cent: DB.fmtT(450.45),
    milhar: DB.fmtT(3120.5), grande: DB.fmtT(68432.75),
    zero: DB.fmtT(0), vazio: DB.fmtT(''), ptbr: DB.fmtT('1.200,5'), tres: DB.fmtT(450.456)
  }));
  ok('450 → "450" (sem ,00 — a correção não pode virar outro incômodo)', f.redondo === '450', f.redondo);
  ok('450,5 → "450,5"', f.meio === '450,5', f.meio);
  ok('450,45 → "450,45" (a segunda casa, que uma casa só perderia)', f.cent === '450,45', f.cent);
  ok('3120,5 → "3.120,5" (milhar junto)', f.milhar === '3.120,5', f.milhar);
  ok('68432,75 → "68.432,75"', f.grande === '68.432,75', f.grande);
  ok('zero e vazio não quebram', f.zero === '0' && f.vazio === '0', f.zero + ' / ' + f.vazio);
  ok('"1.200,5" digitado é mil e duzentos e meio', f.ptbr === '1.200,5', f.ptbr);

  /* ---- 2. lançar 450,5 t e ver 450,5 em TODA saída ---- */
  await p.evaluate(() => navegar('abastecimento')); await p.waitForTimeout(500);
  await p.fill('#fEquip', 'PC-01'); await p.dispatchEvent('#fEquip', 'change'); await p.waitForTimeout(350);
  await p.evaluate(() => { DB.setTipoEquip('PC-01', 'horimetro'); $('#fMot').value = 'Carlos'; });
  await p.fill('#fHoriFim', '5009'); await p.fill('#fLitros', '210');
  await p.fill('#fTon', '450,5');
  await p.click('#btnSalvar'); await p.waitForTimeout(1000);

  const gravado = await p.evaluate(d => {
    const a = ((DB.getDia(d) || {}).abastecimentos || [])[0];
    return a ? a.toneladas : 'NÃO SALVOU';
  }, hoje);
  ok('o valor gravado é 450,5 (sempre foi — nada de conversão)', gravado === 450.5, gravado);
  if (gravado === 'NÃO SALVOU') { console.log('  (o lançamento não salvou — o resto do teste não vale)'); }

  const saidas = await p.evaluate(d => {
    const texto = gerarRelatorioTexto(d);
    const folha = dadosDaFolha([d], 'RELATÓRIO DIÁRIO');
    const prod = (folha.totais.find(t => t.rot === 'PRODUÇÃO') || {}).val;
    window.print = () => {}; gerarPDF([d], 'RELATÓRIO DIÁRIO', texto);
    return { texto: (texto.match(/Produção:.*/) || [''])[0],
             folha: prod,
             pdf: (document.getElementById('printArea') || {}).innerText || '',
             fichaPC: (() => { fichaEquip = 'PC-01'; return DB.fichaEquipamento('PC-01').totToneladas; })() };
  }, hoje);
  ok('relatório de texto mostra 450,5', /450,5/.test(saidas.texto), saidas.texto);
  ok('folha de imagem mostra 450,5', saidas.folha === '450,5', saidas.folha);
  ok('PDF mostra 450,5', /450,5/.test(saidas.pdf), (saidas.pdf.match(/Produção:.*/) || [''])[0]);
  ok('a ficha guarda 450,5', saidas.fichaPC === 450.5, saidas.fichaPC);

  await p.evaluate(() => navegar('dashboard')); await p.waitForTimeout(900);
  const indice = await p.evaluate(() => document.getElementById('app').innerText);
  ok('Índice mostra 450,5 e não 451', /450,5/.test(indice) && !/\b451\b/.test(indice),
     (indice.match(/Produção[\s\S]{0,22}/) || [''])[0].replace(/\n/g, ' '));
  await p.evaluate(() => abrirFicha('PC-01')); await p.waitForTimeout(800);
  const ficha = await p.evaluate(() => document.getElementById('app').innerText);
  ok('ficha mostra 450,5', /450,5/.test(ficha), (ficha.match(/Produção[\s\S]{0,22}/) || [''])[0].replace(/\n/g, ' '));

  /* ---- 3. a segunda casa, que hoje era perdida inteira ---- */
  await p.evaluate(() => navegar('abastecimento')); await p.waitForTimeout(500);
  await p.fill('#fEquip', 'MG-01'); await p.dispatchEvent('#fEquip', 'change'); await p.waitForTimeout(350);
  await p.evaluate(() => { DB.setTipoEquip('MG-01', 'horimetro'); $('#fMot').value = 'Marcos'; });
  await p.fill('#fHoriFim', '3008'); await p.fill('#fLitros', '164');
  await p.fill('#fTon', '450,45');
  await p.click('#btnSalvar'); await p.waitForTimeout(1000);
  const cent = await p.evaluate(d => {
    const t = DB.tonEquipDia('MG-01', d);
    return { valor: t, texto: fmtT(t) };
  }, hoje);
  ok('450,45 t aparece como 450,45 (hoje virava 450)',
     cent.valor === 450.45 && cent.texto === '450,45', JSON.stringify(cent));

  /* ---- 4. o peso total da rota (r56) também para de arredondar ---- */
  await p.evaluate(() => navegar('viagens')); await p.waitForTimeout(500);
  await p.fill('#vEquip', 'CB-17'); await p.dispatchEvent('#vEquip', 'change'); await p.waitForTimeout(250);
  await p.evaluate(() => { $('#vMot').value = 'Saulo'; });
  await p.fill('#vOrig', '01'); await p.fill('#vDest', '02'); await p.fill('#vQtd', '15');
  await p.fill('#vPeso', '452,5');
  await p.click('#btnAdd'); await p.waitForTimeout(400);
  await p.click('#btnSalvar'); await p.waitForTimeout(900);
  const pesoRota = await p.evaluate(d => ({ valor: DB.tonEquipDia('CB-17', d),
    naLista: document.getElementById('app').innerText }), hoje);
  ok('o peso total da rota mostra 452,5 e não 453',
     pesoRota.valor === 452.5 && /452,5/.test(pesoRota.naLista),
     pesoRota.valor + ' · ' + ((pesoRota.naLista.match(/452[,.]?\d*/) || [''])[0]));

  /* ---- 5. lançamento ANTIGO: o dado sempre esteve certo ---- */
  await p.evaluate(d => {
    DB.addAbastecimento(d, { equipamento: 'RD-01', motorista: 'Marcos', hora: '09:00',
      horimetroInicial: 100, horimetroFinal: 107, horasTrabalhadas: '7,0',
      kmInicial: null, kmFinal: null, kmRodado: 0, litros: 80, combustivel: 'S-10',
      litrosArla: 0, media: '11,43', unidadeMedia: 'L/h', situacao: 'Operando',
      toneladas: 318.25 });   // gravado antes do r58, com a casa decimal intacta
  }, hoje);
  // o lançamento foi direto no DB, então o resumo da planilha precisa ser reenviado
  await p.evaluate(d => Sync.pushResumoDia(d), hoje);
  await p.waitForTimeout(700);
  const antigo = await p.evaluate(d => fmtT(DB.tonEquipDia('RD-01', d)), hoje);
  ok('lançamento antigo passa a aparecer com a casa que sempre teve', antigo === '318,25', antigo);

  /* ---- 6. a planilha: 2 casas, e a soma do mês fechando ---- */
  const envios = await p.evaluate(() => window.__TODOS__);
  fs.writeFileSync(__dirname + '/payloads.json', JSON.stringify(envios));
  const { execSync } = require('child_process');
  const resumo = execSync('/opt/node22/bin/node ' + __dirname + '/simgs.js "Resumo por Dia"', { encoding: 'utf8' });
  const linha = resumo.split('\n').find(l => /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}/.test(l)) || '';
  /* O Apps Script converte a string pt-BR em NÚMERO de verdade (numeroSePuder),
     então a célula sai 1353.45 e não "1353,45" — é o certo para uma planilha.
     O que importa é a casa decimal ter sobrevivido: antes saía 1353. */
  const esperado = await p.evaluate(d => DB.resumoDia(d).toneladas, hoje);
  const celulas = linha.split('|').map(x => x.trim());
  ok('a produção chega na planilha com os decimais, e não arredondada',
     celulas.includes(String(esperado)),
     `esperava ${esperado} · linha: ${linha.trim().slice(0, 110)}`);
  ok('e não chega o valor arredondado', !celulas.includes(String(Math.round(esperado))),
     'arredondado seria ' + Math.round(esperado));

  const somas = await p.evaluate(d => {
    const r = DB.resumoDia(d);
    const porEquip = ['PC-01', 'MG-01', 'CB-17', 'RD-01'].reduce((s, e) => s + DB.tonEquipDia(e, d), 0);
    return { resumo: r.toneladas, soma: porEquip };
  }, hoje);
  ok('a soma do dia fecha com a soma por equipamento (sem arredondamento acumulado)',
     Math.abs(somas.resumo - somas.soma) < 0.001,
     `resumo ${somas.resumo} · soma ${somas.soma}`);

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
