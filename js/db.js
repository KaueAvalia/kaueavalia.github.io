// Kauê — banco de dados no próprio aparelho (IndexedDB)
const NOME = 'kaue';
const VERSAO = 3;
export const LOJAS = ['provas', 'escolas', 'arquivos', 'config', 'turmas', 'correcoes', 'aulas'];

let conexao = null;

function abrir() {
  if (conexao) return Promise.resolve(conexao);
  return new Promise((ok, falha) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('provas')) db.createObjectStore('provas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('escolas')) db.createObjectStore('escolas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('arquivos')) {
        const a = db.createObjectStore('arquivos', { keyPath: 'id' });
        a.createIndex('dono', 'dono');
      }
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'chave' });
      // versão 2: turmas e correções
      if (!db.objectStoreNames.contains('turmas')) db.createObjectStore('turmas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('correcoes')) {
        const c = db.createObjectStore('correcoes', { keyPath: 'id' });
        c.createIndex('turma', 'turmaId');
      }
      // versão 3: aulas (roteiro, apostilas e slides)
      if (!db.objectStoreNames.contains('aulas')) db.createObjectStore('aulas', { keyPath: 'id' });
    };
    req.onsuccess = () => { conexao = req.result; ok(conexao); };
    req.onerror = () => falha(req.error);
  });
}

function pedido(loja, modo, fazer) {
  return abrir().then(db => new Promise((ok, falha) => {
    const tx = db.transaction(loja, modo);
    const r = fazer(tx.objectStore(loja));
    tx.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
    tx.onerror = () => falha(tx.error);
    tx.onabort = () => falha(tx.error || new Error('Operação cancelada'));
  }));
}

export const pegar = (loja, id) => pedido(loja, 'readonly', s => s.get(id));
export const todos = loja => pedido(loja, 'readonly', s => s.getAll());
export const guardar = (loja, obj) => pedido(loja, 'readwrite', s => s.put(obj));
export const apagar = (loja, id) => pedido(loja, 'readwrite', s => s.delete(id));
export const arquivosDe = dono => pedido('arquivos', 'readonly', s => s.index('dono').getAll(dono));
export const correcoesDaTurma = turmaId => pedido('correcoes', 'readonly', s => s.index('turma').getAll(turmaId));

export async function apagarArquivosDe(dono) {
  const lista = await arquivosDe(dono);
  for (const a of lista) await apagar('arquivos', a.id);
}

export async function config(chave, padrao = null) {
  const r = await pegar('config', chave);
  return r ? r.valor : padrao;
}
export const definirConfig = (chave, valor) => guardar('config', { chave, valor });

// pede ao navegador para não apagar os dados quando faltar espaço
export async function pedirArmazenamentoPersistente() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* sem suporte */ }
  return false;
}
