/* r50 — KM e horímetro atuais, lado a lado e sempre atualizados.
   O que o teste protege não é o layout: é o número. Se a manutenção não mexer no
   medidor, o próximo abastecimento abre com o valor velho e as horas do mês saem
   erradas — que é exatamente o furo que esta entrega veio fechar. */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
const STUB = fs.readFileSync(__dirname + '/fetchstub.js', 'utf8');
const URL = 'http://localhost:8130/index.html';

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  let falhas = 0;
  const ok = (n, c, extra) => { if (!c) falhas++;
    console.log((c ? '  OK  ' : ' FALHA ') + n + (extra !== undefined ? ' → ' + extra : '')); };

  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));

  const c = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await c.newPage();
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

  // CB-17 é caminhão (km + horímetro); PC-01 é escavadeira (só horímetro)
  await p.evaluate(() => {
    DB.setTipoEquip('CB-17', 'km_horimetro');
    DB.setTipoEquip('PC-01', 'horimetro');
    DB.setUltimo('CB-17', 12000, 1000);
    DB.setUltimo('PC-01', null, 5000);
    DB.save();
  });

  /* ---- 1. abastecer move o par ---- */
  await p.evaluate(() => navegar('abastecimento')); await p.waitForTimeout(400);
  await p.fill('#fEquip', 'CB-17'); await p.dispatchEvent('#fEquip', 'change'); await p.waitForTimeout(300);
  const iniciais = await p.evaluate(() => ({ hor: $('#fHoriIni').value, km: $('#fKmIni').value }));
  ok('o abastecimento abre com o medidor de hoje', iniciais.hor === '1000' && iniciais.km === '12000',
     JSON.stringify(iniciais));
  await p.fill('#fHoriFim', '1008'); await p.fill('#fKmFim', '12300');
  await p.fill('#fLitros', '120,5');
  await p.evaluate(() => { $('#fMot').value = 'Saulo'; });
  await p.click('#btnSalvar'); await p.waitForTimeout(900);
  const dep1 = await p.evaluate(() => DB.ultimo('CB-17'));
  ok('abastecer atualiza KM e horímetro', dep1.horimetroFinal === 1008 && dep1.kmFinal === 12300,
     JSON.stringify(dep1));

  /* ---- 2. o par aparece igual nos quatro lugares ---- */
  const esperado = await p.evaluate(() => medidores('CB-17').linha());
  ok('o par tem os dois números', /12\.300 km · 1\.008/.test(esperado), esperado);

  const textoDe = async tela => {
    await p.evaluate(t => navegar(t), tela); await p.waitForTimeout(600);
    return p.evaluate(() => document.getElementById('app').innerText);
  };
  const tFrota = await textoDe('frota');
  ok('o par aparece na Frota', tFrota.includes(esperado), esperado);
  const tIndice = await textoDe('dashboard');
  ok('o par aparece no Índice', tIndice.includes(esperado), esperado);
  await p.evaluate(() => abrirFicha('CB-17')); await p.waitForTimeout(600);
  const tFicha = await p.evaluate(() => document.getElementById('app').innerText);
  ok('a ficha mostra os dois medidores atuais',
     /Horímetro atual/.test(tFicha) && /KM atual/.test(tFicha) && tFicha.includes('12.300'),
     tFicha.split('\n').filter(l => /atual/i.test(l)).slice(0, 4).join(' / '));
  const rel = await p.evaluate(() => gerarRelatorioTexto(DB.hojeISO()));
  ok('o relatório (e o PDF) trazem os medidores atuais',
     rel.includes('MEDIDORES ATUAIS') && rel.includes('CB-17: ' + esperado),
     rel.split('\n').filter(l => l.includes('CB-17:')).join(' / '));

  /* ---- 3. a manutenção move o medidor de verdade ---- */
  await p.evaluate(() => navegar('manutencao')); await p.waitForTimeout(500);
  await p.fill('#mEquip', 'CB-17'); await p.dispatchEvent('#mEquip', 'change'); await p.waitForTimeout(300);
  const preench = await p.evaluate(() => ({ hor: $('#mHori').value, km: $('#mKm').value,
    kmVisivel: $('#mKmWrap').style.display !== 'none' }));
  ok('a manutenção abre com o medidor de hoje',
     preench.hor === '1008' && preench.km === '12300' && preench.kmVisivel, JSON.stringify(preench));
  await p.fill('#mServico', 'Troca de óleo');
  await p.fill('#mHori', '1050'); await p.fill('#mKm', '12400');
  await p.click('#btnSalvar'); await p.waitForTimeout(900);
  const dep2 = await p.evaluate(() => DB.ultimo('CB-17'));
  ok('a manutenção atualiza KM e horímetro',
     dep2.horimetroFinal === 1050 && dep2.kmFinal === 12400, JSON.stringify(dep2));

  // o que prova que o furo fechou: o próximo abastecimento já abre com o número da manutenção
  await p.evaluate(() => navegar('abastecimento')); await p.waitForTimeout(400);
  await p.fill('#fEquip', 'CB-17'); await p.dispatchEvent('#fEquip', 'change'); await p.waitForTimeout(300);
  const ini2 = await p.evaluate(() => ({ hor: $('#fHoriIni').value, km: $('#fKmIni').value }));
  ok('o próximo abastecimento já abre com o número da manutenção',
     ini2.hor === '1050' && ini2.km === '12400', JSON.stringify(ini2));

  /* ---- 4. máquina de horímetro não apaga KM de ninguém ---- */
  await p.evaluate(() => navegar('manutencao')); await p.waitForTimeout(500);
  await p.fill('#mEquip', 'PC-01'); await p.dispatchEvent('#mEquip', 'change'); await p.waitForTimeout(300);
  const semKm = await p.evaluate(() => $('#mKmWrap').style.display === 'none');
  ok('máquina de horímetro não pede KM', semKm, String(semKm));
  await p.fill('#mServico', 'Revisão'); await p.fill('#mHori', '5100');
  await p.click('#btnSalvar'); await p.waitForTimeout(900);
  const pc = await p.evaluate(() => DB.ultimo('PC-01'));
  const cb = await p.evaluate(() => DB.ultimo('CB-17'));
  ok('o horímetro da escavadeira andou', pc.horimetroFinal === 5100, JSON.stringify(pc));
  ok('e o KM do caminhão continuou intacto', cb.kmFinal === 12400, JSON.stringify(cb));

  /* ---- 5. número menor: pergunta antes ---- */
  const baixar = async (valor, resposta) => {
    await p.evaluate(() => navegar('manutencao')); await p.waitForTimeout(500);
    await p.fill('#mEquip', 'CB-17'); await p.dispatchEvent('#mEquip', 'change'); await p.waitForTimeout(300);
    await p.fill('#mServico', 'Horímetro trocado'); await p.fill('#mHori', valor);
    await p.click('#btnSalvar'); await p.waitForTimeout(500);
    const aberto = await p.evaluate(() => document.getElementById('modalOverlay').classList.contains('show'));
    const texto = await p.evaluate(() => document.getElementById('modalMsg').textContent);
    if (aberto) { await p.click(resposta ? '#modalConfirm' : '#modalCancel'); await p.waitForTimeout(800); }
    return { aberto, texto };
  };
  const r1 = await baixar('105', false);
  ok('número menor abre a pergunta', r1.aberto, r1.texto.slice(0, 90));
  ok('a pergunta mostra os dois números', /1\.050/.test(r1.texto) && /105/.test(r1.texto), r1.texto.slice(0, 90));
  const cancelado = await p.evaluate(() => DB.ultimo('CB-17'));
  ok('cancelar não grava nada', cancelado.horimetroFinal === 1050, JSON.stringify(cancelado));
  const nMan = await p.evaluate(() => (DB.getDia(DB.hojeISO()).manutencoes || []).length);

  const r2 = await baixar('105', true);
  const confirmado = await p.evaluate(() => DB.ultimo('CB-17'));
  ok('confirmar grava (horímetro trocado tem que passar)', confirmado.horimetroFinal === 105,
     JSON.stringify(confirmado));
  const nMan2 = await p.evaluate(() => (DB.getDia(DB.hojeISO()).manutencoes || []).length);
  ok('e o cancelamento não tinha deixado manutenção fantasma', nMan2 === nMan + 1, nMan + ' → ' + nMan2);

  /* ---- 6. a planilha, rodando o Codigo.gs de verdade ---- */
  // manutenção antiga, gravada no formato de campo único
  await p.evaluate(() => {
    const m = DB.addManutencao(DB.hojeISO(), { equipamento: 'CB-22', tipo: 'Preventiva',
      servico: 'Serviço antigo', horKm: '19910', observacoes: '' });
    Sync.pushManutencao(DB.hojeISO(), m);
  });
  await p.waitForTimeout(600);
  const envios = await p.evaluate(() => window.__TODOS__);
  fs.writeFileSync(__dirname + '/payloads.json', JSON.stringify(envios));
  const { execSync } = require('child_process');
  const saidaEq = execSync('/opt/node22/bin/node ' + __dirname + '/simgs.js Equipamentos', { encoding: 'utf8' });
  const saidaMan = execSync('/opt/node22/bin/node ' + __dirname + '/simgs.js Manutenções', { encoding: 'utf8' });

  const linhaCB = saidaEq.split('\n').find(l => l.includes('CB-17')) || '';
  ok('a aba Equipamentos sai com o par certo',
     linhaCB.includes('105') && linhaCB.includes('12400'), linhaCB.trim());
  const linhaPC = saidaEq.split('\n').find(l => l.includes('PC-01')) || '';
  ok('e a escavadeira sai só com horímetro', linhaPC.includes('5100'), linhaPC.trim());
  const manCB = saidaMan.split('\n').filter(l => l.includes('CB-17'));
  ok('a manutenção separa horímetro e KM em colunas diferentes',
     manCB.some(l => l.includes('1050') && l.includes('12400')), manCB.join(' / ').trim().slice(0, 120));
  const manAntiga = saidaMan.split('\n').find(l => l.includes('CB-22')) || '';
  ok('manutenção antiga (campo único) continua saindo', manAntiga.includes('19910'), manAntiga.trim());

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
