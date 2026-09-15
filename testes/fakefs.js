/* Firestore de mentira, do lado do Node.
   Guarda os documentos em memória e expõe funções para a página. Assim dois
   "celulares" (duas abas do Playwright) compartilham os mesmos dados, que é o
   que permite testar a sincronização de verdade. */
const dados = new Map();        // "caminho/do/doc" -> objeto
let negarTudo = false;
let negados = [];               // prefixos negados (simula regra do Firestore)

const api = {
  limpar() { dados.clear(); negarTudo = false; negados = []; },
  liberar() { negarTudo = false; negados = []; },
  negar(prefixo) { if (prefixo) negados.push(prefixo); else negarTudo = true; },
  set(caminho, json, merge) {
    const novo = typeof json === "string" ? JSON.parse(json) : json;
    if (merge && dados.has(caminho)) {
      dados.set(caminho, fundir(Object.assign({}, dados.get(caminho)), novo));
    } else dados.set(caminho, novo);
  },
  get(caminho) { return dados.has(caminho) ? JSON.stringify(dados.get(caminho)) : null; },
  tudo() { return [...dados.keys()].sort(); }
};

/* merge do Firestore: mapa aninhado funde chave a chave; o marcador __del__ apaga */
function fundir(alvo, novo) {
  Object.keys(novo).forEach(k => {
    const v = novo[k];
    if (v && typeof v === "object" && v.__del__) { delete alvo[k]; return; }
    if (v && typeof v === "object" && v.__inc__ !== undefined) {
      alvo[k] = (Number(alvo[k]) || 0) + v.__inc__; return;
    }
    if (v && typeof v === "object" && !Array.isArray(v) &&
        alvo[k] && typeof alvo[k] === "object" && !Array.isArray(alvo[k])) {
      alvo[k] = fundir(Object.assign({}, alvo[k]), v); return;
    }
    alvo[k] = v;
  });
  return alvo;
}

function permitido(caminho) {
  if (negarTudo) return false;
  return !negados.some(p => caminho.startsWith(p));
}
const NEGADO = "__NEGADO__";

/* Liga a página às funções acima */
async function ligar(page) {
  await page.exposeFunction("__fsSet", (caminho, json, merge) => {
    if (!permitido(caminho)) return NEGADO;
    api.set(caminho, json, merge); return true;
  });
  await page.exposeFunction("__fsGet", caminho => {
    if (!permitido(caminho)) return NEGADO;
    return api.get(caminho);
  });
  await page.exposeFunction("__fsDel", caminho => {
    if (!permitido(caminho)) return NEGADO;
    dados.delete(caminho); return true;
  });
  /* Todos os documentos de uma coleção: "frota/gp2t/abastecimentos" devolve
     [[id, json], ...] — só os filhos diretos, como faz a coleção de verdade. */
  await page.exposeFunction("__fsLista", prefixo => {
    if (!permitido(prefixo)) return NEGADO;
    const out = [];
    dados.forEach((v, k) => {
      if (!k.startsWith(prefixo + "/")) return;
      const resto = k.slice(prefixo.length + 1);
      if (resto.includes("/")) return;
      out.push([resto, JSON.stringify(v)]);
    });
    return JSON.stringify(out);
  });
}

module.exports = { api, ligar };
