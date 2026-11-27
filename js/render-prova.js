// Kauê — monta o HTML de impressão da prova e do gabarito (PDF pelo "Imprimir" do navegador)
import { esc, pontosQuestao, num, NOMES_TIPO } from './util.js';

export const FONTES_PROVA = {
  atkinson: { nome: 'Atkinson (leitura fácil)', css: "'Atkinson Hyperlegible Next', Arial, sans-serif", word: 'Arial' },
  arial: { nome: 'Arial', css: 'Arial, Helvetica, sans-serif', word: 'Arial' },
  times: { nome: 'Times New Roman', css: "'Times New Roman', Times, serif", word: 'Times New Roman' },
};

export const chaveImagem = img => (img.arquivo === '[inserir]' || !img.arquivo ? `[inserir]|${img.legenda}` : img.arquivo);

// ---------- texto: lacunas, fórmulas, parágrafos ----------
function formula(tex, display = false) {
  const k = typeof window !== 'undefined' && window.katex;
  if (!k) return `<span class="tex">${esc(tex)}</span>`;
  try { return k.renderToString(tex, { throwOnError: false, displayMode: display, output: 'html' }); }
  catch (e) { return `<span class="tex">${esc(tex)}</span>`; }
}

export function textoHTML(t, { lacunas = false } = {}) {
  if (!t) return '';
  const guardados = [];
  const guardar = html => `\u0000${guardados.push(html) - 1}\u0000`;
  let s = String(t);
  if (lacunas) s = s.replace(/\[\[(.+?)\]\]/g, (_, r) => guardar(`<span class="lacuna" style="--larg:${Math.max(6, Math.min(18, r.split('/')[0].length + 3))}ch"></span>`));
  s = s.replace(/\$\$([^$]+)\$\$/g, (_, f) => guardar(formula(f, true)));
  s = s.replace(/\$([^$\n]+)\$/g, (_, f) => guardar(formula(f)));
  s = s.replace(/\\ce\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, f) => guardar(formula(`\\ce{${f}}`)));
  s = esc(s);
  s = s.split(/\n{2,}/).map(p => p.replace(/\n/g, '<br>')).join('</p><p>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => guardados[Number(i)]);
  return `<p>${s}</p>`;
}

export function figura(img, urls, classe = '') {
  const url = urls.get(chaveImagem(img));
  const leg = img.legenda ? `<figcaption>${esc(img.legenda.replace(/\s*\((recortar|recorte)[^)]*\)\s*$/i, ''))}</figcaption>` : '';
  if (url) return `<figure class="fig ${classe}"><img src="${url}" alt="${esc(img.legenda || '')}">${leg}</figure>`;
  return `<figure class="fig falta ${classe}"><div class="sem-imagem">Imagem: ${esc(img.legenda || img.arquivo)}</div></figure>`;
}

// ---------- cabeçalho ----------
function camposHTML(escola, prova, info) {
  const c = (escola && escola.campos) || {};
  const ver = k => c[k] !== false;
  const caixa = (rot, val, cls = '') => `<div class="campo ${cls}"><span>${esc(rot)}:</span> ${val}</div>`;
  const linha1 = [], linha2 = [];
  if (ver('professor')) linha1.push(caixa('Professor(a)', esc(prova.professor || info.professor || ''), 'larga'));
  if (ver('serie')) linha1.push(caixa('Turma', esc(prova.turma || prova.serie || '')));
  if (ver('data')) linha1.push(caixa('Data', '____/____/______'));
  if (ver('nota')) linha1.push(caixa('Nota', ''));
  if (ver('nome')) linha2.push(caixa('Nome', '', 'larga'));
  if (ver('numero')) linha2.push(caixa('Nº', ''));
  if (escola && escola.extra && escola.extra.rotulo) linha2.push(caixa(escola.extra.rotulo, esc(escola.extra.valor || '')));
  if (!linha1.length && !linha2.length) return '';
  return `<div class="campos">${linha1.length ? `<div class="linha">${linha1.join('')}</div>` : ''}${linha2.length ? `<div class="linha">${linha2.join('')}</div>` : ''}</div>`;
}

function tituloHTML(prova, montada) {
  const t = prova.titulo || 'Prova';
  // a apostila da aula manda o próprio rótulo (vazio: só o título)
  const v = montada.rotulo !== undefined ? montada.rotulo : montada.adaptada ? 'Versão adaptada' : `Versão ${montada.letra}`;
  return v ? `${esc(t)} <span class="titulo-versao">· ${esc(v)}</span>` : esc(t);
}

export function cabecalhoHTML(escola, prova, montada, urls, info) {
  const modo = (escola && escola.modo) || 'campos';
  const titulo = tituloHTML(prova, montada);
  if (modo === 'branco') {
    const alt = (escola && escola.alturaBranco) || 35;
    return `<header class="cab cab-branco"><div class="espaco-branco" style="height:${alt}mm"></div>
      <h1 class="titulo">${titulo}</h1>${escola && escola.camposNoBranco ? camposHTML(escola, prova, info) : ''}</header>`;
  }
  if (modo === 'imagem' && urls.get('escola:cabecalho')) {
    const a = escola.areaTitulo;
    const sobre = a && a.ativa
      ? `<div class="titulo-sobre" style="left:${a.x}%;top:${a.y}%;width:${a.w}%;height:${a.h}%"><span>${titulo}</span></div>` : '';
    return `<header class="cab cab-imagem"><div class="cab-img"><img src="${urls.get('escola:cabecalho')}" alt="">${sobre}</div>
      ${sobre ? '' : `<h1 class="titulo">${titulo}</h1>`}${escola.camposNaImagem !== false ? camposHTML(escola, prova, info) : ''}</header>`;
  }
  const logo = urls.get('escola:logo');
  return `<header class="cab cab-campos"><div class="cab-topo">${logo ? `<img class="logo-escola" src="${logo}" alt="">` : ''}
    <div><div class="nome-escola">${esc((escola && escola.nome) || prova.escola || '')}</div><h1 class="titulo">${titulo}</h1></div></div>
    ${camposHTML(escola, prova, info)}</header>`;
}

function faixaHTML(prova, montada, info) {
  const partes = [`Código <b class="codigo">${montada.codigo}</b>`];
  if (prova.disciplina) partes.push(esc(prova.disciplina));
  partes.push(`Valor: ${num(info.total)} ${info.total === 1 ? 'ponto' : 'pontos'}`);
  if (prova.tempo) partes.push(`Tempo: ${esc(prova.tempo)}`);
  return `<div class="faixa">${partes.join(' <span class="sep">·</span> ')}</div>`;
}

// ---------- questões ----------
export function questaoHTML(q, urls, opcoes) {
  const valor = opcoes.mostrarValor && q.valor != null ? ` <span class="valor">(${pontosQuestao(q.valor)})</span>` : '';
  const figs = q.imagens.map(i => figura(i, urls)).join('');
  let corpo = '';
  if (q.tipo === 'multipla') {
    corpo = `<ol class="alts">${q.alternativas.map(a => `<li><span class="marca">(&nbsp;&nbsp;)</span> <span class="letra">${a.letra})</span> <span class="txt">${textoHTML(a.texto)}</span></li>`).join('')}</ol>`;
  } else if (q.tipo === 'vf') {
    corpo = `<ol class="vf">${q.itensVF.map(i => `<li><span class="marca">(&nbsp;&nbsp;)</span> <span class="txt">${textoHTML(i.texto)}</span></li>`).join('')}</ol>`;
  } else if (q.tipo === 'associe') {
    corpo = `<div class="associe"><ol class="colA">${q.colunaA.map(a => `<li><span class="letra">${a.letra})</span> <span class="txt">${textoHTML(a.texto)}</span></li>`).join('')}</ol>
      <ol class="colB">${q.colunaB.map(b => `<li><span class="marca">(&nbsp;&nbsp;)</span> <span class="txt">${textoHTML(b.texto)}</span></li>`).join('')}</ol></div>`;
  } else if (q.tipo === 'discursiva') {
    corpo = `<div class="linhas">${'<div class="linha"></div>'.repeat(Math.max(1, Math.min(20, q.linhas || 4)))}</div>`;
  }
  const enun = textoHTML(q.enunciado, { lacunas: q.tipo === 'complete' });
  return `<article class="questao tipo-${q.tipo}"><div class="enunciado"><span class="num">${q.n}.</span>${valor}${enun}</div>${figs}${corpo}</article>`;
}

function blocoHTML(b, urls) {
  return `<section class="bloco"><h2>${esc(b.titulo)}</h2>${b.texto ? `<div class="texto-base">${textoHTML(b.texto)}</div>` : ''}${b.imagens.map(i => figura(i, urls)).join('')}</section>`;
}

function gradeHTML(montada) {
  const mult = montada.questoes.filter(q => q.tipo === 'multipla');
  if (!mult.length) return '';
  const nLetras = Math.max(...mult.map(q => q.alternativas.length));
  const linhas = mult.map(q => `<tr><th>${q.n}</th>${'abcdefghij'.slice(0, nLetras).split('').map((l, k) =>
    `<td>${k < q.alternativas.length ? `<span class="bola">${l.toUpperCase()}</span>` : ''}</td>`).join('')}</tr>`).join('');
  return `<section class="grade"><div class="grade-titulo">GABARITO <span>Código ${montada.codigo}</span></div>
    <table>${linhas}</table><div class="grade-dica">Pinte só uma letra por questão.</div></section>`;
}

// ---------- uma versão em partes: o topo e os blocos que o diagramador encaixa nas páginas ----------
export function partesDaProva({ prova, montada, escola, urls, opcoes, info }) {
  const colunas = montada.adaptada ? 1 : (opcoes.colunas || 2);
  const instr = prova.instrucoes ? `<div class="instrucoes">${textoHTML(prova.instrucoes)}</div>` : '';
  const topo = cabecalhoHTML(escola, prova, montada, urls, info) + faixaHTML(prova, montada, { ...info, total: montada.total }) + instr;
  const pecas = [];
  for (const it of montada.itens) {
    if (it.tipo === 'bloco') pecas.push({ tipo: 'bloco', html: blocoHTML(it.bloco, urls) });
    else if (it.tipo !== 'semBloco') pecas.push({ tipo: 'questao', html: questaoHTML(it.q, urls, opcoes) });
  }
  if (opcoes.grade !== false) { const g = gradeHTML(montada); if (g) pecas.push({ tipo: 'grade', html: g }); }
  const finalImg = prova.imagem_final ? figura({ arquivo: prova.imagem_final.split('|')[0].trim(), legenda: '' }, urls, 'final') : '';
  if (prova.mensagem_final || finalImg) pecas.push({ tipo: 'fim', html: `<div class="mensagem-final">${textoHTML(prova.mensagem_final)}${finalImg}</div>` });
  const nome = montada.adaptada ? 'Adaptada' : `Versão ${montada.letra}`;
  return { colunas, adaptada: montada.adaptada, topo, pecas, rodape: `${esc(prova.titulo || 'Prova')} · ${nome}`, codigo: montada.codigo };
}

// ---------- uma versão corrida (prévia do cabeçalho na tela da escola) ----------
export function provaHTML({ prova, montada, escola, urls, opcoes, info }) {
  const colunas = montada.adaptada ? 1 : (opcoes.colunas || 2);
  const corpo = montada.itens.map(it => it.tipo === 'bloco' ? blocoHTML(it.bloco, urls)
    : it.tipo === 'semBloco' ? '<div class="separador"></div>' : questaoHTML(it.q, urls, opcoes)).join('');
  const instr = prova.instrucoes ? `<div class="instrucoes">${textoHTML(prova.instrucoes)}</div>` : '';
  const finalImg = prova.imagem_final ? figura({ arquivo: prova.imagem_final.split('|')[0].trim(), legenda: '' }, urls, 'final') : '';
  const fim = prova.mensagem_final || finalImg ? `<div class="mensagem-final">${textoHTML(prova.mensagem_final)}${finalImg}</div>` : '';
  const grade = opcoes.grade !== false ? gradeHTML(montada) : '';
  const pagina = `v${montada.versao}`;
  return `<section class="folha ${montada.adaptada ? 'adaptada' : ''}" style="page:${pagina}" data-pagina="${pagina}">
    ${cabecalhoHTML(escola, prova, montada, urls, info)}
    ${faixaHTML(prova, montada, { ...info, total: montada.total })}
    ${instr}
    <main class="conteudo" style="column-count:${colunas}">${corpo}${grade}${fim}</main>
  </section>`;
}

// CSS das páginas do gabarito (as folhas das versões já trazem o próprio rodapé)
export function cssPaginas(montadas, prova, { gerado = '' } = {}) {
  return `@page gab { ${gerado ? `@bottom-left { content: "${String(gerado).replace(/["\\]/g, '')}"; } ` : ''}@bottom-right { content: "Gabarito do professor · página " counter(page) " de " counter(pages); } }`;
}

// ---------- gabarito do professor ----------
export function gabaritoHTML({ prova, montadas }) {
  const secoes = montadas.map(m => {
    const linhas = m.gabarito.map(g => `<tr><td class="n">${g.n}</td><td>${NOMES_TIPO[g.tipo] || g.tipo}</td>
      <td class="resp">${g.tipo === 'discursiva' ? '—' : esc(g.resposta)}</td><td class="v">${num(g.valor)}</td></tr>`).join('');
    const disc = m.gabarito.filter(g => g.tipo === 'discursiva').map(g => `<div class="disc"><b>Questão ${g.n}.</b> ${esc(g.respostaEsperada || 'Sem resposta esperada.')}
      ${g.aceitas && g.aceitas.length ? `<p class="aceitas-gab"><b>Também vale:</b> ${g.aceitas.map(a => esc(a.texto)).join(' · ')}</p>` : ''}
      ${g.criterios && g.criterios.length ? `<ul>${g.criterios.map(c => `<li><b>${num(c.valor)}:</b> ${esc(c.texto)}</li>`).join('')}</ul>` : ''}</div>`).join('');
    const resumo = m.questoes.filter(q => q.tipo === 'multipla').map(q => `${q.n}-${q.gabarito}`).join('  ');
    const nota = m.adaptada && Math.abs(m.total - (prova.valor_total || m.total)) > 0.001
      ? `<p class="nota-adaptada">A versão adaptada soma ${num(m.total)} pontos${m.excluidas ? ` (${m.excluidas} questão${m.excluidas > 1 ? 'ões' : ''} fora)` : ''}. Na correção, a nota é convertida para ${num(prova.valor_total)} pontos.</p>` : '';
    return `<section class="gab-versao"><h2>${m.adaptada ? 'Versão adaptada' : 'Versão ' + m.letra} <span>Código ${m.codigo}</span></h2>
      ${resumo ? `<p class="gab-resumo">${resumo}</p>` : ''}${nota}
      <table class="gab"><thead><tr><th>Nº</th><th>Tipo</th><th>Resposta</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody></table>${disc}</section>`;
  }).join('');
  return `<section class="folha gabarito" style="page:gab"><div class="gab-cab"><div class="aviso-prof">GABARITO DO PROFESSOR · não entregar aos alunos</div>
    <h1>${esc(prova.titulo || 'Prova')}</h1><p>${[prova.disciplina, prova.turma || prova.serie, prova.periodo].filter(Boolean).map(esc).join(' · ')}</p></div>${secoes}</section>`;
}
