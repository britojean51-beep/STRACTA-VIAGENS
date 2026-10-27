/* r60 — o saldo dos tanques no relatório.
   O risco desta entrega não é o número não aparecer: é ele ser CONFUNDIDO com o
   consumo do dia, que já está cinco linhas acima com rótulo quase igual. */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
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
  await ligar(p); await p.addInitScript(SDK);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#btnEntrar');
  await p.fill('#loginEmail', 'jean'); await p.fill('#loginSenha', '123456');
  await p.click('#btnEntrar'); await p.waitForTimeout(1300);
  await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });
  const hoje = await p.evaluate(() => DB.hojeISO());

  /* o dia dele, com os tanques num saldo conhecido e o mínimo em 1000 L.
     O S-500 fica em 900 (abaixo do mínimo) e com consumo, para estar "em uso". */
  await p.evaluate(d => {
    DB.setConfig({ estoqueMin: 1000 });
    DB.setEstoque('s10', 4250); DB.setEstoque('s500', 900); DB.setEstoque('arla', 450);
    DB.setTipoEquip('CB-17', 'km_horimetro');
    DB.addAbastecimento(d, { equipamento: 'CB-17', motorista: 'Saulo', hora: '07:30',
      horimetroInicial: 1000, horimetroFinal: 1008, horasTrabalhadas: '8,0',
      kmInicial: 12000, kmFinal: 12300, kmRodado: 300, litros: 374, combustivel: 'S-10',
      litrosArla: 12, media: '0,80', unidadeMedia: 'km/L', situacao: 'Operando' });
    DB.addAbastecimento(d, { equipamento: 'CB-22', motorista: 'José', hora: '07:00',
      horimetroInicial: 1180, horimetroFinal: 1187, horasTrabalhadas: '7,0',
      kmInicial: 42500, kmFinal: 42800, kmRodado: 300, litros: 98, combustivel: 'S-500',
      litrosArla: 0, media: '3,06', unidadeMedia: 'km/L', situacao: 'Operando' });
  }, hoje);
  await p.waitForTimeout(900);
  /* O saldo é reposto SÓ AGORA, e não junto dos lançamentos: cada lançamento
     desconta do tanque pela nuvem (increment), e esse desconto chega depois.
     Repondo antes, o 4.250 viraria 3.876 na frente do teste. */
  await p.evaluate(() => {
    DB.setEstoque('s10', 4250); DB.setEstoque('s500', 900); DB.setEstoque('arla', 450);
  });
  await p.waitForTimeout(900);
  const conferido = await p.evaluate(() => JSON.parse(JSON.stringify(DB.load().estoque)));
  ok('o saldo de partida é o esperado (senão o resto do teste não vale)',
     conferido.s10 === 4250 && conferido.s500 === 900 && conferido.arla === 450,
     JSON.stringify(conferido));

  const texto = await p.evaluate(d => gerarRelatorioTexto(d), hoje);

  /* ---- 1. o saldo aparece, tanque por tanque ---- */
  [['S-10', /Tanque S-10: 4\.250 L/], ['S-500', /Tanque S-500: 900 L/],
   ['ARLA', /Tanque ARLA 32: 450 L/], ['total diesel', /Total Diesel: 5\.150 L/]].forEach(([n, re]) =>
    ok('texto · saldo do tanque ' + n, re.test(texto), (texto.match(re) || ['FALTOU'])[0]));
  ok('texto · o bloco tem o título que ele pediu',
     /QUANTIDADE DE DIESEL DISPONÍVEL/.test(texto),
     (texto.match(/QUANTIDADE DE.*/) || ['FALTOU'])[0]);

  /* ---- 2. O RISCO: consumo e saldo não podem ser confundidos ---- */
  const consumoS10 = texto.match(/^Diesel S-10: .*/m);
  const saldoS10 = texto.match(/^Tanque S-10: .*/m);
  ok('o CONSUMO do dia continua lá, com o rótulo de sempre',
     consumoS10 && /374 L/.test(consumoS10[0]), consumoS10 ? consumoS10[0] : 'FALTOU');
  ok('e o SALDO vem com a palavra Tanque, que desfaz a confusão',
     saldoS10 && /4\.250 L/.test(saldoS10[0]), saldoS10 ? saldoS10[0] : 'FALTOU');
  ok('os dois números coexistem sem se misturar',
     (texto.match(/^Diesel S-10:/gm) || []).length === 1 &&
     (texto.match(/^Tanque S-10:/gm) || []).length === 1,
     'consumo ' + (texto.match(/^Diesel S-10:/gm) || []).length +
     ' · saldo ' + (texto.match(/^Tanque S-10:/gm) || []).length);

  /* ---- 3. o aviso de mínimo ---- */
  ok('tanque abaixo do mínimo ganha o aviso',
     /Tanque S-500: 900 L\s+\(abaixo do mínimo\)/.test(texto),
     (texto.match(/Tanque S-500:.*/) || ['FALTOU'])[0]);
  ok('tanque acima do mínimo NÃO ganha aviso',
     !/Tanque S-10: 4\.250 L\s+\(abaixo/.test(texto), (texto.match(/Tanque S-10:.*/) || [''])[0]);

  /* ---- 4. tanque zerado e nunca usado não vira alerta falso ---- */
  const semUso = await p.evaluate(() => {
    const antes = DB.load().estoque.s500;
    // zera o S-500 e apaga todo lançamento de S-500: tanque que ele não usa
    DB.setEstoque('s500', 0);
    Object.keys(DB.load().dias).forEach(iso => {
      const d = DB.getDia(iso);
      if (d) d.abastecimentos = (d.abastecimentos || []).filter(a => a.combustivel !== 'S-500');
    });
    DB.save();
    const r = { emUso: DB.tanqueEmUso('s500'), baixos: DB.dieselNoMinimo().map(t => t.tanque) };
    DB.setEstoque('s500', antes);
    return r;
  });
  ok('tanque zerado que ele nunca usou não entra como "abaixo do mínimo"',
     semUso.emUso === false && !semUso.baixos.includes('s500'),
     'em uso: ' + semUso.emUso + ' · baixos: ' + JSON.stringify(semUso.baixos));

  /* ---- 5. o PDF usa o mesmo texto ---- */
  await p.evaluate(d => { window.print = () => {}; gerarPDF([d], 'RELATÓRIO DIÁRIO', gerarRelatorioTexto(d)); }, hoje);
  await p.waitForTimeout(600);
  const pdf = await p.evaluate(() => (document.getElementById('printArea') || {}).innerText || '');
  ok('o PDF traz o saldo dos tanques',
     /Tanque S-10: 4\.250 L/.test(pdf) && /QUANTIDADE DE DIESEL DISPONÍVEL/.test(pdf),
     (pdf.match(/Tanque S-10:.*/) || ['FALTOU'])[0]);

  /* ---- 6. a imagem: a tira, com os números do db.estoque ---- */
  const img = await p.evaluate(d => {
    const dd = dadosDaFolha([d], 'RELATÓRIO DIÁRIO');
    const cv = desenharFolha(dd, 'faixa');
    const e = DB.load().estoque;
    return { tira: dd.tanques, h: cv.height, w: cv.width, estoque: e };
  }, hoje);
  ok('a imagem tem a tira do saldo', !!img.tira, img.tira);
  ok('e os três números batem com o db.estoque',
     img.tira.includes('4.250') && img.tira.includes('900') && img.tira.includes('450'),
     img.tira + ' vs ' + JSON.stringify(img.estoque));
  ok('o tanque baixo é marcado na tira', /S-500 900 L \(baixo\)/.test(img.tira), img.tira);

  /* ---- 7. a compactação do r59 não se perdeu ---- */
  await p.evaluate(d => {
    [['CB-01','Saulo'],['CB-11','Carlos'],['RD-01','Marcos']].forEach(([eq, mot]) => {
      DB.setTipoEquip(eq, 'km_horimetro');
      DB.addAbastecimento(d, { equipamento: eq, motorista: mot, hora: '07:30',
        horimetroInicial: 1000, horimetroFinal: 1008, horasTrabalhadas: '8,0',
        kmInicial: 128000, kmFinal: 128300, kmRodado: 300, litros: 120.5, combustivel: 'S-10',
        litrosArla: 12, media: '2,49', unidadeMedia: 'km/L', situacao: 'Operando' });
      for (let k = 1; k <= 2; k++)
        DB.addViagem(d, { equipamento: eq, motorista: mot, origem: '0'+k, destino: '0'+(k+1),
          quantidade: 15, material: 'Minério', pesoTotal: 450.5 });
    });
    ['PC-01','MG-01'].forEach(eq => {
      DB.setTipoEquip(eq, 'horimetro');
      DB.addAbastecimento(d, { equipamento: eq, motorista: 'Saulo', hora: '07:00',
        horimetroInicial: 5000, horimetroFinal: 5009, horasTrabalhadas: '9,0',
        kmInicial: null, kmFinal: null, kmRodado: 0, litros: 210, combustivel: 'S-10',
        litrosArla: 0, media: '23,33', unidadeMedia: 'L/h', situacao: 'Operando' });
    });
  }, hoje);
  await p.waitForTimeout(900);
  await p.evaluate(() => { DB.setEstoque('s10', 4250); DB.setEstoque('s500', 900); });
  await p.waitForTimeout(700);
  const cheia = await p.evaluate(d => {
    const cv = desenharFolha(dadosDaFolha([d], 'RELATÓRIO DIÁRIO'), 'faixa');
    return { h: cv.height, n: dadosDaFolha([d], 'R').quadros.length };
  }, hoje);
  const escala = 1600 / cheia.h;
  ok('com 7 equipamentos a folha continua abaixo de 2.500 px, mesmo com a tira',
     cheia.h < 2500, cheia.h + ' px · ' + cheia.n + ' equipamentos');
  ok('o encolhimento do WhatsApp continua ≥ 0,64', escala >= 0.64,
     escala.toFixed(2) + ' · texto de 24px chega com ' + (24 * escala).toFixed(1) + 'px');

  /* ---- 8. nada vaza da tira, nem com saldo de 6 dígitos ---- */
  const vaza = await p.evaluate(() => {
    DB.setEstoque('s10', 148250); DB.setEstoque('s500', 199900); DB.setEstoque('arla', 112450);
    const linha = tanquesEmLinha();
    const cv = document.createElement('canvas'); cv.width = 1240;
    const c = cv.getContext('2d');
    const L = FOLHA.M, R = 1240 - FOLHA.M;
    c.font = FOLHA.fonte(16, 700);
    const xT = L + 18 + c.measureText('🛢️ DIESEL DISPONÍVEL').width + 22;
    c.font = FOLHA.fonte(19, 600);
    return { linha, larg: c.measureText(linha).width, cabe: R - xT - 14 };
  });
  ok('saldo de 6 dígitos nos três tanques ainda cabe na tira',
     vaza.larg <= vaza.cabe, Math.round(vaza.larg) + 'px de ' + Math.round(vaza.cabe) + 'px · ' + vaza.linha);

  /* ---- 9. o relatório de período também traz o bloco ---- */
  await p.evaluate(d => {
    const o = new Date(d + 'T12:00'); o.setDate(o.getDate() - 1);
    const iso = `${o.getFullYear()}-${String(o.getMonth()+1).padStart(2,'0')}-${String(o.getDate()).padStart(2,'0')}`;
    DB.addAbastecimento(iso, { equipamento: 'CB-17', motorista: 'Saulo', hora: '07:30',
      horimetroInicial: 992, horimetroFinal: 1000, horasTrabalhadas: '8,0',
      kmInicial: 11700, kmFinal: 12000, kmRodado: 300, litros: 118, combustivel: 'S-10',
      litrosArla: 0, media: '2,54', unidadeMedia: 'km/L', situacao: 'Operando' });
  }, hoje);
  await p.waitForTimeout(400);
  const periodo = await p.evaluate(() => {
    const mes = DB.mesesDisponiveis()[0];
    return gerarRelatorioPeriodo(mes.dias, 'RELATÓRIO MENSAL');
  });
  ok('o relatório mensal também traz o saldo, com o mesmo título',
     /QUANTIDADE DE DIESEL DISPONÍVEL/.test(periodo) && /Tanque S-10:/.test(periodo),
     (periodo.match(/Tanque S-10:.*/) || ['FALTOU'])[0]);

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
