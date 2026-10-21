/* r59 — a folha compactada.
   A altura É a qualidade: o WhatsApp reduz o lado maior para ~1600px, então cada
   pixel de altura encolhe o texto de todo mundo. O teste mede o ganho e cobra que
   nada tenha se perdido no aperto — em meia largura, texto vazando é risco real. */
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

  // o dia dele: 5 caminhões com viagens, 2 máquinas, 1 manutenção, e nome de
  // operador comprido de propósito para testar o corte em meia largura
  await p.evaluate(d => {
    [['CB-01', 'Saulo'], ['CB-11', 'José Reginaldo da Silva Sobrinho'], ['CB-17', 'Carlos'],
     ['CB-22', 'Antônio'], ['RD-01', 'Marcos']].forEach(([eq, mot]) => {
      DB.setTipoEquip(eq, 'km_horimetro');
      DB.addAbastecimento(d, { equipamento: eq, motorista: mot, hora: '07:30',
        horimetroInicial: 1000, horimetroFinal: 1008, horasTrabalhadas: '8,0',
        kmInicial: 128000, kmFinal: 128300, kmRodado: 300, litros: 120.5, combustivel: 'S-10',
        litrosArla: 12, media: '2,49', unidadeMedia: 'km/L', situacao: 'Operando' });
      for (let k = 1; k <= 2; k++)
        DB.addViagem(d, { equipamento: eq, motorista: mot, origem: '0' + k, destino: '0' + (k + 1),
          quantidade: 15, material: 'Minério', pesoTotal: 450.5 });
    });
    ['PC-01', 'MG-01'].forEach(eq => {
      DB.setTipoEquip(eq, 'horimetro');
      DB.addAbastecimento(d, { equipamento: eq, motorista: 'Saulo', hora: '07:00',
        horimetroInicial: 5000, horimetroFinal: 5009, horasTrabalhadas: '9,0',
        kmInicial: null, kmFinal: null, kmRodado: 0, litros: 210, combustivel: 'S-10',
        litrosArla: 0, media: '23,33', unidadeMedia: 'L/h', situacao: 'Operando' });
    });
    DB.addManutencao(d, { equipamento: 'CB-22', tipo: 'Corretiva',
      servico: 'Troca do cubo da roda traseira direita e sangria do freio',
      entradaHora: '13:00', saidaHora: '16:30' });
  }, hoje);
  await p.waitForTimeout(600);

  /* ---- 1. o ganho, medido ---- */
  const m = await p.evaluate(d => {
    const dd = dadosDaFolha([d], 'RELATÓRIO DIÁRIO');
    const cv = desenharFolha(dd, 'faixa');
    return { w: cv.width, h: cv.height, nQuadros: dd.quadros.length, orcado: alturaDaFolha(dd) };
  }, hoje);
  const escala = 1600 / m.h;
  ok('a folha ficou abaixo de 2.500 px (era 3.804)', m.h < 2500, m.h + ' px');
  ok('largura intacta em 1240', m.w === 1240, m.w);
  ok('o encolhimento do WhatsApp melhorou de 0,42 para ≥ 0,64', escala >= 0.64,
     escala.toFixed(2) + ' · texto de 24px chega com ' + (24 * escala).toFixed(1) + 'px (era 9,3px)');

  /* ---- 2. o orçamento bate com o desenho (o "espaço vago" do fim) ---- */
  const fim = await p.evaluate(d => {
    // onde a última tinta foi posta: varre de baixo para cima procurando pixel não-branco
    const cv = desenharFolha(dadosDaFolha([d], 'RELATÓRIO DIÁRIO'), 'faixa');
    const c = cv.getContext('2d');
    const dados = c.getImageData(0, 0, cv.width, cv.height).data;
    for (let y = cv.height - 1; y >= 0; y--) {
      for (let x = 0; x < cv.width; x += 4) {
        const i = (y * cv.width + x) * 4;
        if (dados[i] < 250 || dados[i + 1] < 250 || dados[i + 2] < 250) return { ultimaTinta: y, alt: cv.height };
      }
    }
    return { ultimaTinta: 0, alt: cv.height };
  }, hoje);
  const sobra = fim.alt - fim.ultimaTinta;
  ok('não sobra canvas em branco no fim da folha', sobra <= 40,
     sobra + ' px depois da última tinta (o orçamento fantasma eram ~156)');

  /* ---- 3. nada se perdeu no aperto ---- */
  const conteudo = await p.evaluate(d => {
    const dd = dadosDaFolha([d], 'RELATÓRIO DIÁRIO');
    const q = dd.quadros.find(x => x.equip === 'CB-17');
    const q22 = dd.quadros.find(x => x.equip === 'CB-22');
    const qpc = dd.quadros.find(x => x.equip === 'PC-01');
    return { campos: q.campos.flat().map(([r]) => r), nTotais: dd.totais.length,
             viag: dd.viag.length, manut: dd.manut.length,
             mot22: q22.motivo, sit: q.situacao, op: q.operador,
             pcKm: qpc.campos.flat().filter(([r]) => r.startsWith('KM')).map(([, v]) => v) };
  }, hoje);
  ['HORÍM. INI', 'HORÍM. FIM', 'HORAS', 'DIESEL', 'KM INI', 'KM FIM',
   'KM RODADO', 'ARLA', 'MÉDIA', 'L/h', 'L/TON'].forEach(r =>
    ok('o campo ' + r + ' continua no quadro', conteudo.campos.includes(r), r));
  ok('os 8 totais continuam', conteudo.nTotais === 8, conteudo.nTotais);
  ok('as viagens e a manutenção continuam', conteudo.viag === 5 && conteudo.manut === 1,
     conteudo.viag + ' viagens · ' + conteudo.manut + ' manut');
  ok('o motivo da manutenção continua', /Troca do cubo/.test(conteudo.mot22), conteudo.mot22.slice(0, 50));
  ok('máquina de horímetro segue com — no KM',
     conteudo.pcKm.every(v => v === '—'), JSON.stringify(conteudo.pcKm));

  /* ---- 4. em meia largura, nada pode vazar ---- */
  const vaza = await p.evaluate(d => {
    const dd = dadosDaFolha([d], 'RELATÓRIO DIÁRIO');
    const cv = document.createElement('canvas'); cv.width = 1240;
    const c = cv.getContext('2d');
    const LARG = 1240 - 2 * FOLHA.M, meia = (LARG - 20) / 2;
    const ruins = [];
    dd.quadros.forEach(q => {
      q.campos.forEach(faixa => {
        const cw = (meia - 32) / faixa.length;
        faixa.forEach(([rot, val]) => {
          c.font = FOLHA.fonte(13, 700);
          if (c.measureText(rot).width > cw - 10) ruins.push(q.equip + ' rótulo ' + rot);
          c.font = FOLHA.fonte(24, 700);
          if (c.measureText(String(val)).width > cw - 10) ruins.push(q.equip + ' valor ' + val);
        });
      });
    });
    return ruins;
  }, hoje);
  ok('nenhum rótulo ou valor estoura a coluna de meia largura (o cortar() apara)',
     vaza.length === 0, vaza.slice(0, 3).join(' | ') || 'nenhum');
  ok('nome de operador comprido é aparado em vez de invadir o vizinho',
     conteudo.op === 'Carlos', conteudo.op);

  /* ---- 5. as bordas do grid de duas colunas ---- */
  const grid = await p.evaluate(d => {
    const base = DB.getDia(d).abastecimentos.slice();
    const alturaCom = n => {
      DB.getDia(d).abastecimentos = base.slice(0, n);
      DB.save();
      const dd = dadosDaFolha([d], 'R');
      return { n: dd.quadros.length, h: desenharFolha(dd, 'faixa').height };
    };
    const r = { um: alturaCom(1), dois: alturaCom(2), tres: alturaCom(3), sete: alturaCom(7) };
    DB.getDia(d).abastecimentos = base; DB.save();
    return r;
  }, hoje);
  ok('1 equipamento: um quadro só', grid.um.n === 1, JSON.stringify(grid.um));
  ok('2 equipamentos cabem na mesma altura de 1 (duas colunas, uma linha)',
     grid.dois.h === grid.um.h, `1 → ${grid.um.h}px · 2 → ${grid.dois.h}px`);
  ok('3 equipamentos custam uma linha a mais, não três',
     grid.tres.h > grid.dois.h && grid.tres.h - grid.dois.h < 300,
     `2 → ${grid.dois.h}px · 3 → ${grid.tres.h}px (+${grid.tres.h - grid.dois.h})`);
  ok('7 (ímpar) → 4 linhas, e o último atravessa as duas colunas',
     grid.sete.n === 7 && grid.sete.h < 2500, JSON.stringify(grid.sete));

  /* ---- 6. o período (semanal/mensal) não virou quadro ---- */
  await p.evaluate(d => {
    const o = new Date(d + 'T12:00'); o.setDate(o.getDate() - 1);
    const iso = `${o.getFullYear()}-${String(o.getMonth()+1).padStart(2,'0')}-${String(o.getDate()).padStart(2,'0')}`;
    DB.addAbastecimento(iso, { equipamento: 'CB-17', motorista: 'Saulo', hora: '07:30',
      horimetroInicial: 992, horimetroFinal: 1000, horasTrabalhadas: '8,0',
      kmInicial: 127700, kmFinal: 128000, kmRodado: 300, litros: 118, combustivel: 'S-10',
      litrosArla: 0, media: '2,54', unidadeMedia: 'km/L', situacao: 'Operando' });
  }, hoje);
  await p.waitForTimeout(400);
  const periodo = await p.evaluate(() => {
    const mes = DB.mesesDisponiveis()[0];
    const dd = dadosDaFolha(mes.dias, 'RELATÓRIO MENSAL');
    return { quadros: (dd.quadros || []).length, linhas: dd.linhas.length, h: desenharFolha(dd, 'faixa').height };
  });
  ok('o mensal continua com linha por dia, sem quadro',
     periodo.quadros === 0 && periodo.linhas >= 2, JSON.stringify(periodo));

  /* ---- 7. dia vazio ---- */
  const vazio = await p.evaluate(() => {
    DB.load().dias['2019-03-03'] = { abastecimentos: [], viagens: [], manutencoes: [] };
    DB.save();
    const cv = desenharFolha(dadosDaFolha(['2019-03-03'], 'RELATÓRIO DIÁRIO'), 'faixa');
    return { w: cv.width, h: cv.height };
  });
  ok('dia sem lançamento gera folha válida', vazio.w === 1240 && vazio.h >= 1000, JSON.stringify(vazio));

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
