/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — version.js
   Controle de versão do build.
   ══════════════════════════════════════════════════════════ */

const APP_VERSION = '4.4.2';
const APP_BUILD_NOME = 'STRACTA VIAGENS Enterprise (rumo à Build 5.0)';

async function registrarVersaoInstalada() {
  const anterior = await DB.getConfig('versao_instalada', null);
  if (anterior !== APP_VERSION) {
    const historico = (await DB.getConfig('versao_historico', [])) || [];
    historico.push({ versao: APP_VERSION, instaladaEm: agoraISO(), anterior });
    await DB.setConfig('versao_historico', historico);
    await DB.setConfig('versao_instalada', APP_VERSION);
  }
}

window.APP_VERSION = APP_VERSION;
window.APP_BUILD_NOME = APP_BUILD_NOME;
window.registrarVersaoInstalada = registrarVersaoInstalada;
