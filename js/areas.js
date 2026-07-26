/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — areas.js
   Áreas (polígonos) com código, definidas pela gestão.
   Servem para identificar, offline, DE ONDE o motorista saiu e
   ONDE chegou (origem/destino) e montar a rota automaticamente.

   - Dados (CRUD) ficam no store 'areas' e sincronizam (area).
   - O desenho é feito no mapa (Leaflet): toca-se nos cantos.
   - A identificação ponto→área é 100% offline (ver geo.js).
   ══════════════════════════════════════════════════════════ */

const Areas = {
  // ---------- DADOS ----------
  async listar() {
    const areas = await DB.getAll('areas');
    return areas.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
  },

  async salvar({ id, codigo, pontos }) {
    if (!Permissoes.podeGerenciarRotas()) return { erro: 'Apenas a gestão pode definir áreas' };
    if (!codigo) return { erro: 'Informe o código da área' };
    if (!Array.isArray(pontos) || pontos.length < 3) return { erro: 'A área precisa de pelo menos 3 pontos' };
    const existente = id ? await DB.get('areas', id) : null;
    const usuario = Permissoes.usuarioAtual();
    const area = {
      id: id || gerarId('area'),
      tipo: 'area',
      codigo: codigo.trim(),
      // guarda como objetos {lat,lng} (o Firestore não aceita array de arrays)
      pontos: pontos.map(p => Array.isArray(p) ? { lat: p[0], lng: p[1] } : { lat: p.lat, lng: p.lng }),
      criadoPorId: existente ? existente.criadoPorId : (usuario ? usuario.id : null),
      criadoPorNome: existente ? existente.criadoPorNome : (usuario ? usuario.nome : null),
      criadoEm: existente ? existente.criadoEm : agoraISO(),
      editadoEm: agoraISO()
    };
    await DB.put('areas', area);
    if (typeof Sync !== 'undefined') Sync.enfileirar('area', area);
    return area;
  },

  async remover(id) {
    if (!Permissoes.podeGerenciarRotas()) return { erro: 'Apenas a gestão pode apagar áreas' };
    await DB.delete('areas', id);
    if (typeof Sync !== 'undefined') Sync.enfileirarExclusao('area', id);
    return { sucesso: true };
  },

  // ---------- MAPA / DESENHO ----------
  _map: null,
  _grupoDesenho: null,
  _grupoAreas: null,
  _desenho: [],
  _editandoId: null,

  async abrir() {
    const info = qs('#areas-info');
    if (typeof L === 'undefined') {
      if (info) info.textContent = 'Mapa indisponível — conecte-se à internet para desenhar as áreas.';
      return;
    }

    if (!this._map) {
      this._map = L.map('areas-mapa').setView([-15.78, -47.93], 4);

      const ruas = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
      });
      // satélite: mostra a vegetação/terreno de verdade (sem chave de API)
      const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Imagens © Esri'
      });
      // relevo/topográfico (curvas de nível e vegetação)
      const relevo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17, attribution: '© OpenTopoMap'
      });
      satelite.addTo(this._map); // padrão: satélite
      L.control.layers(
        { '🛰️ Satélite': satelite, '⛰️ Relevo': relevo, '🗺️ Ruas': ruas },
        null, { position: 'topright' }
      ).addTo(this._map);

      this._grupoAreas = L.layerGroup().addTo(this._map);
      this._grupoDesenho = L.layerGroup().addTo(this._map);
      this._grupoLocal = L.layerGroup().addTo(this._map);
      this._map.on('click', (ev) => this._aoClicar(ev));
    }
    setTimeout(() => { if (this._map) this._map.invalidateSize(); }, 250);

    this._desenho = [];
    this._editandoId = null;
    this._redesenhar();
    await this._carregarAreas();
    this.renderLista();
  },

  // Centraliza o mapa na posição atual do GPS (para andar/desenhar mais rápido).
  async localizarMe() {
    if (!this._map) return;
    if (typeof Geo === 'undefined' || !Geo.disponivel()) { showToast('GPS não disponível neste aparelho', 'var(--iron)'); return; }
    showToast('📍 Localizando...', 'var(--blue)', 3000);
    const pos = await Geo.capturar({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    if (!Geo.ehValida(pos)) { showToast(pos.mensagem || 'Não foi possível localizar', 'var(--iron)'); return; }
    this._map.setView([pos.lat, pos.lng], 17, { animate: true });
    if (this._grupoLocal) {
      this._grupoLocal.clearLayers();
      L.circleMarker([pos.lat, pos.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#2b7fff', fillOpacity: 1 })
        .bindTooltip('Você está aqui', { direction: 'top' })
        .addTo(this._grupoLocal);
      if (pos.precisao) {
        L.circle([pos.lat, pos.lng], { radius: pos.precisao, color: '#2b7fff', weight: 1, fillColor: '#2b7fff', fillOpacity: 0.12 })
          .addTo(this._grupoLocal);
      }
    }
  },

  _aoClicar(ev) {
    this._desenho.push([ev.latlng.lat, ev.latlng.lng]);
    this._redesenhar();
    this._atualizarInfo();
  },

  _redesenhar() {
    if (!this._grupoDesenho) return;
    this._grupoDesenho.clearLayers();
    // vértices
    this._desenho.forEach((p, i) => {
      L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: '#F0A020', fillOpacity: 1 })
        .bindTooltip(String(i + 1), { permanent: false })
        .addTo(this._grupoDesenho);
    });
    if (this._desenho.length >= 3) {
      L.polygon(this._desenho, { color: '#F0A020', weight: 2, fillColor: '#F0A020', fillOpacity: 0.2 })
        .addTo(this._grupoDesenho);
    } else if (this._desenho.length === 2) {
      L.polyline(this._desenho, { color: '#F0A020', weight: 2, dashArray: '5,5' }).addTo(this._grupoDesenho);
    }
  },

  _atualizarInfo() {
    const info = qs('#areas-info');
    if (!info) return;
    const n = this._desenho.length;
    if (n === 0) info.textContent = 'Toque no mapa para marcar os cantos da área.';
    else if (n < 3) info.textContent = `${n} ponto(s) — marque pelo menos 3 para formar uma área.`;
    else info.textContent = `${n} pontos marcados. Toque em "Salvar área" quando terminar.`;
  },

  async _carregarAreas() {
    if (!this._grupoAreas) return;
    this._grupoAreas.clearLayers();
    const areas = await this.listar();
    const bounds = [];
    areas.forEach(a => {
      const pts = Geo.pontosLatLng(a.pontos);
      if (pts.length < 3) return;
      L.polygon(pts, { color: '#12B886', weight: 2, fillColor: '#12B886', fillOpacity: 0.15 })
        .bindTooltip(a.codigo, { permanent: true, direction: 'center', className: 'mk-tooltip' })
        .addTo(this._grupoAreas);
      pts.forEach(p => bounds.push(p));
    });
    if (bounds.length && !this._desenho.length) {
      this._map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  },

  desfazer() {
    this._desenho.pop();
    this._redesenhar();
    this._atualizarInfo();
  },

  limparDesenho() {
    this._desenho = [];
    this._editandoId = null;
    this._redesenhar();
    this._atualizarInfo();
  },

  async salvarNova() {
    if (this._desenho.length < 3) { showToast('Marque pelo menos 3 pontos no mapa', 'var(--iron)'); return; }
    const pontos = this._desenho.slice();
    const editandoId = this._editandoId;
    abrirModalFormulario({
      titulo: editandoId ? '✏️ Editar área' : '📐 Nova área',
      subtitulo: `${pontos.length} pontos marcados`,
      campos: [{ id: 'codigo', label: 'Código / nome da área', placeholder: 'Ex: Frente 01, Britador, Oficina' }],
      textoSalvar: 'Salvar',
      aoSalvar: async ({ codigo }) => {
        const res = await Areas.salvar({ id: editandoId, codigo, pontos });
        if (res && res.erro) { showToast(res.erro, 'var(--iron)'); return; }
        showToast('✅ Área salva!');
        Areas.limparDesenho();
        await Areas._carregarAreas();
        Areas.renderLista();
      }
    });
  },

  async editar(id) {
    const a = await DB.get('areas', id);
    if (!a) return;
    this._desenho = Geo.pontosLatLng(a.pontos);
    this._editandoId = id;
    this._redesenhar();
    this._atualizarInfo();
    if (this._map && this._desenho.length) this._map.fitBounds(this._desenho, { padding: [40, 40], maxZoom: 16 });
    showToast('Ajuste os pontos e salve para atualizar a área', 'var(--blue)', 3500);
  },

  async apagar(id) {
    if (!confirm('Apagar esta área?')) return;
    const res = await this.remover(id);
    if (res && res.erro) { showToast(res.erro, 'var(--iron)'); return; }
    showToast('🗑️ Área apagada');
    if (this._editandoId === id) this.limparDesenho();
    await this._carregarAreas();
    this.renderLista();
  },

  async renderLista() {
    const lista = qs('#areas-lista');
    if (!lista) return;
    const areas = await this.listar();
    lista.innerHTML = areas.length ? areas.map(a => `
      <div class="list-item">
        <div>
          <div class="li-main">${a.codigo}</div>
          <div class="li-sub">${(a.pontos || []).length} pontos${a.criadoPorNome ? ' • por ' + a.criadoPorNome : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="Areas.editar('${a.id}')">Editar</button>
          <button class="li-fav" onclick="Areas.apagar('${a.id}')">🗑️</button>
        </div>
      </div>`).join('') : `<div class="empty-state"><span class="emoji">📐</span>Nenhuma área cadastrada ainda.</div>`;
  },

  fechar() {
    // mantém o mapa em memória; apenas limpa o desenho em andamento
    this._desenho = [];
    this._editandoId = null;
    if (this._grupoDesenho) this._grupoDesenho.clearLayers();
  }
};

window.Areas = Areas;
