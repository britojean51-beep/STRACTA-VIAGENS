/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — permissoes.js
   Módulo único e central de autorização. Nenhuma tela deve
   verificar "nivel === algumaCoisa" diretamente — sempre chamar
   uma função daqui. Isso evita duplicar regra de acesso em
   vários lugares (e esquecer de atualizar uma delas depois).
   ══════════════════════════════════════════════════════════ */

const NIVEL_HIERARQUIA = ['Motorista', 'Encarregado', 'Supervisor', 'Gerente', 'Administrador'];

// Normaliza níveis legados: 'Desenvolvedor' deixou de existir e conta como 'Administrador'.
function _normalizarNivel(n) {
  return n === 'Desenvolvedor' ? 'Administrador' : n;
}

const Permissoes = {
  usuarioAtual() {
    return (typeof Auth !== 'undefined') ? Auth.usuarioAtual() : null;
  },

  nivelAtual() {
    const u = this.usuarioAtual();
    return u ? _normalizarNivel(u.nivel) : null;
  },

  nivelPeloMenos(nivelMinimo) {
    const atual = this.nivelAtual();
    if (!atual) return false;
    const idxAtual = NIVEL_HIERARQUIA.indexOf(atual);
    const idxMinimo = NIVEL_HIERARQUIA.indexOf(_normalizarNivel(nivelMinimo));
    if (idxAtual === -1 || idxMinimo === -1) return false;
    return idxAtual >= idxMinimo;
  },

  ehMotorista() { return this.nivelAtual() === 'Motorista'; },

  // Ver todos os dados operacionais (viagens/abastecimentos/deslocamentos de todo mundo)
  podeVerTudoOperacional() { return this.nivelPeloMenos('Encarregado'); },

  // Cadastrar/editar/apagar/desativar equipamentos
  podeGerenciarFrota() { return this.nivelPeloMenos('Encarregado'); },

  // Cadastrar/editar/apagar/ativar rotas (viagem e deslocamento).
  // Motorista NÃO cria rotas — apenas usa as que já existem.
  podeGerenciarRotas() { return this.nivelPeloMenos('Encarregado'); },

  // Lançamento atrasado (registrar viagem/deslocamento esquecido com horário manual).
  // Restrito à gestão, para evitar lançamentos manuais indevidos.
  podeLancarAtrasado() { return this.nivelPeloMenos('Encarregado'); },

  // Colocar/tirar equipamento de manutenção — todo mundo pode, inclusive Motorista
  // (é uma ação operacional do dia a dia, diferente de gerir o cadastro da frota)
  podeAlternarManutencao() { return !!this.usuarioAtual(); },

  // Criar/editar/apagar usuários e redefinir senha
  podeGerenciarUsuarios() { return this.nivelPeloMenos('Administrador'); },

  // Painel de diagnóstico técnico
  podeVerDiagnostico() { return this.nivelPeloMenos('Administrador'); },

  // Rotas: só a gestão (Encarregado+) cria/edita/apaga. Motorista apenas usa.
  podeEditarRota() {
    return this.podeGerenciarRotas();
  },

  // Filtra uma lista de registros (viagens, abastecimentos, deslocamentos...) pelo
  // que o usuário tem permissão de ver. Motorista só vê o que é dele mesmo.
  filtrarPorVisibilidade(lista, campoUsuarioId = 'motoristaId') {
    if (this.podeVerTudoOperacional()) return lista;
    const u = this.usuarioAtual();
    if (!u) return [];
    return lista.filter(item => item[campoUsuarioId] === u.id);
  }
};

window.Permissoes = Permissoes;
window.NIVEL_HIERARQUIA = NIVEL_HIERARQUIA;
