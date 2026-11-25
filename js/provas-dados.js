// Kauê — dados de uma prova: configuração, versões montadas, arquivos
import { lerFormatoKaue } from './formato-kaue.js';
import { gerarVersoes, montarVersao, montarAdaptada, provaPedeAdaptada } from './versoes.js';
import * as db from './db.js';

// ---------- configuração padrão de uma prova ----------
export const configPadrao = res => ({
  versoes: 4, embaralharAlternativas: true, embaralharQuestoes: false,
  adaptada: res ? provaPedeAdaptada(res) : false, adaptadaAlternativas: (res && res.adaptadaAlternativas) || 2,
  colunas: 2, fonte: 'atkinson', tamanho: 10, mostrarValor: true, grade: true,
});

export const hashTexto = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
export const assinatura = p => hashTexto(p.texto + JSON.stringify(p.config));

// ---------- dados prontos de uma prova ----------
export async function carregarProva(id) {
  const prova = await db.pegar('provas', id);
  if (!prova) return null;
  const res = lerFormatoKaue(prova.texto);
  prova.config = { ...configPadrao(res), ...(prova.config || {}) };
  const escola = prova.escolaId ? await db.pegar('escolas', prova.escolaId) : null;
  return { prova, res, escola };
}

export function montarTudo(prova, res) {
  const c = prova.config;
  const descs = gerarVersoes(res, { numero: prova.numero, quantas: c.versoes, embaralharQuestoes: c.embaralharQuestoes,
    embaralharAlternativas: c.embaralharAlternativas, semente: prova.id });
  const montadas = descs.map(d => montarVersao(res, d));
  if (c.adaptada) montadas.push(montarAdaptada(res, { numero: prova.numero, alternativas: c.adaptadaAlternativas, semente: prova.id }));
  return montadas;
}

export async function mapaDeArquivos(prova, escola) {
  const mapa = new Map();
  for (const a of await db.arquivosDe(prova.id)) if (a.blob) mapa.set(a.chave, a);
  if (escola) for (const a of await db.arquivosDe(escola.id)) if (a.blob) mapa.set(a.chave, a);
  return mapa;
}

export async function professorPadrao(escola) {
  return (escola && escola.professor) || await db.config('professor', '');
}

