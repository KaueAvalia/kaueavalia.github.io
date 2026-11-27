// Kauê — diagramador: encaixa cada versão em folhas A4.
// Cada questão, texto-base, grade e recado é um bloco medido de verdade; questão não se parte entre colunas
// (só se não couber nem numa coluna vazia). Se reduzir a folha inteira (letra, linhas, imagens e cabeçalho, como
// a escala da impressão), até 85%, evita uma página a mais, o diagramador reduz; as versões comuns saem iguais.

const MM = 96 / 25.4;                                   // px por milímetro na tela
export const FOLHA = { altura: 297, topo: 10, lados: 11, base: 15, vao: 7 };
const ALTURA_UTIL = FOLHA.altura - FOLHA.topo - FOLHA.base;   // 272 mm
const LARGURA_UTIL = 210 - 2 * FOLHA.lados;                   // 188 mm
export const larguraColuna = n => (n <= 1 ? LARGURA_UTIL : (LARGURA_UTIL - FOLHA.vao * (n - 1)) / n);

const SO_TEXTO = '.texto-base, .alts, .vf';             // partes que podem continuar na coluna seguinte

async function esperarCarregar(el) {
  await Promise.all([...el.querySelectorAll('img')].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
}

// mede sem zoom, numa folha "virtual" maior (largura / fator): o zoom da folha final reduz tudo por igual
function criarMedidor(caixa, v, tam) {
  const m = document.createElement('div');
  m.className = `folha medidor ${v.adaptada ? 'adaptada' : ''} ${v.classe || ''}`;
  m.style.setProperty('--tam', `${tam}pt`);
  m.innerHTML = `<div class="pag-topo">${v.topo}</div>
    <div class="med-col">${v.pecas.map(p => `<div class="peca">${p.html}</div>`).join('')}</div>`;
  caixa.appendChild(m);
  return m;
}

// corta um bloco no ponto em que ele deixa de caber em `limite` px; devolve [parte que fica, parte que segue] ou null
function dividir(raiz, limite) {
  const topo = raiz.getBoundingClientRect().top;
  const filhos = [...raiz.children];
  let corte = -1;
  for (let i = 0; i < filhos.length; i++) {
    if (filhos[i].getBoundingClientRect().bottom - topo <= limite + 0.5) corte = i; else break;
  }
  const montar = (de, ate, extra, antes) => {
    const c = raiz.cloneNode(false);
    if (antes) c.appendChild(antes);
    filhos.slice(de, ate).forEach(f => c.appendChild(f.cloneNode(true)));
    if (extra) c.appendChild(extra);
    return c;
  };
  const seguinte = filhos[corte + 1];
  if (seguinte && seguinte.matches(SO_TEXTO) && seguinte.children.length > 1) {
    const sub = dividir(seguinte, limite - (seguinte.getBoundingClientRect().top - topo));
    if (sub) {
      const a = montar(0, corte + 1, sub[0]);
      const b = montar(corte + 2, filhos.length, null, sub[1]);
      b.classList.add('continua');
      return [a, b];
    }
  }
  if (corte < 0 || corte >= filhos.length - 1) return null;
  if (corte === 0 && filhos[0].tagName === 'H2') return null;   // título de bloco não fica sozinho no fim da coluna
  const a = montar(0, corte + 1), b = montar(corte + 1, filhos.length);
  b.classList.add('continua');
  return [a, b];
}

// distribui as peças de uma versão nas colunas e páginas, com a folha reduzida pelo fator f
function paginar(v, medidor, f) {
  const coluna = medidor.querySelector('.med-col');
  coluna.querySelectorAll('.temp').forEach(e => e.remove());
  medidor.querySelector('.pag-topo').style.width = `${LARGURA_UTIL / f}mm`;
  coluna.style.width = `${larguraColuna(v.colunas) / f}mm`;
  const alturaTopo = medidor.querySelector('.pag-topo').getBoundingClientRect().height;
  const cheia = ((ALTURA_UTIL - 1.5) / f) * MM;   // 1,5 mm de folga para arredondamentos
  const altura = el => el.getBoundingClientRect().height;
  const paginas = [];
  let pag, c, livre;
  const alturaColuna = () => (paginas.length === 1 ? cheia - alturaTopo : cheia);
  const novaPagina = () => { pag = { colunas: Array.from({ length: v.colunas }, () => []) }; paginas.push(pag); c = 0; livre = alturaColuna(); };
  const proximaColuna = () => { if (c < v.colunas - 1) { c++; livre = alturaColuna(); } else novaPagina(); };
  novaPagina();
  const fila = [...coluna.children].map((el, i) => ({ el, html: v.pecas[i].html, tipo: v.pecas[i].tipo }));
  let guarda = 0;
  while (fila.length && guarda++ < 2000) {
    const item = fila.shift();
    const h = altura(item.el);
    if (h <= livre + 0.5) { pag.colunas[c].push(item.html); livre -= h; continue; }
    const vazia = pag.colunas[c].length === 0;
    // texto-base pode começar aqui e continuar; questão só se divide quando não cabe nem numa coluna vazia
    const tentar = item.tipo === 'bloco' ? livre >= (30 / f) * MM : vazia;
    if (tentar) {
      const partes = dividir(item.el.firstElementChild, livre);
      if (partes) {
        pag.colunas[c].push(partes[0].outerHTML);
        const resto = document.createElement('div');
        resto.className = 'peca temp';
        resto.appendChild(partes[1]);
        coluna.appendChild(resto);
        fila.unshift({ el: resto, html: partes[1].outerHTML, tipo: item.tipo });
        proximaColuna();
        continue;
      }
    }
    if (vazia) { pag.colunas[c].push(item.html); proximaColuna(); continue; }   // não há como encaixar melhor
    fila.unshift(item);
    proximaColuna();
  }
  // tira páginas que ficaram sem nada no fim
  while (paginas.length > 1 && paginas[paginas.length - 1].colunas.every(col => !col.length)) paginas.pop();
  coluna.querySelectorAll('.temp').forEach(e => e.remove());
  return paginas;
}

export const FATOR_MINIMO = 0.85;
export const FATOR_MINIMO_ADAPTADA = 0.8;
const fatores = minimo => { const l = []; for (let f = 1; f >= minimo - 1e-9; f -= 0.025) l.push(Math.round(f * 1000) / 1000); return l; };

// escolhe a maior escala (de 100% até o mínimo) que não precisa de mais páginas do que a menor escala precisaria;
// com `teto`, mira nesse número de páginas (a adaptada: duas folhas)
async function encaixar(caixa, versoes, tam, minimo, teto = null) {
  const medidores = versoes.map(v => criarMedidor(caixa, v, tam));
  await Promise.all(medidores.map(esperarCarregar));
  const pagsEm = f => versoes.map((v, i) => paginar(v, medidores[i], f));
  const maxPags = res => Math.max(...res.map(p => p.length));
  const lista = fatores(minimo);
  const noMinimo = pagsEm(lista[lista.length - 1]);
  const alvo = teto ? Math.max(teto, maxPags(noMinimo)) : maxPags(noMinimo);
  let escolhido = { fator: lista[lista.length - 1], paginas: noMinimo };
  for (const f of lista.slice(0, -1)) {
    const res = pagsEm(f);
    if (maxPags(res) <= alvo) { escolhido = { fator: f, paginas: res }; break; }
  }
  medidores.forEach(m => m.remove());
  return escolhido;
}

function folhasHTML(v, paginas, tam, f) {
  const total = paginas.length;
  return paginas.map((p, i) => `<section class="folha pagina ${v.adaptada ? 'adaptada' : ''} ${v.classe || ''}" style="--tam:${tam}pt;--f:${f}">
    <div class="pag-miolo">
    ${i === 0 ? `<div class="pag-topo">${v.topo}</div>` : ''}
    <div class="pag-colunas" style="grid-template-columns:repeat(${v.colunas}, ${larguraColuna(v.colunas) / f}mm)">${p.colunas.map(col => `<div class="pag-col">${col.map(h => `<div class="peca">${h}</div>`).join('')}</div>`).join('')}</div>
    </div>
    <footer class="pag-rodape"><span>${v.rodape}</span><span>${[v.codigo ? `Código ${v.codigo}` : '', total > 1 ? `página ${i + 1} de ${total}` : ''].filter(Boolean).join(' · ')}</span></footer>
  </section>`).join('');
}

// monta as folhas de todas as versões dentro de `caixa`; devolve o resumo do encaixe
// a aula usa outras medidas: { tamanhoAdaptada, minimo, minimoAdaptada, tetoAdaptada }
export async function diagramar(caixa, versoes, { tamanho = 10, tamanhoAdaptada = 14, minimo = FATOR_MINIMO, minimoAdaptada = FATOR_MINIMO_ADAPTADA, tetoAdaptada = 2 } = {}) {
  const comuns = versoes.filter(v => !v.adaptada), adaptadas = versoes.filter(v => v.adaptada);
  const resumo = [];
  const resultado = new Map();
  // a adaptada (letra 14 pt) mira em duas folhas e pode ser reduzida até 80% (11,2 pt, ainda maior que a das comuns)
  for (const [grupo, tam, adaptada, min, teto] of [[comuns, tamanho, false, minimo, null], [adaptadas, tamanhoAdaptada, true, minimoAdaptada, tetoAdaptada]]) {
    if (!grupo.length) continue;
    const r = await encaixar(caixa, grupo, tam, min, teto);
    grupo.forEach((v, i) => resultado.set(v, { paginas: r.paginas[i], tam, f: r.fator }));
    resumo.push({ adaptada, fator: r.fator, tamanho: tam, paginas: r.paginas.map(p => p.length), excede: teto ? Math.max(...r.paginas.map(p => p.length)) > teto : false });
  }
  caixa.innerHTML = versoes.map(v => { const x = resultado.get(v); return folhasHTML(v, x.paginas, x.tam, x.f); }).join('');
  await esperarCarregar(caixa);
  return resumo;
}

// "Cada versão: 1 página, reduzida para 90% para caber · Adaptada: 2 páginas, tamanho normal"
export function textoDoEncaixe(resumo) {
  return resumo.map(r => {
    const pags = [...new Set(r.paginas)];
    const quantas = pags.length === 1 ? `${pags[0]} ${pags[0] === 1 ? 'página' : 'páginas'}` : `${Math.min(...pags)} a ${Math.max(...pags)} páginas`;
    const escala = r.fator < 1 ? `reduzida para ${Math.round(r.fator * 100)}% para caber` : 'tamanho normal';
    return `${r.adaptada ? 'Adaptada' : r.paginas.length > 1 ? 'Cada versão' : 'Versão'}: ${quantas}, ${escala}`;
  }).join(' · ');
}

// aviso quando a adaptada não coube em duas folhas nem reduzida
export function avisoDoEncaixe(resumo) {
  const a = resumo.find(r => r.adaptada && r.excede);
  if (!a) return '';
  return `A adaptada ficou com ${Math.max(...a.paginas)} folhas mesmo reduzida a ${Math.round(FATOR_MINIMO_ADAPTADA * 100)}%. Para caber em duas, encurte a adaptada: `
    + 'peça ao Assistente uma adaptada mais curta, resuma o texto-base com "texto_adaptada:" no bloco, '
    + 'troque questões longas por uma forma curta ("--- ADAPTADA") ou tire alguma da adaptada ("adaptada: excluir").';
}
