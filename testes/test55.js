/* r55 — horas pagas dos caminhões.
   O que está em jogo aqui é dinheiro: cada número destes vai para uma conversa
   com o dono do caminhão. A regra dele, palavra por palavra: "hora real, limitado
   a 9,09h de desconto, se rodar a mais paga, e se ficar em manutenção desconta só
   o tempo de manutenção". E a base é HORA DIA, não horímetro. */
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
  const perto = (a, b, tol) => Math.abs(a - b) < (tol || 0.02);

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

  /* Um mês FECHADO, para o mínimo ser o do contrato cheio e não o proporcional.
     Setembro de 2026: 22 dias úteis — o mesmo 22 da conta dele. */
  const MES = '2026-09';
  const uteis = await p.evaluate(m => DB.diasUteisDoMes(m, false), MES);
  ok('setembro/2026 tem 22 dias úteis (o 22 da conta dele)', uteis === 22, uteis);
  ok('e 200 ÷ 22 dá os 9,09 dele', perto(200 / uteis, 9.09, 0.005), (200 / uteis).toFixed(4));

  // lança HORA DIA num mês fechado, sem mexer no horímetro de propósito
  const horaDia = async (eq, horas, dia) => p.evaluate(([e, h, d]) => {
    DB.setTipoEquip(e, 'km_horimetro');
    DB.addAbastecimento(d, { equipamento: e, motorista: 'Saulo', hora: '08:00',
      horimetroInicial: 0, horimetroFinal: 0, horasTrabalhadas: String(h).replace('.', ','),
      kmInicial: 0, kmFinal: 100, kmRodado: 100, litros: 50, combustivel: 'S-10',
      litrosArla: 0, media: '2,00', unidadeMedia: 'km/L', situacao: 'Operando' });
  }, [eq, horas, dia]);
  /* A parada vai para o localStorage E para a nuvem, como o app faz. Escrever só
     local não serve: o ouvinte de "operacao" substitui db.paradas INTEIRO pelo que
     está na nuvem, então a próxima gravação qualquer apagaria a parada do teste. */
  const parada = async (eq, d1, h1, d2, h2) => p.evaluate(([e, a, b, c, dd]) => {
    const db = DB.load();
    const id = 'p' + Math.random().toString(36).slice(2);
    const reg = { equipamento: e, tipo: 'manutencao', entradaDia: a, entradaHora: b,
      saidaDia: c, saidaHora: dd, minutos: 1, origem: 'teste', quem: 'jean@gp2t.local' };
    db.paradas[id] = reg;
    DB.save();
    if (typeof Cloud !== 'undefined' && Cloud.ligada()) Cloud.patch('operacao', { paradas: { [id]: reg } });
  }, [eq, d1, h1, d2, h2]);
  const pag = (eq) => p.evaluate(([e, m]) => DB.pagamentoMes(e, m), [eq, MES]);

  /* ---- 1. rodou menos: paga o mínimo ---- */
  await horaDia('CB-01', 170, MES + '-02');
  let r = await pag('CB-01');
  ok('170h sem manutenção: mínimo 200h e PAGA 200h',
     perto(r.minimo, 200) && perto(r.pagar, 200), `mín ${r.minimo} · paga ${r.pagar}`);
  ok('e a diferença aparece como garantia de 30h', perto(r.garantia, 30), r.garantia);

  /* ---- 2. rodou mais: paga o que rodou ---- */
  await horaDia('CB-11', 210, MES + '-02');
  r = await pag('CB-11');
  ok('210h: PAGA 210h ("se rodar a mais, paga")', perto(r.pagar, 210), r.pagar);
  ok('e a garantia é zero', perto(r.garantia, 0), r.garantia);
  ok('com 10h marcadas como a mais', perto(r.aMais, 10), r.aMais);

  /* ---- 3. o exemplo que ELE respondeu: 170h com 30h de manutenção ---- */
  await horaDia('CB-17', 170, MES + '-02');
  // 30h espalhadas em dias úteis, abaixo do teto: 10 dias × 3h
  for (let d = 1; d <= 10; d++) {
    const dia = MES + '-' + String(d + 6).padStart(2, '0');   // 07 a 16 de setembro
    const dt = await p.evaluate(x => new Date(x + 'T12:00').getDay(), dia);
    if (dt === 0 || dt === 6) continue;
    await parada('CB-17', dia, '08:00', dia, '11:00');
  }
  r = await pag('CB-17');
  ok('o desconto é o tempo real de manutenção, não o dia inteiro',
     perto(r.desconto, r.manutencao, 0.05), `desconto ${fmtN(r.desconto)} · parou ${fmtN(r.manutencao)}`);
  ok('mínimo ajustado = 200 − desconto', perto(r.ajustado, 200 - r.desconto), r.ajustado);
  ok('e paga o maior entre o rodado e o ajustado',
     perto(r.pagar, Math.max(170, r.ajustado)), r.pagar);

  /* ---- 4. O CASO QUE JUSTIFICA A REGRA: sexta 18h a segunda 7h ---- */
  await horaDia('CB-22', 100, MES + '-02');
  // 11/09/2026 é sexta; 14/09 é segunda
  const dowSex = await p.evaluate(() => new Date('2026-09-11T12:00').getDay());
  ok('11/09/2026 é sexta-feira (base do caso)', dowSex === 5, dowSex);
  await parada('CB-22', '2026-09-11', '18:00', '2026-09-14', '07:00');
  r = await pag('CB-22');
  ok('a parada são 61h de relógio', perto(r.manutencao, 61, 0.2), fmtN(r.manutencao) + ' h');
  /* 13h, e não 61h: sexta das 18h à meia-noite são 6h, segunda da meia-noite às
     7h são 7h, e sábado e domingo não são dias de ADM. Nenhum dos dois chega ao
     teto de 9,09h, então vale o tempo real — "desconta só o tempo de manutenção". */
  ok('o desconto é 13h, e não as 61h de relógio (fim de semana fora)',
     perto(r.desconto, 13, 0.03), fmtN(r.desconto) + ' h (6h da sexta + 7h da segunda)');
  ok('e só dois dias úteis foram tocados', r.diasComParada === 2, r.diasComParada);

  /* ---- 5. o teto num único dia ---- */
  await horaDia('CB-02', 100, MES + '-02');
  await parada('CB-02', '2026-09-08', '06:00', '2026-09-08', '18:00');   // 12h numa terça
  r = await pag('CB-02');
  ok('12h de parada num dia útil descontam o teto de 9,09h, não 12h',
     perto(r.desconto, 9.09), fmtN(r.desconto));

  /* ---- 6. parada curta desconta o tempo exato ---- */
  await horaDia('CB-03', 100, MES + '-02');
  await parada('CB-03', '2026-09-08', '08:00', '2026-09-08', '11:30');
  r = await pag('CB-03');
  ok('parada de 3h30 desconta exatamente 3h30', perto(r.desconto, 3.5), fmtN(r.desconto));

  /* ---- 7. manutenção enorme não gera mínimo negativo ---- */
  await horaDia('CB-04', 10, MES + '-02');
  await p.evaluate(m => {
    const db = DB.load(); const todas = {};
    for (let d = 1; d <= 30; d++) {
      const dia = m + '-' + String(d).padStart(2, '0');
      const reg = { equipamento: 'CB-04', tipo: 'manutencao',
        entradaDia: dia, entradaHora: '00:00', saidaDia: dia, saidaHora: '23:59',
        minutos: 1, origem: 'teste', quem: 'x' };
      db.paradas['g' + d] = reg; todas['g' + d] = reg;
    }
    DB.save();
    if (typeof Cloud !== 'undefined' && Cloud.ligada()) Cloud.patch('operacao', { paradas: todas });
  }, MES);
  r = await pag('CB-04');
  ok('manutenção o mês todo não deixa o mínimo negativo', r.ajustado >= 0, r.ajustado);
  ok('e nesse caso paga só o que rodou', perto(r.pagar, 10), r.pagar);

  /* ---- 8. A EXIGÊNCIA DELE: é hora dia, não horímetro ---- */
  const antes = (await pag('CB-01')).pagar;
  await p.evaluate(() => { DB.setUltimo('CB-01', 99999, 99999); });
  const depois = (await pag('CB-01')).pagar;
  ok('mexer no horímetro NÃO muda o pagamento (a base é hora dia)',
     perto(antes, depois), `${antes} → ${depois}`);

  /* ---- 9. mês em curso: proporcional, e converge para 200 ---- */
  const corrente = await p.evaluate(() => DB.pagamentoMes('CB-01', DB.hojeISO().slice(0, 7)));
  ok('no mês em curso o mínimo é proporcional aos dias úteis passados',
     corrente.corrente && corrente.minimo <= corrente.minimoCheio,
     `${fmtN(corrente.minimo)} de ${corrente.minimoCheio} · ${corrente.uteisAteHoje}/${corrente.uteisMes} dias`);
  ok('e o mês fechado usa o contrato cheio',
     perto((await pag('CB-01')).minimo, 200), (await pag('CB-01')).minimo);

  /* ---- 10. só caminhão, e regime sem horas fica fora ---- */
  await p.evaluate(() => { DB.setTipoEquip('PC-01', 'horimetro'); });
  const frota = await p.evaluate(m => DB.pagamentoFrota(m), MES);
  ok('máquina de horímetro não entra no controle',
     !frota.linhas.some(l => l.equip === 'PC-01'), JSON.stringify(frota.linhas.map(l => l.equip)));
  await p.evaluate(() => { DB.setRegimeEquip('CB-01', 'A'); });   // turno A nasce com mínimo 0
  const frota2 = await p.evaluate(m => DB.pagamentoFrota(m), MES);
  ok('caminhão em regime sem horas sai do controle, em vez de mostrar garantia falsa',
     !frota2.linhas.some(l => l.equip === 'CB-01'), JSON.stringify(frota2.linhas.map(l => l.equip)));
  await p.evaluate(() => { DB.setRegimeEquip('CB-01', 'ADM'); });

  /* ---- 11. mínimo próprio manda no regime ---- */
  await p.evaluate(() => { DB.setMinimoEquip('CB-01', 180); });
  r = await pag('CB-01');
  ok('mínimo próprio do caminhão manda no do regime', perto(r.minimo, 180), r.minimo);
  await p.evaluate(() => { DB.setMinimoEquip('CB-01', ''); });
  ok('e apagar o próprio volta para o do regime', perto((await pag('CB-01')).minimo, 200));

  /* ---- 12. as telas não podem divergir ---- */
  await p.evaluate(m => { horasMesSel = m; navegar('dashboard'); }, MES);
  await p.waitForTimeout(900);
  // olha DENTRO do cartão de horas pagas, não no de horas do mês
  const noIndice = await p.evaluate(() => {
    const t = document.getElementById('app').innerText;
    const i = t.indexOf('Horas pagas no mês');
    if (i < 0) return '';
    const bloco = t.slice(i, i + 1400);
    const m = bloco.match(/CB-17[\s\S]{0,140}/);
    return m ? m[0].replace(/\n/g, ' ') : bloco.slice(0, 140).replace(/\n/g, ' ');
  });
  const fichaPag = await pag('CB-17');
  const esperado = fmtH_(fichaPag.pagar);
  ok('o Índice e a ficha mostram o MESMO valor a pagar do CB-17',
     noIndice.includes(esperado), `índice "${noIndice.slice(0, 80)}" · ficha ${esperado}`);
  await p.evaluate(() => abrirFicha('CB-17')); await p.waitForTimeout(800);
  const naFicha = await p.evaluate(() => document.getElementById('app').innerText);
  ok('a ficha abre o cálculo linha por linha',
     /Mínimo do contrato/.test(naFicha) && /Mínimo ajustado/.test(naFicha) && /A pagar/.test(naFicha),
     naFicha.split('\n').filter(l => /Mínimo|A pagar/.test(l)).slice(0, 3).join(' / '));

  /* ---- 13. configuração muda as contas ---- */
  await p.evaluate(() => { DB.setConfig({ regimes: Object.assign({}, DB.load().config.regimes,
    { ADM: { nome: 'ADM (seg a sex)', minimo: 220, dias: 'uteis' } }) }); });
  ok('mudar o mínimo em Configurações muda a conta', perto((await pag('CB-02')).minimo, 220),
     (await pag('CB-02')).minimo);

  /* ---- 14. mês vazio não quebra ---- */
  const vazio = await p.evaluate(() => DB.pagamentoFrota('2019-01'));
  ok('mês sem lançamento nenhum não quebra', vazio && Array.isArray(vazio.linhas), JSON.stringify(vazio.pagar));

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);

  function fmtN(n) { return (Math.round(n * 100) / 100).toString(); }
  // o mesmo fmtH do app: uma casa e " h"
  function fmtH_(n) { return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',') + ' h'; }
})();
