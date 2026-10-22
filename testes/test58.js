/* r57 — os onze campos por equipamento, nas quatro saídas.
   Um assert POR CAMPO: se faltar algum, a falha diz qual. E os números da imagem
   são comparados com os do texto — as saídas não podem divergir. */
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

  await p.evaluate(d => {
    // um caminhão operando, com tudo preenchido
    DB.setTipoEquip('CB-17', 'km_horimetro');
    DB.addAbastecimento(d, { equipamento: 'CB-17', motorista: 'Saulo', hora: '07:30',
      horimetroInicial: 1000, horimetroFinal: 1008, horasTrabalhadas: '8,0',
      kmInicial: 12000, kmFinal: 12300, kmRodado: 300, litros: 120.5, combustivel: 'S-10',
      litrosArla: 12, media: '2,49', unidadeMedia: 'km/L', situacao: 'Operando' });
    DB.addViagem(d, { equipamento: 'CB-17', motorista: 'Saulo', origem: '01', destino: '02',
      quantidade: 15, material: 'Minério', pesoTotal: 450 });
    // um caminhão em manutenção, com motivo e horário
    DB.setTipoEquip('CB-22', 'km_horimetro');
    DB.addAbastecimento(d, { equipamento: 'CB-22', motorista: 'Antônio', hora: '07:00',
      horimetroInicial: 1180, horimetroFinal: 1187.5, horasTrabalhadas: '7,5',
      kmInicial: 42500, kmFinal: 42980, kmRodado: 480, litros: 98, combustivel: 'S-500',
      litrosArla: 0, media: '4,90', unidadeMedia: 'km/L', situacao: 'Manutenção' });
    DB.addManutencao(d, { equipamento: 'CB-22', tipo: 'Corretiva',
      servico: 'Troca do cubo da roda traseira direita', horimetro: 1187.5, km: 42980,
      entradaHora: '13:00', saidaHora: '16:30', observacoes: '' });
    // uma máquina de horímetro, sem odômetro
    DB.setTipoEquip('PC-01', 'horimetro');
    DB.addAbastecimento(d, { equipamento: 'PC-01', motorista: 'Pedro', hora: '07:00',
      horimetroInicial: 5000, horimetroFinal: 5009, horasTrabalhadas: '9,0',
      kmInicial: null, kmFinal: null, kmRodado: 0, litros: 210, combustivel: 'S-10',
      litrosArla: 0, media: '23,33', unidadeMedia: 'L/h', situacao: 'Operando' });
  }, hoje);
  await p.waitForTimeout(600);

  const texto = await p.evaluate(d => gerarRelatorioTexto(d), hoje);
  const bloco = (texto.match(/🚛 CB-17[\s\S]*?(?=━)/) || [''])[0];

  /* ---- 1. os onze campos no TEXTO (WhatsApp e PDF saem daqui) ---- */
  const campos = [
    ['operador', /Operador: Saulo/],
    ['horímetro inicial e final', /Horímetro: 1\.000 → 1\.008/],
    ['horas de horímetro', /Horas \(horímetro\): 8,0 h/],
    ['KM inicial e final', /KM: 12\.000 → 12\.300/],
    ['KM rodados', /KM Rodado: 300 km/],
    ['L\/h', /Consumo: 15,06 L\/h/],
    ['L\/ton', /L\/Ton: 0,27 L\/t/],
    ['situação', /Situação: Operando/]
  ];
  campos.forEach(([nome, re]) => ok('texto · ' + nome, re.test(bloco),
    (bloco.match(re) || ['FALTOU'])[0]));
  ok('texto · média em km/L', /Média: 2,49 km\/L/.test(bloco), (bloco.match(/Média:.*/) || [''])[0]);
  ok('texto · L/km NÃO aparece (ele corrigiu o pedido)', !/L\/km/.test(texto));

  /* ---- 2. o motivo da manutenção ---- */
  const bloco22 = (texto.match(/🚛 CB-22[\s\S]*?(?=━)/) || [''])[0];
  ok('texto · o motivo aparece no equipamento em manutenção',
     /Motivo: Corretiva · Troca do cubo da roda traseira direita \(13:00 às 16:30\)/.test(bloco22),
     (bloco22.match(/Motivo:.*/) || ['FALTOU'])[0]);
  ok('texto · equipamento operando NÃO ganha linha de motivo', !/Motivo:/.test(bloco),
     (bloco.match(/Motivo:.*/) || ['nenhum'])[0]);

  /* ---- 3. máquina de horímetro: "—" no KM, e não 0 ---- */
  const blocoPC = (texto.match(/🚛 PC-01[\s\S]*?(?=━)/) || [''])[0];
  ok('texto · máquina de horímetro não mostra linha de KM', !/KM/.test(blocoPC),
     (blocoPC.match(/KM.*/) || ['nenhuma'])[0]);
  ok('texto · e não repete o L/h (a média dela já é o L/h)', !/Consumo:/.test(blocoPC),
     (blocoPC.match(/Consumo:.*/) || ['nenhum'])[0]);

  /* ---- 4. a IMAGEM: quadro por equipamento, com os mesmos números ---- */
  const img = await p.evaluate(d => {
    const dd = dadosDaFolha([d], 'RELATÓRIO DIÁRIO');
    const cv = desenharFolha(dd, 'faixa');
    const q = dd.quadros.find(x => x.equip === 'CB-17');
    const q22 = dd.quadros.find(x => x.equip === 'CB-22');
    const qpc = dd.quadros.find(x => x.equip === 'PC-01');
    const achatar = x => x.campos.flat().map(([r, v]) => r + '=' + v);
    return { w: cv.width, h: cv.height, nQuadros: dd.quadros.length,
             cb17: achatar(q), op17: q.operador, sit17: q.situacao, mot17: q.motivo,
             mot22: q22.motivo, sit22: q22.situacao, pc: achatar(qpc) };
  }, hoje);
  ok('a folha tem um quadro por equipamento', img.nQuadros === 3, img.nQuadros + ' quadros');
  // r59: a altura mínima caiu de 1754 (A4) para 1200 — dia curto, folha curta,
  // que é o ponto da compactação. O que importa é a largura e crescer com o conteúdo.
  ok('o PNG sai com 1240 de largura', img.w === 1240, img.w + '×' + img.h);

  // r59: rótulos curtos e ARLA com célula própria, porque o quadro vive em meia largura
  const esperados = ['HORÍM. INI=1.000', 'HORÍM. FIM=1.008', 'HORAS=8,0 h',
    'KM INI=12.000', 'KM FIM=12.300', 'KM RODADO=300 km', 'MÉDIA=2,49 km/L',
    'L/h=15,06', 'L/TON=0,27'];
  esperados.forEach(e => ok('imagem · ' + e.split('=')[0],
    img.cb17.includes(e), img.cb17.find(x => x.startsWith(e.split('=')[0])) || 'FALTOU'));
  ok('imagem · operador', img.op17 === 'Saulo', img.op17);
  ok('imagem · situação', img.sit17 === 'Operando', img.sit17);
  ok('imagem · diesel na célula dele', img.cb17.includes('DIESEL=120,5 L'),
     img.cb17.find(x => x.startsWith('DIESEL')) || 'FALTOU');
  ok('imagem · ARLA em célula PRÓPRIA (em meia largura não cabia junto do diesel)',
     img.cb17.includes('ARLA=12 L'), img.cb17.find(x => x.startsWith('ARLA')) || 'FALTOU');

  ok('imagem · o motivo está no quadro do equipamento em manutenção',
     /Troca do cubo/.test(img.mot22) && /13:00 às 16:30/.test(img.mot22), img.mot22);
  ok('imagem · quadro de equipamento operando não tem motivo', !img.mot17, img.mot17 || 'nenhum');
  ok('imagem · máquina de horímetro mostra — no KM, não 0',
     img.pc.includes('KM INI=—') && img.pc.includes('KM FIM=—') && img.pc.includes('KM RODADO=—'),
     img.pc.filter(x => x.startsWith('KM')).join(' · '));
  ok('imagem · e o L/h dela não se repete', img.pc.includes('L/h=—'),
     img.pc.find(x => x.startsWith('L/h')) || 'FALTOU');

  /* ---- 5. imagem e texto contam a MESMA coisa ---- */
  const bate = [['1.000', 'horímetro inicial'], ['1.008', 'horímetro final'],
    ['12.000', 'KM inicial'], ['12.300', 'KM final'], ['15,06', 'L/h'], ['0,27', 'L/ton']];
  bate.forEach(([v, nome]) => ok('imagem e texto batem no ' + nome,
    bloco.includes(v) && img.cb17.some(x => x.includes(v)), v));

  /* ---- 6. o PDF usa o mesmo texto ---- */
  await p.evaluate(d => { window.print = () => {}; gerarPDF([d], 'RELATÓRIO DIÁRIO', gerarRelatorioTexto(d)); }, hoje);
  await p.waitForTimeout(600);
  const pdf = await p.evaluate(() => (document.getElementById('printArea') || {}).innerText || '');
  ok('o PDF traz os campos novos', /Horímetro: 1\.000 → 1\.008/.test(pdf) && /KM: 12\.000 → 12\.300/.test(pdf),
     (pdf.match(/Horímetro:.*/) || ['FALTOU'])[0]);
  ok('e o PDF traz o motivo da manutenção', /Troca do cubo/.test(pdf));

  /* ---- 7. o mensal continua tabela por dia, não quadro ---- */
  // sem um segundo dia, mesesDisponiveis traz uma lista de 1 e o caminho de
  // período nem é exercitado — foi o que a primeira versão deste teste fez
  await p.evaluate(d => {
    const ontem = new Date(d + 'T12:00'); ontem.setDate(ontem.getDate() - 1);
    const iso = `${ontem.getFullYear()}-${String(ontem.getMonth()+1).padStart(2,'0')}-${String(ontem.getDate()).padStart(2,'0')}`;
    DB.addAbastecimento(iso, { equipamento: 'CB-17', motorista: 'Saulo', hora: '07:30',
      horimetroInicial: 992, horimetroFinal: 1000, horasTrabalhadas: '8,0',
      kmInicial: 11700, kmFinal: 12000, kmRodado: 300, litros: 118, combustivel: 'S-10',
      litrosArla: 0, media: '2,54', unidadeMedia: 'km/L', situacao: 'Operando' });
  }, hoje);
  await p.waitForTimeout(500);
  const mensal = await p.evaluate(() => {
    const m = DB.mesesDisponiveis()[0];
    const dd = dadosDaFolha(m.dias, 'RELATÓRIO MENSAL');
    return { quadros: (dd.quadros || []).length, linhas: dd.linhas.length, varios: dd.varios };
  });
  ok('relatório de período continua com linha por dia, sem quadro',
     mensal.varios && mensal.quadros === 0 && mensal.linhas >= 2, JSON.stringify(mensal));

  /* ---- 8. dia vazio não quebra ---- */
  const vazio = await p.evaluate(() => {
    DB.load().dias['2019-05-05'] = { abastecimentos: [], viagens: [], manutencoes: [] };
    DB.save();
    const cv = desenharFolha(dadosDaFolha(['2019-05-05'], 'RELATÓRIO DIÁRIO'), 'faixa');
    return { w: cv.width, h: cv.height };
  });
  ok('dia sem lançamento gera folha válida', vazio.w === 1240 && vazio.h >= 1000, JSON.stringify(vazio));

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
