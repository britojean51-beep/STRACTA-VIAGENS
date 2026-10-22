/* ============================================================
   Política de privacidade (LGPD) e Termos de uso
   Abrem por cima de qualquer tela, com ou sem login.
   ============================================================ */
/* Quem responde pelos dados. Vazio = "o gestor do app". */
const EMPRESA_LGPD = { nome: "", cnpj: "", contato: "" };

const Legal = {
  _esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
  textos: {
    privacidade() {
      const e = EMPRESA_LGPD, esc = s => Legal._esc(s);
      const quem = e.nome ? esc(e.nome) + (e.cnpj ? " (CNPJ " + esc(e.cnpj) + ")" : "") : "a empresa dona da frota";
      const contato = e.contato ? esc(e.contato) : "o gestor do app";
      return `<h2>Política de privacidade</h2>
      <p class="hint">Em linha com a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      <h3>Quem cuida dos dados</h3>
      <p>O controlador dos dados é ${quem}. Dúvidas e pedidos sobre seus dados: ${contato}.</p>
      <h3>Quais dados o app guarda</h3>
      <ul><li>Nome, usuário e função (operador ou gestor) de quem usa o app.</li>
        <li>Lançamentos da operação: abastecimentos, viagens, paradas, revisões, KM e horímetro, com o equipamento, o nome do operador ou motorista, a data e quem lançou.</li></ul>
      <p>O app não pede localização, câmera, documentos pessoais nem dados bancários.</p>
      <h3>Para que</h3>
      <p>Somente para controlar a frota: consumo de combustível, produção, manutenção e custos. A base legal é o legítimo interesse da empresa na gestão da operação.</p>
      <h3>Quem vê</h3>
      <p>Os gestores e a equipe autorizada da empresa. Os dados não são vendidos nem usados para propaganda.</p>
      <h3>Onde ficam</h3>
      <p>No Google Firebase e na planilha Google da empresa (servidores que podem ficar fora do Brasil), com acesso por usuário e senha.
        No celular fica uma cópia para o app funcionar sem sinal. A senha nunca é guardada: só um resumo cifrado, para entrar sem internet.</p>
      <h3>Cookies e rastreamento</h3>
      <p>O app não usa cookies de propaganda nem ferramentas de rastreamento ou estatística de terceiros.</p>
      <h3>Por quanto tempo</h3>
      <p>Enquanto forem necessários para o histórico da frota ou exigidos por lei (por exemplo, fiscal e trabalhista).</p>
      <h3>Seus direitos</h3>
      <p>Você pode pedir para ver, corrigir ou apagar seus dados e saber com quem foram compartilhados, falando com ${contato}.</p>`;
    },
    termos() {
      return `<h2>Termos de uso</h2>
      <ul><li>O app é de uso interno, só para pessoas autorizadas pela empresa.</li>
        <li>O usuário e a senha são pessoais: não empreste e troque a senha se alguém souber.</li>
        <li>Lance os dados com a verdade, no dia em que aconteceram. Cada lançamento fica registrado com o nome de quem lançou.</li>
        <li>Os dados podem ser usados em controles internos e auditorias da operação.</li>
        <li>O uso dos dados segue a <a href="#" data-doc="privacidade">Política de privacidade</a>.</li></ul>`;
    }
  },
  abrir(tipo) {
    const ant = document.querySelector(".doc-fundo"); if (ant) ant.remove();
    const f = document.createElement("div");
    f.className = "doc-fundo";
    f.innerHTML = `<div class="doc" role="dialog" aria-modal="true" tabindex="-1">${this.textos[tipo]()}
      <button class="btn btn-primary" data-fechar>Fechar</button></div>`;
    f.onclick = ev => {
      const d = ev.target.closest("[data-doc]");
      if (d) { ev.preventDefault(); return this.abrir(d.dataset.doc); }
      if (ev.target === f || ev.target.closest("[data-fechar]")) f.remove();
    };
    f.onkeydown = ev => { if (ev.key === "Escape") f.remove(); };
    document.body.appendChild(f);
    f.querySelector(".doc").focus();
  },
  links() {
    return `<p class="hint legal">Ao usar o app, você concorda com os <a href="#" data-doc="termos">Termos de uso</a>
      e a <a href="#" data-doc="privacidade">Política de privacidade</a>.</p>`;
  }
};
document.addEventListener("click", ev => {
  const d = ev.target.closest("[data-doc]");
  if (d && !d.closest(".doc-fundo")) { ev.preventDefault(); Legal.abrir(d.dataset.doc); }
});
