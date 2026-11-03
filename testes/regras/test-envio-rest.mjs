// Como rodar: igual ao test-regras.mjs, trocando o arquivo (npx firebase emulators:exec ... "node test-envio-rest.mjs")
// Envio REST do service worker contra o emulador oficial, com as regras de verdade.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import vm from 'vm';
import { doc, setDoc, getDoc } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-gp2t', firestore: { rules: readFileSync('' + new URL('../../regras.txt', import.meta.url).pathname + '', 'utf8'), host: '127.0.0.1', port: 8085 } });
let adm;
await env.withSecurityRulesDisabled(async c => {
  adm = c.firestore();
  await setDoc(doc(adm, 'checklist_usuarios/ze@gp2t.local'), { nome: 'Zé', perfil: 'motorista' });
  await setDoc(doc(adm, 'checklist_equipamentos/e1'), { prefixo: 'CB-12', pendencias: {} });
});
const ctx = { FIREBASE_CONFIG: { projectId: 'demo-gp2t', apiKey: 'x' }, fetch, btoa, console, Date, JSON, Number, String, Object, Uint8Array, encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../../checklist/js/envio.js', import.meta.url), 'utf8') + ';this.EnvioREST=EnvioREST;', ctx);
const R = ctx.EnvioREST;
R.base = () => 'http://127.0.0.1:8085/v1/projects/demo-gp2t/databases/(default)/documents';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = email => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ iss: 'https://securetoken.google.com/demo-gp2t', aud: 'demo-gp2t', sub: email.split('@')[0], user_id: email.split('@')[0], email, email_verified: false, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'password' } }) + '.';
const tk = { email: 'ze@gp2t.local', id: jwt('ze@gp2t.local') };
let falhas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✖ ') + m); if (!c) falhas++; };
const id = '1abcDEF-x9';   // começa com número e tem hífen: precisa de crase no caminho
const insp = { id, criadoPor: 'ze@gp2t.local', criadoEm: Date.now(), resultado: 'bloqueado', km: 12.5, horimetro: null, itens: [{ id: 'i1', st: 'nok', critico: true, obs: 'freio' }],
  midias: { m1: { item: 'geral', tipo: 'foto', path: 'checklist_fotos/m1', ok: false, dur: null } }, pendentes: 1, geo: null, tratativa: { status: 'aberto' } };
const it = { id, email: 'ze@gp2t.local', docPath: 'checklist_inspecoes/' + id, equipPath: 'checklist_equipamentos/e1', resultado: 'bloqueado', dados: insp };
ok(await R.enviarChecklist(tk, it) === 'enviado', 'regras aceitam o checklist e a pendência');
ok(await R.enviarChecklist(tk, it) === 'ja', 'segunda vez: já está lá, não regrava');
const blob = new Blob([Buffer.from('/9j/4AAQ', 'base64')], { type: 'image/jpeg' });
ok(await R.enviarFoto(tk, { mid: 'm1', inspId: id, path: 'checklist_fotos/m1', blob, item: 'geral' }, 'checklist_inspecoes/' + id) === 'enviado', 'regras aceitam a foto e a marcação');
ok(await R.enviarFoto(tk, { mid: 'm1', inspId: id, path: 'checklist_fotos/m1', blob, item: 'geral' }, 'checklist_inspecoes/' + id) === 'ja', 'foto já marcada: não desconta de novo');
let outro = false;
try { await R.enviarChecklist({ email: 'ze@gp2t.local', id: jwt('beto@gp2t.local') }, Object.assign({}, it, { id: 'zz', docPath: 'checklist_inspecoes/zz' })); } catch (e) { outro = true; }
ok(outro, 'outra pessoa não envia em nome do Zé');
{ const ler = async p => (await (await fetch(R.base() + '/' + p, { headers: { Authorization: 'Bearer owner' } })).json()).fields;
  const i = await ler('checklist_inspecoes/' + id), e = await ler('checklist_equipamentos/e1');
  ok(i.pendentes.integerValue === '0' && i.midias.mapValue.fields.m1.mapValue.fields.ok.booleanValue === true && i.km.doubleValue === 12.5
    && i.itens.arrayValue.values[0].mapValue.fields.obs.stringValue === 'freio' && 'nullValue' in i.horimetro, 'dados chegam iguais (números, listas, nulos)');
  ok(e.pendencias.mapValue.fields[id].stringValue === 'bloqueado', 'pendência gravada com o id certo');
}
await env.cleanup();
console.log(falhas ? falhas + ' FALHA(S)' : 'TUDO CERTO');
process.exit(falhas ? 1 : 0);
