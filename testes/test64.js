/* r64 — layout profissional: nenhum emoji, e botão legível.
   Dois riscos de verdade aqui:
   1. o emoji que escapar vai justamente para o relatório que o Jean manda no
      WhatsApp do cliente — por isso o texto de saída é varrido igual à tela;
   2. #headerTitle era escrito com textContent; com ícone desenhado isso mostra
      a tag <svg ...> escrita na tela, em TODAS as telas. */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
const URL = 'http://localhost:8130/index.html';

/* mesma faixa do levantamento. ━ → ✔ ✕ ▲ ▼ ficam: são caracteres de texto,
   iguais em qualquer aparelho, e já fazem o trabalho de separar e marcar. */
const FICAM = '━→✔✕▲▼';
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2139}]/gu;
const achaEmoji = s => [...new Set((String(s).match(EMOJI) || []).filter(c => !FICAM.includes(c)))];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = []; let falhas = 0;
  const ok = (n, c, extra) => { if (!c) falhas++;
    console.log((c ? '  OK  ' : ' FALHA ') + n + (extra !== undefined ? ' → ' + extra : '')); };

  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));

  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await ligar(p); await p.addInitScript(SDK);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });

  /* ---- a tela de entrada ---- */
  await p.waitForSelector('#btnEntrar');
  const login = await p.evaluate(() => document.body.innerText + '|' + document.body.innerHTML);
  ok('entrada sem emoji', achaEmoji(login).length === 0, achaEmoji(login).join(' ') || 'limpa');
  const logoSvg = await p.evaluate(() => {
    const s = document.querySelector('.login-logo svg');
    return s ? s.getBoundingClientRect().width : 0;
  });
  ok('o caminhão da entrada virou desenho', logoSvg > 10, logoSvg + 'px');

  await p.fill('#loginEmail', 'jean'); await p.fill('#loginSenha', '123456');
  await p.click('#btnEntrar'); await p.waitForTimeout(2400);
  await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });

  /* dados de verdade, para as telas terem conteúdo */
  await p.evaluate(() => {
    const iso = DB.hojeISO();
    DB.addAbastecimento(iso, { equipamento: 'CB-17', motorista: 'Saulo', hora: '08:00',
      horimetroInicial: 100, horimetroFinal: 108, horasTrabalhadas: '8,0',
      kmInicial: 0, kmFinal: 300, kmRodado: 300, litros: 120.5, combustivel: 'S-10',
      litrosArla: 12, media: '2,49', unidadeMedia: 'km/L', situacao: 'Operando',
      parteDiaria: '001234' });
    DB.addViagem(iso, { equipamento: 'CB-17', motorista: 'Saulo', origem: '01', destino: '02',
      quantidade: 8, material: 'Minério', pesoTotal: 240 });
    DB.registrarManutencao('PC-01', { iso, tipo: 'Corretiva', servico: 'Troca de mangueira',
      entradaHora: '07:00', saidaHora: '09:00' });
    DB.setEstoque('s10', 100);   // abaixo do mínimo: acende o alerta e o "(baixo)"
    DB.addParadaAlmoco(['CB-17'], iso, '11:00', '12:00');
  });

  const TELAS = ['home', 'abastecimento', 'viagens', 'manutencao', 'relatorio', 'dashboard',
                 'frota', 'corrigir', 'operadores', 'usuarios', 'conta', 'configuracoes', 'novodia'];

  /* ---- nenhum emoji na tela, nos dois temas ---- */
  for (const tema of ['escuro', 'claro']) {
    await p.evaluate(t => { if (temaAtual() !== t) trocarTema(); }, tema);
    await p.waitForTimeout(300);
    for (const tela of TELAS) {
      await p.evaluate(t => navegar(t), tela);
      await p.waitForTimeout(420);
      const alvo = await p.evaluate(() => document.body.innerText + '|' + document.body.innerHTML);
      const achados = achaEmoji(alvo);
      ok(`tema ${tema} · ${tela} sem emoji`, achados.length === 0, achados.join(' ') || 'limpa');
      /* a pegadinha do textContent: a tag não pode aparecer escrita */
      const topo = await p.evaluate(() => document.getElementById('headerTitle').innerText);
      ok(`tema ${tema} · ${tela} · topo não mostra a tag`, !/svg|<|>/.test(topo), JSON.stringify(topo));
    }
    await p.evaluate(() => abrirFicha('CB-17')); await p.waitForTimeout(600);
    const ficha = await p.evaluate(() => document.body.innerText + '|' + document.body.innerHTML);
    ok(`tema ${tema} · ficha sem emoji`, achaEmoji(ficha).length === 0, achaEmoji(ficha).join(' ') || 'limpa');
  }

  /* ---- os ícones aparecem e têm tamanho (um SVG sem medida fica invisível) ---- */
  await p.evaluate(t => { if (temaAtual() !== t) trocarTema(); }, 'escuro');
  await p.evaluate(() => navegar('home')); await p.waitForTimeout(450);
  const med = await p.evaluate(() => {
    const larg = sel => [...document.querySelectorAll(sel)]
      .map(e => Math.round(e.getBoundingClientRect().width));
    return { abas: larg('.tab span svg'), cartoes: larg('.menu-card .ico svg'),
             tema: larg('.btn-tema svg'), topo: larg('#headerTitle svg') };
  });
  ok('as 5 abas de baixo têm ícone desenhado', med.abas.length === 5 && med.abas.every(w => w > 10),
     JSON.stringify(med.abas));
  ok('os cartões do menu têm ícone desenhado', med.cartoes.length >= 11 && med.cartoes.every(w => w > 20),
     med.cartoes.length + ' cartões · ' + JSON.stringify(med.cartoes.slice(0, 3)));
  ok('o botão de tema tem ícone', med.tema.length === 1 && med.tema[0] > 10, JSON.stringify(med.tema));
  ok('o título do topo tem ícone', med.topo.length === 1 && med.topo[0] > 8, JSON.stringify(med.topo));

  /* o ícone herda a cor do texto: tem de mudar junto com o tema */
  /* a aba ATIVA é laranja de propósito nos dois temas, então mede uma inativa */
  const corDeAba = () => p.evaluate(() => {
    const el = document.querySelector('.tab:not(.active) span svg');
    return el ? getComputedStyle(el).stroke : 'sem aba inativa';
  });
  const corEscuro = await corDeAba();
  await p.evaluate(() => trocarTema()); await p.waitForTimeout(350);
  const corClaro = await corDeAba();
  ok('o ícone muda de cor com o tema (currentColor)', corEscuro !== corClaro, corEscuro + ' → ' + corClaro);
  await p.evaluate(() => trocarTema()); await p.waitForTimeout(350);

  /* ---- a situação continua se lendo: a cor não foi embora com a bolinha ---- */
  const pills = await p.evaluate(() => ['manutencao', 'reserva', 'final_expediente', 'operando']
    .map(s => pillStatus(s)));
  ok('pastilha de manutenção continua vermelha',
     /pill-red/.test(pills[0]) && /Manutenção/.test(pills[0]), pills[0]);
  ok('pastilha de reserva continua amarela',
     /pill-yellow/.test(pills[1]) && /Reserva/.test(pills[1]), pills[1]);
  ok('pastilha de operando continua verde',
     /pill-green/.test(pills[3]) && /Operando/.test(pills[3]), pills[3]);
  ok('nenhuma pastilha tem bolinha', achaEmoji(pills.join('')).length === 0, pills.join(' '));

  /* ---- O QUE VALE A ENTREGA: o relatório que sai do celular dele ---- */
  const saidas = await p.evaluate(() => {
    const iso = DB.hojeISO();
    const dias = Object.keys(DB.load().dias).sort();
    return { dia: gerarRelatorioTexto(iso), tanques: blocoTanques(), linha: tanquesEmLinha(),
             periodo: gerarRelatorioPeriodo(dias, 'RELATÓRIO SEMANAL') };
  }).catch(() => null);
  if (saidas) {
    Object.entries(saidas).forEach(([k, v]) => {
      const a = achaEmoji(v || '');
      ok(`saída "${k}" sem emoji`, a.length === 0, a.join(' ') || (String(v).length + ' caracteres'));
    });
    ok('o relatório continua trazendo o equipamento', /CB-17/.test(saidas.dia), 'sim');
    ok('o tanque baixo aparece em palavra, não em símbolo',
       /\(baixo\)/.test(saidas.linha) || /abaixo do mínimo/.test(saidas.tanques),
       saidas.linha);
  } else ok('as funções de relatório responderam', false, 'não deu para chamar');

  /* ---- a folha de imagem continua montando e cabendo ---- */
  await p.evaluate(() => navegar('relatorio')); await p.waitForTimeout(500);
  const folha = await p.evaluate(() => {
    const d = dadosDaFolha([DB.hojeISO()], 'RELATÓRIO DIÁRIO');
    return { altura: alturaDaFolha(d), tanques: d.tanques,
             texto: JSON.stringify(d) };
  });
  ok('a folha continua abaixo de 2.500 px', folha.altura < 2500, folha.altura + ' px');
  ok('a folha não tem emoji', achaEmoji(folha.texto).length === 0,
     achaEmoji(folha.texto).join(' ') || 'limpa');

  /* ---- o PDF ---- */
  const pdf = await p.evaluate(() => {
    window.print = () => {};          // headless não imprime; só queremos o HTML
    gerarPDF(DB.hojeISO());
    const a = document.getElementById('printArea');
    return a ? a.innerHTML : '';
  }).catch(e => 'ERRO: ' + e.message);
  ok('o PDF não tem emoji', pdf.length > 50 && achaEmoji(pdf).length === 0,
     achaEmoji(pdf).join(' ') || (pdf.length + ' caracteres'));

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
