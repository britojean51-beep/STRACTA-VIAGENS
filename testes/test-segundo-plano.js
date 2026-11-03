/* Envio em segundo plano: o motorista faz o checklist SEM SINAL e fecha o app.
   Quando a internet volta, o service worker envia sozinho (checklist, pendência
   do equipamento e a foto) direto para o Firestore (REST), sem abrir o app.
   Rodar com: PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node testes/test-segundo-plano.js */
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');
const fs = require('fs');
const SDK = fs.readFileSync(__dirname + '/ck-sdk.js', 'utf8');
const BASE = 'http://localhost:8131';
const URL = BASE + '/checklist/index.html';
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✖ ') + msg); if (!cond) falhas++; };

/* Firestore de mentira (REST) e o renovador de login */
const docs = {};           // nome -> { fields, updateTime }
const pedidos = [];
let relogio = 1;
const curto = n => n.split('/documents/')[1];
function aplicar(w) {
  const nome = w.update.name, atual = docs[nome];
  const pc = w.currentDocument || {};
  if (pc.exists === true && !atual) throw new Error('não existe');
  if (pc.exists === false && atual) throw new Error('já existe');
  if (pc.updateTime && (!atual || atual.updateTime !== pc.updateTime)) throw new Error('mudou');
  let campos;
  if (w.updateMask) {
    campos = JSON.parse(JSON.stringify((atual || {}).fields || {}));
    for (const fp of w.updateMask.fieldPaths) {
      const partes = fp.match(/`(?:[^`\\]|\\.)*`|[^.]+/g).map(p => p.startsWith('`') ? p.slice(1, -1) : p);
      let o = campos, src = w.update.fields;
      partes.forEach((p, i) => {
        if (i === partes.length - 1) { o[p] = src[p]; return; }
        o[p] = o[p] || { mapValue: { fields: {} } };
        o = o[p].mapValue.fields; src = src[p].mapValue.fields;
      });
    }
  } else campos = w.update.fields;
  for (const t of w.updateTransforms || []) {
    const v = Number((campos[t.fieldPath] || {}).integerValue || 0) + Number(t.increment.integerValue);
    campos[t.fieldPath] = { integerValue: String(v) };
  }
  docs[nome] = { fields: campos, updateTime: 't' + (relogio++) };
}
async function servidor(route) {
  const req = route.request(), u = req.url();
  if (u.startsWith('https://securetoken.googleapis.com/')) {
    pedidos.push({ tipo: 'token', corpo: req.postData() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id_token: 'tok-novo', refresh_token: 'r2' }) });
  }
  const auth = req.headers()['authorization'];
  if (u.endsWith(':commit')) {
    const corpo = JSON.parse(req.postData());
    pedidos.push({ tipo: 'commit', auth, corpo });
    try { const copia = JSON.parse(JSON.stringify(docs)); try { corpo.writes.forEach(aplicar); } catch (e) { Object.keys(docs).forEach(k => delete docs[k]); Object.assign(docs, copia); throw e; } }
    catch (e) { return route.fulfill({ status: 400, body: e.message }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }
  const nome = 'projects/' + u.split('/projects/')[1];
  pedidos.push({ tipo: 'get', auth, nome: decodeURIComponent(nome) });
  const d = docs[decodeURIComponent(nome)];
  return d ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: nome, fields: d.fields, updateTime: d.updateTime }) })
    : route.fulfill({ status: 404, body: '{}' });
}
const P = 'projects/gp2t-gestaodefrota/databases/(default)/documents/';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://www.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('https://firestore.googleapis.com/**', servidor);
  await ctx.route('https://securetoken.googleapis.com/**', servidor);
  await ctx.addInitScript(SDK);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(URL);
  docs[P + 'checklist_equipamentos/e1'] = { fields: { prefixo: { stringValue: 'CB-12' } }, updateTime: 't0' };
  await page.evaluate(() => localStorage.setItem('__ck_banco__', JSON.stringify({
    'checklist_usuarios/ze@gp2t.local': { nome: 'Zé', perfil: 'motorista' },
    'checklist_equipamentos/e1': { prefixo: 'CB-12', placa: 'ABC1D23', tipo: 'caminhao' } })));
  await page.reload();
  await page.fill('#lgUsuario', 'ze'); await page.fill('#lgSenha', '123456'); await page.click('#lgEntrar');
  await page.waitForSelector('#btnNovo');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // o login que o Firebase guarda no aparelho (o passe já venceu: o service worker renova)
  await page.evaluate(k => new Promise(ok => {
    const r = indexedDB.open('firebaseLocalStorageDb', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
    r.onsuccess = () => {
      const tx = r.result.transaction('firebaseLocalStorage', 'readwrite');
      tx.objectStore('firebaseLocalStorage').put({ fbase_key: 'firebase:authUser:' + k + ':[DEFAULT]',
        value: { email: 'ze@gp2t.local', stsTokenManager: { accessToken: 'tok-velho', refreshToken: 'r1', expirationTime: Date.now() - 1000 } } });
      tx.oncomplete = () => { r.result.close(); ok(); };
    };
  }), 'AIzaSyCppDcUQSkDCOBZIs1BHA1WMEWoBeboFyc');

  console.log('1. sem sinal: faz o checklist com um item que obriga parada e uma foto');
  await page.evaluate(() => { window.__SEM_REDE__ = true; });
  await ctx.setOffline(true);
  await page.click('#btnNovo');
  await page.click('.equip:has-text("CB-12")');
  await page.waitForSelector('.ck-item');
  const n = await page.$$eval('.ck-item', l => l.findIndex(e => e.querySelector('.critico')) + 1);
  await page.click(`.ck-item:nth-child(${n}) [data-st="nok"]`);
  await page.fill(`.ck-item:nth-child(${n}) .ck-obs`, 'Freio fraco');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 150; c.getContext('2d').fillRect(0, 0, 90, 60); return c.toDataURL('image/png').split(',')[1]; });
  page.once('filechooser', fc => fc.setFiles({ name: 'f.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }));
  await page.click('[data-foto="geral"]');
  await page.waitForSelector('.card .mini-midia img[src^="blob:"]');
  await page.click('#ckTudoOk');
  await page.click('#ckFinalizar');
  await page.waitForSelector('.resultado');
  const saida = await page.evaluate(() => Saida.todos());
  ok(saida.length === 1 && saida[0].email === 'ze@gp2t.local' && saida[0].resultado === 'bloqueado', 'checklist guardado na saída do aparelho');
  ok((await page.evaluate(() => Midia.pendentes())) === 1, 'foto na fila do aparelho');
  const id = saida[0].id;

  console.log('2. fecha o app; a internet volta; o Android chama o service worker');
  await page.close();
  ok(!pedidos.some(p => p.tipo === 'commit'), 'nada foi enviado enquanto estava sem sinal');
  await ctx.setOffline(false);
  // uma página do mesmo site, fora do app (o app continua fechado), só para cutucar o service worker
  const fora = await ctx.newPage();
  await fora.goto(BASE + '/checklist/icons/icon.svg');
  await fora.evaluate(() => navigator.serviceWorker.getRegistration('/checklist/').then(r => r.active.postMessage({ tipo: 'ck-enviar', forcar: true })));
  const fim = Date.now() + 15000;
  while (Date.now() < fim && !(docs[P + 'checklist_inspecoes/' + id] && docs[P + 'checklist_inspecoes/' + id].fields.pendentes.integerValue === '0')) await new Promise(r => setTimeout(r, 200));
  const insp = docs[P + 'checklist_inspecoes/' + id];
  ok(!!insp, 'checklist chegou ao servidor sem abrir o app');
  ok(insp && insp.fields.criadoPor.stringValue === 'ze@gp2t.local' && insp.fields.resultado.stringValue === 'bloqueado', 'em nome do motorista, com o resultado');
  ok(docs[P + 'checklist_equipamentos/e1'].fields.pendencias.mapValue.fields[id].stringValue === 'bloqueado', 'CB-12 entrou em manutenção');
  ok(pedidos.some(p => p.tipo === 'token' && p.corpo.includes('refresh_token=r1')) && pedidos.filter(p => p.tipo === 'commit').every(p => p.auth === 'Bearer tok-novo'),
    'login renovado e usado no envio');
  const fotos = Object.keys(docs).filter(k => k.includes('/checklist_fotos/'));
  ok(fotos.length === 1 && docs[fotos[0]].fields.dados.stringValue.startsWith('data:image/jpeg;base64,'), 'foto enviada');
  const mid = fotos[0].split('/').pop();
  ok(insp && insp.fields.midias.mapValue.fields[mid].mapValue.fields.ok.booleanValue === true && insp.fields.pendentes.integerValue === '0',
    'checklist marca a foto como enviada');
  const gav = await fora.evaluate(async () => {
    const abrir = n => new Promise(ok => { const r = indexedDB.open(n); r.onsuccess = () => ok(r.result); });
    const conta = (db, os) => new Promise(ok => { const r = db.transaction(os).objectStore(os).count(); r.onsuccess = () => ok(r.result); });
    return [await conta(await abrir('ck_saida'), 'itens'), await conta(await abrir('ck_midias'), 'midias')];
  });
  ok(gav[0] === 0 && gav[1] === 0, 'saída e fila do aparelho vazias');

  console.log('3. de novo: não envia duas vezes');
  const antes = pedidos.filter(p => p.tipo === 'commit').length;
  await fora.evaluate(() => navigator.serviceWorker.getRegistration('/checklist/').then(r => r.active.postMessage({ tipo: 'ck-enviar', forcar: true })));
  await new Promise(r => setTimeout(r, 1500));
  ok(pedidos.filter(p => p.tipo === 'commit').length === antes, 'nada repetido');

  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await browser.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
