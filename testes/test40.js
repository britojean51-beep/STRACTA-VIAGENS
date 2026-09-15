/* r47 — Solicitações de manutenção com foto */
const { chromium } = require('playwright');
const fs = require('fs');
const { api, ligar } = require('./fakefs.js');
const SDK = fs.readFileSync(__dirname + '/sdk2.js', 'utf8');
const URL = 'http://localhost:8130/index.html';

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [], log = [];
  const ok = (n, c, extra) => { const l = (c ? '  OK  ' : ' FALHA ') + n + (extra !== undefined ? ' → ' + extra : ''); log.push(l); console.log(l); };

  api.limpar(); api.liberar();
  api.set('usuarios/jean@gp2t.local', JSON.stringify({ nome: 'Jean', perfil: 'gestor', ativo: true }));
  api.set('usuarios/op@gp2t.local', JSON.stringify({ nome: 'Saulo', perfil: 'operador', ativo: true }));

  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const nova = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await ligar(p); await p.addInitScript(SDK);
    await p.goto(URL, { waitUntil: 'networkidle' });
    return p;
  };
  const entrar = async (p, u) => {
    await p.waitForSelector('#btnEntrar');
    await p.fill('#loginEmail', u); await p.fill('#loginSenha', '123456');
    await p.click('#btnEntrar'); await p.waitForTimeout(1200);
    await p.evaluate(() => { const ov = document.getElementById('modalOverlay');
      if (ov && ov.classList.contains('show')) document.getElementById('modalConfirm').click(); });
    await p.waitForTimeout(200);
  };
  /* Foto "de celular" de verdade: 3000x2000 com ruído, entregue ao input como File */
  const mandarFoto = async (p, seletor, n) => p.evaluate(async ([sel, qtd]) => {
    const files = [];
    for (let k = 0; k < qtd; k++) {
      const c = document.createElement('canvas');
      c.width = 3000; c.height = 2000;
      const g = c.getContext('2d');
      const img = g.createImageData(3000, 2000);
      for (let i = 0; i < img.data.length; i += 4) {
        const x = (i / 4) % 3000, y = Math.floor((i / 4) / 3000);
        img.data[i] = (Math.sin((x + k * 50) / 40) * 90 + 140 + Math.random() * 45) | 0;
        img.data[i + 1] = (Math.cos(y / 55) * 70 + 130 + Math.random() * 45) | 0;
        img.data[i + 2] = ((x ^ y) % 200) + Math.random() * 45 | 0;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      files.push(new File([blob], `foto${k}.jpg`, { type: 'image/jpeg' }));
    }
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    const input = document.querySelector(sel);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return files.reduce((s, f) => s + f.size, 0);
  }, [seletor, n]);
  const tamLocal = p => p.evaluate(() => (localStorage.getItem('stracta_frota_v1') || '').length);

  /* ===== 1. abrir solicitação com 2 fotos ===== */
  const p = await nova();
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await entrar(p, 'jean');
  ok('o cartão de Solicitações aparece no menu', (await p.textContent('#app')).includes('Solicitações'));

  await p.evaluate(() => navegar('solicitacoes')); await p.waitForTimeout(700);
  const antesLS = await tamLocal(p);
  await p.fill('#sqEquip', 'CB-17'); await p.waitForTimeout(300);
  await p.fill('#sqParte', 'Motor');
  await p.fill('#sqDesc', 'Perdendo força na subida e soltando fumaça preta');
  const bytesCrus = await mandarFoto(p, '#sqFoto', 2);
  await p.waitForTimeout(3000);
  ok('as duas fotos entraram na prévia',
     (await p.evaluate(() => solicFotos.length)) === 2, String(await p.evaluate(() => solicFotos.length)));

  const tam = await p.evaluate(() => solicFotos.map(f => ({
    foto: Math.round(f.foto.length / 1024), mini: Math.round(f.miniatura.length / 1024) })));
  ok('a foto foi reduzida (crua ~' + Math.round(bytesCrus / 1024) + ' KB → ' + tam[0].foto + ' KB)',
     tam[0].foto < 300, JSON.stringify(tam[0]));
  ok('a miniatura ficou bem pequena', tam[0].mini < 30, tam[0].mini + ' KB');

  await p.click('#btnSqSalvar'); await p.waitForTimeout(1500);
  ok('a solicitação foi criada', (await p.evaluate(() => DB.solicitacoesLista().length)) === 1);
  const s1 = await p.evaluate(() => DB.solicitacoesLista()[0]);
  ok('nasce como Pendente', s1.situacao === 'Pendente', s1.situacao);
  ok('guarda quantas fotos tem', s1.nFotos === 2, String(s1.nFotos));
  ok('guarda a miniatura', !!s1.miniatura && s1.miniatura.startsWith('data:image/jpeg'));

  /* ===== 2. o teste que protege o app inteiro ===== */
  const depoisLS = await tamLocal(p);
  const cresceu = Math.round((depoisLS - antesLS) / 1024);
  ok('o localStorage NÃO cresceu com as fotos grandes', cresceu < 40, `cresceu ${cresceu} KB`);
  ok('e a foto grande não está no localStorage',
     (await p.evaluate(() => JSON.stringify(DB.load().solicitacoes).includes('fotos'))) === false);

  /* ===== 3. a foto grande está na nuvem, e cabe no limite ===== */
  const naNuvem = await p.evaluate(async () => {
    const lista = JSON.parse(await window.__fsLista('frota/gp2t/solicitacoes'));
    return lista.map(([id, json]) => ({ id, kb: Math.round(json.length / 1024), fotos: (JSON.parse(json).fotos || []).length }));
  });
  ok('o documento foi para a nuvem com as 2 fotos', naNuvem.length === 1 && naNuvem[0].fotos === 2,
     JSON.stringify(naNuvem));
  ok('e cabe no limite de 1 MiB do Firestore', naNuvem[0] && naNuvem[0].kb < 1024,
     (naNuvem[0] ? naNuvem[0].kb : '?') + ' KB');

  /* ===== 4. a lista e o filtro ===== */
  ok('a lista mostra a solicitação', (await p.textContent('#sqLista')).includes('CB-17'));
  ok('com a miniatura', (await p.$('#sqLista .mini-foto')) !== null);
  await p.evaluate(() => { DB.addSolicitacao({ equipamento: 'PC-01', parte: 'Pneu / rodagem',
    descricao: 'Furou', fotos: [], nFotos: 0, miniatura: '' }); navegar('solicitacoes'); });
  await p.waitForTimeout(700);
  ok('duas na lista', (await p.evaluate(() => DB.solicitacoesLista().length)) === 2);
  await p.evaluate(() => { const b = [...document.querySelectorAll('[data-sqf]')].find(x => x.dataset.sqf === 'Realizado'); b.click(); });
  await p.waitForTimeout(600);
  ok('filtrar por Realizado esvazia a lista', (await p.textContent('#sqLista')).includes('Nenhuma solicitação'));
  await p.evaluate(() => { const b = [...document.querySelectorAll('[data-sqf]')].find(x => x.dataset.sqf === ''); b.click(); });
  await p.waitForTimeout(600);

  /* ===== 5. as quatro situações ===== */
  await p.evaluate(id => { solicitacaoAberta = id; navegar('solicitacao'); },
                   await p.evaluate(() => DB.solicitacoesLista().find(x => x.equipamento === 'CB-17').id));
  await p.waitForTimeout(900);
  ok('o detalhe abre com o problema escrito', (await p.textContent('#app')).includes('fumaça preta'));
  ok('e busca as fotos da nuvem',
     (await p.evaluate(() => document.querySelectorAll('#sqFotos img').length)) >= 2,
     await p.evaluate(() => document.querySelectorAll('#sqFotos img').length + ' img'));

  await p.selectOption('#sqSit', 'Em atendimento');
  await p.click('#btnSqSit'); await p.waitForTimeout(900);
  ok('passa para Em atendimento',
     (await p.evaluate(() => DB.solicitacoesLista().find(x => x.equipamento === 'CB-17').situacao)) === 'Em atendimento');

  await p.selectOption('#sqSit', 'Realizado'); await p.waitForTimeout(300);
  ok('ao escolher Realizado aparece o campo do que foi feito',
     await p.evaluate(() => getComputedStyle(document.getElementById('sqConcWrap')).display !== 'none'));
  await p.fill('#sqConc', 'Trocado o bico injetor 3');
  await p.click('#btnSqSit'); await p.waitForTimeout(900);
  const feita = await p.evaluate(() => DB.solicitacoesLista().find(x => x.equipamento === 'CB-17'));
  ok('fica Realizado com o texto do serviço',
     feita.situacao === 'Realizado' && feita.conclusao === 'Trocado o bico injetor 3',
     JSON.stringify({ s: feita.situacao, c: feita.conclusao }));

  /* ===== 6. alerta no Índice ===== */
  let al = await p.evaluate(() => DB.alertas().map(a => a.msg));
  ok('a que está Pendente vira alerta', al.some(m => /PC-01.*pendente/i.test(m)),
     al.find(m => /PC-01/.test(m)) || '(nenhum)');
  ok('a Realizada não alerta mais', !al.some(m => /CB-17.*pendente/i.test(m)));
  await p.evaluate(() => {
    const id = DB.solicitacoesLista().find(x => x.equipamento === 'PC-01').id;
    const db = DB.load(); db.solicitacoes[id].criadoEm = Date.now() - 5 * 86400000; DB.save();
  });
  al = await p.evaluate(() => DB.alertas().filter(a => /PC-01/.test(a.msg)));
  ok('depois de 3 dias o alerta sobe de tom', al[0] && al[0].nivel === 'alto',
     JSON.stringify(al[0]));

  /* ===== 7. segundo celular recebe ===== */
  const p2 = await nova();
  await p2.evaluate(() => localStorage.clear());
  await p2.reload({ waitUntil: 'networkidle' });
  await entrar(p2, 'jean');
  await p2.waitForTimeout(2500);
  ok('o segundo celular recebeu as solicitações',
     (await p2.evaluate(() => DB.solicitacoesLista().length)) === 2,
     String(await p2.evaluate(() => DB.solicitacoesLista().length)));
  ok('mas SEM as fotos grandes no localStorage dele',
     (await p2.evaluate(() => JSON.stringify(DB.load().solicitacoes).includes('"fotos"'))) === false);
  const kb2 = Math.round((await tamLocal(p2)) / 1024);
  ok('o localStorage do segundo celular ficou pequeno', kb2 < 60, kb2 + ' KB');
  const fotos2 = await p2.evaluate(async () => {
    const id = DB.solicitacoesLista().find(x => x.equipamento === 'CB-17').id;
    return (await Cloud.fotosDaSolicitacao(id) || []).length;
  });
  ok('e ele busca as fotos da nuvem quando precisa', fotos2 === 2, String(fotos2));
  await p2.close();

  /* ===== 8. excluir ===== */
  await p.evaluate(id => { solicitacaoAberta = id; navegar('solicitacao'); },
                   await p.evaluate(() => DB.solicitacoesLista().find(x => x.equipamento === 'PC-01').id));
  await p.waitForTimeout(700);
  await p.click('#btnSqDel'); await p.waitForTimeout(400);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /confirmar/i.test(x.textContent)); b.click(); });
  await p.waitForTimeout(1200);
  ok('excluir tira da lista', (await p.evaluate(() => DB.solicitacoesLista().length)) === 1);

  /* ===== 9. operador não entra ===== */
  await p.evaluate(() => Auth.sair()); await p.waitForTimeout(900);
  await entrar(p, 'op');
  ok('operador não vê o cartão de Solicitações',
     !(await p.evaluate(() => [...document.querySelectorAll('.menu-card .lbl')].map(e => e.textContent))).includes('Solicitações'));
  await p.evaluate(() => navegar('solicitacoes')); await p.waitForTimeout(600);
  ok('e a rota é bloqueada para ele', !(await p.$('#sqEquip')));

  console.log('=== FALHAS: ' + log.filter(l => l.startsWith(' FALHA')).length + ' ===');
  const reais = errors.filter(e => !/net::ERR|gstatic|Failed to load resource|favicon/.test(e));
  console.log('=== ERROS JS REAIS: ' + reais.length + ' ==='); reais.slice(0, 6).forEach(e => console.log(' ! ' + e));
  await b.close();
})();
