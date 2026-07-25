/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — mapa.js
   Mapa ao vivo (lado da GESTÃO). Mostra, em tempo real, a
   posição dos motoristas com turno ativo, usando Leaflet +
   OpenStreetMap. Requer internet (mapa e tempo real).
   ══════════════════════════════════════════════════════════ */

const Mapa = {
  _map: null,
  _markers: {},
  _unsub: null,
  _timerStale: null,
  _ultimasPosicoes: [],
  _ajustou: false,
  STALE_MS: 5 * 60 * 1000, // esconde quem não atualiza há mais de 5 min

  async abrir() {
    const container = qs('#mapa-container');
    const info = qs('#mapa-info');

    if (typeof L === 'undefined') {
      if (info) info.textContent = 'Mapa indisponível — verifique sua conexão com a internet.';
      return;
    }
    if (typeof FirebaseSync === 'undefined' || !(await FirebaseSync.configurado())) {
      if (info) info.textContent = 'Rastreamento indisponível — Firebase não configurado.';
      return;
    }

    if (!this._map) {
      // vista inicial no Brasil; ajusta sozinho quando chegam posições
      this._map = L.map('mapa-container').setView([-15.78, -47.93], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(this._map);
    }
    // o container só tem tamanho depois que a tela fica ativa
    setTimeout(() => { if (this._map) this._map.invalidateSize(); }, 250);

    if (info) info.textContent = 'Carregando posições...';
    this._ajustou = false;
    this._assinar();
    this._timerStale = setInterval(() => this._render(this._ultimasPosicoes), 60000);
  },

  _assinar() {
    if (this._unsub) return; // já assinado
    this._unsub = FirebaseSync.escutarPosicoes(posicoes => this._render(posicoes));
  },

  _render(posicoes) {
    if (!this._map) return;
    this._ultimasPosicoes = posicoes || [];
    const agora = Date.now();
    const ativos = new Set();
    const bounds = [];

    this._ultimasPosicoes.forEach(p => {
      if (!p || p._removido) return;
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const idade = agora - new Date(p.atualizadoEm || 0).getTime();
      if (isNaN(idade) || idade > this.STALE_MS) return; // antigo demais — esconde

      ativos.add(p.id);
      const latlng = [p.lat, p.lng];
      bounds.push(latlng);
      const quando = (typeof fmtHoraBR !== 'undefined') ? fmtHoraBR(p.atualizadoEm) : '';
      const popup =
        `<b>${p.motoristaNome || '—'}</b><br>` +
        `${p.equipamentoCodigo || 'sem equipamento'}<br>` +
        `Atualizado às ${quando}` +
        (p.precisao != null ? ` • ±${p.precisao} m` : '');

      if (this._markers[p.id]) {
        this._markers[p.id].setLatLng(latlng).setPopupContent(popup);
      } else {
        this._markers[p.id] = L.marker(latlng).addTo(this._map).bindPopup(popup);
      }
    });

    // remove marcadores de quem saiu / ficou antigo
    Object.keys(this._markers).forEach(id => {
      if (!ativos.has(id)) {
        this._map.removeLayer(this._markers[id]);
        delete this._markers[id];
      }
    });

    // enquadra todos na primeira vez que aparecem posições
    if (bounds.length && !this._ajustou) {
      this._map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      this._ajustou = true;
    }

    const info = qs('#mapa-info');
    if (info) {
      info.textContent = ativos.size
        ? `${ativos.size} ${ativos.size === 1 ? 'motorista' : 'motoristas'} em operação agora`
        : 'Ninguém em operação no momento.';
    }
  },

  fechar() {
    if (this._unsub) { try { this._unsub(); } catch (e) {} this._unsub = null; }
    if (this._timerStale) { clearInterval(this._timerStale); this._timerStale = null; }
    this._ajustou = false;
  }
};

window.Mapa = Mapa;
