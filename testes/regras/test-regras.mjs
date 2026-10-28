// Como rodar (pasta testes/regras):
//   npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
//   npx firebase emulators:exec --only firestore --project demo-gp2t "node test-regras.mjs"
// Regras do Firestore no emulador oficial: o que precisa continuar funcionando e as brechas fechadas.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, deleteField } from 'firebase/firestore';
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
  await setDoc(doc(db, 'usuarios/gil@gp2t.local'), { nome: 'Gil', perfil: 'gestor' });
  await setDoc(doc(db, 'checklist_usuarios/adm@gp2t.local'), { nome: 'Adm', perfil: 'admin' });
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

console.log('usuários e gestor da frota (STRACTA)');
const gil = como('gil@gp2t.local'), adm = como('adm@gp2t.local');
await ok(assertSucceeds(getDoc(doc(ze, 'checklist_usuarios/ze@gp2t.local'))), 'motorista lê o próprio cadastro');
await ok(assertFails(getDocs(collection(ze, 'checklist_usuarios'))), 'motorista NÃO lista usuários');
await ok(assertSucceeds(setDoc(doc(ana, 'checklist_usuarios/novo@gp2t.local'), { nome: 'Novo', perfil: 'motorista' })), 'gestor cadastra motorista');
await ok(assertFails(setDoc(doc(ana, 'checklist_usuarios/novo2@gp2t.local'), { nome: 'X', perfil: 'admin' })), 'gestor NÃO nomeia administrador');
await ok(assertFails(updateDoc(doc(ana, 'checklist_usuarios/adm@gp2t.local'), { ativo: false })), 'gestor NÃO bloqueia administrador');
await ok(assertSucceeds(setDoc(doc(gil, 'checklist_usuarios/novo3@gp2t.local'), { nome: 'N3', perfil: 'admin' })), 'gestor do app de frota entra como admin');
await ok(assertSucceeds(getDoc(doc(gil, 'checklist_inspecoes/i1'))), 'gestor da frota vê checklists');

console.log('várias empresas');
const jean = como('jean@gp2t.local');
const maria = como('maria@acme.gp2t.local'), joao = como('joao@acme.gp2t.local'), lia = como('lia@beta.gp2t.local');
await ok(assertFails(setDoc(doc(ana, 'empresas/acme'), { nome: 'Acme', ativo: true })), 'só o dono cria empresa');
await ok(assertFails(setDoc(doc(jean, 'empresas/stracta'), { nome: 'X' })), 'código "stracta" é reservado');
await ok(assertSucceeds(setDoc(doc(jean, 'empresas/acme'), { nome: 'Acme', ativo: true })), 'dono cria a Acme');
await ok(assertSucceeds(setDoc(doc(jean, 'empresas/beta'), { nome: 'Beta', ativo: true })), 'dono cria a Beta');
await ok(assertFails(setDoc(doc(jean, 'empresas/acme/usuarios/maria@gp2t.local'), { nome: 'M', perfil: 'admin' })), 'login de outra empresa NÃO entra na Acme');
await ok(assertSucceeds(setDoc(doc(jean, 'empresas/acme/usuarios/maria@acme.gp2t.local'), { nome: 'Maria', perfil: 'admin', ativo: true })), 'dono cria o 1º admin da Acme');
await ok(assertSucceeds(setDoc(doc(jean, 'empresas/beta/usuarios/lia@beta.gp2t.local'), { nome: 'Lia', perfil: 'admin', ativo: true })), 'dono cria o 1º admin da Beta');
await ok(assertSucceeds(getDoc(doc(maria, 'empresas/acme/usuarios/maria@acme.gp2t.local'))), 'admin da Acme lê o próprio cadastro (entra)');
await ok(assertSucceeds(setDoc(doc(maria, 'empresas/acme/usuarios/joao@acme.gp2t.local'), { nome: 'João', perfil: 'motorista' })), 'admin da Acme cadastra motorista');
await ok(assertSucceeds(setDoc(doc(maria, 'empresas/acme/equipamentos/x1'), { prefixo: 'AC-01' })), 'admin da Acme cadastra equipamento');
await ok(assertSucceeds(setDoc(doc(joao, 'empresas/acme/inspecoes/a1'), { criadoPor: 'joao@acme.gp2t.local', itens: [], midias: {} })), 'motorista da Acme envia checklist');
await ok(assertSucceeds(updateDoc(doc(joao, 'empresas/acme/equipamentos/x1'), { 'pendencias.a1': 'bloqueado' })), 'motorista da Acme abre pendência');
await ok(assertSucceeds(setDoc(doc(joao, 'empresas/acme/fotos/af1'), { criadoPor: 'joao@acme.gp2t.local', inspecao: 'a1', dados: jpg })), 'motorista da Acme envia foto');
await ok(assertSucceeds(getDocs(collection(maria, 'empresas/acme/inspecoes'))), 'admin da Acme vê os checklists dela');
await ok(assertFails(getDocs(collection(lia, 'empresas/acme/inspecoes'))), 'admin da Beta NÃO vê checklists da Acme');
await ok(assertFails(getDoc(doc(lia, 'empresas/acme/equipamentos/x1'))), 'Beta NÃO vê equipamento da Acme');
await ok(assertFails(getDoc(doc(lia, 'empresas/acme/fotos/af1'))), 'Beta NÃO vê foto da Acme');
await ok(assertFails(setDoc(doc(lia, 'empresas/acme/usuarios/lia@beta.gp2t.local'), { nome: 'Lia', perfil: 'admin' })), 'Beta NÃO se cadastra na Acme');
await ok(assertFails(getDocs(collection(maria, 'checklist_inspecoes'))), 'Acme NÃO vê checklists da STRACTA');
await ok(assertFails(getDoc(doc(maria, 'checklist_equipamentos/e1'))), 'Acme NÃO vê equipamentos da STRACTA');
await ok(assertFails(getDocs(collection(ana, 'empresas/acme/inspecoes'))), 'gestora da STRACTA NÃO vê checklists da Acme');
await ok(assertFails(getDocs(collection(gil, 'empresas/acme/inspecoes'))), 'gestor da frota NÃO vê a Acme');
await ok(assertFails(getDocs(collection(jean, 'empresas/acme/inspecoes'))), 'nem o dono lê os checklists da Acme');
await ok(assertFails(getDocs(collection(maria, 'empresas'))), 'Acme NÃO lista as empresas');
await ok(assertSucceeds(getDocs(collection(jean, 'empresas'))), 'dono lista as empresas');
await ok(assertFails(updateDoc(doc(maria, 'empresas/acme'), { ativo: true, plano: 'ouro' })), 'Acme NÃO mexe na própria ficha');
await ok(assertSucceeds(updateDoc(doc(jean, 'empresas/acme'), { ativo: false })), 'dono suspende a Acme');
await ok(assertFails(getDoc(doc(joao, 'empresas/acme/usuarios/joao@acme.gp2t.local'))), 'empresa suspensa: ninguém entra');
await ok(assertFails(getDoc(doc(maria, 'empresas/acme/equipamentos/x1'))), 'empresa suspensa: dados fechados');
await ok(assertSucceeds(updateDoc(doc(jean, 'empresas/acme'), { ativo: true })), 'dono reativa');
await ok(assertSucceeds(getDoc(doc(maria, 'empresas/acme/equipamentos/x1'))), 'reativada: volta a ver');

await env.cleanup();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO CERTO');
process.exit(falhas ? 1 : 0);
