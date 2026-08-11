/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — auth.js
   Login, sessão e permissões. Funciona 100% offline: as
   credenciais ficam salvas no IndexedDB local.
   ══════════════════════════════════════════════════════════ */

const SESSAO_CHAVE = 'stracta_viagens_sessao';

const Auth = {
  async garantirUsuarioPadrao() {
    const usuarios = await DB.getAll('usuarios');
    if (usuarios.length === 0) {
      const admin = {
        id: gerarId('user'),
        tipo: 'usuario',
        usuario: 'admin',
        senha: 'admin123',
        nome: 'Administrador',
        nivel: 'Administrador',
        criadoEm: agoraISO()
      };
      await DB.put('usuarios', admin);
      if (typeof Sync !== 'undefined') Sync.enfileirar('usuario', admin);
    }
  },

  async login(usuario, senha) {
    const usuarios = await DB.getAll('usuarios');
    const alvo = String(usuario).trim().toLowerCase();
    const senhaTrim = String(senha).trim();
    // Aceita entrar tanto pelo login (usuario) quanto pelo nome, sem diferenciar
    // maiúsculas e ignorando espaços acidentais na senha. Guarda contra registros
    // malformados (sem usuario/nome/senha) para não travar a busca.
    const encontrado = usuarios.find(u =>
      (
        (u.usuario || '').trim().toLowerCase() === alvo ||
        (u.nome || '').trim().toLowerCase() === alvo
      ) &&
      String(u.senha || '').trim() === senhaTrim
    );
    if (!encontrado) return { sucesso: false, erro: 'Usuário ou senha inválidos' };

    const sessao = {
      id: encontrado.id,
      usuario: encontrado.usuario,
      nome: encontrado.nome,
      nivel: encontrado.nivel,
      logadoEm: agoraISO()
    };
    localStorage.setItem(SESSAO_CHAVE, JSON.stringify(sessao));
    return { sucesso: true, sessao };
  },

  logout() {
    localStorage.removeItem(SESSAO_CHAVE);
  },

  usuarioAtual() {
    try {
      return JSON.parse(localStorage.getItem(SESSAO_CHAVE) || 'null');
    } catch (e) { return null; }
  },

  estaLogado() {
    return !!this.usuarioAtual();
  },

  async cadastrarMotorista({ nome, matricula }) {
    const motorista = {
      id: gerarId('mot'),
      nome, matricula: matricula || '',
      ativo: true,
      criadoEm: agoraISO()
    };
    await DB.put('motoristas', motorista);
    return motorista;
  },

  // ---------- GESTÃO DE USUÁRIOS ----------
  async listarUsuarios() {
    const usuarios = await DB.getAll('usuarios');
    return usuarios.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  },

  async criarUsuario({ usuario, senha, nome, nivel }) {
    if (!usuario || !senha || !nome) return { sucesso: false, erro: 'Preencha usuário, senha e nome' };
    const existentes = await DB.getAll('usuarios');
    const jaExiste = existentes.find(u => (u.usuario || '').trim().toLowerCase() === String(usuario).trim().toLowerCase());
    if (jaExiste) return { sucesso: false, erro: 'Já existe um usuário com esse login' };

    const novo = {
      id: gerarId('user'),
      tipo: 'usuario',
      usuario: usuario.trim(),
      senha: String(senha).trim(),
      nome: nome.trim(),
      nivel: nivel || 'Motorista',
      criadoEm: agoraISO()
    };
    await DB.put('usuarios', novo);
    if (typeof Sync !== 'undefined') Sync.enfileirar('usuario', novo);
    return { sucesso: true, usuario: novo };
  },

  async removerUsuario(id) {
    const atual = this.usuarioAtual();
    if (atual && atual.id === id) return { sucesso: false, erro: 'Você não pode remover o usuário com o qual está logado' };
    await DB.delete('usuarios', id);
    if (typeof Sync !== 'undefined') Sync.enfileirarExclusao('usuario', id);
    return { sucesso: true };
  },

  async resetarSenha(id, novaSenha) {
    novaSenha = String(novaSenha || '').trim();
    if (!novaSenha || novaSenha.length < 4) return { sucesso: false, erro: 'A senha precisa ter pelo menos 4 caracteres' };
    const usuario = await DB.get('usuarios', id);
    if (!usuario) return { sucesso: false, erro: 'Usuário não encontrado' };
    usuario.senha = novaSenha;
    usuario.senhaAlteradaEm = agoraISO();
    await DB.put('usuarios', usuario);
    if (typeof Sync !== 'undefined') Sync.enfileirar('usuario', usuario);
    return { sucesso: true };
  }
};

window.Auth = Auth;
