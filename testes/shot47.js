const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));
  const c = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await c.newPage();
  await ligar(p); await p.addInitScript(SDK);
  await p.goto('http://localhost:8130/index.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#btnEntrar');
  await p.fill('#loginEmail', 'jean'); await p.fill('#loginSenha', '123456');
  await p.click('#btnEntrar'); await p.waitForTimeout(1300);
  await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
    if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });
  // uma foto de verdade, pequena, para a miniatura aparecer
  await p.evaluate(async () => {
    const foto = (cor, lado) => {
      const c = document.createElement('canvas'); c.width = lado; c.height = lado * 0.7;
      const g = c.getContext('2d');
      g.fillStyle = cor; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#222'; g.fillRect(lado * 0.1, lado * 0.15, lado * 0.8, lado * 0.25);
      g.fillStyle = '#888'; g.beginPath(); g.arc(lado * 0.3, lado * 0.5, lado * 0.12, 0, 7); g.fill();
      g.beginPath(); g.arc(lado * 0.7, lado * 0.5, lado * 0.12, 0, 7); g.fill();
      return c.toDataURL('image/jpeg', 0.6);
    };
    DB.addSolicitacao({ equipamento: 'CB-17', parte: 'Motor',
      descricao: 'Perdendo força na subida e soltando fumaça preta',
      fotos: [foto('#b45309', 1024)], nFotos: 1, miniatura: foto('#b45309', 240) });
    DB.addSolicitacao({ equipamento: 'PC-01', parte: 'Hidráulico',
      descricao: 'Vazando óleo no cilindro da lança', fotos: [], nFotos: 0, miniatura: '' });
    const id = DB.solicitacoesLista().find(x => x.equipamento === 'PC-01').id;
    DB.atualizarSolicitacao(id, { situacao: 'Em atendimento' });
    DB.addSolicitacao({ equipamento: 'RD-01', parte: 'Elétrica',
      descricao: 'Farol queimado', fotos: [], nFotos: 0, miniatura: '' });
    const id2 = DB.solicitacoesLista().find(x => x.equipamento === 'RD-01').id;
    DB.atualizarSolicitacao(id2, { situacao: 'Realizado', conclusao: 'Lâmpada trocada' });
  });
  await p.evaluate(() => navegar('home')); await p.waitForTimeout(600);
  await p.screenshot({ path: __dirname + '/r47-menu.png' });
  await p.evaluate(() => navegar('solicitacoes')); await p.waitForTimeout(900);
  await p.evaluate(() => { const el = [...document.querySelectorAll('h3')].find(h => h.textContent.includes('📋')); el.scrollIntoView({ block: 'start' }); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: __dirname + '/r47-lista.png' });
  await p.evaluate(() => { solicitacaoAberta = DB.solicitacoesLista().find(x => x.equipamento === 'CB-17').id; navegar('solicitacao'); });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: __dirname + '/r47-detalhe.png' });
  await b.close();
})();
