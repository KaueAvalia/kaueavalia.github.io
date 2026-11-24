// Kauê — backup em arquivo: leva as provas para outro aparelho ou para o novo endereço do app
import { todos, pegar, guardar, arquivosDe } from './db.js';
import { blobParaBase64, base64ParaBlob } from './util.js';

const FORMATO = 'kaue-backup';

async function arquivosParaJson(lista) {
  const out = [];
  for (const a of lista) {
    const { blob, ...resto } = a;
    out.push({ ...resto, base64: blob ? await blobParaBase64(blob) : null });
  }
  return out;
}

export async function backupCompleto() {
  const [provas, escolas, arquivos, config] = await Promise.all([todos('provas'), todos('escolas'), todos('arquivos'), todos('config')]);
  return { formato: FORMATO, versao: 1, exportadoEm: new Date().toISOString(), tipo: 'completo',
    provas, escolas, config, arquivos: await arquivosParaJson(arquivos) };
}

export async function backupDaProva(provaId) {
  const prova = await pegar('provas', provaId);
  const escola = prova.escolaId ? await pegar('escolas', prova.escolaId) : null;
  const arquivos = [...await arquivosDe(provaId), ...(escola ? await arquivosDe(escola.id) : [])];
  return { formato: FORMATO, versao: 1, exportadoEm: new Date().toISOString(), tipo: 'prova',
    provas: [prova], escolas: escola ? [escola] : [], config: [], arquivos: await arquivosParaJson(arquivos) };
}

export function lerBackup(texto) {
  let dados;
  try { dados = JSON.parse(texto); } catch (e) { throw new Error('Este arquivo não é um backup do Kauê.'); }
  if (!dados || dados.formato !== FORMATO) throw new Error('Este arquivo não é um backup do Kauê.');
  return dados;
}

// junta o backup com o que já existe: o que tem o mesmo identificador é substituído
export async function restaurar(dados, { incluirConfig = true } = {}) {
  const existentes = await todos('provas');
  const conflitos = [];
  for (const p of dados.provas || []) {
    const mesmoNumero = existentes.find(e => e.numero === p.numero && e.id !== p.id);
    if (mesmoNumero) conflitos.push({ numero: p.numero, titulo: p.titulo, outro: mesmoNumero.titulo });
    await guardar('provas', p);
  }
  for (const e of dados.escolas || []) await guardar('escolas', e);
  for (const a of dados.arquivos || []) {
    const { base64, ...resto } = a;
    await guardar('arquivos', { ...resto, blob: base64 ? base64ParaBlob(base64, a.tipo) : null });
  }
  if (incluirConfig) for (const c of dados.config || []) await guardar('config', c);
  return { provas: (dados.provas || []).length, escolas: (dados.escolas || []).length, conflitos };
}
