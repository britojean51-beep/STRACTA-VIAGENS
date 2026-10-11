/* r52 — editar o horímetro e o KM na ficha do equipamento.
   O que o teste prova não é que o campo aceita número: é que o número editado na
   ficha vira o medidor de verdade, e que o próximo abastecimento abre com ele. */
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

  const med = () => p.evaluate(() => DB.ultimo('CB-17'));
  const abrir = async eq => { await p.evaluate(e => abrirFicha(e), eq); await p.waitForTimeout(600); };

  await p.evaluate(() => {
    DB.setTipoEquip('CB-17', 'km_horimetro'); DB.setUltimo('CB-17', 12000, 1000);
    DB.setTipoEquip('PC-01', 'horimetro');    DB.setUltimo('PC-01', null, 5000);
  });

  /* ---- 1. a ficha abre com o valor de hoje ---- */
  await abrir('CB-17');
  const pre = await p.evaluate(() => ({ hor: $('#fkHori').value, km: $('#fkKm').value,
    kmVisivel: $('#fkKmWrap').style.display !== 'none' }));
  ok('a ficha abre com os dois medidores preenchidos',
     pre.hor === '1000' && pre.km === '12000' && pre.kmVisivel, JSON.stringify(pre));

  /* ---- 2. editar os dois muda o medidor ---- */
  await p.fill('#fkHori', '1200'); await p.fill('#fkKm', '12800');
  await p.click('#btnFkSalvar'); await p.waitForTimeout(900);
  const m1 = await med();
  ok('editar na ficha muda horímetro e KM',
     m1.horimetroFinal === 1200 && m1.kmFinal === 12800, JSON.stringify(m1));

  // o que prova que mexeu no lugar certo: o abastecimento abre com o número novo
  await p.evaluate(() => navegar('abastecimento')); await p.waitForTimeout(500);
  await p.fill('#fEquip', 'CB-17'); await p.dispatchEvent('#fEquip', 'change'); await p.waitForTimeout(400);
  const ini = await p.evaluate(() => ({ hor: $('#fHoriIni').value, km: $('#fKmIni').value }));
  ok('o próximo abastecimento abre com o número editado na ficha',
     ini.hor === '1200' && ini.km === '12800', JSON.stringify(ini));

  /* ---- 3. campo em branco não apaga o outro ---- */
  await abrir('CB-17');
  await p.fill('#fkHori', ''); await p.fill('#fkKm', '13000');
  await p.click('#btnFkSalvar'); await p.waitForTimeout(900);
  const m2 = await med();
  ok('horímetro em branco não apaga o horímetro guardado',
     m2.horimetroFinal === 1200 && m2.kmFinal === 13000, JSON.stringify(m2));

  /* ---- 4. "4.250" é quatro mil duzentos e cinquenta (o bug do r51 no campo novo) ---- */
  await abrir('CB-17');
  await p.fill('#fkKm', '14.250');
  await p.click('#btnFkSalvar'); await p.waitForTimeout(500);
  const avisou = await p.evaluate(() => document.getElementById('modalOverlay').classList.contains('show'));
  if (avisou) { await p.click('#modalConfirm'); await p.waitForTimeout(700); }
  const m3 = await med();
  ok('"14.250" no KM vira 14.250, não 14,25', m3.kmFinal === 14250, JSON.stringify(m3));
  ok('e subir o número não pergunta nada', avisou === false, String(avisou));

  /* ---- 5. trocar a medição esconde o KM e não perde o valor ---- */
  await abrir('CB-17');
  await p.evaluate(() => { $('#fkTipo').value = 'horimetro'; $('#fkTipo').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  const escondeu = await p.evaluate(() => $('#fkKmWrap').style.display === 'none');
  ok('trocar para Somente Horímetro esconde o KM na hora', escondeu, String(escondeu));
  await p.click('#btnFkSalvar'); await p.waitForTimeout(900);
  const m4 = await med();
  ok('e o KM guardado NÃO se perde', m4.kmFinal === 14250, JSON.stringify(m4));

  await abrir('CB-17');
  const voltou = await p.evaluate(() => ({ visivel: $('#fkKmWrap').style.display !== 'none', km: $('#fkKm').value }));
  ok('a ficha da máquina de horímetro abre sem o campo KM', voltou.visivel === false, JSON.stringify(voltou));
  await p.evaluate(() => { $('#fkTipo').value = 'km_horimetro'; $('#fkTipo').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  const promoveu = await p.evaluate(() => ({ visivel: $('#fkKmWrap').style.display !== 'none', km: $('#fkKm').value }));
  ok('promover de volta mostra o campo com o KM de volta',
     promoveu.visivel && promoveu.km === '14250', JSON.stringify(promoveu));
  await p.click('#btnFkSalvar'); await p.waitForTimeout(800);

  /* ---- 6. número menor pergunta, e cancelar não grava NADA ---- */
  await abrir('CB-17');
  const antesStatus = await p.evaluate(() => DB.getStatus('CB-17'));
  await p.fill('#fkHori', '120');
  await p.evaluate(() => { $('#fkStatus').value = 'manutencao'; $('#fkTurnoIni').value = '06:00'; });
  await p.click('#btnFkSalvar'); await p.waitForTimeout(500);
  const txt = await p.evaluate(() => document.getElementById('modalMsg').textContent);
  ok('número menor pergunta antes', /abaixo do que já foi registrado/.test(txt), txt.slice(0, 80));
  ok('e a pergunta mostra os dois números', /1\.200/.test(txt) && /120/.test(txt), txt.slice(0, 80));
  await p.click('#modalCancel'); await p.waitForTimeout(700);
  const m5 = await med();
  const depoisStatus = await p.evaluate(() => DB.getStatus('CB-17'));
  const turno = await p.evaluate(() => DB.load().turnoEquip['CB-17'] || {});
  ok('cancelar não grava o medidor', m5.horimetroFinal === 1200, JSON.stringify(m5));
  ok('cancelar também não grava o status nem o turno do mesmo formulário',
     depoisStatus === antesStatus && turno.inicio !== '06:00',
     antesStatus + ' → ' + depoisStatus + ' · turno ' + JSON.stringify(turno));

  // confirmar grava (medidor trocado tem que passar)
  await p.fill('#fkHori', '120');
  await p.click('#btnFkSalvar'); await p.waitForTimeout(500);
  await p.click('#modalConfirm'); await p.waitForTimeout(900);
  ok('confirmar grava o número menor', (await med()).horimetroFinal === 120, JSON.stringify(await med()));

  /* ---- 7. a manutenção continua avisando depois da extração ---- */
  await p.evaluate(() => navegar('manutencao')); await p.waitForTimeout(600);
  await p.fill('#mEquip', 'CB-17'); await p.dispatchEvent('#mEquip', 'change'); await p.waitForTimeout(300);
  await p.fill('#mServico', 'Teste'); await p.fill('#mHori', '50');
  await p.click('#btnSalvar'); await p.waitForTimeout(500);
  const txtM = await p.evaluate(() => document.getElementById('modalOverlay').classList.contains('show')
    ? document.getElementById('modalMsg').textContent : '');
  ok('a manutenção segue avisando do número menor', /abaixo do que já foi registrado/.test(txtM),
     txtM.slice(0, 70) || 'não perguntou');
  await p.click('#modalCancel'); await p.waitForTimeout(500);

  /* ---- 8. a planilha, rodando o Codigo.gs de verdade ---- */
  const envios = await p.evaluate(() => window.__TODOS__);
  fs.writeFileSync(__dirname + '/payloads.json', JSON.stringify(envios));
  const { execSync } = require('child_process');
  const saida = execSync('/opt/node22/bin/node ' + __dirname + '/simgs.js Equipamentos', { encoding: 'utf8' });
  const linha = saida.split('\n').find(l => l.includes('CB-17')) || '';
  ok('a aba Equipamentos recebe o medidor editado na ficha',
     linha.includes('120') && linha.includes('14250'), linha.trim());

  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  ok('sem erro de JavaScript', reais.length === 0, reais.slice(0, 3).join(' | ') || 'nenhum');
  console.log('=== FALHAS: ' + falhas + ' ===');
  await b.close();
  process.exit(falhas ? 1 : 0);
})();
