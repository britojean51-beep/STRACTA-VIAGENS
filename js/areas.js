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

  // ---------- DADOS: ACESSOS (estradas / linhas) ----------
  async listarAcessos() {
    const acessos = await DB.getAll('acessos');
    return acessos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  },

  async salvarAcesso({ id, nome, pontos }) {
    if (!Permissoes.podeGerenciarRotas()) return { erro: 'Apenas a gestão pode definir acessos' };
    if (!nome) return { erro: 'Informe o nome do acesso' };
    if (!Array.isArray(pontos) || pontos.length < 2) return { erro: 'O acesso precisa de pelo menos 2 pontos' };
    const existente = id ? await DB.get('acessos', id) : null;
    const usuario = Permissoes.usuarioAtual();
    const acesso = {
      id: id || gerarId('acesso'),
      tipo: 'acesso',
      nome: nome.trim(),
      // objetos {lat,lng} (o Firestore não aceita array de arrays)
      pontos: pontos.map(p => Array.isArray(p) ? { lat: p[0], lng: p[1] } : { lat: p.lat, lng: p.lng }),
      criadoPorId: existente ? existente.criadoPorId : (usuario ? usuario.id : null),
      criadoPorNome: existente ? existente.criadoPorNome : (usuario ? usuario.nome : null),
      criadoEm: existente ? existente.criadoEm : agoraISO(),
      editadoEm: agoraISO()
    };
    await DB.put('acessos', acesso);
    if (typeof Sync !== 'undefined') Sync.enfileirar('acesso', acesso);
    return acesso;
  },

  async removerAcesso(id) {
    if (!Permissoes.podeGerenciarRotas()) return { erro: 'Apenas a gestão pode apagar acessos' };
    await DB.delete('acessos', id);
    if (typeof Sync !== 'undefined') Sync.enfileirarExclusao('acesso', id);
    return { sucesso: true };
  },

  // ---------- MAPA / DESENHO ----------
  _map: null,
  _grupoDesenho: null,
  _grupoAreas: null,
  _desenho: [],
  _editandoId: null,
  _modo: 'area', // 'area' (polígono) ou 'acesso' (linha/estrada)

  // Atualiza os botões de modo e o rótulo do botão salvar conforme this._modo.
  _refletirModo() {
    const bArea = qs('#areas-modo-area'), bAcesso = qs('#areas-modo-acesso');
    if (bArea) { bArea.classList.toggle('btn-primary', this._modo === 'area'); bArea.classList.toggle('btn-outline', this._modo !== 'area'); }
    if (bAcesso) { bAcesso.classList.toggle('btn-primary', this._modo === 'acesso'); bAcesso.classList.toggle('btn-outline', this._modo !== 'acesso'); }
    const btnSalvar = qs('#areas-btn-salvar');
    if (btnSalvar) btnSalvar.textContent = this._modo === 'acesso' ? '💾 Salvar acesso' : '💾 Salvar área';
  },

  // Alterna entre desenhar uma ÁREA (polígono) ou um ACESSO (linha/estrada).
  definirModo(modo) {
    this._modo = modo === 'acesso' ? 'acesso' : 'area';
    this._refletirModo();
    this.limparDesenho();
  },

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
    this.definirModo('area');
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
    const cor = this._modo === 'acesso' ? '#2b7fff' : '#F0A020';
    // vértices
    this._desenho.forEach((p, i) => {
      L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: cor, fillOpacity: 1 })
        .bindTooltip(String(i + 1), { permanent: false })
        .addTo(this._grupoDesenho);
    });
    if (this._modo === 'acesso') {
      // acesso = linha aberta (estrada)
      if (this._desenho.length >= 2) {
        L.polyline(this._desenho, { color: cor, weight: 4 }).addTo(this._grupoDesenho);
      }
    } else {
      // área = polígono fechado
      if (this._desenho.length >= 3) {
        L.polygon(this._desenho, { color: cor, weight: 2, fillColor: cor, fillOpacity: 0.2 })
          .addTo(this._grupoDesenho);
      } else if (this._desenho.length === 2) {
        L.polyline(this._desenho, { color: cor, weight: 2, dashArray: '5,5' }).addTo(this._grupoDesenho);
      }
    }
  },

  _atualizarInfo() {
    const info = qs('#areas-info');
    if (!info) return;
    const n = this._desenho.length;
    if (this._modo === 'acesso') {
      if (n === 0) info.textContent = 'Modo ACESSO — toque no mapa para traçar a estrada (linha).';
      else if (n < 2) info.textContent = `${n} ponto — marque pelo menos 2 para formar o acesso.`;
      else info.textContent = `${n} pontos marcados. Toque em "Salvar acesso" quando terminar.`;
    } else {
      if (n === 0) info.textContent = 'Modo ÁREA — toque no mapa para marcar os cantos.';
      else if (n < 3) info.textContent = `${n} ponto(s) — marque pelo menos 3 para formar uma área.`;
      else info.textContent = `${n} pontos marcados. Toque em "Salvar área" quando terminar.`;
    }
  },

  async _carregarAreas() {
    if (!this._grupoAreas) return;
    this._grupoAreas.clearLayers();
    const [areas, acessos] = await Promise.all([this.listar(), this.listarAcessos()]);
    const bounds = [];
    areas.forEach(a => {
      const pts = Geo.pontosLatLng(a.pontos);
      if (pts.length < 3) return;
      L.polygon(pts, { color: '#12B886', weight: 2, fillColor: '#12B886', fillOpacity: 0.15 })
        .bindTooltip(a.codigo, { permanent: true, direction: 'center', className: 'mk-tooltip' })
        .addTo(this._grupoAreas);
      pts.forEach(p => bounds.push(p));
    });
    acessos.forEach(ac => {
      const pts = Geo.pontosLatLng(ac.pontos);
      if (pts.length < 2) return;
      L.polyline(pts, { color: '#F0A020', weight: 4 })
        .bindTooltip('🛣️ ' + ac.nome, { permanent: false, direction: 'top', className: 'mk-tooltip' })
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
    const pontos = this._desenho.slice();
    const editandoId = this._editandoId;
    if (this._modo === 'acesso') {
      if (pontos.length < 2) { showToast('Marque pelo menos 2 pontos no mapa', 'var(--iron)'); return; }
      abrirModalFormulario({
        titulo: editandoId ? '✏️ Editar acesso' : '🛣️ Novo acesso',
        subtitulo: `${pontos.length} pontos marcados`,
        campos: [{ id: 'nome', label: 'Nome do acesso / estrada', placeholder: 'Ex: Acesso Frente 01, Estrada do Britador' }],
        textoSalvar: 'Salvar',
        aoSalvar: async ({ nome }) => {
          const res = await Areas.salvarAcesso({ id: editandoId, nome, pontos });
          if (res && res.erro) { showToast(res.erro, 'var(--iron)'); return; }
          showToast('✅ Acesso salvo!');
          Areas.limparDesenho();
          await Areas._carregarAreas();
          Areas.renderLista();
        }
      });
      return;
    }
    if (pontos.length < 3) { showToast('Marque pelo menos 3 pontos no mapa', 'var(--iron)'); return; }
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
    this._modo = 'area';
    this._refletirModo();
    this._desenho = Geo.pontosLatLng(a.pontos);
    this._editandoId = id;
    this._redesenhar();
    this._atualizarInfo();
    if (this._map && this._desenho.length) this._map.fitBounds(this._desenho, { padding: [40, 40], maxZoom: 16 });
    showToast('Ajuste os pontos e salve para atualizar a área', 'var(--blue)', 3500);
  },

  async editarAcesso(id) {
    const ac = await DB.get('acessos', id);
    if (!ac) return;
    this._modo = 'acesso';
    this._refletirModo();
    this._desenho = Geo.pontosLatLng(ac.pontos);
    this._editandoId = id;
    this._redesenhar();
    this._atualizarInfo();
    if (this._map && this._desenho.length) this._map.fitBounds(this._desenho, { padding: [40, 40], maxZoom: 16 });
    showToast('Ajuste os pontos e salve para atualizar o acesso', 'var(--blue)', 3500);
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

  async apagarAcesso(id) {
    if (!confirm('Apagar este acesso?')) return;
    const res = await this.removerAcesso(id);
    if (res && res.erro) { showToast(res.erro, 'var(--iron)'); return; }
    showToast('🗑️ Acesso apagado');
    if (this._editandoId === id) this.limparDesenho();
    await this._carregarAreas();
    this.renderLista();
  },

  async renderLista() {
    const lista = qs('#areas-lista');
    if (!lista) return;
    const [areas, acessos] = await Promise.all([this.listar(), this.listarAcessos()]);
    const htmlAreas = areas.map(a => `
      <div class="list-item">
        <div>
          <div class="li-main">📐 ${a.codigo}</div>
          <div class="li-sub">${(a.pontos || []).length} pontos${a.criadoPorNome ? ' • por ' + a.criadoPorNome : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="Areas.editar('${a.id}')">Editar</button>
          <button class="li-fav" onclick="Areas.apagar('${a.id}')">🗑️</button>
        </div>
      </div>`).join('');
    const htmlAcessos = acessos.map(ac => `
      <div class="list-item">
        <div>
          <div class="li-main">🛣️ ${ac.nome}</div>
          <div class="li-sub">${(ac.pontos || []).length} pontos${ac.criadoPorNome ? ' • por ' + ac.criadoPorNome : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="Areas.editarAcesso('${ac.id}')">Editar</button>
          <button class="li-fav" onclick="Areas.apagarAcesso('${ac.id}')">🗑️</button>
        </div>
      </div>`).join('');
    if (!areas.length && !acessos.length) {
      lista.innerHTML = `<div class="empty-state"><span class="emoji">📐</span>Nenhuma área ou acesso cadastrado ainda.</div>`;
      return;
    }
    lista.innerHTML = htmlAreas + htmlAcessos;
  },

  fechar() {
    // mantém o mapa em memória; apenas limpa o desenho em andamento
    this._desenho = [];
    this._editandoId = null;
    if (this._grupoDesenho) this._grupoDesenho.clearLayers();
  }
};

window.Areas = Areas;
