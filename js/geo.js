/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — geo.js
   Geolocalização: captura a posição GPS do aparelho e anexa
   aos registros (viagens, deslocamentos, turnos, abastecimentos)
   ou envia um "ponto" avulso ("estou aqui").

   Observações:
   - O GPS NÃO depende de internet — funciona offline. Só a
     sincronização das coordenadas com a nuvem é que espera conexão.
   - Nada aqui lança erro: se o usuário negar a permissão ou o
     sinal falhar, a operação principal (iniciar viagem, etc.)
     segue normalmente, apenas sem a posição.
   ══════════════════════════════════════════════════════════ */

const Geo = {
  // Captura a posição atual. Resolve com { lat, lng, precisao, em }
  // ou com { erro, mensagem } — NUNCA rejeita, pra não quebrar quem chama.
  capturar({ timeout = 10000, maximumAge = 30000, enableHighAccuracy = true } = {}) {
    return new Promise((resolve) => {
      if (!Geo.disponivel()) {
        resolve({ erro: 'indisponivel', mensagem: 'GPS não disponível neste aparelho' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = pos.coords;
          resolve({
            lat: Number(c.latitude.toFixed(6)),
            lng: Number(c.longitude.toFixed(6)),
            precisao: c.accuracy != null ? Math.round(c.accuracy) : null,
            em: agoraISO()
          });
        },
        (err) => resolve({ erro: err.code, mensagem: Geo.textoErro(err.code) }),
        { enableHighAccuracy, timeout, maximumAge }
      );
    });
  },

  disponivel() {
    return typeof navigator !== 'undefined' && !!navigator.geolocation;
  },

  textoErro(code) {
    switch (code) {
      case 1: return 'Permissão de localização negada';
      case 2: return 'Não foi possível obter a posição (sinal fraco)';
      case 3: return 'Tempo esgotado ao buscar a localização';
      default: return 'Falha ao obter a localização';
    }
  },

  ehValida(pos) {
    return !!pos && !pos.erro && typeof pos.lat === 'number' && typeof pos.lng === 'number';
  },

  linkMapa(pos) {
    if (!Geo.ehValida(pos)) return '';
    return `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
  },

  formatar(pos) {
    if (!Geo.ehValida(pos)) return '—';
    const prec = pos.precisao != null ? ` (±${pos.precisao} m)` : '';
    return `${pos.lat}, ${pos.lng}${prec}`;
  },

  // Pequeno link clicável "📍 mapa" pra usar nas listas / painel.
  chipMapa(pos, texto = '📍 mapa') {
    if (!Geo.ehValida(pos)) return '';
    return `<a class="geo-chip" href="${Geo.linkMapa(pos)}" target="_blank" rel="noopener">${texto}</a>`;
  },

  // Captura em SEGUNDO PLANO e anexa a posição a um registro já salvo,
  // sem travar a ação do usuário (a viagem inicia na hora; a posição
  // chega um instante depois). Atualiza o registro local e re-sincroniza.
  async anexarLocal(storeName, id, campo, tipoSync) {
    try {
      const pos = await Geo.capturar();
      if (!Geo.ehValida(pos)) return false;
      const reg = await DB.get(storeName, id);
      if (!reg) return false;
      reg[campo] = pos;
      await DB.put(storeName, reg);
      if (tipoSync && typeof Sync !== 'undefined') Sync.enfileirar(tipoSync, reg);
      return true;
    } catch (e) {
      return false;
    }
  }
};

window.Geo = Geo;
