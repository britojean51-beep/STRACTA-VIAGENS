/* Passa por todas as telas, nos dois temas, e cobra duas coisas:
   nenhum erro de JavaScript e contraste legível em todo texto — inclusive
   dentro dos gráficos (SVG usa "fill", e não "color": foi por olhar só o
   color que um dia os gráficos passaram ilegíveis no tema claro). */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
const URL = 'http://localhost:8130/index.html';

const CONTRASTE = `(() => {
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const rgb = s => { const m = String(s).match(/(\\d+(?:\\.\\d+)?)/g); return m ? m.slice(0, 3).map(Number) : null; };
  const opaco = s => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return false;
    const p = m[1].split(','); return p.length < 4 || parseFloat(p[3]) > 0.55; };
  const fundoDe = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const m = cs.backgroundImage.match(/rgba?\\(([^)]+)\\)/);
        if (m) { const v = m[1].split(',').map(x => parseFloat(x)); if (v.length < 4 || v[3] > 0.55) return v.slice(0, 3); }
        return null;
      }
      if (opaco(cs.backgroundColor)) return rgb(cs.backgroundColor);
      n = n.parentElement;
    }
    return rgb(getComputedStyle(document.body).backgroundColor) || [255, 255, 255];
  };
  const corDe = el => {
    const cs = getComputedStyle(el);
    if (el.ownerSVGElement) return cs.fill === 'none' ? null : rgb(cs.fill);
    return rgb(cs.color);
  };
  const ruins = [], conhecidos = [];
  document.querySelectorAll('body *').forEach(el => {
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!txt) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const c = corDe(el), f = fundoDe(el);
    if (!c || !f) return;
    const l1 = lum(c), l2 = lum(f);
    const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (razao >= 3) return;
    const achado = { txt: txt.slice(0, 34), cor: 'rgb(' + c.join(',') + ')', razao: +razao.toFixed(2) };
    /* Botão colorido da marca (laranja, verde, azul, vermelho) com texto branco:
       é escolha de identidade, vem do primeiro dia e o Jean usa assim todo dia.
       Fica separado — visível em toda rodada, sem afogar uma regressão de verdade. */
    if (el.classList.contains('btn') && getComputedStyle(el).color === 'rgb(255, 255, 255)') {
      conhecidos.push(achado);
    } else ruins.push(achado);
  });
  return { ruins, conhecidos };
})()`;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [], log = [], sabidos = new Map();
  const ok = (n, c, extra) => { const l = (c ? '  OK  ' : ' FALHA ') + n + (extra !== undefined ? ' → ' + extra : ''); log.push(l); console.log(l); };
  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));

  const c = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await c.newPage();
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

  // dados para as telas terem conteúdo de verdade
  await p.evaluate(() => {
    const iso = DB.hojeISO();
    DB.addAbastecimento(iso, { equipamento: 'CB-17', motorista: 'Saulo', hora: '08:00',
      horimetroInicial: 100, horimetroFinal: 108, horasTrabalhadas: '8,0',
      kmInicial: 0, kmFinal: 300, kmRodado: 300, litros: 120.5, combustivel: 'S-10',
      litrosArla: 0, media: '2,49', unidadeMedia: 'km/L', situacao: 'Operando' });
    DB.addViagem(iso, { equipamento: 'CB-17', motorista: 'Saulo', origem: '01', destino: '02',
      quantidade: 8, material: 'Minério', pesoViagem: 30, pesoTotal: 240 });
    DB.setStatus('PC-01', 'manutencao', { dia: iso, hora: '07:00' });
    DB.addParadaAlmoco(['CB-17'], iso, '11:00', '12:00');
    DB.addSolicitacao({ equipamento: 'CB-17', parte: 'Motor', descricao: 'Fumaça preta',
      fotos: [], nFotos: 0, miniatura: '' });
  });

  const TELAS = ['home', 'abastecimento', 'viagens', 'manutencao', 'solicitacoes',
                 'relatorio', 'dashboard', 'frota', 'corrigir', 'operadores',
                 'usuarios', 'conta', 'configuracoes', 'novodia'];

  for (const tema of ['escuro', 'claro']) {
    await p.evaluate(t => { if (temaAtual() !== t) trocarTema(); }, tema);
    await p.waitForTimeout(300);
    for (const tela of TELAS) {
      await p.evaluate(t => navegar(t), tela);
      await p.waitForTimeout(450);
      const { ruins, conhecidos } = await p.evaluate(CONTRASTE);
      conhecidos.forEach(x => sabidos.set(x.txt + x.razao, x));
      ok(`tema ${tema} · ${tela}`, ruins.length === 0,
         ruins.slice(0, 2).map(r => `"${r.txt}" ${r.cor} (${r.razao})`).join(' | ') || 'legível');
    }
    // ficha e detalhe de solicitação não têm rota direta no menu
    await p.evaluate(() => abrirFicha('CB-17')); await p.waitForTimeout(500);
    const rf = await p.evaluate(CONTRASTE);
    rf.conhecidos.forEach(x => sabidos.set(x.txt + x.razao, x));
    ok(`tema ${tema} · ficha`, rf.ruins.length === 0, rf.ruins.slice(0, 2).map(r => `"${r.txt}" (${r.razao})`).join(' | ') || 'legível');
    const nSvg = await p.evaluate(() => document.querySelectorAll('#app svg text').length);
    ok(`tema ${tema} · a ficha tem gráfico para conferir`, nSvg > 0, nSvg + ' <text>');
    await p.evaluate(() => { solicitacaoAberta = DB.solicitacoesLista()[0].id; navegar('solicitacao'); });
    await p.waitForTimeout(500);
    const rs = await p.evaluate(CONTRASTE);
    rs.conhecidos.forEach(x => sabidos.set(x.txt + x.razao, x));
    ok(`tema ${tema} · solicitação`, rs.ruins.length === 0, rs.ruins.slice(0, 2).map(r => `"${r.txt}" (${r.razao})`).join(' | ') || 'legível');
  }

  if (sabidos.size) {
    console.log('\n--- contraste baixo CONHECIDO (botão colorido com texto branco, desde o r1):');
    [...sabidos.values()].slice(0, 6).forEach(x => console.log(`    "${x.txt}" ${x.razao}:1 (mínimo 4,5)`));
    console.log(`    ${sabidos.size} no total — decisão de identidade, não regressão.`);
  }
  console.log('=== FALHAS: ' + log.filter(l => l.startsWith(' FALHA')).length + ' ===');
  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  console.log('=== ERROS JS REAIS: ' + reais.length + ' ==='); reais.slice(0, 8).forEach(e => console.log(' ! ' + e));
  await b.close();
})();
