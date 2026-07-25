/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — rastreamento.js
   Rastreamento em tempo real (lado do MOTORISTA).
   Enquanto há um turno ativo e o app está aberto, envia a
   posição atual para o Firebase a cada X segundos, para que a
   gestão veja no mapa ao vivo.

   Limitações honestas do navegador:
   - Só rastreia com o app ABERTO (em primeiro plano). A web não
     permite rastreio confiável com o app totalmente fechado.
   - Depende de permissão de localização e de internet para enviar.
   ══════════════════════════════════════════════════════════ */

const Rastreamento = {
  _timer: null,
  _turno: null,
  _intervaloMs: 30000, // envia a posição a cada 30s

  ativo() {
    return this._timer != null;
  },

  // Liga o rastreamento para um turno. Se já está rastreando o mesmo
  // turno, não faz nada (evita reiniciar à toa em cada renderHome).
  iniciar(turno) {
    if (!turno || typeof Geo === 'undefined' || !Geo.disponivel()) return;
    if (typeof FirebaseSync === 'undefined') return;
    if (this._timer != null && this._turno && this._turno.id === turno.id) return;

    this.parar();
    this._turno = turno;
    this._enviarAgora();                       // primeira posição imediata
    this._timer = setInterval(() => this._enviarAgora(), this._intervaloMs);
  },

  async _enviarAgora() {
    const turno = this._turno;
    if (!turno) return;
    if (!estaOnline()) return;                 // sem internet: só volta a enviar quando conectar

    const pos = await Geo.capturar({ enableHighAccuracy: true, timeout: 25000, maximumAge: 10000 });
    if (!Geo.ehValida(pos)) return;

    const doc = {
      id: turno.id,                            // um documento por turno
      turnoId: turno.id,
      motoristaId: turno.motoristaId,
      motoristaNome: turno.motoristaNome,
      equipamentoId: turno.equipamentoId,
      equipamentoCodigo: turno.equipamentoCodigo,
      lat: pos.lat,
      lng: pos.lng,
      precisao: pos.precisao,
      atualizadoEm: agoraISO(),
      dispositivo: (typeof dispositivoId !== 'undefined') ? dispositivoId() : null
    };
    FirebaseSync.enviarPosicao(doc).catch(() => {});
  },

  // Desliga o rastreamento e remove o ponto do mapa (turno encerrado).
  parar() {
    if (this._timer != null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    const turno = this._turno;
    this._turno = null;
    if (turno && typeof FirebaseSync !== 'undefined' && estaOnline()) {
      FirebaseSync.removerPosicao(turno.id).catch(() => {});
    }
  }
};

window.Rastreamento = Rastreamento;
