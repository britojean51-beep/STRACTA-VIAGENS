/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — db.js
   Banco de dados 100% offline usando IndexedDB.
   Stores: motoristas, equipamentos, rotas, viagens, deslocamentos,
           abastecimentos, lubrificacoes, turnos, localizacoes,
           configuracoes, usuarios, syncQueue
   ══════════════════════════════════════════════════════════ */

const DB_NAME = 'stracta_viagens_db';
const DB_VERSION = 8;

const STORES = [
  { name: 'usuarios',        keyPath: 'id', indexes: [['usuario', 'usuario', { unique: true }]] },
  { name: 'motoristas',      keyPath: 'id', indexes: [['nome', 'nome', {}]] },
  { name: 'equipamentos',    keyPath: 'id', indexes: [['codigo', 'codigo', {}]] },
  { name: 'rotas',           keyPath: 'id', indexes: [['favorita', 'favorita', {}]] },
  { name: 'rotasDeslocamento', keyPath: 'id', indexes: [['favorita', 'favorita', {}]] },
  { name: 'checklists',      keyPath: 'id', indexes: [['equipamentoId', 'equipamentoId', {}], ['dia', 'dia', {}]] },
  { name: 'viagens',         keyPath: 'id', indexes: [['dia', 'dia', {}], ['turnoId', 'turnoId', {}], ['rotaId', 'rotaId', {}], ['equipamentoId', 'equipamentoId', {}]] },
  { name: 'deslocamentos',   keyPath: 'id', indexes: [['turnoId', 'turnoId', {}], ['equipamentoId', 'equipamentoId', {}]] },
  { name: 'abastecimentos',  keyPath: 'id', indexes: [['dia', 'dia', {}], ['equipamentoId', 'equipamentoId', {}]] },
  { name: 'lubrificacoes',   keyPath: 'id', indexes: [['dia', 'dia', {}], ['equipamentoId', 'equipamentoId', {}]] },
  { name: 'manutencoes',     keyPath: 'id', indexes: [['equipamentoId', 'equipamentoId', {}]] },
  { name: 'logs',            keyPath: 'id', indexes: [['criadoEm', 'criadoEm', {}], ['evento', 'evento', {}]] },
  { name: 'turnos',          keyPath: 'id', indexes: [['status', 'status', {}], ['motoristaId', 'motoristaId', {}]] },
  { name: 'localizacoes',    keyPath: 'id', indexes: [['dia', 'dia', {}], ['motoristaId', 'motoristaId', {}], ['turnoId', 'turnoId', {}]] },
  { name: 'areas',           keyPath: 'id', indexes: [['codigo', 'codigo', {}]] },
  { name: 'paradas',         keyPath: 'id', indexes: [['dia', 'dia', {}], ['turnoId', 'turnoId', {}]] },
  { name: 'configuracoes',   keyPath: 'chave' },
  { name: 'syncQueue',       keyPath: 'id', indexes: [['status', 'status', {}]] }
];

let _dbPromise = null;

function abrirBanco() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      const tx = ev.target.transaction;
      STORES.forEach(s => {
        let store;
        if (!db.objectStoreNames.contains(s.name)) {
          store = db.createObjectStore(s.name, { keyPath: s.keyPath, autoIncrement: !!s.autoIncrement });
        } else {
          store = tx.objectStore(s.name);
        }
        (s.indexes || []).forEach(([idxName, keyPath, opts]) => {
          if (!store.indexNames.contains(idxName)) {
            store.createIndex(idxName, keyPath, opts);
          }
        });
      });
    };

    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = (ev) => reject(ev.target.error);
  });
  return _dbPromise;
}

function _tx(storeName, modo = 'readonly') {
  return abrirBanco().then(db => db.transaction(storeName, modo).objectStore(storeName));
}

const DB = {
  // ---- CRUD genérico ----
  async put(storeName, valor) {
    const store = await _tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(valor);
      req.onsuccess = () => resolve(valor);
      req.onerror = () => reject(req.error);
    });
  },

  async get(storeName, chave) {
    const store = await _tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(chave);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(storeName) {
    const store = await _tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async getByIndex(storeName, indexName, valor) {
    const store = await _tx(storeName);
    return new Promise((resolve, reject) => {
      const idx = store.index(indexName);
      const req = idx.getAll(valor);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(storeName, chave) {
    const store = await _tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(chave);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  async clear(storeName) {
    const store = await _tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },

  // ---- Configurações (chave/valor) ----
  async getConfig(chave, padrao = null) {
    const r = await DB.get('configuracoes', chave);
    return r ? r.valor : padrao;
  },
  async setConfig(chave, valor) {
    return DB.put('configuracoes', { chave, valor });
  }
};

window.DB = DB;
window.abrirBanco = abrirBanco;
