// Kauê — o nome deste aparelho (escolhido pelo professor) e o carimbo de aparelho, data e hora.
// O nome fica só neste aparelho: o backup leva o carimbo das coisas, mas nunca o nome do aparelho que restaura.
import * as db from './db.js';
import { uid, nomeArquivo } from './util.js';

let atual = null;

export async function aparelho() {
  if (atual) return atual;
  let a = await db.config('aparelho');
  if (!a || !a.id) { a = { id: uid(), nome: '' }; await db.definirConfig('aparelho', a); }
  atual = a;
  return a;
}

export async function nomearAparelho(nome) {
  const a = await aparelho();
  a.nome = String(nome || '').trim().slice(0, 40);
  await db.definirConfig('aparelho', a);
  atual = a;
  return a;
}

export const nomeOuPadrao = n => n || 'aparelho sem nome';

// { em, aparelho, aparelhoId }: quando e onde algo foi feito
export async function carimbo() {
  const a = await aparelho();
  return { em: new Date().toISOString(), aparelho: a.nome, aparelhoId: a.id };
}

// "25/11/2026 às 08:12"
export function dataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// "25/11/2026 às 08:12 · Telefone 1"
export function descreverCarimbo(c, { meuId } = {}) {
  if (!c) return '';
  const em = typeof c === 'string' ? c : c.em;
  const nome = typeof c === 'string' ? '' : c.aparelho;
  const aqui = meuId && c.aparelhoId === meuId;
  return `${dataHora(em)}${nome ? ' · ' + nome : ''}${aqui ? ' (este aparelho)' : ''}`;
}

// trecho para nomes de arquivo: "pc-do-gustavo-2026-11-25-0812"
export async function sufixoArquivo() {
  const a = await aparelho();
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${nomeArquivo(a.nome || 'sem-nome')}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// sugestões de nome (o professor pode escrever o que quiser, como "PC do Gustavo")
export const SUGESTOES_DE_NOME = ['Meu PC', 'Meu celular', 'PC da escola', 'Notebook'];
