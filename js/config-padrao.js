/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — config-padrao.js
   Configuração de sincronização já embutida no app publicado.
   Assim, qualquer aparelho novo só precisa fazer login — não é
   necessário colar link do Sheets, token ou config do Firebase
   manualmente em cada celular.

   Isso é aplicado apenas UMA VEZ por aparelho (na primeira vez
   que o app abre nele). Se alguém trocar manualmente em
   Configurações depois, a escolha da pessoa é respeitada.
   ══════════════════════════════════════════════════════════ */

const CONFIG_PADRAO = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbxaggnV3BadOhNJ5CArGMVDNIQT59922qrxZlAnGC2JkzcdUnhzlTFJ30dSiCQgZrOSUQ/exec',
  token: 'stracta2026',
  firebase: {
    apiKey: 'AIzaSyCI_mQ2vlFKYZ06-guL9_Km73NYkacFCcA',
    authDomain: 'stracta-viagens.firebaseapp.com',
    projectId: 'stracta-viagens',
    storageBucket: 'stracta-viagens.firebasestorage.app',
    messagingSenderId: '202038822038',
    appId: '1:202038822038:web:d83451b8f1911f27feeeb7',
    measurementId: 'G-8LPZMT4LK2'
  }
};

// Aplica a configuração padrão apenas se o aparelho ainda não tiver nenhuma
// configuração salva (primeira vez que o app abre nele).
async function aplicarConfigPadraoSeNecessario() {
  const apiUrlAtual = await DB.getConfig('api_url', '');
  const firebaseAtual = await DB.getConfig('firebase_config', null);

  if (!apiUrlAtual) {
    await DB.setConfig('api_url', CONFIG_PADRAO.apiUrl);
    await DB.setConfig('sync_token', CONFIG_PADRAO.token);
  }
  if (!firebaseAtual) {
    await DB.setConfig('firebase_config', CONFIG_PADRAO.firebase);
  }
}

window.CONFIG_PADRAO = CONFIG_PADRAO;
window.aplicarConfigPadraoSeNecessario = aplicarConfigPadraoSeNecessario;
