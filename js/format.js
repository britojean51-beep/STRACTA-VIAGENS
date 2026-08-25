// ============================================================================
// format.js — Formatação de números, datas e helpers de domínio
// ============================================================================
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const fmt = {
  int: (v) => nf0.format(Number(v) || 0),
  n1: (v) => nf1.format(Number(v) || 0),
  n2: (v) => nf2.format(Number(v) || 0),
  n3: (v) => nf3.format(Number(v) || 0),
  litros: (v) => nf0.format(Number(v) || 0) + ' L',
  horas: (v) => nf1.format(Number(v) || 0) + ' h',
  ton: (v) => nf1.format(Number(v) || 0) + ' t',
  km: (v) => nf0.format(Number(v) || 0) + ' km',
};

export function hoje() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function mesAno(iso) {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const [a, m] = iso.split('-');
  return `${meses[Number(m) - 1]}/${a}`;
}

export function dataHoraBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Aplica classe de badge de acordo com o status do equipamento/operador.
export function classeStatus(status) {
  return ({
    'Operando': 'badge badge-ok',
    'Manutenção': 'badge badge-warn',
    'Parado': 'badge badge-muted',
    'Inativo': 'badge badge-danger',
    'Ativo': 'badge badge-ok',
    'Afastado': 'badge badge-warn',
  })[status] || 'badge';
}
