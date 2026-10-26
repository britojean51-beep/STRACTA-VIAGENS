/* r63 — juntar operador digitado errado, e a Parte diária.
   O risco da fusão não é renomear: é a NUVEM DESFAZER. _aplicarLancamentos
   sobrescreve o local sempre que difere do que está na nuvem, então renomear só
   no aparelho traria o nome velho de volta na próxima leitura. */
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
  /* Depois do primeiro login a sessão persiste e a tela de login não aparece
     mais — então entrar() tolera os dois casos. */
  const entrar = async p => {
    const temLogin = await p.locator('#btnEntrar').count().catch(() => 0);
    if (temLogin) {
      await p.fill('#loginEmail', 'jean'); await p.fill('#loginSenha', '123456');
      await p.click('#btnEntrar');
    }
    await p.waitForTimeout(2400);
    await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
      if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });
  };
  const abrir = async () => {
    const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
    p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await ligar(p); await p.addInitScript(SDK); await p.addInitScript(STUB);
    await p.goto(URL, { waitUntil: 'networkidle' });
    await entrar(p);
    return p;
  };

  let p = await abrir();
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await entrar(p);
  const hoje = await p.evaluate(() => DB.hojeISO());

  /* ---- o histórico bagunçado vai DIRETO no localStorage ----
     Pelo app não daria: a fusão é instantânea (o onMudanca da nuvem dispara no
     primeiro envio e já junta), e não haveria "antes" para observar. Semeando
     aqui, o app abre com a bagunça e a fusão roda no boot, que é o caso real. */
  await p.evaluate(d => {
    const base = JSON.parse(localStorage.getItem('stracta_frota_v1') || '{}');
    const antigo = '2026-01-15';   // mais de 120 dias: fora da janela do ouvinte
    const lanc = (eq, mot, i) => ({ id: 'x' + i, equipamento: eq, motorista: mot,
      hora: '07:30', horimetroInicial: 1000, horimetroFinal: 1008, horasTrabalhadas: '8,0',
      kmInicial: 12000, kmFinal: 12300, kmRodado: 300, litros: 120, combustivel: 'S-10',
      litrosArla: 0, media: '2,50', unidadeMedia: 'km/L', situacao: 'Operando',
      criadoPor: 'jean@gp2t.local' });
    base.dias = base.dias || {};
    base.dias[d] = { abastecimentos: [lanc('CB-17','Maciano',1), lanc('CB-22','maciano',2),
                                      lanc('CB-01','Marciano',3), lanc('CB-11','Marciano',4)],
      viagens: [{ id: 'v1', equipamento: 'CB-17', motorista: 'Maciano', origem: '01',
        destino: '02', quantidade: 15, material: 'Minério', pesoTotal: 450, criadoPor: 'jean@gp2t.local' }],
      manutencoes: [{ id: 'm1', equipamento: 'CB-22', tipo: 'Corretiva', servico: 'Freio',
        motorista: 'Maciano', entradaHora: '13:00', saidaHora: '15:00', criadoPor: 'jean@gp2t.local' }] };
    base.dias[antigo] = { abastecimentos: [lanc('CB-17','MACIANO',5)], viagens: [], manutencoes: [] };
    base.diaAtual = d;
    base.motoristas = ['Saulo','Maciano','Marciano'];
    base.operadorEquip = { 'CB-17': 'Maciano' };
    base.tipoEquip = { 'CB-17': 'km_horimetro', 'CB-22': 'km_horimetro' };
    localStorage.setItem('stracta_frota_v1', JSON.stringify(base));
  }, hoje);

  const antesDaFusao = await p.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('stracta_frota_v1'));
    let n = 0;
    Object.values(db.dias).forEach(d => ['abastecimentos','viagens','manutencoes']
      .forEach(c => (d[c] || []).forEach(r => { if (/maciano/i.test(r.motorista || '')) n++; })));
    return n;
  });
  ok('o histórico tem 5 registros do nome errado antes da fusão', antesDaFusao === 5, antesDaFusao);

  /* ---- a fusão roda sozinha ao abrir o app ---- */
  await p.reload({ waitUntil: 'networkidle' });
  await entrar(p);
  await p.waitForTimeout(1200);

  const dep = await p.evaluate(() => {
    const db = DB.load();
    const regs = [];
    Object.keys(db.dias).forEach(iso => ['abastecimentos','viagens','manutencoes']
      .forEach(c => (db.dias[iso][c] || []).forEach(r => regs.push({ iso, c, mot: r.motorista }))));
    return { errados: regs.filter(r => /maciano/i.test(r.mot || '') && r.mot !== 'Marciano'),
             marcianos: regs.filter(r => r.mot === 'Marciano').length,
             lista: db.motoristas, opEq: db.operadorEquip['CB-17'],
             antigo: regs.filter(r => r.iso === '2026-01-15').map(r => r.mot) };
  });
  ok('nenhum registro sobrou com o nome errado', dep.errados.length === 0,
     JSON.stringify(dep.errados.slice(0, 3)));
  ok('os 5 do errado + 2 do certo viraram 7 do Marciano', dep.marcianos === 7, dep.marcianos);
  ok('"maciano" e "MACIANO" também foram pegos (caixa ignorada)',
     dep.errados.length === 0 && dep.marcianos === 7);
  ok('o nome errado saiu da lista de operadores',
     !dep.lista.some(m => /^maciano$/i.test(m)) && dep.lista.includes('Marciano'),
     JSON.stringify(dep.lista));
  ok('quem está no equipamento virou Marciano', dep.opEq === 'Marciano', dep.opEq);
  ok('lançamento de mais de 120 dias também foi renomeado',
     dep.antigo.length === 1 && dep.antigo[0] === 'Marciano', JSON.stringify(dep.antigo));

  /* ---- O TESTE QUE VALE A ENTREGA: a nuvem não ressuscita o nome velho ---- */
  const naNuvem = api.tudo().filter(c => c.startsWith('frota/gp2t/abastecimentos'))
    .map(c => (JSON.parse(api.get(c)) || {}).motorista);
  ok('a nuvem recebeu os registros já renomeados',
     naNuvem.length > 0 && !naNuvem.some(m => /maciano/i.test(m || '') && m !== 'Marciano'),
     naNuvem.length + ' registro(s) · ' + JSON.stringify(naNuvem));

  // um segundo celular lê a nuvem: se ela tivesse o nome velho, ele voltaria aqui
  const p2 = await abrir();
  const no2 = await p2.evaluate(() => {
    const regs = [];
    Object.values(DB.load().dias).forEach(d => (d.abastecimentos || [])
      .forEach(r => regs.push(r.motorista)));
    return regs;
  });
  ok('o segundo celular lê a nuvem e NÃO vê o nome velho voltar',
     no2.length > 0 && !no2.some(m => /maciano/i.test(m || '') && m !== 'Marciano'),
     JSON.stringify(no2));

  /* ---- a planilha recebeu UM bulk por tipo, não N requisições ----
     Lido ANTES do reload: o fetchstub zera __TODOS__ a cada carga da página. */
  const bulks = await p.evaluate(() => (window.__TODOS__ || [])
    .filter(x => x.action === 'bulk').map(x => `${x.kind}×${(x.rows || []).length}`));
  ok('a planilha recebeu bulk (um envio por tipo), não uma requisição por registro',
     bulks.length > 0 && bulks.length <= 6, JSON.stringify(bulks));

  /* ---- idempotente: abrir de novo não faz nada ---- */
  await p.reload({ waitUntil: 'networkidle' });
  await entrar(p);
  const dep2 = await p.evaluate(() => {
    const regs = [];
    Object.values(DB.load().dias).forEach(d => ['abastecimentos','viagens','manutencoes']
      .forEach(c => (d[c] || []).forEach(r => regs.push(r.motorista))));
    return { marcianos: regs.filter(m => m === 'Marciano').length,
             errados: regs.filter(m => /maciano/i.test(m || '') && m !== 'Marciano').length };
  });
  ok('abrir de novo não muda nada (idempotente)',
     dep2.marcianos === 7 && dep2.errados === 0, JSON.stringify(dep2));

  /* ---- os totais por operador somam os dois históricos ---- */
  const porOp = await p.evaluate(d => {
    const r = DB.resumoDia(d);
    return { operadores: r.operadores };
  }, hoje);
  ok('o Maciano não aparece mais nos operadores do dia',
     !porOp.operadores.some(o => /maciano/i.test(o) && o !== 'Marciano'),
     JSON.stringify(porOp.operadores));

  /* ================= PARTE DIÁRIA ================= */
  await p.evaluate(() => navegar('abastecimento')); await p.waitForTimeout(700);
  ok('o campo Parte diária existe no formulário',
     await p.evaluate(() => !!document.getElementById('fParte')));
  await p.fill('#fEquip', 'RD-01'); await p.dispatchEvent('#fEquip', 'change'); await p.waitForTimeout(350);
  await p.evaluate(() => { DB.setTipoEquip('RD-01', 'horimetro'); $('#fMot').value = 'Marciano'; });
  await p.fill('#fHoriFim', '2008'); await p.fill('#fLitros', '90');
  await p.fill('#fParte', '001234');
  await p.click('#btnSalvar'); await p.waitForTimeout(1100);

  const pd = await p.evaluate(d => {
    const a = (DB.getDia(d).abastecimentos || []).find(x => x.equipamento === 'RD-01');
    return a ? { valor: a.parteDiaria, tipo: typeof a.parteDiaria } : null;
  }, hoje);
  ok('"001234" é gravado COM os zeros à esquerda, como texto',
     pd && pd.valor === '001234' && pd.tipo === 'string', JSON.stringify(pd));
  ok('e NÃO virou o número 1234', pd && pd.valor !== 1234 && pd.valor !== '1234', pd && pd.valor);

  const saidas = await p.evaluate(d => {
    const texto = gerarRelatorioTexto(d);
    const dd = dadosDaFolha([d], 'RELATÓRIO DIÁRIO');
    const q = (dd.quadros || []).find(x => x.equip === 'RD-01');
    const semPD = (dd.quadros || []).find(x => x.equip === 'CB-01');
    window.print = () => {}; gerarPDF([d], 'RELATÓRIO DIÁRIO', texto);
    return { texto: (texto.match(/Parte diária:.*/) || [''])[0],
             quadro: q ? q.parte : null, semPD: semPD ? semPD.parte : null,
             pdf: (document.getElementById('printArea') || {}).innerText || '',
             altura: desenharFolha(dd, 'faixa').height };
  }, hoje);
  ok('o relatório de texto traz a parte diária', /001234/.test(saidas.texto), saidas.texto || 'FALTOU');
  ok('o PDF traz a parte diária', /Parte diária: 001234/.test(saidas.pdf),
     (saidas.pdf.match(/Parte diária:.*/) || ['FALTOU'])[0]);
  ok('o quadro da imagem tem a parte diária', saidas.quadro === '001234', saidas.quadro);
  ok('lançamento SEM parte diária fica vazio, sem "undefined"',
     saidas.semPD === '', JSON.stringify(saidas.semPD));
  ok('a folha continua abaixo de 2.500 px (o PD foi para o cabeçalho)',
     saidas.altura < 2500, saidas.altura + ' px');

  await p.evaluate(() => navegar('corrigir')); await p.waitForTimeout(800);
  const naCorrecao = await p.evaluate(() => document.getElementById('app').innerText);
  ok('Corrigir Dados mostra o PD', /PD 001234/.test(naCorrecao),
     (naCorrecao.match(/PD \d+/) || ['FALTOU'])[0]);
  await p.evaluate(() => { const el = [...document.querySelectorAll('[data-edit]')]
    .find(b => b.closest('.itemrow').innerText.includes('RD-01')); if (el) el.click(); });
  await p.waitForTimeout(800);
  const noEditar = await p.evaluate(() => (document.getElementById('fParte') || {}).value);
  ok('editar o lançamento mantém o número no campo', noEditar === '001234', noEditar);

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
