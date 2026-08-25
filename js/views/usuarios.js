// ============================================================================
// Usuários e permissões (somente Administrador) + auditoria
// ============================================================================
import { getAll, del, audit } from '../store.js';
import { usuarioAtual, podeFazer, criarUsuario, atualizarSenha, PERMISSOES } from '../auth.js';
import { secao, tabela, esc, modal, lerForm, options, toast, confirmar } from '../ui.js';
import { PERFIS } from '../store.js';
import { dataHoraBR } from '../format.js';

export async function render() {
  const u = usuarioAtual();
  if (!podeFazer(u, 'usuarios')) return '<div class="erro-box">Acesso restrito ao Administrador.</div>';

  const usuarios = (await getAll('usuarios')).sort((a, b) => a.nome.localeCompare(b.nome));
  const auditoria = (await getAll('auditoria')).sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 50);

  const cols = [
    { h: 'Nome', get: (x) => esc(x.nome) },
    { h: 'E-mail', get: (x) => esc(x.email) },
    { h: 'Perfil', get: (x) => `<span class="tag">${esc(x.perfil)}</span>` },
    { h: 'Status', get: (x) => esc(x.status) },
    { h: '', cls: 'acoes-col', get: (x) => `
        <button class="btn-icon" data-senha="${x.id}" title="Redefinir senha">🔑</button>
        <button class="btn-icon" data-del-u="${x.id}" title="Excluir">🗑️</button>` },
  ];

  const permTabela = `
    <div class="tabela-wrap"><table class="tabela tabela--compacta"><thead><tr>
      <th>Perfil</th><th>Permissões</th></tr></thead><tbody>
      ${PERFIS.map((p) => `<tr><td><strong>${esc(p)}</strong></td><td>${(PERMISSOES[p] || []).map((a) => `<span class="tag">${esc(a)}</span>`).join(' ')}</td></tr>`).join('')}
    </tbody></table></div>`;

  const colsAudit = [
    { h: 'Quando', get: (a) => dataHoraBR(a.data) },
    { h: 'Ação', get: (a) => esc(a.acao) },
    { h: 'Entidade', get: (a) => esc(a.entidade) },
    { h: 'Referência', get: (a) => esc(a.ref) },
    { h: 'Usuário', get: (a) => esc(a.usuario) },
  ];

  const html = `
    <div class="page-head">
      <div><h1>Usuários e permissões</h1><p class="sub">Controle de acesso e rastreabilidade</p></div>
      <button class="btn btn--primary" id="btn-novo-u">+ Novo usuário</button>
    </div>
    ${secao('Usuários', tabela(cols, usuarios, { vazio: 'Nenhum usuário.' }))}
    ${secao('Perfis e permissões', permTabela)}
    ${secao('Auditoria (últimas 50 ações)', tabela(colsAudit, auditoria, { vazio: 'Sem registros de auditoria.' }))}
  `;

  return { html, montar: (root) => {
    root.querySelector('#btn-novo-u').onclick = () => abrirFormUsuario();
    root.querySelectorAll('[data-senha]').forEach((b) => b.onclick = () => redefinirSenha(b.dataset.senha));
    root.querySelectorAll('[data-del-u]').forEach((b) => b.onclick = () => excluir(b.dataset.delU));
  }};
}

async function abrirFormUsuario() {
  const ok = await modal({
    titulo: 'Novo usuário',
    corpoHTML: `
      <form class="form-grid">
        <label class="col-full">Nome *<input name="nome" required></label>
        <label>E-mail *<input name="email" type="email" required></label>
        <label>Perfil *<select name="perfil" required>${options(PERFIS.map((p) => ({ id: p, nome: p })), 'Gestor')}</select></label>
        <label class="col-full">Senha *<input name="senha" type="password" required minlength="4"></label>
      </form>`,
  });
  if (!ok) return;
  const d = lerForm(document.querySelector('.modal form'));
  try {
    await criarUsuario({ nome: d.nome.trim(), email: d.email.trim(), senha: d.senha, perfil: d.perfil }, usuarioAtual()?.nome);
    toast('Usuário criado.', 'ok');
    location.reload();
  } catch (e) { toast(e.message, 'erro'); }
}

async function redefinirSenha(id) {
  const ok = await modal({
    titulo: 'Redefinir senha',
    okLabel: 'Salvar',
    corpoHTML: `<form class="form-grid"><label class="col-full">Nova senha *<input name="senha" type="password" required minlength="4"></label></form>`,
  });
  if (!ok) return;
  const d = lerForm(document.querySelector('.modal form'));
  await atualizarSenha(id, d.senha, usuarioAtual()?.nome);
  toast('Senha atualizada.', 'ok');
}

async function excluir(id) {
  const atual = usuarioAtual();
  if (atual.id === id) return toast('Você não pode excluir o próprio usuário logado.', 'erro');
  const usuarios = await getAll('usuarios');
  if (usuarios.length <= 1) return toast('Deve existir ao menos um usuário.', 'erro');
  if (!(await confirmar('Excluir usuário', 'Confirma excluir este usuário?', 'Excluir'))) return;
  await del('usuarios', id);
  await audit('excluir', 'usuarios', id, atual.nome);
  toast('Usuário excluído.', 'ok');
  location.reload();
}
