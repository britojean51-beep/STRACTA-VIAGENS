/* Planilha falsa para rodar o Codigo.gs de verdade fora do Google.
   Recebe os envios guardados em payloads.json e mostra como ficam as abas. */
const fs = require('fs'), vm = require('vm'), path = require('path');

function Sheet(nome) {
  this.nome = nome; this.cells = []; this.frozen = 0;
  this.getName = () => this.nome;
  this._at = r => (this.cells[r - 1] || (this.cells[r - 1] = []));
  this.getRange = (r, c, nr, nc) => {
    nr = nr || 1; nc = nc || 1;
    const self = this;
    return {
      setValue(v) { self._at(r)[c - 1] = v; return this; },
      getValue() { return self._at(r)[c - 1] ?? ''; },
      setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => { self._at(r + i)[c + j - 1] = v; })); return this; },
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(self._at(r + i)[c + j - 1] ?? ''); out.push(row); }
        return out;
      },
      setFontWeight() { return this; },
      clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) self._at(r + i)[c + j - 1] = ''; return this; }
    };
  };
  this.getLastRow = () => { let last = 0; this.cells.forEach((row, i) => { if (row && row.some(v => v !== '' && v != null)) last = i + 1; }); return last; };
  this.getLastColumn = () => { let last = 0; this.cells.forEach(row => { if (row) row.forEach((v, j) => { if (v !== '' && v != null) last = Math.max(last, j + 1); }); }); return last; };
  this.deleteRow = r => { this.cells.splice(r - 1, 1); };
  this.setFrozenRows = n => { this.frozen = n; };
}
const SS = {
  sheets: [],
  getName: () => 'Planilha GP2T',
  getSheetByName(n) { return this.sheets.find(s => s.getName() === n) || null; },
  getSheets() { return this.sheets; },
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
};
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => SS, openById: () => SS },
  ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: t => ({ setMimeType: () => t }) },
  Date, JSON, String, Number, Object, isNaN, parseFloat, console, RegExp, Math, Array
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'google-sheets', 'Codigo.gs'), 'utf8'), ctx);

const envios = JSON.parse(fs.readFileSync(path.join(__dirname, 'payloads.json'), 'utf8'));
envios.forEach(e => { const r = ctx.processar(e); if (!r.ok) console.log('ERRO no envio', e.kind, r.erro); });

const alvo = process.argv[2];
const fmt = v => v instanceof Date ? v.toISOString().slice(0, 10) : (v === '' || v == null ? '' : String(v));
SS.getSheets().forEach(sh => {
  if (alvo && sh.getName() !== alvo) return;
  console.log('\n### ' + sh.getName());
  const last = sh.getLastRow(), lc = sh.getLastColumn();
  for (let r = 3; r <= last; r++) {
    const linha = sh.getRange(r, 1, 1, lc).getValues()[0].map(fmt);
    if (linha.every(v => v === '')) continue;
    console.log('  ' + (r === 3 ? '#' : r) + ' | ' + linha.join(' | '));
  }
});
