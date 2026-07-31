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
  FRESH_MS: 2 * 60 * 1000,  // até 2 min = "recente" (verde)
  STALE_MS: 5 * 60 * 1000,  // acima de 5 min = some do mapa

  async abrir() {
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
      this._map = L.map('mapa-container', { zoomControl: true }).setView([-15.78, -47.93], 4);

      const ruas = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
      });
      // satélite: mostra a vegetação/terreno (sem chave de API)
      const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Imagens © Esri'
      });
      // relevo/topográfico (curvas de nível e vegetação)
      const relevo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17, attribution: '© OpenTopoMap'
      });
      satelite.addTo(this._map); // padrão: satélite

      // camada com os polígonos das áreas cadastradas (somente leitura)
      this._grupoAreas = L.layerGroup().addTo(this._map);

      L.control.layers(
        { '🛰️ Satélite': satelite, '⛰️ Relevo': relevo, '🗺️ Ruas': ruas },
        { '📐 Áreas': this._grupoAreas },
        { position: 'topright' }
      ).addTo(this._map);
    }
    this._carregarAreas();
    setTimeout(() => { if (this._map) this._map.invalidateSize(); }, 250);

    if (info) info.textContent = 'Carregando posições...';
    this._ajustou = false;
    this._assinar();
    // re-renderiza sozinho para atualizar o "há X min" e sumir com os antigos
    this._timerStale = setInterval(() => this._render(this._ultimasPosicoes), 30000);
  },

  _assinar() {
    if (this._unsub) return;
    this._unsub = FirebaseSync.escutarPosicoes(posicoes => this._render(posicoes));
  },

  // Desenha os polígonos das áreas cadastradas (camada de contexto, só leitura)
  async _carregarAreas() {
    if (!this._grupoAreas) return;
    this._grupoAreas.clearLayers();
    const [areas, acessos] = await Promise.all([DB.getAll('areas'), DB.getAll('acessos')]);
    areas.forEach(a => {
      const pts = Geo.pontosLatLng(a.pontos);
      if (pts.length < 3) return;
      L.polygon(pts, { color: '#12B886', weight: 2, fillColor: '#12B886', fillOpacity: 0.12 })
        .bindTooltip(a.codigo, { permanent: true, direction: 'center', className: 'mk-tooltip' })
        .addTo(this._grupoAreas);
    });
    acessos.forEach(ac => {
      const pts = Geo.pontosLatLng(ac.pontos);
      if (pts.length < 2) return;
      L.polyline(pts, { color: '#F0A020', weight: 4 })
        .bindTooltip('🛣️ ' + ac.nome, { permanent: false, direction: 'top', className: 'mk-tooltip' })
        .addTo(this._grupoAreas);
    });
  },

  _corPorIdade(idade) {
    if (idade <= this.FRESH_MS) return '#12B886'; // verde
    return '#F0A020';                             // âmbar (mais antigo)
  },

  _ativos() {
    const agora = Date.now();
    return (this._ultimasPosicoes || [])
      .filter(p => p && !p._removido && typeof p.lat === 'number' && typeof p.lng === 'number')
      .map(p => ({ ...p, _idade: agora - new Date(p.atualizadoEm || 0).getTime() }))
      .filter(p => !isNaN(p._idade) && p._idade <= this.STALE_MS)
      .sort((a, b) => a._idade - b._idade);
  },

  _tempoRelativo(ms) {
    if (isNaN(ms) || ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min <= 0) return 'agora mesmo';
    if (min === 1) return 'há 1 min';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    return h === 1 ? 'há 1 h' : `há ${h} h`;
  },

  _render(posicoes) {
    if (!this._map) return;
    this._ultimasPosicoes = posicoes || this._ultimasPosicoes || [];
    const ativos = this._ativos();
    const idsAtivos = new Set(ativos.map(p => p.id));
    const bounds = [];

    ativos.forEach(p => {
      const latlng = [p.lat, p.lng];
      bounds.push(latlng);
      const cor = this._corPorIdade(p._idade);
      const popup =
        `<b>${p.motoristaNome || '—'}</b><br>` +
        `${p.equipamentoCodigo || 'sem equipamento'}<br>` +
        `Atualizado ${this._tempoRelativo(p._idade)}` +
        (p.precisao != null ? ` • ±${p.precisao} m` : '');

      if (this._markers[p.id]) {
        this._markers[p.id].setLatLng(latlng).setStyle({ fillColor: cor, color: '#fff' });
        this._markers[p.id].setPopupContent(popup);
      } else {
        this._markers[p.id] = L.circleMarker(latlng, {
          radius: 9, weight: 3, color: '#fff', fillColor: cor, fillOpacity: 1
        }).addTo(this._map).bindPopup(popup);
        if (p.equipamentoCodigo) {
          this._markers[p.id].bindTooltip(p.equipamentoCodigo, {
            permanent: true, direction: 'top', offset: [0, -8], className: 'mk-tooltip'
          });
        }
      }
    });

    // remove marcadores de quem saiu / ficou antigo
    Object.keys(this._markers).forEach(id => {
      if (!idsAtivos.has(id)) {
        this._map.removeLayer(this._markers[id]);
        delete this._markers[id];
      }
    });

    if (bounds.length && !this._ajustou) {
      this._map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      this._ajustou = true;
    }

    this._renderInfoELista(ativos);
  },

  _renderInfoELista(ativos) {
    const info = qs('#mapa-info');
    if (info) {
      info.textContent = ativos.length
        ? `${ativos.length} ${ativos.length === 1 ? 'motorista' : 'motoristas'} em operação agora`
        : 'Ninguém em operação no momento.';
    }

    const lista = qs('#mapa-lista');
    if (!lista) return;
    if (!ativos.length) {
      lista.innerHTML = `<div class="empty-state" style="padding:24px"><span class="emoji">🛰️</span>Aguardando posições dos motoristas com turno ativo.</div>`;
      return;
    }
    lista.innerHTML = ativos.map(p => {
      const cor = this._corPorIdade(p._idade);
      const detalhe = `${p.equipamentoCodigo || 'sem equipamento'} • ${this._tempoRelativo(p._idade)}` +
        (p.precisao != null ? ` • ±${p.precisao} m` : '');
      return `
      <div class="list-item mapa-item" onclick="Mapa.focar('${p.id}')">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="mapa-dot" style="background:${cor}"></span>
          <div>
            <div class="li-main">${p.motoristaNome || '—'}</div>
            <div class="li-sub">${detalhe}</div>
          </div>
        </div>
        <span class="mapa-item-ir">Ver ›</span>
      </div>`;
    }).join('');
  },

  // Reenquadra o mapa para mostrar todos os motoristas ativos
  recentralizar() {
    if (!this._map) return;
    const ativos = this._ativos();
    if (!ativos.length) { if (typeof showToast !== 'undefined') showToast('Ninguém em operação agora', 'var(--iron)'); return; }
    const bounds = ativos.map(p => [p.lat, p.lng]);
    this._map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  },

  // Centraliza num motorista específico e abre o balão de detalhes
  focar(id) {
    const m = this._markers[id];
    if (!m || !this._map) return;
    this._map.setView(m.getLatLng(), 15, { animate: true });
    m.openPopup();
    const cont = qs('#mapa-container');
    if (cont && cont.scrollIntoView) cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  fechar() {
    if (this._unsub) { try { this._unsub(); } catch (e) {} this._unsub = null; }
    if (this._timerStale) { clearInterval(this._timerStale); this._timerStale = null; }
    this._ajustou = false;
  }
};

window.Mapa = Mapa;
