// Kauê — leitor do Formato Kauê v1
// Lê o texto de uma prova, devolve a estrutura em objeto e lista erros e avisos.
// Funciona no navegador e no Node (módulo ES, sem dependências).

const VERSAO = 1;

const CHAVES_PROVA = new Set(['titulo', 'disciplina', 'serie', 'periodo', 'alternativas', 'valor_total',
  'pontuacao', 'instrucoes', 'mensagem_final', 'imagem_final', 'escola', 'tempo', 'professor', 'turma', 'avaliacao']);
const CHAVES_BLOCO = new Set(['texto', 'imagem']);
const CHAVES_QUESTAO = new Set(['tipo', 'valor', 'dificuldade', 'fonte', 'bncc', 'enunciado', 'imagem',
  'adaptada', 'pontuacao', 'linhas', 'resposta', 'criterios', 'revisar', 'fixar']);
const CAMPOS_TEXTO = new Set(['texto', 'enunciado', 'resposta', 'instrucoes', 'mensagem_final']);

const TIPOS = {
  multipla: 'multipla', 'multipla escolha': 'multipla', me: 'multipla',
  vf: 'vf', 'v ou f': 'vf', 'verdadeiro ou falso': 'vf', 'v/f': 'vf',
  associe: 'associe', associacao: 'associe', associar: 'associe',
  complete: 'complete', completar: 'complete', lacunas: 'complete',
  discursiva: 'discursiva', aberta: 'discursiva', dissertativa: 'discursiva',
};

const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normChave = s => semAcento(s).toLowerCase().trim().replace(/\s+/g, '_');
const normValor = s => semAcento(String(s)).toLowerCase().trim();
const numero = s => {
  if (s == null || s === '') return null;
  const n = Number(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const limpaTexto = s => (s || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const RE = {
  prova: /^#\s*PROVA\s*$/i,
  bloco: /^##\s*BLOCO\s*:?\s*(.*)$/i,
  semBloco: /^##\s*SEM\s+BLOCO\s*$/i,
  questao: /^###\s*QUEST[ÃA]O\b.*$/i,
  adaptada: /^-{2,}\s*ADAPTADA\s*-*\s*$/i,
  campo: /^([A-Za-zÀ-ÿ_ ]{2,20}?)\s*:\s?(.*)$/,
  alternativa: /^(\*)?\s*([a-eA-E])\)\s+(.*)$/,
  vf: /^([VF])\)\s+(.*)$/,
  colunaB: /^\(\s*([a-zA-Z]?)\s*\)\s+(.*)$/,
  criterio: /^[-•]\s*([\d]+(?:[.,]\d+)?)\s*:\s*(.*)$/,
  lacuna: /\[\[(.+?)\]\]/g,
};

function novaQuestao(linha, bloco) {
  return {
    linha, bloco, tipo: null, valor: null, dificuldade: null, fonte: null, bncc: null,
    enunciado: '', imagens: [], alternativas: [], itensVF: [], colunaA: [], colunaB: [],
    lacunas: [], resposta: '', criterios: [], linhas: null, pontuacao: null,
    revisar: false, fixar: null, adaptadaRegra: null, adaptadaQuestao: null,
  };
}

function lerImagem(v) {
  const [arquivo, ...resto] = v.split('|');
  return { arquivo: arquivo.trim(), legenda: resto.join('|').trim() };
}

// Se o texto colado tiver um bloco de código (```), vale só o que está dentro dele:
// assim, frases do Claude antes ou depois da prova não entram por engano.
function extrairBlocoDeCodigo(linhas) {
  const ini = linhas.findIndex(l => /^\s*```/.test(l));
  if (ini < 0) return { linhas, deslocamento: 0 };
  let fim = linhas.findIndex((l, k) => k > ini && /^\s*```/.test(l));
  if (fim < 0) fim = linhas.length;
  return { linhas: linhas.slice(ini + 1, fim), deslocamento: ini + 1 };
}

export function lerFormatoKaue(textoEntrada) {
  const todas = String(textoEntrada || '').replace(/\r\n?/g, '\n').split('\n');
  const { linhas, deslocamento } = extrairBlocoDeCodigo(todas);
  const res = { versao: VERSAO, prova: {}, blocos: [], questoes: [], erros: [], avisos: [] };
  const erro = (linha, msg) => res.erros.push({ linha, msg });
  const aviso = (linha, msg) => res.avisos.push({ linha, msg });

  let secao = null;          // 'prova' | 'bloco' | 'questao' | null
  let blocoAtual = null;
  let q = null;              // questão em leitura
  let alvoQ = null;          // q ou a sua forma adaptada
  let ultimo = null;         // { obj, prop } que recebe linhas de continuação
  let viuProva = false;

  const fecharQuestao = () => {
    if (q) res.questoes.push(q);
    q = null; alvoQ = null; ultimo = null;
  };

  for (let i = 0; i < linhas.length; i++) {
    const n = i + 1 + deslocamento;
    const l = linhas[i].trim();

    if (!l) {
      // linha em branco: separa parágrafos num texto longo; encerra itens de lista
      if (ultimo && ultimo.paragrafo) { if (ultimo.obj[ultimo.prop]) ultimo.obj[ultimo.prop] += '\n\n'; }
      else ultimo = null;
      continue;
    }

    if (RE.prova.test(l)) { fecharQuestao(); secao = 'prova'; viuProva = true; continue; }
    let m;
    if ((m = l.match(RE.bloco)) && !RE.semBloco.test(l)) {
      fecharQuestao();
      blocoAtual = { id: res.blocos.length + 1, titulo: m[1].trim(), texto: '', imagens: [], linha: n };
      if (!blocoAtual.titulo) aviso(n, 'Bloco sem nome.');
      res.blocos.push(blocoAtual);
      secao = 'bloco';
      continue;
    }
    if (RE.semBloco.test(l)) { fecharQuestao(); blocoAtual = null; secao = null; continue; }
    if (RE.questao.test(l)) {
      fecharQuestao();
      q = novaQuestao(n, blocoAtual ? blocoAtual.id : null);
      alvoQ = q; secao = 'questao';
      continue;
    }
    if (RE.adaptada.test(l)) {
      if (secao !== 'questao' || !q) { erro(n, '"--- ADAPTADA" fora de uma questão.'); continue; }
      if (q.adaptadaQuestao) { erro(n, 'A questão já tem uma forma adaptada.'); continue; }
      q.adaptadaQuestao = novaQuestao(n, q.bloco);
      alvoQ = q.adaptadaQuestao; ultimo = null;
      continue;
    }

    // linhas próprias de questão
    if (secao === 'questao') {
      const tipoAtual = alvoQ.tipo;
      if (tipoAtual === 'vf' && (m = l.match(RE.vf))) {
        alvoQ.itensVF.push({ texto: m[2].trim(), resposta: m[1] });
        ultimo = { obj: alvoQ.itensVF[alvoQ.itensVF.length - 1], prop: 'texto' };
        continue;
      }
      if (ultimo && ultimo.prop === 'criterios' && (m = l.match(RE.criterio))) {
        alvoQ.criterios.push({ valor: numero(m[1]), texto: m[2].trim() });
        continue;
      }
      if (tipoAtual === 'associe' && (m = l.match(RE.colunaB))) {
        alvoQ.colunaB.push({ texto: m[2].trim(), resposta: m[1].toLowerCase() || null, linha: n });
        ultimo = { obj: alvoQ.colunaB[alvoQ.colunaB.length - 1], prop: 'texto' };
        continue;
      }
      if ((m = l.match(RE.alternativa)) && tipoAtual !== 'vf') {
        const letra = m[2].toLowerCase();
        if (tipoAtual === 'associe') {
          if (m[1]) aviso(n, 'Em "associe" o asterisco não tem efeito.');
          alvoQ.colunaA.push({ letra, texto: m[3].trim() });
          ultimo = { obj: alvoQ.colunaA[alvoQ.colunaA.length - 1], prop: 'texto' };
        } else {
          alvoQ.alternativas.push({ letra, texto: m[3].trim(), certa: !!m[1], linha: n });
          ultimo = { obj: alvoQ.alternativas[alvoQ.alternativas.length - 1], prop: 'texto' };
        }
        continue;
      }
    }

    // chave: valor
    if ((m = l.match(RE.campo))) {
      const chave = normChave(m[1]);
      const valor = m[2].trim();
      const permitidas = secao === 'prova' ? CHAVES_PROVA : secao === 'bloco' ? CHAVES_BLOCO
        : secao === 'questao' ? CHAVES_QUESTAO : null;
      if (permitidas && permitidas.has(chave)) {
        if (secao === 'prova') {
          res.prova[chave] = valor;
          ultimo = CAMPOS_TEXTO.has(chave) ? { obj: res.prova, prop: chave, paragrafo: true } : null;
        } else if (secao === 'bloco') {
          if (chave === 'imagem') { blocoAtual.imagens.push(lerImagem(valor)); ultimo = null; }
          else { blocoAtual.texto = valor; ultimo = { obj: blocoAtual, prop: 'texto', paragrafo: true }; }
        } else {
          ultimo = aplicarCampoQuestao(alvoQ, chave, valor, n, erro, aviso);
        }
        continue;
      }
    }

    // continuação de texto
    if (ultimo && Array.isArray(ultimo.obj[ultimo.prop])) {
      const lista = ultimo.obj[ultimo.prop];
      if (lista.length) { lista[lista.length - 1].texto += ' ' + l; continue; }
      aviso(n, `Critério fora do formato "- valor: texto": "${l.slice(0, 60)}"`);
      continue;
    }
    if (ultimo) {
      const atual = ultimo.obj[ultimo.prop] || '';
      const sep = !atual || atual.endsWith('\n') ? '' : '\n';
      ultimo.obj[ultimo.prop] = atual + sep + l;
      continue;
    }
    aviso(n, `Linha não reconhecida e ignorada: "${l.slice(0, 60)}"`);
  }
  fecharQuestao();

  if (!viuProva) erro(1, 'Falta a seção "# PROVA" com os dados da prova.');
  finalizarProva(res, erro, aviso);
  res.erros.sort((a, b) => a.linha - b.linha);
  res.avisos.sort((a, b) => a.linha - b.linha);
  return res;
}

function aplicarCampoQuestao(q, chave, valor, n, erro, aviso) {
  switch (chave) {
    case 'tipo': {
      const t = TIPOS[normValor(valor)];
      if (!t) erro(n, `Tipo desconhecido: "${valor}". Use multipla, vf, associe, complete ou discursiva.`);
      q.tipo = t || null;
      return null;
    }
    case 'valor': q.valor = numero(valor); if (q.valor == null) erro(n, `Valor inválido: "${valor}".`); return null;
    case 'linhas': q.linhas = numero(valor); return null;
    case 'dificuldade': q.dificuldade = normValor(valor); return null;
    case 'fonte': q.fonte = valor; return null;
    case 'bncc': q.bncc = valor.toUpperCase(); return null;
    case 'pontuacao': q.pontuacao = normValor(valor); return null;
    case 'revisar': q.revisar = /^s/i.test(valor); return null;
    case 'fixar': q.fixar = valor.toLowerCase().replace(/[^a-e]/g, '') || null; return null;
    case 'imagem': q.imagens.push(lerImagem(valor)); return null;
    case 'adaptada': q.adaptadaRegra = valor; return null;
    case 'criterios':
      if (valor) aviso(n, 'Escreva cada critério numa linha própria, começando com "- valor: texto".');
      return { obj: q, prop: 'criterios' };
    default:
      q[chave] = valor;
      return CAMPOS_TEXTO.has(chave) ? { obj: q, prop: chave, paragrafo: true } : null;
  }
}

function nAlternativasDaProva(prova) {
  const a = normValor(prova.alternativas || '').replace(/\s/g, '');
  if (a === 'a-d' || a === 'abcd') return 4;
  if (a === 'a-e' || a === 'abcde') return 5;
  return null;
}

function validarQuestao(q, rotulo, nAlt, erro, aviso, ehAdaptada) {
  q.enunciado = limpaTexto(q.enunciado);
  q.resposta = limpaTexto(q.resposta);
  if (!q.tipo) { erro(q.linha, `${rotulo}: falta "tipo".`); return; }
  if (!q.enunciado) erro(q.linha, `${rotulo}: falta "enunciado".`);

  if (q.tipo === 'multipla') {
    const alts = q.alternativas;
    const certas = alts.filter(a => a.certa);
    if (alts.length < 2) erro(q.linha, `${rotulo}: múltipla escolha precisa de pelo menos 2 alternativas.`);
    if (certas.length !== 1) erro(q.linha, `${rotulo}: marque exatamente uma alternativa certa com * (encontrei ${certas.length}).`);
    const letras = alts.map(a => a.letra);
    const esperadas = 'abcde'.slice(0, alts.length).split('');
    if (letras.join('') !== esperadas.join('')) aviso(q.linha, `${rotulo}: as letras deveriam ser ${esperadas.join(', ')} em ordem.`);
    if (!ehAdaptada && nAlt && alts.length && alts.length !== nAlt) aviso(q.linha, `${rotulo}: tem ${alts.length} alternativas, e a prova usa ${nAlt}.`);
    if (q.fixar && !letras.includes(q.fixar)) erro(q.linha, `${rotulo}: "fixar: ${q.fixar}" não existe nas alternativas.`);
    if (/(todas|nenhuma) as (alternativas )?(anteriores|acima)/i.test(alts.map(a => a.texto).join(' ')) && !q.fixar)
      aviso(q.linha, `${rotulo}: há "todas/nenhuma das anteriores"; use "fixar" para ela não mudar de lugar.`);
  }
  if (q.tipo === 'vf') {
    if (q.itensVF.length < 2) erro(q.linha, `${rotulo}: V ou F precisa de pelo menos 2 afirmativas (linhas "V)" ou "F)").`);
  }
  if (q.tipo === 'associe') {
    const letrasA = new Set(q.colunaA.map(a => a.letra));
    if (q.colunaA.length < 2) erro(q.linha, `${rotulo}: associe precisa de pelo menos 2 itens na coluna da esquerda.`);
    if (q.colunaB.length < 2) erro(q.linha, `${rotulo}: associe precisa de pelo menos 2 itens na coluna da direita, como "(a) texto".`);
    q.colunaB.forEach((b, k) => {
      if (!b.resposta) erro(b.linha, `${rotulo}: o item ${k + 1} da coluna da direita está sem a letra certa.`);
      else if (!letrasA.has(b.resposta)) erro(b.linha, `${rotulo}: a letra "${b.resposta}" não existe na coluna da esquerda.`);
    });
  }
  if (q.tipo === 'complete') {
    q.lacunas = [...q.enunciado.matchAll(RE.lacuna)].map(m => m[1].split('/').map(s => s.trim()).filter(Boolean));
    if (!q.lacunas.length) erro(q.linha, `${rotulo}: complete precisa de lacunas marcadas com [[resposta]].`);
  }
  if (q.tipo === 'discursiva') {
    if (!q.resposta) aviso(q.linha, `${rotulo}: discursiva sem "resposta" esperada.`);
    if (q.linhas == null) q.linhas = 4;
    if (q.criterios.length && q.valor != null) {
      const max = Math.max(...q.criterios.map(c => c.valor || 0));
      if (Math.abs(max - q.valor) > 0.001) aviso(q.linha, `${rotulo}: o critério mais alto (${max}) é diferente do valor da questão (${q.valor}).`);
    }
  }
  if (['vf', 'associe', 'complete'].includes(q.tipo) && q.pontuacao && !['parcial', 'inteira'].includes(q.pontuacao))
    aviso(q.linha, `${rotulo}: pontuação deve ser "parcial" ou "inteira".`);
}

function interpretarRegraAdaptada(q, rotulo, erro, aviso) {
  const r = normValor(q.adaptadaRegra || '');
  if (!r) return { modo: q.adaptadaQuestao ? 'propria' : (q.tipo === 'multipla' ? 'automatica' : 'igual') };
  if (r === 'excluir') return { modo: 'excluir' };
  if (r === 'igual') return { modo: 'igual' };
  const m = r.match(/^manter\s+([a-e](?:\s*,\s*[a-e])*)$/);
  if (m) {
    if (q.tipo !== 'multipla') { erro(q.linha, `${rotulo}: "adaptada: manter" só vale para múltipla escolha.`); return { modo: 'igual' }; }
    const manter = m[1].split(',').map(s => s.trim());
    const certa = q.alternativas.find(a => a.certa);
    if (new Set(manter).size !== manter.length) erro(q.linha, `${rotulo}: "adaptada: ${q.adaptadaRegra}" repete uma letra.`);
    manter.forEach(x => {
      if (!q.alternativas.some(a => a.letra === x)) erro(q.linha, `${rotulo}: "adaptada: manter ${x}" — a alternativa ${x} não existe.`);
      if (certa && certa.letra === x) erro(q.linha, `${rotulo}: "adaptada: manter ${x}" — a certa já fica sempre; indique só as erradas que ficam.`);
    });
    const erradas = q.alternativas.filter(a => !a.certa).length;
    if (erradas && manter.length >= erradas) aviso(q.linha, `${rotulo}: "adaptada: ${q.adaptadaRegra}" mantém todas as erradas; a adaptada fica igual à original.`);
    return { modo: 'manter', manter };
  }
  erro(q.linha, `${rotulo}: regra de adaptada desconhecida: "${q.adaptadaRegra}". Use "manter a" (2 alternativas), "manter a, e" (3 alternativas), "excluir" ou "igual".`);
  return { modo: 'igual' };
}

export function gabaritoDe(q) {
  switch (q.tipo) {
    case 'multipla': { const c = q.alternativas.find(a => a.certa); return c ? c.letra : '?'; }
    case 'vf': return q.itensVF.map(v => v.resposta).join(' ');
    case 'associe': return q.colunaB.map(b => b.resposta || '?').join(' ');
    case 'complete': return q.lacunas.map(l => l[0]).join(' | ');
    case 'discursiva': return 'discursiva';
    default: return '?';
  }
}

function finalizarProva(res, erro, aviso) {
  const p = res.prova;
  for (const c of ['texto', 'instrucoes', 'mensagem_final']) if (p[c]) p[c] = limpaTexto(p[c]);
  res.blocos.forEach(b => { b.texto = limpaTexto(b.texto); });
  if (Object.keys(p).length)
    for (const c of ['titulo', 'disciplina', 'serie', 'alternativas', 'valor_total'])
      if (!p[c]) aviso(1, `Dados da prova: falta "${c}".`);
  p.valor_total = numero(p.valor_total);
  p.pontuacao = normValor(p.pontuacao || 'parcial');
  const nAlt = nAlternativasDaProva(p);
  if (p.alternativas && !nAlt) aviso(1, `"alternativas: ${p.alternativas}" não reconhecido; use A-D ou A-E.`);
  p.nAlternativas = nAlt;

  if (!res.questoes.length) erro(1, 'Nenhuma questão encontrada (cada questão começa com "### QUESTÃO").');

  res.questoes.forEach((q, k) => {
    q.n = k + 1;
    const rotulo = `Questão ${q.n}`;
    validarQuestao(q, rotulo, nAlt, erro, aviso, false);
    q.adaptada = interpretarRegraAdaptada(q, rotulo, erro, aviso);
    if (q.adaptadaQuestao) {
      const a = q.adaptadaQuestao;
      if (a.valor == null) a.valor = q.valor;
      validarQuestao(a, `${rotulo} (adaptada)`, nAlt, erro, aviso, true);
      q.adaptada.modo = 'propria';
    }
    q.gabarito = gabaritoDe(q);
    if (q.adaptadaQuestao) q.adaptadaQuestao.gabarito = gabaritoDe(q.adaptadaQuestao);
  });

  // adaptada: todas as múltiplas com "manter" devem deixar o mesmo número de alternativas
  const tamanhos = new Set(res.questoes.filter(q => q.adaptada.modo === 'manter').map(q => q.adaptada.manter.length + 1));
  if (tamanhos.size > 1)
    aviso(1, `Na adaptada, as múltiplas escolhas ficam com quantidades diferentes de alternativas (${[...tamanhos].sort().join(' e ')}). Confira se é isso mesmo.`);
  res.adaptadaAlternativas = tamanhos.size === 1 ? [...tamanhos][0] : null;

  // valores: completa os que faltam dividindo o que sobra do valor total
  const semValor = res.questoes.filter(q => q.valor == null);
  const somaDefinida = res.questoes.reduce((s, q) => s + (q.valor || 0), 0);
  if (semValor.length) {
    const sobra = p.valor_total != null ? p.valor_total - somaDefinida : semValor.length;
    const cada = Math.round((sobra / semValor.length) * 100) / 100;
    semValor.forEach(q => { q.valor = cada; q.valorCalculado = true; });
    if (p.valor_total != null && sobra <= 0) aviso(1, 'As questões com valor já somam o valor total; as demais ficaram com zero ou negativo.');
  }
  const soma = Math.round(res.questoes.reduce((s, q) => s + (q.valor || 0), 0) * 100) / 100;
  if (p.valor_total != null && Math.abs(soma - p.valor_total) > 0.011)
    aviso(1, `A soma dos valores das questões (${soma}) é diferente do valor total (${p.valor_total}).`);

  const porTipo = {};
  res.questoes.forEach(q => { const t = q.tipo || 'sem tipo'; porTipo[t] = (porTipo[t] || 0) + 1; });
  const imagens = new Set();
  res.blocos.forEach(b => b.imagens.forEach(im => imagens.add(im.arquivo)));
  res.questoes.forEach(q => [q, q.adaptadaQuestao].filter(Boolean).forEach(x => x.imagens.forEach(im => imagens.add(im.arquivo))));
  if (p.imagem_final) imagens.add(p.imagem_final.split('|')[0].trim());
  res.resumo = {
    questoes: res.questoes.length,
    blocos: res.blocos.length,
    porTipo,
    somaValores: soma,
    imagens: [...imagens],
    naAdaptada: res.questoes.filter(q => q.adaptada.modo !== 'excluir').length,
    paraRevisar: res.questoes.filter(q => q.revisar).map(q => q.n),
  };
}

export default lerFormatoKaue;
