// Kauê — versões A, B, C e D, versão adaptada, códigos e gabaritos.
// Tudo é determinístico: a mesma prova, com a mesma semente, gera sempre as mesmas versões.

export const LETRAS_VERSAO = ['A', 'B', 'C', 'D'];
export const VERSAO_ADAPTADA = 5;
const LETRAS = 'abcdefghij';

// ---------- números aleatórios com semente ----------
function hash32(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function aleatorio(semente) {
  let a = hash32(String(semente));
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function embaralhar(lista, rnd) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// embaralha mantendo os itens fixos na mesma posição
function embaralharComFixos(lista, fixos, rnd) {
  const livresPos = [], livres = [];
  lista.forEach((x, k) => { if (!fixos.includes(x)) { livresPos.push(k); livres.push(x); } });
  const mist = embaralhar(livres, rnd);
  const out = [...lista];
  livresPos.forEach((pos, k) => { out[pos] = mist[k]; });
  return out;
}

// ---------- código da prova: 3 dígitos do número + 1 da versão + 1 de conferência (Luhn) ----------
function digitoLuhn(base) {
  let soma = 0, dobra = true;
  for (let i = base.length - 1; i >= 0; i--) {
    let d = Number(base[i]);
    if (dobra) { d *= 2; if (d > 9) d -= 9; }
    soma += d; dobra = !dobra;
  }
  return (10 - (soma % 10)) % 10;
}

export function codigoDe(numero, versao) {
  const base = String(numero).padStart(3, '0') + String(versao);
  return base + digitoLuhn(base);
}

export function lerCodigo(texto) {
  const s = String(texto || '').replace(/\D/g, '');
  if (s.length !== 5) return null;
  if (digitoLuhn(s.slice(0, 4)) !== Number(s[4])) return null;
  const versao = Number(s[3]);
  if (versao < 1 || versao > VERSAO_ADAPTADA) return null;
  return { numero: Number(s.slice(0, 3)), versao };
}

export const nomeVersao = v => (v === VERSAO_ADAPTADA ? 'Adaptada' : LETRAS_VERSAO[v - 1]);

// ---------- ordem das questões: só embaralha dentro do mesmo bloco ----------
function ordemDasQuestoes(questoes, embaralharQuestoes, rnd) {
  const ordem = [];
  let grupo = [];
  const fechar = () => { ordem.push(...(embaralharQuestoes ? embaralhar(grupo, rnd) : grupo)); grupo = []; };
  questoes.forEach((q, i) => {
    if (grupo.length && questoes[grupo[0]].bloco !== q.bloco) fechar();
    grupo.push(i);
  });
  if (grupo.length) fechar();
  return ordem;
}

// ---------- gera as descrições das versões (o que fica guardado) ----------
export function gerarVersoes(res, { numero, quantas = 4, embaralharQuestoes = false, embaralharAlternativas = true, semente }) {
  const versoes = [];
  for (let v = 0; v < Math.min(Math.max(quantas, 1), 4); v++) {
    const letra = LETRAS_VERSAO[v];
    const original = v === 0; // a versão A é a prova como foi escrita
    const rnd = aleatorio(`${semente}|${letra}`);
    const ordem = original ? res.questoes.map((_, i) => i) : ordemDasQuestoes(res.questoes, embaralharQuestoes, rnd);
    const mexer = !original && embaralharAlternativas;
    const perm = res.questoes.map(q => {
      if (q.tipo === 'multipla') {
        const letras = q.alternativas.map(a => a.letra);
        return { alt: mexer ? embaralharComFixos(letras, q.fixar ? [q.fixar] : [], rnd) : letras };
      }
      if (q.tipo === 'vf') { const k = q.itensVF.map((_, i) => i); return { vf: mexer ? embaralhar(k, rnd) : k }; }
      if (q.tipo === 'associe') { const k = q.colunaB.map((_, i) => i); return { colB: mexer ? embaralhar(k, rnd) : k }; }
      return {};
    });
    versoes.push({ versao: v + 1, letra, codigo: codigoDe(numero, v + 1), ordem, perm });
  }
  return versoes;
}

// ---------- monta uma questão já com as letras da versão ----------
function questaoMontada(q, perm, n, origem) {
  const out = {
    n, origem, tipo: q.tipo, valor: q.valor, enunciado: q.enunciado, imagens: q.imagens,
    linhas: q.linhas, resposta: q.resposta, criterios: q.criterios, pontuacao: q.pontuacao,
    lacunas: q.lacunas, colunaA: q.colunaA, revisar: q.revisar, dificuldade: q.dificuldade, fonte: q.fonte,
  };
  if (q.tipo === 'multipla') {
    const ordem = perm.alt || q.alternativas.map(a => a.letra);
    out.alternativas = ordem.map((letraOrig, k) => {
      const a = q.alternativas.find(x => x.letra === letraOrig);
      return { letra: LETRAS[k], texto: a.texto, certa: a.certa, letraOriginal: letraOrig };
    });
    const c = out.alternativas.find(a => a.certa);
    out.gabarito = c ? c.letra : '?';
  } else if (q.tipo === 'vf') {
    out.itensVF = (perm.vf || q.itensVF.map((_, i) => i)).map(k => q.itensVF[k]);
    out.gabarito = out.itensVF.map(x => x.resposta).join(' ');
  } else if (q.tipo === 'associe') {
    out.colunaB = (perm.colB || q.colunaB.map((_, i) => i)).map(k => q.colunaB[k]);
    out.gabarito = out.colunaB.map(x => x.resposta || '?').join(' ');
  } else if (q.tipo === 'complete') {
    out.gabarito = q.lacunas.map(l => l.join(' / ')).join(' | ');
  } else {
    out.gabarito = 'discursiva';
  }
  return out;
}

// itens na ordem de impressão: cabeçalhos de bloco + questões
function itensComBlocos(res, montadas) {
  const itens = [];
  let anterior;
  montadas.forEach(({ q, bloco }) => {
    if (bloco !== anterior) {
      if (bloco != null) itens.push({ tipo: 'bloco', bloco: res.blocos.find(b => b.id === bloco) });
      else if (anterior != null) itens.push({ tipo: 'semBloco' });
      anterior = bloco;
    }
    itens.push({ tipo: 'questao', q });
  });
  return itens;
}

function resumoGabarito(questoes) {
  return questoes.map(q => ({ n: q.n, tipo: q.tipo, resposta: q.gabarito, valor: q.valor, origem: q.origem,
    pontuacao: q.pontuacao, criterios: q.criterios, respostaEsperada: q.resposta }));
}

export function montarVersao(res, desc) {
  const montadas = desc.ordem.map((i, k) => ({ q: questaoMontada(res.questoes[i], desc.perm[i] || {}, k + 1, i), bloco: res.questoes[i].bloco }));
  const questoes = montadas.map(m => m.q);
  return {
    versao: desc.versao, letra: desc.letra, codigo: desc.codigo, adaptada: false,
    itens: itensComBlocos(res, montadas), questoes, gabarito: resumoGabarito(questoes),
    total: Math.round(questoes.reduce((s, q) => s + (q.valor || 0), 0) * 100) / 100,
  };
}

// ---------- versão adaptada ----------
export function montarAdaptada(res, { numero, alternativas = 2, semente }) {
  const rnd = aleatorio(`${semente}|ADAPTADA`);
  const montadas = [];
  let n = 0;
  res.questoes.forEach((q, i) => {
    const modo = q.adaptada ? q.adaptada.modo : 'igual';
    if (modo === 'excluir') return;
    let base = modo === 'propria' && q.adaptadaQuestao ? q.adaptadaQuestao : q;
    if (base.tipo === 'multipla' && modo !== 'propria') {
      const certa = q.alternativas.find(a => a.certa);
      const erradas = q.alternativas.filter(a => !a.certa).map(a => a.letra);
      let manter = modo === 'manter' ? q.adaptada.manter : embaralhar(erradas, rnd).slice(0, Math.max(alternativas - 1, 1));
      // a ordem também é sorteada, para a certa não cair sempre na mesma letra
      const ficam = embaralhar(q.alternativas.filter(a => a === certa || manter.includes(a.letra)).map(a => a.letra), rnd);
      base = { ...q, fixar: null };
      n++;
      montadas.push({ q: { ...questaoMontada(base, { alt: ficam }, n, i), modoAdaptada: modo }, bloco: q.bloco });
      return;
    }
    n++;
    const valor = base.valor != null ? base.valor : q.valor;
    const perm = base.tipo === 'multipla' ? { alt: base.alternativas.map(a => a.letra) } : {};
    montadas.push({ q: { ...questaoMontada({ ...base, valor }, perm, n, i), modoAdaptada: modo }, bloco: q.bloco });
  });
  const questoes = montadas.map(m => m.q);
  const total = Math.round(questoes.reduce((s, q) => s + (q.valor || 0), 0) * 100) / 100;
  return {
    versao: VERSAO_ADAPTADA, letra: 'Adaptada', codigo: codigoDe(numero, VERSAO_ADAPTADA), adaptada: true,
    itens: itensComBlocos(res, montadas), questoes, gabarito: resumoGabarito(questoes), total,
    excluidas: res.questoes.length - questoes.length,
  };
}

// tem algo para adaptar? (a prova pede adaptada se alguma questão tiver regra ou forma própria)
export function provaPedeAdaptada(res) {
  return res.questoes.some(q => q.adaptadaRegra || q.adaptadaQuestao);
}
