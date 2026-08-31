/*******************************************************************
 * STRACTA · Ponte com o app de Frota (Google Apps Script)
 * -----------------------------------------------------------------
 * Cole este arquivo em: sua planilha → Extensões → Apps Script.
 * Depois: Implantar → Nova implantação → App da Web
 *   • Executar como: Eu
 *   • Quem tem acesso: Qualquer pessoa
 * Copie a URL que termina em /exec e cole no app (Painel → Planilha).
 *
 * O app é a fonte da verdade. Cada linha guarda um _id:
 *   upsert  → cria ou ATUALIZA a linha do mesmo _id (não duplica)
 *   delete  → limpa a linha daquele _id
 *   bulk    → vários upserts de uma vez ("Sincronizar tudo")
 * As colunas de fórmula (Horas, L/h, L/Ton) nunca são sobrescritas.
 *******************************************************************/

var HEADER_ROW = 3;   // linha dos cabeçalhos
var DATA_START = 4;   // primeira linha de dados
var ID_COL     = "_id";

// Configuração por tipo de dado
var TABS = {
  lancamento: {
    nome: "Lançamento Diário",
    extras: ["KM", "Combustível", "ARLA (L)", "Situação"],
    dateCols: ["Data"],
    formulas: {
      "Horas":  function (r) { return '=IF(OR(D' + r + '="",E' + r + '=""),"",E' + r + '-D' + r + ')'; },
      "L/h":    function (r) { return '=IF(OR(F' + r + '="",F' + r + '=0,G' + r + '=""),"",G' + r + '/F' + r + ')'; },
      "L/Ton":  function (r) { return '=IF(OR(H' + r + '="",H' + r + '=0,G' + r + '=""),"",G' + r + '/H' + r + ')'; }
    }
  },
  equipamento: { nome: "Equipamentos", extras: [], dateCols: [], formulas: {} },
  operador:    { nome: "Operadores",   extras: [], dateCols: [], formulas: {} },
  manutencao:  { nome: "Manutenções",  extras: [], dateCols: ["Data", "Próxima Manutenção"], formulas: {} }
};

/* ------------------------ Entradas HTTP ------------------------ */

function doGet(e) {
  var out = { ok: true, planilha: SpreadsheetApp.getActiveSpreadsheet().getName(), linhas: contarLinhas() };
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) return ContentService.createTextOutput(cb + "(" + JSON.stringify(out) + ")")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
  return json(out);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var res = processar(body);
    return json(res);
  } catch (err) {
    return json({ ok: false, erro: String(err) });
  }
}

/* ------------------------ Processamento ------------------------ */

function processar(body) {
  var cfg = TABS[body.kind];
  if (!cfg) return { ok: false, erro: "Tipo desconhecido: " + body.kind };
  var ctx = abrir(cfg);
  if (!ctx) return { ok: false, erro: "Aba não encontrada: " + cfg.nome };

  if (body.action === "upsert") { upsert(ctx, cfg, body.row); return { ok: true }; }
  if (body.action === "delete") { remover(ctx, body.id); return { ok: true }; }
  if (body.action === "bulk") {
    (body.rows || []).forEach(function (row) { upsert(ctx, cfg, row); });
    return { ok: true, total: (body.rows || []).length };
  }
  return { ok: false, erro: "Ação desconhecida: " + body.action };
}

// Abre a aba e monta o mapa de cabeçalhos (criando extras e _id se faltarem)
function abrir(cfg) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(cfg.nome) || acharAbaNormalizada(ss, cfg.nome);
  if (!sh) return null;

  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) { if (h !== "" && h != null) map[String(h).trim()] = i + 1; });

  // garante colunas extras + _id
  var faltando = cfg.extras.concat([ID_COL]).filter(function (h) { return !map[h]; });
  faltando.forEach(function (h) {
    lastCol += 1;
    sh.getRange(HEADER_ROW, lastCol).setValue(h);
    map[h] = lastCol;
  });
  return { sh: sh, map: map };
}

function upsert(ctx, cfg, row) {
  var sh = ctx.sh, map = ctx.map;
  var idCol = map[ID_COL];
  var r = acharLinhaPorId(sh, idCol, row[ID_COL]);
  if (!r) r = primeiraLinhaVazia(sh, idCol);

  Object.keys(row).forEach(function (h) {
    var col = map[h];
    if (!col) return;                       // cabeçalho inexistente: ignora
    if (cfg.formulas[h]) return;            // coluna de fórmula: não sobrescreve
    var v = row[h];
    if (cfg.dateCols.indexOf(h) >= 0) v = parseData(v);
    else v = numeroSePuder(v);
    sh.getRange(r, col).setValue(v);
  });

  // (re)aplica fórmulas da linha
  Object.keys(cfg.formulas).forEach(function (h) {
    var col = map[h];
    if (col) sh.getRange(r, col).setFormula(cfg.formulas[h](r));
  });
}

function remover(ctx, id) {
  var sh = ctx.sh, idCol = ctx.map[ID_COL];
  var r = acharLinhaPorId(sh, idCol, id);
  if (r) sh.getRange(r, 1, 1, Math.max(sh.getLastColumn(), 1)).clearContent();
}

/* ------------------------ Utilidades ------------------------ */

function acharLinhaPorId(sh, idCol, id) {
  if (!id) return null;
  var last = sh.getLastRow();
  if (last < DATA_START) return null;
  var vals = sh.getRange(DATA_START, idCol, last - DATA_START + 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) return DATA_START + i;
  }
  return null;
}

function primeiraLinhaVazia(sh, idCol) {
  var last = sh.getLastRow();
  if (last < DATA_START) return DATA_START;
  var vals = sh.getRange(DATA_START, idCol, last - DATA_START + 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === "" || vals[i][0] == null) return DATA_START + i;
  }
  return last + 1;
}

function parseData(v) {
  if (!v) return "";
  var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(v);
  return isNaN(d.getTime()) ? v : d;
}

function numeroSePuder(v) {
  if (typeof v === "string" && v.trim() !== "" && !isNaN(v) && !isNaN(parseFloat(v))) return Number(v);
  return v;
}

function contarLinhas() {
  var out = {};
  Object.keys(TABS).forEach(function (k) {
    var ctx = abrir(TABS[k]);
    if (!ctx) { out[k] = 0; return; }
    var idCol = ctx.map[ID_COL], sh = ctx.sh, last = sh.getLastRow(), n = 0;
    if (last >= DATA_START) {
      var vals = sh.getRange(DATA_START, idCol, last - DATA_START + 1, 1).getValues();
      vals.forEach(function (x) { if (x[0] !== "" && x[0] != null) n++; });
    }
    out[k] = n;
  });
  return out;
}

function acharAbaNormalizada(ss, nome) {
  var alvo = normalizar(nome);
  var achou = null;
  ss.getSheets().forEach(function (s) { if (normalizar(s.getName()) === alvo) achou = s; });
  return achou;
}
function normalizar(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
