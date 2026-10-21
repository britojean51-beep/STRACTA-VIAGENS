/* r53 — manutenção com dia e horário escolhidos, e o relatório do dia em imagem. */
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
  const ontem = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const paradas = () => p.evaluate(() => Object.values(DB.load().paradas)
    .filter(x => (x.tipo || 'manutencao') === 'manutencao'));

  const lancar = async (data, ini, fim, eq, serv) => {
    await p.evaluate(() => navegar('manutencao')); await p.waitForTimeout(600);
    await p.fill('#mEquip', eq || 'CB-17'); await p.dispatchEvent('#mEquip', 'change'); await p.waitForTimeout(300);
    await p.fill('#mData', data);
    await p.fill('#mHoraIni', ini || ''); await p.fill('#mHoraFim', fim || '');
    await p.fill('#mServico', serv || 'Troca de óleo');
    await p.click('#btnSalvar'); await p.waitForTimeout(900);
  };

  /* ---- 1. o pedido inteiro: lançar em outro dia sem abrir dia novo ---- */
  const diaAntes = await p.evaluate(() => DB.load().diaAtual);
  await lancar(ontem, '08:00', '11:30');
  const diaDepois = await p.evaluate(() => DB.load().diaAtual);
  ok('lançar manutenção de ontem NÃO muda o dia de operação',
     diaDepois === diaAntes, diaAntes + ' → ' + diaDepois);
  const noDia = await p.evaluate(d => ((DB.getDia(d) || {}).manutencoes || []).length, ontem);
  const noHoje = await p.evaluate(d => ((DB.getDia(d) || {}).manutencoes || []).length, hoje);
  ok('o registro cai no dia escolhido, e não no de hoje', noDia === 1 && noHoje === 0,
     `ontem ${noDia} · hoje ${noHoje}`);

  /* ---- 2. os dois horários criam período fechado com os minutos certos ---- */
  let ps = await paradas();
  ok('com os dois horários o período nasce fechado',
     ps.length === 1 && ps[0].entradaHora === '08:00' && ps[0].saidaHora === '11:30' && ps[0].saidaDia === ontem,
     JSON.stringify(ps[0] && { e: ps[0].entradaHora, s: ps[0].saidaHora, min: ps[0].minutos }));
  ok('e os minutos batem (3 h 30 = 210 min)', ps[0] && ps[0].minutos === 210, ps[0] && ps[0].minutos);

  /* ---- 3. só o início deixa o período aberto, e Operando fecha ---- */
  await lancar(hoje, '13:00', '', 'CB-22', 'Suspensão');
  ps = (await paradas()).filter(x => x.equipamento === 'CB-22');
  ok('só o início deixa o período em aberto',
     ps.length === 1 && ps[0].entradaHora === '13:00' && ps[0].saidaDia === null, JSON.stringify(ps[0]));
  await p.evaluate(d => DB.setStatus('CB-22', 'operando', { dia: d, hora: '15:00' }), hoje);
  ps = (await paradas()).filter(x => x.equipamento === 'CB-22');
  ok('apontar Operando depois fecha ele',
     ps[0].saidaHora === '15:00' && ps[0].minutos === 120, JSON.stringify(ps[0]));

  /* ---- 4. a trava: dois apontamentos não deixam dois períodos abertos ---- */
  await lancar(hoje, '07:00', '', 'RD-01', 'Primeiro');
  await lancar(hoje, '09:00', '', 'RD-01', 'Segundo');
  ps = (await paradas()).filter(x => x.equipamento === 'RD-01');
  const abertos = ps.filter(x => !x.saidaDia);
  ok('dois apontamentos não deixam dois períodos abertos', abertos.length <= 1,
     `${ps.length} período(s), ${abertos.length} aberto(s)`);
  ok('e o primeiro foi fechado em vez de duplicar',
     ps.some(x => x.entradaHora === '07:00' && x.saidaHora === '09:00'),
     JSON.stringify(ps.map(x => x.entradaHora + '→' + (x.saidaHora || 'aberto'))));

  /* ---- 5. as recusas ---- */
  const recusa = async (data, ini, fim) => {
    const antes = (await paradas()).length;
    await p.evaluate(() => navegar('manutencao')); await p.waitForTimeout(600);
    await p.fill('#mEquip', 'MG-01'); await p.dispatchEvent('#mEquip', 'change'); await p.waitForTimeout(300);
    await p.fill('#mData', data); await p.fill('#mHoraIni', ini); await p.fill('#mHoraFim', fim);
    await p.fill('#mServico', 'Teste');
    await p.click('#btnSalvar'); await p.waitForTimeout(700);
    return (await paradas()).length === antes;
  };
  const amanha = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  ok('fim antes do início é recusado', await recusa(hoje, '14:00', '10:00'));
  ok('dia no futuro é recusado', await recusa(amanha, '08:00', '09:00'));

  /* ---- 6. sem horário, o comportamento de antes não muda ---- */
  const antes6 = (await paradas()).length;
  await lancar(hoje, '', '', 'CB-11', 'Sem horário');
  await p.evaluate(d => DB.setStatus('CB-11', 'manutencao', { dia: d }), hoje);
  ps = (await paradas()).filter(x => x.equipamento === 'CB-11');
  ok('sem horário o relógio do aparelho continua valendo',
     ps.length === 1 && /^\d{2}:\d{2}$/.test(ps[0].entradaHora), JSON.stringify(ps[0] && ps[0].entradaHora));

  /* ---- 7. as horas de manutenção do mês contam o período ---- */
  const hm = await p.evaluate(() => DB.horasMesEquip('CB-17', DB.hojeISO().slice(0, 7)));
  ok('as horas de manutenção do mês incluem o período apontado',
     Math.abs(hm.manutencao - 3.5) < 0.01, hm.manutencao + ' h (esperado 3,5)');

  /* ---- 8. a imagem ---- */
  await p.evaluate(() => {
    const iso = DB.hojeISO();
    [['CB-01','Saulo',118.5,1420],['CB-11','José',132,1580],['CB-17','Carlos',120.5,1500]].forEach(([eq,mot,L,km]) => {
      DB.setTipoEquip(eq, 'km_horimetro');
      DB.addAbastecimento(iso, { equipamento: eq, motorista: mot, hora: '07:30',
        horimetroInicial: 1000, horimetroFinal: 1008, horasTrabalhadas: '8,0',
        kmInicial: 0, kmFinal: km, kmRodado: km, litros: L, combustivel: 'S-10',
        litrosArla: 12, media: '2,49', unidadeMedia: 'km/L', situacao: 'Operando' });
      DB.addViagem(iso, { equipamento: eq, motorista: mot, origem: '01', destino: '02',
        quantidade: 15, material: 'Minério', pesoViagem: 30, pesoTotal: 450 });
    });
  });
  await p.waitForTimeout(500);

  const img = await p.evaluate(() => {
    const d = dadosDaFolha([DB.hojeISO()], 'RELATÓRIO DIÁRIO');
    const cv = desenharFolha(d, 'faixa');
    return { w: cv.width, h: cv.height, png: cv.toDataURL('image/png').length > 5000,
             totais: d.totais.map(t => t.rot + '=' + t.val), linhas: d.linhas.length,
             viag: d.viag.length, manut: d.manut.length };
  });
  ok('o PNG sai com 1240 de largura', img.w === 1240, img.w + '×' + img.h);
  ok('e a folha tem pelo menos a altura de uma A4', img.h >= 1754, img.h);
  ok('o PNG tem conteúdo de verdade', img.png, String(img.png));
  ok('a folha traz as quatro partes que ele pediu',
     img.linhas > 0 && img.viag > 0 && img.manut > 0 && img.totais.length === 6,
     `${img.linhas} equip · ${img.viag} viagens · ${img.manut} manut · ${img.totais.length} totais`);

  // os números da folha batem com o relatório de texto
  const conf = await p.evaluate(() => {
    const iso = DB.hojeISO();
    const r = DB.resumoDia(iso);
    const d = dadosDaFolha([iso], 'R');
    const achar = rot => (d.totais.find(t => t.rot === rot) || {}).val;
    return { folhaDiesel: achar('DIESEL'), dbDiesel: DB.fmtL(r.diesel),
             folhaViag: achar('VIAGENS'), dbViag: r.viagens };
  });
  ok('o diesel da folha bate com o DB.resumoDia',
     conf.folhaDiesel === conf.dbDiesel, conf.folhaDiesel + ' vs ' + conf.dbDiesel);
  ok('as viagens da folha batem com o DB.resumoDia',
     conf.folhaViag.replace(/\./g, '') === String(conf.dbViag), conf.folhaViag + ' vs ' + conf.dbViag);

  // a folha cresce com o conteúdo
  const alturas = await p.evaluate(() => {
    const iso = DB.hojeISO();
    const cheio = alturaDaFolha(dadosDaFolha([iso], 'R'));
    const d = dadosDaFolha([iso], 'R');
    const magro = alturaDaFolha(Object.assign({}, d, { linhas: d.linhas.slice(0, 1), viag: [], manut: [] }));
    return { cheio, magro };
  });
  ok('a folha cresce conforme o conteúdo', alturas.cheio > alturas.magro || alturas.cheio === 1754,
     `cheia ${alturas.cheio} · magra ${alturas.magro}`);

  // nada vaza da margem
  const vaza = await p.evaluate(() => {
    const d = dadosDaFolha([DB.hojeISO()], 'R');
    const cv = document.createElement('canvas'); cv.width = 1240;
    const c = cv.getContext('2d');
    const ruins = [];
    const checar = (s, fonte, max) => { c.font = fonte; if (c.measureText(String(s)).width > max) ruins.push(s); };
    d.linhas.forEach(l => { checar(l.a, FOLHA.fonte(21, 700), 1240 * 0.17 - 20); });
    d.totais.forEach(t => { checar(t.val, FOLHA.fonte(40, 800), (1240 - 144 - 40) / 3 - 60); });
    return ruins;
  });
  ok('nenhum texto vaza da coluna', vaza.length === 0, JSON.stringify(vaza));

  // dia vazio não quebra
  const vazio = await p.evaluate(() => {
    DB.load().dias['2020-01-01'] = { abastecimentos: [], viagens: [], manutencoes: [] };
    DB.save();
    const cv = desenharFolha(dadosDaFolha(['2020-01-01'], 'RELATÓRIO DIÁRIO'), 'faixa');
    return { w: cv.width, h: cv.height };
  });
  ok('dia sem lançamento gera folha válida em vez de quebrar',
     vazio.w === 1240 && vazio.h >= 1754, JSON.stringify(vazio));

  // o botão existe e não deixa erro na tela
  await p.evaluate(() => navegar('relatorio')); await p.waitForTimeout(700);
  ok('o botão de imagem está na tela do relatório',
     await p.evaluate(() => !!document.getElementById('btnImagem')));

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
