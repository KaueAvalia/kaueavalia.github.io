// Kauê — correção de uma prova: pontos por questão, total e nota na coluna da planilha
import { nota2 } from './notas.js';

const LETRAS = 'abcdefghij';

// marcação vazia para uma questão da versão
export function marcacaoVazia(q) {
  if (q.tipo === 'multipla') return null;
  if (q.tipo === 'vf') return q.itensVF.map(() => null);
  if (q.tipo === 'associe') return q.colunaB.map(() => null);
  if (q.tipo === 'complete') return q.lacunas.map(() => null);
  return null; // discursiva: pontos escolhidos pelo professor
}

const proporcional = (q, acertos, itens, modo) => {
  if (!itens) return 0;
  if (modo === 'inteira') return acertos === itens ? q.valor : 0;
  return nota2(q.valor * acertos / itens);
};

// pontua uma questão; "pendente" quando falta marcar alguma parte
export function pontuar(q, marc, pontuacaoProva = 'parcial') {
  const modo = q.pontuacao || pontuacaoProva || 'parcial';
  const valor = q.valor || 0;
  if (q.tipo === 'multipla') {
    if (marc == null) return { pontos: 0, max: valor, pendente: true };
    const certa = marc === q.gabarito;
    return { pontos: certa ? valor : 0, max: valor, pendente: false, estado: certa ? 'certa' : 'errada' };
  }
  if (q.tipo === 'discursiva') {
    if (marc == null || marc === '') return { pontos: 0, max: valor, pendente: true };
    const p = Math.max(0, Math.min(valor, Number(marc)));
    return { pontos: nota2(p), max: valor, pendente: false, estado: p >= valor ? 'certa' : p > 0 ? 'parcial' : 'errada' };
  }
  const lista = Array.isArray(marc) ? marc : [];
  let certos = [];
  if (q.tipo === 'vf') certos = q.itensVF.map((it, k) => lista[k] == null ? null : lista[k] === it.resposta);
  else if (q.tipo === 'associe') certos = q.colunaB.map((it, k) => lista[k] == null ? null : lista[k] === it.resposta);
  else if (q.tipo === 'complete') certos = q.lacunas.map((_, k) => lista[k] == null ? null : lista[k] === true);
  const itens = certos.length;
  const acertos = certos.filter(c => c === true).length;
  const pendente = certos.some(c => c === null);
  const pontos = proporcional(q, acertos, itens, modo);
  return { pontos, max: valor, pendente, acertos, itens, estado: acertos === itens ? 'certa' : acertos ? 'parcial' : 'errada' };
}

export function totalDaCorrecao(montada, marcacoes, pontuacaoProva) {
  let pontos = 0, max = 0, pendentes = [];
  montada.questoes.forEach(q => {
    const r = pontuar(q, marcacoes[q.n], pontuacaoProva);
    pontos += r.pontos; max += r.max;
    if (r.pendente) pendentes.push(q.n);
  });
  return { pontos: nota2(pontos), max: nota2(max), pendentes };
}

// converte os pontos da prova para o valor que a avaliação tem na planilha
// (vale também para a adaptada, que pode somar menos pontos)
export function notaNaColuna(pontos, totalDaVersao, valorMax) {
  if (!totalDaVersao) return 0;
  return nota2(pontos / totalDaVersao * valorMax);
}

// "bdac-e": preenche as múltiplas escolhas em ordem; "-" ou "." = em branco
export function preencherMultiplas(montada, texto, marcacoes) {
  const letras = String(texto || '').toLowerCase().replace(/[^a-j\-.?x*]/g, '');
  const multiplas = montada.questoes.filter(q => q.tipo === 'multipla');
  const novas = { ...marcacoes };
  multiplas.forEach((q, k) => {
    const c = letras[k];
    if (c == null) return;
    if (/[a-j]/.test(c) && LETRAS.indexOf(c) < q.alternativas.length) novas[q.n] = c;
    else novas[q.n] = '-';
  });
  return { marcacoes: novas, usadas: Math.min(letras.length, multiplas.length), total: multiplas.length };
}
