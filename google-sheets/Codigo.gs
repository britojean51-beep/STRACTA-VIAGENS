/*******************************************************************
 * GP2T · Ponte com o app de Gestão de Frota (Google Apps Script)
 * -----------------------------------------------------------------
 * Cole este arquivo em: sua planilha → Extensões → Apps Script.
 * Depois: Implantar → Nova implantação → App da Web
 *   • Executar como: Eu
 *   • Quem tem acesso: Qualquer pessoa
 * Copie a URL que termina em /exec e cole no app
 *   (Início → ⚙️ Configurações → ☁️ Planilha na nuvem).
 *
 * O app é a fonte da verdade. Cada linha guarda um _id:
 *   upsert  → cria ou ATUALIZA a linha do mesmo _id (não duplica)
 *   delete  → limpa a linha daquele _id
 *   bulk    → vários upserts de uma vez ("Sincronizar tudo")
 *   substituirDia → regrava um dia inteiro (abas de resumo)
 * A planilha NÃO tem fórmula: quem calcula é o app, aqui só se registra.
 * As abas que faltarem são criadas sozinhas na primeira sincronização.
 *******************************************************************/

/* >>> COLE AQUI o link da sua planilha do Google Sheets <<<
   Necessário quando o script é criado AVULSO em script.google.com
   (ex.: no celular, onde a planilha não mostra "Extensões").
   Se você colar este script DENTRO da própria planilha, pode deixar "". */
var PLANILHA_URL = "";

var HEADER_ROW = 3;   // linha dos cabeçalhos
var DATA_START = 4;   // primeira linha de dados
var ID_COL     = "_id";

// Abre a planilha: pelo link (script avulso) ou a planilha atual (dentro dela)
function getSS() {
  if (PLANILHA_URL && String(PLANILHA_URL).trim()) {
    var m = String(PLANILHA_URL).match(/[-\w]{25,}/);   // extrai o ID do link
    if (m) return SpreadsheetApp.openById(m[0]);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// Configuração por tipo de dado
var TABS = {
  // ---- abas de detalhe (o app manda tudo pronto, sem fórmula) ----
  lancamento: {
    nome: "Abastecimentos", dateCols: ["Data"],
    colunas: ["Data", "Horário", "Equipamento", "Operador", "Horímetro Inicial", "Horímetro Final",
              "Horas", "Litros", "Combustível", "ARLA (L)", "KM Rodado", "Média",
              "Unidade", "Toneladas", "L/Ton", "Situação"]
  },
  viagem: {
    nome: "Viagens", dateCols: ["Data"],
    colunas: ["Data", "Equipamento", "Operador", "Origem", "Destino", "Viagens",
              "Material", "Peso/viagem (t)", "Peso total (t)"]
  },
  manutencao: {
    nome: "Manutenções", dateCols: ["Data", "Próxima Manutenção"],
    colunas: ["Data", "Equipamento", "Operador/Responsável", "Horímetro", "KM", "Tipo",
              "Serviço Realizado", "Peças/Trocas", "Observação", "Próxima Manutenção"]
  },
  equipamento: {
    nome: "Equipamentos", dateCols: [],
    colunas: ["Código", "Tipo", "Modelo", "Status", "Horímetro Atual", "KM Atual"]
  },
  operador: {
    nome: "Operadores", dateCols: [],
    colunas: ["Nome", "Função", "Status"]
  },

  // ---- abas de resumo (uma linha por dia / dia+equipamento / dia+operador) ----
  resumoDia: {
    nome: "Resumo por Dia", dateCols: ["Data"], semId: true,
    colunas: ["Data", "Equipamentos", "Operadores", "Consumo total (L)", "Horas totais",
              "L/h", "Produção (t)", "L/Ton", "Diesel S-10 (L)", "Diesel S-500 (L)",
              "ARLA (L)", "KM", "Média km/L", "Viagens", "Manutenções",
              "Quais equipamentos", "Quais operadores"]
  },
  resumoEquip: {
    nome: "Resumo por Equipamento", dateCols: ["Data"], semId: true,
    colunas: ["Data", "Equipamento", "Consumo (L)", "Horas", "L/h", "Produção (t)",
              "L/Ton", "KM", "Média km/L", "Viagens"]
  },
  resumoOperador: {
    nome: "Resumo por Operador", dateCols: ["Data"], semId: true,
    colunas: ["Data", "Operador", "Equipamentos", "Consumo (L)", "Horas", "L/h",
              "Produção (t)", "L/Ton", "Viagens"]
  },
  resumoMes: {
    nome: "Resumo por Mês", dateCols: [],
    colunas: ["Mês", "Dias com lançamento", "Equipamentos", "Operadores",
              "Consumo total (L)", "Horas totais", "L/h", "Produção (t)", "L/Ton",
              "Diesel S-10 (L)", "Diesel S-500 (L)", "ARLA (L)", "KM", "Média km/L",
              "Viagens", "Manutenções", "Quais equipamentos", "Quais operadores"]
  }
};

/* ------------------------ Entradas HTTP ------------------------ */

function doGet(e) {
  var out = { ok: true, planilha: getSS().getName(), linhas: contarLinhas() };
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
  if (body.action === "substituirDia") {
    substituirDia(ctx, cfg, body.data, body.rows || []);
    return { ok: true, total: (body.rows || []).length };
  }
  return { ok: false, erro: "Ação desconhecida: " + body.action };
}

// Abre a aba e monta o mapa de cabeçalhos (criando extras e _id se faltarem)
function abrir(cfg) {
  var ss = getSS();
  var sh = ss.getSheetByName(cfg.nome) || acharAbaNormalizada(ss, cfg.nome);

  // aba nova: cria com título e cabeçalho na linha 3 (mesmo padrão das outras)
  if (!sh) {
    sh = ss.insertSheet(cfg.nome);
    sh.getRange(1, 1).setValue(cfg.nome);
    sh.getRange(2, 1).setValue("Preenchido automaticamente pelo app GP2T — não edite à mão.");
    var cabec = cfg.colunas.concat(cfg.semId ? [] : [ID_COL]);
    sh.getRange(HEADER_ROW, 1, 1, cabec.length).setValues([cabec]).setFontWeight("bold");
    sh.setFrozenRows(HEADER_ROW);
  }

  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) { if (h !== "" && h != null) map[String(h).trim()] = i + 1; });

  // garante as colunas esperadas + _id (quando a aba usa _id)
  var esperadas = (cfg.colunas || []).concat(cfg.semId ? [] : [ID_COL]);
  var faltando = esperadas.filter(function (h) { return !map[h]; });
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
  escreverLinha(sh, cfg, map, r, row);
}

/* Escreve uma linha inteira (sem fórmula: o app já manda calculado) */
function escreverLinha(sh, cfg, map, r, row) {
  Object.keys(row).forEach(function (h) {
    var col = map[h];
    if (!col) return;                       // cabeçalho inexistente: ignora
    var v = row[h];
    if (cfg.dateCols.indexOf(h) >= 0) v = parseData(v);
    else v = numeroSePuder(v);
    sh.getRange(r, col).setValue(v);
  });
}

/* Apaga as linhas daquela data e grava as novas — mantém o resumo sempre certo */
function substituirDia(ctx, cfg, data, rows) {
  var sh = ctx.sh, map = ctx.map;
  var colData = map["Data"];
  if (!colData) return;
  var alvo = String(data).slice(0, 10);
  var last = sh.getLastRow();

  // limpa de baixo para cima as linhas daquele dia
  if (last >= DATA_START) {
    var vals = sh.getRange(DATA_START, colData, last - DATA_START + 1, 1).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (mesmaData(vals[i][0], alvo)) sh.deleteRow(DATA_START + i);
    }
  }
  // grava as novas no fim
  var linha = Math.max(sh.getLastRow() + 1, DATA_START);
  rows.forEach(function (row) { escreverLinha(sh, cfg, map, linha++, row); });
}

/* Compara a célula de data (Date ou texto) com "AAAA-MM-DD" */
function mesmaData(v, iso) {
  if (v instanceof Date) {
    var m = iso.split("-");
    return v.getFullYear() === Number(m[0]) && (v.getMonth() + 1) === Number(m[1]) && v.getDate() === Number(m[2]);
  }
  return String(v).slice(0, 10) === iso;
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

/* Texto que é número vira número de verdade na célula (aceita vírgula).
   Códigos com zero à esquerda ("01") continuam como texto. */
function numeroSePuder(v) {
  if (typeof v !== "string") return v;
  var s = v.trim();
  if (s === "" || /^0\d/.test(s)) return v;
  if (/^-?\d+(?:[.,]\d+)?$/.test(s)) return Number(s.replace(",", "."));
  return v;
}

function contarLinhas() {
  var out = {};
  Object.keys(TABS).forEach(function (k) {
    var ctx = abrir(TABS[k]);
    if (!ctx) { out[k] = 0; return; }
    var idCol = ctx.map[ID_COL] || 1, sh = ctx.sh, last = sh.getLastRow(), n = 0;
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
