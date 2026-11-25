// Kauê — gera a prova e o gabarito em Word (.docx) no próprio aparelho, com a biblioteca docx.
import { NOMES_TIPO, num, pontosQuestao } from './util.js';
import { FONTES_PROVA, chaveImagem } from './render-prova.js';

let carregando = null;
export function carregarDocx() {
  if (window.docx) return Promise.resolve(window.docx);
  if (!carregando) carregando = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/docx/docx.min.js', import.meta.url).href;
    s.onload = () => ok(window.docx);
    s.onerror = () => falha(new Error('Não consegui carregar o gerador de Word.'));
    document.head.appendChild(s);
  });
  return carregando;
}

// A4 em DXA (1/20 de ponto) e margens parecidas com as do PDF
const PAGINA = { largura: 11906, altura: 16838, topo: 567, lados: 624, base: 737 };
const LARGURA_UTIL = PAGINA.largura - 2 * PAGINA.lados;
const PX_POR_DXA = 96 / 1440;

// ---------- fórmulas viram texto simples no Word ----------
const SOBRE = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ' };
const SOB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' };
const conv = (s, mapa) => [...s].map(c => mapa[c] || c).join('');
export function texPlano(tex) {
  let s = tex;
  s = s.replace(/\\ce\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, f) => f.replace(/([A-Za-z\)])(\d+)/g, (m, a, d) => a + conv(d, SOB))
    .replace(/\^\{?([0-9+-]+)\}?/g, (_, d) => conv(d, SOBRE)).replace(/->/g, '→').replace(/<=>/g, '⇌'));
  for (let i = 0; i < 3; i++) s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)').replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
  s = s.replace(/\^\{([^{}]*)\}/g, (_, d) => (/^[0-9+\-n]+$/.test(d) ? conv(d, SOBRE) : '^(' + d + ')'))
    .replace(/\^([0-9n])/g, (_, d) => conv(d, SOBRE))
    .replace(/_\{([^{}]*)\}/g, (_, d) => (/^[0-9+\-]+$/.test(d) ? conv(d, SOB) : '_(' + d + ')'))
    .replace(/_([0-9])/g, (_, d) => conv(d, SOB));
  const simbolos = { cdot: '·', times: '×', div: '÷', pm: '±', leq: '≤', geq: '≥', neq: '≠', approx: '≈', pi: 'π', alpha: 'α',
    beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', theta: 'θ', lambda: 'λ', mu: 'μ', sigma: 'σ', omega: 'ω', infty: '∞', degree: '°',
    circ: '°', rightarrow: '→', to: '→', left: '', right: '', quad: ' ', ',': ' ', ';': ' ' };
  s = s.replace(/\\([A-Za-z]+|[,;])/g, (m, n) => (n in simbolos ? simbolos[n] : n));
  return s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

// texto com lacunas e fórmulas → lista de parágrafos, cada um com trechos { t, quebra }
function trechos(texto, { lacunas = false } = {}) {
  let s = String(texto || '');
  if (lacunas) s = s.replace(/\[\[(.+?)\]\]/g, (_, r) => '_'.repeat(Math.max(8, Math.min(18, r.split('/')[0].length + 4))));
  s = s.replace(/\$\$([^$]+)\$\$/g, (_, f) => texPlano(f)).replace(/\$([^$\n]+)\$/g, (_, f) => texPlano(f))
    .replace(/\\ce\{((?:[^{}]|\{[^{}]*\})*)\}/g, m => texPlano(m));
  return s.split(/\n{2,}/).map(p => p.split('\n'));
}

export async function provaDocx({ prova, montada, escola, arquivos, opcoes, info }) {
  const d = await carregarDocx();
  const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
    AlignmentType, Footer, PageNumber, TabStopType, SectionType, ShadingType } = d;
  const fonte = (FONTES_PROVA[opcoes.fonte] || FONTES_PROVA.atkinson).word;
  const adaptada = montada.adaptada;
  const tam = adaptada ? 28 : Math.round((opcoes.tamanho || 10) * 2); // meio-pontos
  const colunas = adaptada ? 1 : (opcoes.colunas || 2);
  const larguraColuna = colunas === 2 ? (LARGURA_UTIL - 400) / 2 : LARGURA_UTIL;
  const espaco = adaptada ? { after: 120, line: 360 } : { after: 60, line: 264 };

  const run = (t, extra = {}) => new TextRun({ text: t, font: fonte, size: tam, ...extra });
  const pars = (texto, { lacunas = false, prefixo = [], alinhamento = AlignmentType.JUSTIFIED, extra = {} } = {}) =>
    trechos(texto, { lacunas }).map((linhas, k) => new Paragraph({
      alignment: alinhamento, spacing: espaco, ...extra,
      children: [...(k === 0 ? prefixo : []), ...linhas.flatMap((l, i) => (i ? [run(l, { break: 1 })] : [run(l)]))],
    }));

  const tipoImagem = t => (/png/.test(t) ? 'png' : /gif/.test(t) ? 'gif' : /bmp/.test(t) ? 'bmp' : 'jpg');
  async function imagem(img, maxLarguraDxa, maxAlturaPx = 260) {
    const a = arquivos.get(chaveImagem(img));
    if (!a) {
      return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 },
        border: { top: { style: BorderStyle.DASHED, size: 6, color: '888888', space: 4 }, bottom: { style: BorderStyle.DASHED, size: 6, color: '888888', space: 4 } },
        children: [run(`[Imagem: ${img.legenda || img.arquivo}]`, { italics: true, size: tam - 3, color: '555555' })] })];
    }
    const maxL = maxLarguraDxa * PX_POR_DXA;
    let l = a.largura, h = a.altura;
    const esc1 = Math.min(1, maxL / l, maxAlturaPx / h);
    l = Math.round(l * esc1); h = Math.round(h * esc1);
    const dados = await a.blob.arrayBuffer();
    const out = [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 30 },
      children: [new ImageRun({ type: tipoImagem(a.tipo), data: dados, transformation: { width: l, height: h } })] })];
    const leg = (img.legenda || '').replace(/\s*\((recortar|recorte)[^)]*\)\s*$/i, '');
    if (leg) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [run(leg, { size: tam - 4 })] }));
    return out;
  }

  // ----- cabeçalho -----
  const cab = [];
  const modo = (escola && escola.modo) || 'campos';
  const titulo = `${prova.titulo || 'Prova'} · ${adaptada ? 'Versão adaptada' : 'Versão ' + montada.letra}`;
  if (modo === 'imagem' && arquivos.get('escola:cabecalho')) {
    cab.push(...await imagem({ arquivo: 'escola:cabecalho', legenda: '' }, LARGURA_UTIL, 200));
  } else if (modo === 'branco') {
    const alt = Math.round(((escola && escola.alturaBranco) || 35) * 56.7);
    cab.push(new Paragraph({ spacing: { before: alt, after: 0 }, children: [run('')] }));
  } else {
    if (arquivos.get('escola:logo')) cab.push(...await imagem({ arquivo: 'escola:logo', legenda: '' }, 2400, 70));
    const nomeEscola = (escola && escola.nome) || prova.escola;
    if (nomeEscola) cab.push(new Paragraph({ children: [run(nomeEscola.toUpperCase(), { bold: true, size: 20 })] }));
  }
  cab.push(new Paragraph({ alignment: modo === 'campos' ? AlignmentType.LEFT : AlignmentType.CENTER, spacing: { before: 80, after: 80 },
    children: [run(titulo, { bold: true, size: 28 })] }));

  const c = (escola && escola.campos) || {};
  const ver = k => c[k] !== false;
  const borda = { style: BorderStyle.SINGLE, size: 6, color: '333333' };
  const celula = (rot, val, largura) => new TableCell({ width: { size: largura, type: WidthType.DXA },
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [new Paragraph({ children: [run(`${rot.toUpperCase()}: `, { bold: true, size: 16 }), run(val || '', { size: 18 })] })] });
  const linhaCampos = itens => {
    if (!itens.length) return null;
    const pesos = itens.map(i => i[2]);
    const soma = pesos.reduce((a, b) => a + b, 0);
    const larguras = pesos.map(p => Math.floor(LARGURA_UTIL * p / soma));
    larguras[larguras.length - 1] += LARGURA_UTIL - larguras.reduce((a, b) => a + b, 0);
    return new Table({ width: { size: LARGURA_UTIL, type: WidthType.DXA }, columnWidths: larguras,
      borders: { top: borda, bottom: borda, left: borda, right: borda, insideVertical: borda, insideHorizontal: borda },
      rows: [new TableRow({ children: itens.map((i, k) => celula(i[0], i[1], larguras[k])) })] });
  };
  const mostrarCampos = modo === 'campos' || (modo === 'imagem' && escola.camposNaImagem !== false) || (modo === 'branco' && escola && escola.camposNoBranco);
  if (mostrarCampos) {
    const l1 = [], l2 = [];
    if (ver('professor')) l1.push(['Professor(a)', prova.professor || info.professor || '', 4]);
    if (ver('serie')) l1.push(['Turma', prova.turma || prova.serie || '', 2]);
    if (ver('data')) l1.push(['Data', '____/____/______', 2.4]);
    if (ver('nota')) l1.push(['Nota', '', 1.4]);
    if (ver('nome')) l2.push(['Nome', '', 6]);
    if (ver('numero')) l2.push(['Nº', '', 1.2]);
    if (escola && escola.extra && escola.extra.rotulo) l2.push([escola.extra.rotulo, escola.extra.valor || '', 3]);
    [linhaCampos(l1), linhaCampos(l2)].filter(Boolean).forEach((t, k) => {
      if (k) cab.push(new Paragraph({ spacing: { after: 0 }, children: [run('', { size: 8 })] }));
      cab.push(t);
    });
  }
  const faixa = [`Código ${montada.codigo}`, prova.disciplina, `Valor: ${num(montada.total)} pontos`, prova.tempo ? `Tempo: ${prova.tempo}` : null].filter(Boolean).join('  ·  ');
  cab.push(new Paragraph({ spacing: { before: 120, after: 120 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: '333333', space: 2 }, bottom: { style: BorderStyle.SINGLE, size: 6, color: '333333', space: 2 } },
    children: [run(faixa, { size: 17 })] }));
  if (prova.instrucoes) cab.push(...pars(prova.instrucoes, { extra: { shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } } }));

  // ----- questões -----
  const corpo = [];
  const marca = '(    ) ';
  const recuo = { left: 360, hanging: 360 };
  for (const it of montada.itens) {
    if (it.tipo === 'bloco') {
      corpo.push(new Paragraph({ keepNext: true, spacing: { before: 120, after: 60 }, children: [run(it.bloco.titulo.toUpperCase(), { bold: true })] }));
      if (it.bloco.texto) corpo.push(...pars(it.bloco.texto));
      for (const img of it.bloco.imagens) corpo.push(...await imagem(img, larguraColuna));
      continue;
    }
    if (it.tipo === 'semBloco') continue;
    const q = it.q;
    const valor = opcoes.mostrarValor && q.valor != null ? [run(`(${pontosQuestao(q.valor)}) `, { size: tam - 3 })] : [];
    corpo.push(...pars(q.enunciado, { lacunas: q.tipo === 'complete', prefixo: [run(`${q.n}. `, { bold: true }), ...valor],
      extra: { keepNext: true, spacing: { before: adaptada ? 240 : 140, ...espaco } } }));
    for (const img of q.imagens) corpo.push(...await imagem(img, larguraColuna));
    const item = (prefixo, texto) => new Paragraph({ indent: recuo, spacing: espaco, keepLines: true,
      children: [run(prefixo), ...trechos(texto).flat().map((l, i) => run(i ? ' ' + l : l))] });
    if (q.tipo === 'multipla') q.alternativas.forEach(a => corpo.push(item(`${marca}${a.letra}) `, a.texto)));
    if (q.tipo === 'vf') q.itensVF.forEach(v => corpo.push(item(marca, v.texto)));
    if (q.tipo === 'associe') {
      q.colunaA.forEach(a => corpo.push(item(`${a.letra}) `, a.texto)));
      corpo.push(new Paragraph({ spacing: { after: 40 }, children: [run('')] }));
      q.colunaB.forEach(b => corpo.push(item(marca, b.texto)));
    }
    if (q.tipo === 'discursiva') {
      const n = Math.max(1, Math.min(20, q.linhas || 4));
      for (let i = 0; i < n; i++) corpo.push(new Paragraph({ spacing: { before: adaptada ? 300 : 220, after: 0 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '666666', space: 1 } }, children: [run('')] }));
    }
  }

  // ----- grade de respostas e mensagem final -----
  const fim = [];
  const mult = montada.questoes.filter(q => q.tipo === 'multipla');
  if (opcoes.grade !== false && mult.length) {
    const nLetras = Math.max(...mult.map(q => q.alternativas.length));
    const circ = l => String.fromCodePoint(0x24B6 + l.charCodeAt(0) - 97);
    const larguras = [700, ...Array(nLetras).fill(620)];
    const total = larguras.reduce((a, b) => a + b, 0);
    const semBorda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    fim.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 80 }, keepNext: true,
      children: [run('GABARITO', { bold: true, size: 26 }), run(`   Código ${montada.codigo}`, { size: 17 })] }));
    fim.push(new Table({ alignment: AlignmentType.CENTER, width: { size: total, type: WidthType.DXA }, columnWidths: larguras,
      borders: { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda, insideVertical: semBorda, insideHorizontal: semBorda },
      rows: mult.map((q, iq) => new TableRow({ cantSplit: true, children: larguras.map((l, k) => new TableCell({ width: { size: l, type: WidthType.DXA },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, keepNext: iq < mult.length - 1,
          children: [k === 0 ? run(String(q.n), { bold: true }) : (k <= q.alternativas.length ? run(circ('abcdefghij'[k - 1]), { font: 'Segoe UI Symbol', size: tam + 4 }) : run(''))] })] })) })) }));
    fim.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [run('Pinte só uma letra por questão.', { size: 15, color: '444444' })] }));
  }
  if (prova.mensagem_final) fim.push(...pars(prova.mensagem_final, { alinhamento: AlignmentType.CENTER, extra: { spacing: { before: 200 } } }));

  const rodape = new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: LARGURA_UTIL }],
    children: [new TextRun({ text: `${prova.titulo || 'Prova'} · ${adaptada ? 'Adaptada' : 'Versão ' + montada.letra}`, font: 'Arial', size: 15, color: '666666' }),
      new TextRun({ children: [`\tCódigo ${montada.codigo} · página `, PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], font: 'Arial', size: 15, color: '666666' })] })] });
  const pagina = { page: { size: { width: PAGINA.largura, height: PAGINA.altura },
    margin: { top: PAGINA.topo, bottom: PAGINA.base, left: PAGINA.lados, right: PAGINA.lados, footer: 300 } } };

  const secoes = [{ properties: { ...pagina }, footers: { default: rodape }, children: cab }];
  secoes.push({ properties: { ...pagina, type: SectionType.CONTINUOUS, column: { count: colunas, space: 400, separate: colunas > 1 } },
    footers: { default: rodape }, children: corpo.length ? corpo : [new Paragraph('')] });
  if (fim.length) secoes.push({ properties: { ...pagina, type: SectionType.CONTINUOUS, column: { count: 1 } }, footers: { default: rodape }, children: fim });

  const doc = new Document({ creator: 'Kauê', title: titulo,
    styles: { default: { document: { run: { font: fonte, size: tam } } } }, sections: secoes });
  return Packer.toBlob(doc);
}

export async function gabaritoDocx({ prova, montadas, gerado = '' }) {
  const d = await carregarDocx();
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak, Footer } = d;
  const run = (t, extra = {}) => new TextRun({ text: t, font: 'Arial', size: 19, ...extra });
  const borda = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
  const larg = [800, 2500, 5306, 1600]; // soma = largura útil (11906 − 2 × 850)
  const cel = (t, l, extra = {}, fundo) => new TableCell({ width: { size: l, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 80, right: 80 },
    ...(fundo ? { shading: { type: ShadingType.CLEAR, fill: fundo, color: 'auto' } } : {}),
    children: [new Paragraph({ children: [run(t, extra)] })] });
  const filhos = [
    new Paragraph({ children: [run('GABARITO DO PROFESSOR · não entregar aos alunos', { bold: true, color: 'FFFFFF', size: 17 })],
      shading: { type: ShadingType.CLEAR, fill: '111111', color: 'auto' } }),
    new Paragraph({ spacing: { before: 120 }, children: [run(prova.titulo || 'Prova', { bold: true, size: 30 })] }),
    new Paragraph({ children: [run([prova.disciplina, prova.turma || prova.serie, prova.periodo].filter(Boolean).join(' · '))] }),
  ];
  montadas.forEach((m, k) => {
    if (k) filhos.push(new Paragraph({ children: [new PageBreak()] }));
    filhos.push(new Paragraph({ spacing: { before: 240, after: 80 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '111111', space: 2 } },
      children: [run(m.adaptada ? 'Versão adaptada' : `Versão ${m.letra}`, { bold: true, size: 24 }), run(`    Código ${m.codigo}`)] }));
    const resumo = m.questoes.filter(q => q.tipo === 'multipla').map(q => `${q.n}-${q.gabarito}`).join('   ');
    if (resumo) filhos.push(new Paragraph({ spacing: { after: 80 }, children: [run(resumo, { bold: true, font: 'Consolas' })] }));
    if (m.adaptada && Math.abs(m.total - (prova.valor_total || m.total)) > 0.001)
      filhos.push(new Paragraph({ spacing: { after: 80 }, children: [run(`A versão adaptada soma ${num(m.total)} pontos. Na correção, a nota é convertida para ${num(prova.valor_total)} pontos.`, { size: 17 })] }));
    filhos.push(new Table({ width: { size: larg.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: larg,
      borders: { top: borda, bottom: borda, left: borda, right: borda, insideVertical: borda, insideHorizontal: borda },
      rows: [new TableRow({ tableHeader: true, children: ['Nº', 'Tipo', 'Resposta', 'Valor'].map((t, i) => cel(t, larg[i], { bold: true }, 'EEEEEE')) }),
        ...m.gabarito.map(g => new TableRow({ children: [cel(String(g.n), larg[0]), cel(NOMES_TIPO[g.tipo] || g.tipo, larg[1]),
          cel(g.tipo === 'discursiva' ? '—' : g.resposta, larg[2], { bold: true }), cel(num(g.valor), larg[3])] }))] }));
    m.gabarito.filter(g => g.tipo === 'discursiva').forEach(g => {
      filhos.push(new Paragraph({ spacing: { before: 120 }, children: [run(`Questão ${g.n}. `, { bold: true }), run(g.respostaEsperada || 'Sem resposta esperada.')] }));
      if ((g.aceitas || []).length) filhos.push(new Paragraph({ indent: { left: 360 }, children: [run('Também vale: ', { bold: true }), run(g.aceitas.map(a => a.texto).join(' · '))] }));
      (g.criterios || []).forEach(c => filhos.push(new Paragraph({ indent: { left: 360 }, children: [run(`${num(c.valor)}: `, { bold: true }), run(c.texto)] })));
    });
  });
  const doc = new Document({ creator: 'Kauê', title: `Gabarito – ${prova.titulo || 'Prova'}`,
    sections: [{ properties: { page: { size: { width: PAGINA.largura, height: PAGINA.altura },
      margin: { top: 850, bottom: 850, left: 850, right: 850 } } },
      footers: gerado ? { default: new Footer({ children: [new Paragraph({ children: [run(gerado, { size: 16, color: '555555' })] })] }) } : undefined, children: filhos }] });
  return Packer.toBlob(doc);
}
