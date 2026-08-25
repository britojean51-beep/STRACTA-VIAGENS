// ============================================================================
// main.js — Bootstrap do aplicativo: banco, sessão, layout e rotas
// ============================================================================
import { initDB, seedIfEmpty } from './store.js';
import { garantirAdmin, usuarioAtual, login, logout, podeFazer } from './auth.js';
import { rota, iniciarRouter, setNotFound, irPara } from './router.js';
import { esc, toast } from './ui.js';

import * as Dashboard from './views/dashboard.js';
import * as Equipamentos from './views/equipamentos.js';
import * as Operadores from './views/operadores.js';
import * as Lancamento from './views/lancamento.js';
import * as ResumoDiario from './views/resumo-diario.js';
import * as ResumoMensal from './views/resumo-mensal.js';
import * as Manutencoes from './views/manutencoes.js';
import * as Relatorios from './views/relatorios.js';
import * as Busca from './views/busca.js';
import * as Usuarios from './views/usuarios.js';

// Estrutura do menu (rota, rótulo, ícone, aparece no menu inferior mobile?)
const NAV = [
  { rota: '#/', label: 'Início', icon: '🏠', mobile: true },
  { rota: '#/equipamentos', label: 'Frota', icon: '🚛', mobile: true },
  { rota: '#/operadores', label: 'Operadores', icon: '👷', mobile: false },
  { rota: '#/lancamento', label: 'Operação', icon: '⛽', mobile: true },
  { rota: '#/resumo-diario', label: 'Resumo diário', icon: '📅', mobile: false },
  { rota: '#/resumo-mensal', label: 'Resumo mensal', icon: '📈', mobile: false },
  { rota: '#/manutencao', label: 'Manutenção', icon: '🔧', mobile: true },
  { rota: '#/relatorios', label: 'Relatórios', icon: '📊', mobile: true },
  { rota: '#/busca', label: 'Histórico', icon: '🔎', mobile: false },
  { rota: '#/usuarios', label: 'Usuários', icon: '👤', mobile: false, admin: true },
];

async function boot() {
  await initDB();
  await seedIfEmpty();
  await garantirAdmin();

  if (!usuarioAtual()) return telaLogin();
  montarApp();
}

// ---------- Login -----------------------------------------------------------
function telaLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login">
      <div class="login__card">
        <div class="login__logo">🚛</div>
        <h1>STRACTA <span>Frota</span></h1>
        <p class="login__sub">Gestão operacional de frota</p>
        <form id="form-login" class="login__form">
          <label>E-mail<input type="email" name="email" value="admin@stracta.com" required autocomplete="username"></label>
          <label>Senha<input type="password" name="senha" value="" required autocomplete="current-password" placeholder="Sua senha"></label>
          <button class="btn btn--primary btn--grande" type="submit">Entrar</button>
        </form>
        <p class="login__dica">Primeiro acesso: <strong>admin@stracta.com</strong> / <strong>admin123</strong></p>
      </div>
    </div>`;
  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await login(f.email.value, f.senha.value);
      montarApp();
      toast('Bem-vindo!', 'ok');
    } catch (err) {
      toast(err.message, 'erro');
    }
  });
}

// ---------- Shell do app ----------------------------------------------------
function montarApp() {
  const u = usuarioAtual();
  const itensVisiveis = NAV.filter((n) => !n.admin || podeFazer(u, 'usuarios'));
  const app = document.getElementById('app');

  const lateral = itensVisiveis.map((n) =>
    `<a href="${n.rota}" data-rota="${n.rota}" class="nav-item"><span class="nav-ic">${n.icon}</span><span>${esc(n.label)}</span></a>`
  ).join('');

  const inferior = NAV.filter((n) => n.mobile).map((n) =>
    `<a href="${n.rota}" data-rota="${n.rota}" class="tab-item"><span class="tab-ic">${n.icon}</span><span>${esc(n.label)}</span></a>`
  ).join('');

  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><span class="brand__ic">🚛</span><div><strong>STRACTA</strong><span>Gestão de Frota</span></div></div>
        <nav class="nav">${lateral}</nav>
        <div class="sidebar__user">
          <div class="avatar">${esc((u.nome || '?')[0].toUpperCase())}</div>
          <div class="sidebar__user-info"><strong>${esc(u.nome)}</strong><span>${esc(u.perfil)}</span></div>
          <button class="btn-icon" id="btn-sair" title="Sair">⎋</button>
        </div>
      </aside>

      <main class="conteudo">
        <header class="topbar">
          <button class="topbar__menu" id="btn-menu" aria-label="Menu">☰</button>
          <span class="topbar__titulo" id="topbar-titulo">Dashboard</span>
          <a href="#/lancamento" class="topbar__acao">⛽ Lançar</a>
        </header>
        <div id="outlet" class="outlet"></div>
      </main>

      <nav class="tabbar">${inferior}</nav>
      <div class="backdrop" id="backdrop"></div>
    </div>`;

  registrarRotas();

  const outlet = document.getElementById('outlet');
  iniciarRouter(outlet, (path) => {
    // Marca item ativo + título.
    const hash = '#' + path;
    document.querySelectorAll('[data-rota]').forEach((a) => {
      const r = a.dataset.rota;
      const ativo = r === hash || (r !== '#/' && hash.startsWith(r));
      a.classList.toggle('ativo', ativo || (r === '#/' && (hash === '#/' || hash === '#')));
    });
    const item = NAV.find((n) => n.rota === hash) ||
      NAV.find((n) => n.rota !== '#/' && hash.startsWith(n.rota));
    document.getElementById('topbar-titulo').textContent = item ? item.label : 'STRACTA Frota';
    fecharMenu();
  });

  // Menu mobile
  const btnMenu = document.getElementById('btn-menu');
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('backdrop');
  const abrirMenu = () => { sidebar.classList.add('aberta'); backdrop.classList.add('ativo'); };
  window.fecharMenu = () => { sidebar.classList.remove('aberta'); backdrop.classList.remove('ativo'); };
  btnMenu.onclick = abrirMenu;
  backdrop.onclick = fecharMenu;

  document.getElementById('btn-sair').onclick = () => { logout(); telaLogin(); };
}

function fecharMenu() { if (window.fecharMenu) window.fecharMenu(); }

// ---------- Registro de rotas ----------------------------------------------
function registrarRotas() {
  rota('/', () => Dashboard.render());
  rota('/equipamentos', () => Equipamentos.renderLista());
  rota('/equipamento/:id', (p) => Equipamentos.renderPerfil(p));
  rota('/operadores', () => Operadores.renderLista());
  rota('/operador/:id', (p) => Operadores.renderPerfil(p));
  rota('/lancamento', () => Lancamento.render());
  rota('/resumo-diario', () => ResumoDiario.render());
  rota('/resumo-mensal', () => ResumoMensal.render());
  rota('/manutencao', () => Manutencoes.render());
  rota('/relatorios', () => Relatorios.render());
  rota('/busca', () => Busca.render());
  rota('/usuarios', () => Usuarios.render());
  setNotFound(() => '<div class="erro-box">Página não encontrada. <a href="#/">Voltar ao início</a></div>');
}

// Service worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

boot();
