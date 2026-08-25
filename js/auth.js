// ============================================================================
// auth.js — Autenticação e controle de permissões (perfis)
// Senhas armazenadas apenas como hash SHA-256 + salt (nunca em texto puro).
// ============================================================================
import { getAll, put, byIndex, uid, audit } from './store.js';

const SESSION_KEY = 'stracta_sessao';

// Matriz de permissões por perfil.
// Ações: ver | lancar | manutencao | cadastrar | editar | excluir | usuarios | exportar
const PERMISSOES = {
  Administrador: ['ver','lancar','manutencao','cadastrar','editar','excluir','usuarios','exportar'],
  Gestor:        ['ver','lancar','manutencao','cadastrar','editar','exportar'],
  Operador:      ['ver','lancar'],
  'Visualização':['ver','exportar'],
};

export function podeFazer(usuario, acao) {
  if (!usuario) return false;
  return (PERMISSOES[usuario.perfil] || []).includes(acao);
}

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashSenha(senha, salt) {
  return sha256(`${salt}::${senha}`);
}

export async function criarUsuario({ nome, email, senha, perfil }, autor) {
  const existentes = await byIndex('usuarios', 'email', email.toLowerCase());
  if (existentes.length) throw new Error('Já existe um usuário com este e-mail.');
  const salt = uid();
  const u = {
    id: uid(), nome, email: email.toLowerCase(), perfil,
    salt, hash: await hashSenha(senha, salt),
    status: 'Ativo', created_at: new Date().toISOString(),
  };
  await put('usuarios', u);
  await audit('criar', 'usuarios', u.email, autor);
  return u;
}

export async function atualizarSenha(id, novaSenha, autor) {
  const todos = await getAll('usuarios');
  const u = todos.find((x) => x.id === id);
  if (!u) throw new Error('Usuário não encontrado.');
  u.salt = uid();
  u.hash = await hashSenha(novaSenha, u.salt);
  await put('usuarios', u);
  await audit('editar', 'usuarios', u.email, autor);
}

export async function login(email, senha) {
  const encontrados = await byIndex('usuarios', 'email', (email || '').toLowerCase());
  const u = encontrados[0];
  if (!u) throw new Error('E-mail ou senha inválidos.');
  if (u.status !== 'Ativo') throw new Error('Usuário inativo. Contate o administrador.');
  const hash = await hashSenha(senha, u.salt);
  if (hash !== u.hash) throw new Error('E-mail ou senha inválidos.');
  const sessao = { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
  return sessao;
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function usuarioAtual() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

// Garante que exista pelo menos um administrador (primeira execução).
export async function garantirAdmin() {
  const usuarios = await getAll('usuarios');
  if (usuarios.length) return false;
  await criarUsuario(
    { nome: 'Administrador', email: 'admin@stracta.com', senha: 'admin123', perfil: 'Administrador' },
    'sistema'
  );
  return true;
}

export { PERMISSOES };
