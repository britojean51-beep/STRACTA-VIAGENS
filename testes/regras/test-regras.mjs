// Como rodar (pasta testes/regras):
//   npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
//   npx firebase emulators:exec --only firestore --project demo-gp2t "node test-regras.mjs"
// Regras do Firestore no emulador oficial: o que precisa continuar funcionando e as brechas fechadas.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, updateDoc, getDoc, deleteField } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-gp2t', firestore: { rules: readFileSync(new URL('../../regras.txt', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
let falhas = 0;
const ok = async (p, msg) => { try { await p; console.log('  ✔ ' + msg); } catch (e) { falhas++; console.log('  ✖ ' + msg + ' — ' + e.message.split('\n')[0]); } };
const como = e => env.authenticatedContext(e.split('@')[0], { email: e }).firestore();
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, 'checklist_usuarios/ze@gp2t.local'), { nome: 'Zé', perfil: 'motorista' });
  await setDoc(doc(db, 'checklist_usuarios/beto@gp2t.local'), { nome: 'Beto', perfil: 'motorista' });
  await setDoc(doc(db, 'checklist_usuarios/ana@gp2t.local'), { nome: 'Ana', perfil: 'gestor' });
  await setDoc(doc(db, 'checklist_usuarios/rita@gp2t.local'), { nome: 'Rita', perfil: 'tecnico' });
  await setDoc(doc(db, 'checklist_equipamentos/e1'), { prefixo: 'CB-12', pendencias: { a: 'bloqueado', b: 'restricao' } });
  await setDoc(doc(db, 'checklist_inspecoes/i1'), { criadoPor: 'ze@gp2t.local', itens: [], midias: {}, pendentes: 0 });
  await setDoc(doc(db, 'checklist_fotos/f1'), { criadoPor: 'ze@gp2t.local', inspecao: 'i1', dados: 'data:image/jpeg;base64,AAA' });
});
const ze = como('ze@gp2t.local'), beto = como('beto@gp2t.local'), ana = como('ana@gp2t.local'), rita = como('rita@gp2t.local');
const jpg = 'data:image/jpeg;base64,BBB';

console.log('pendências do equipamento (quem faz checklist)');
await ok(assertSucceeds(updateDoc(doc(ze, 'checklist_equipamentos/e1'), { 'pendencias.c': 'restricao' })), 'acrescenta pendência nova');
await ok(assertSucceeds(updateDoc(doc(ze, 'checklist_equipamentos/e1'), { 'pendencias.b': 'bloqueado' })), 'sobe restricao -> bloqueado (problema apontado que obriga parada)');
await ok(assertFails(updateDoc(doc(ze, 'checklist_equipamentos/e1'), { 'pendencias.a': 'restricao' })), 'NÃO rebaixa bloqueado -> restricao');
await ok(assertFails(updateDoc(doc(ze, 'checklist_equipamentos/e1'), { 'pendencias.a': deleteField() })), 'NÃO tira pendência');
await ok(assertFails(updateDoc(doc(ze, 'checklist_equipamentos/e1'), { 'pendencias.c': 'qualquer' })), 'NÃO grava valor estranho');
await ok(assertSucceeds(updateDoc(doc(ana, 'checklist_equipamentos/e1'), { 'pendencias.a': deleteField() })), 'gestão resolve (tira pendência)');

console.log('checklist');
await ok(assertSucceeds(setDoc(doc(ze, 'checklist_inspecoes/i2'), { criadoPor: 'ze@gp2t.local', itens: [], midias: {} })), 'motorista envia checklist em nome próprio');
await ok(assertFails(setDoc(doc(ze, 'checklist_inspecoes/i3'), { criadoPor: 'beto@gp2t.local', itens: [] })), 'NÃO envia em nome de outro');
await ok(assertFails(setDoc(doc(ze, 'checklist_inspecoes/i4'), { criadoPor: 'ze@gp2t.local', itens: [], resolucoes: { x: { nota: 'ok' } } })), 'NÃO cria checklist já "resolvido"');
await ok(assertFails(setDoc(doc(ze, 'checklist_inspecoes/i5'), { criadoPor: 'ze@gp2t.local', itens: [], vistos: { a: 1 } })), 'NÃO cria checklist já "visualizado"');
await ok(assertSucceeds(updateDoc(doc(ze, 'checklist_inspecoes/i1'), { 'apontamentos.p1': { obs: 'freio' } })), 'motorista aponta problema no próprio checklist');
await ok(assertFails(updateDoc(doc(beto, 'checklist_inspecoes/i1'), { 'apontamentos.p2': { obs: 'x' } })), 'NÃO aponta no checklist de outro');
await ok(assertSucceeds(updateDoc(doc(ana, 'checklist_inspecoes/i1'), { 'resolucoes.p1': { nota: 'trocado' } })), 'gestão resolve item');
await ok(assertSucceeds(updateDoc(doc(rita, 'checklist_inspecoes/i1'), { 'vistos.rita': { por: 'Rita' } })), 'técnico marca visualizado');
await ok(assertFails(updateDoc(doc(rita, 'checklist_inspecoes/i1'), { 'resolucoes.p9': { nota: 'x' } })), 'técnico NÃO resolve');
await ok(assertFails(getDoc(doc(beto, 'checklist_inspecoes/i1'))), 'motorista NÃO lê checklist de outro');

console.log('fotos');
await ok(assertSucceeds(setDoc(doc(ze, 'checklist_fotos/f2'), { criadoPor: 'ze@gp2t.local', inspecao: 'i1', dados: jpg })), 'envia foto nova');
await ok(assertSucceeds(setDoc(doc(ze, 'checklist_fotos/f1'), { criadoPor: 'ze@gp2t.local', inspecao: 'i1', dados: jpg })), 'reenvia a própria foto');
await ok(assertFails(setDoc(doc(beto, 'checklist_fotos/f1'), { criadoPor: 'beto@gp2t.local', inspecao: 'i1', dados: jpg })), 'NÃO troca a foto de outra pessoa');
await ok(assertFails(setDoc(doc(ze, 'checklist_fotos/f3'), { criadoPor: 'ze@gp2t.local', inspecao: 'i1', dados: 'data:image/png;base64,A' })), 'NÃO aceita o que não é JPEG');
await ok(assertFails(getDoc(doc(beto, 'checklist_fotos/f1'))), 'motorista NÃO vê foto do checklist de outro');

await env.cleanup();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO CERTO');
process.exit(falhas ? 1 : 0);
