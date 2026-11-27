// Kauê — monta o HTML da aula: roteiro do professor, apostilas (turma e adaptadas) e slides
import { esc, NOMES_TIPO } from './util.js';
import { textoHTML, figura, questaoHTML, cabecalhoHTML } from './render-prova.js';
import { APOIOS } from './formato-aula.js';

// [PICTOGRAMA: palavra] e [IMAGEM: descrição] escritos no meio do texto viram quadros para colar a figura
export const marcadores = html => html
  .replace(/\[PICTOGRAMA:\s*([^\]]+)\]/gi, '<span class="picto"><small>pictograma</small>$1</span>')
  .replace(/\[IMAGEM:\s*([^\]]+)\]/gi, '<span class="img-marca">Imagem: $1</span>');
const texto = t => marcadores(textoHTML(t));
const lista = itens => (itens && itens.length ? `<ul>${itens.map(i => `<li>${marcadores(esc(i))}</li>`).join('')}</ul>` : '');
export const semTituloProf = s => String(s || '').replace(/^\s*(prof(essor|essora|\.?ª|\.?\(a\)|\.)?\s*(\(a\))?\.?)\s+/i, '').trim();
const minutos = n => `${n} min`;
const intervalo = b => `${b.inicio}–${b.fim} min`;
export const nomeTipo = t => (t === 'pratica' ? 'Prática ou criativa' : NOMES_TIPO[t] || t);

// ---------- roteiro do professor ----------
function gabaritoLinha(q) {
  let resp;
  if (q.tipo === 'multipla') resp = q.gabarito.toUpperCase();
  else if (q.tipo === 'vf') resp = q.itensVF.map(v => v.resposta).join(' · ');
  else if (q.tipo === 'associe') resp = `${q.colunaB.map(b => (b.resposta || '?').toUpperCase()).join(' · ')} <small>(de cima para baixo)</small>`;
  else if (q.tipo === 'complete') resp = q.lacunas.map(l => l[0]).join(' · ');
  else resp = q.resposta ? marcadores(esc(q.resposta)) + (q.aceitas && q.aceitas.length ? `<br><i>Também vale:</i> ${q.aceitas.map(a => esc(a.texto)).join(' · ')}` : '') : '<i>Resposta pessoal.</i>';
  return `<tr><td class="n">${q.n}</td><td>${esc(nomeTipo(q.tipo))}</td><td>${resp}</td></tr>`;
}

function gabaritoDaApostila(ap) {
  if (!ap.atividades.length) return '';
  const nome = ap.adaptada ? ap.nome : 'Apostila da turma';
  return `<section class="rot-sec"><h2>Gabarito · ${esc(nome)}</h2>
    <table class="rot-tab"><thead><tr><th>Nº</th><th>Tipo</th><th>Resposta</th></tr></thead><tbody>${ap.atividades.map(gabaritoLinha).join('')}</tbody></table></section>`;
}

export function partesDoRoteiro(res) {
  const a = res.aula, r = res.roteiro;
  const meta = [a.escola, a.professor && `Professor(a): ${semTituloProf(a.professor)}`, a.disciplina, a.turma, a.duracaoMin && `${a.duracaoMin} minutos`].filter(Boolean).map(esc).join(' · ');
  const topo = `<header class="rot-cab"><div class="aviso-prof">ROTEIRO DO PROFESSOR</div><h1>${esc(a.titulo || 'Aula')}</h1><p class="rot-meta">${meta}</p></header>`;
  const pecas = [];
  const sec = (html, tipo = 'bloco') => pecas.push({ tipo, html });

  const info = [];
  if (a.objetivo) info.push(`<h2>Objetivo</h2>${texto(a.objetivo)}`);
  if (a.antes) info.push(`<h3>O que os alunos precisam saber antes</h3>${texto(a.antes)}`);
  if (a.bncc.length) info.push(`<h3>Habilidades da BNCC</h3>${lista(a.bncc)}`);
  if (a.materiais.length) info.push(`<h3>Materiais para separar</h3>${lista(a.materiais)}`);
  if (info.length) sec(`<section class="rot-sec">${info.join('')}</section>`);

  if (r && r.blocos.length) {
    sec(`<section class="rot-sec"><h2>Tempos da aula</h2><table class="rot-tab rot-tempos"><thead><tr><th>Tempo</th><th>Bloco</th><th>O que acontece</th><th>Slides</th></tr></thead><tbody>
      ${r.blocos.map(b => `<tr><td class="t">${intervalo(b)}<br><small>${minutos(b.minutos)}</small></td><td><b>${b.n}. ${esc(b.titulo)}</b></td><td>${esc(b.resumo)}</td><td class="t">${b.slides == null ? '—' : esc(b.slides)}</td></tr>`).join('')}
      <tr class="total"><td class="t">${minutos(r.total)}</td><td colspan="3">Total${a.duracaoMin && a.duracaoMin !== r.total ? ` · a aula tem ${a.duracaoMin} min` : ''}</td></tr></tbody></table></section>`, 'questao');
    for (const b of r.blocos) {
      const itens = [];
      if (b.fazer.length) itens.push(`<div class="rot-item"><h3>O que fazer</h3>${lista(b.fazer)}</div>`);
      if (b.slides != null) itens.push(`<div class="rot-item rot-linha"><h3>Slides</h3><p>${esc(b.slides)}</p></div>`);
      if (b.fala) itens.push(`<div class="rot-item rot-fala"><h3>Fala sugerida</h3>${texto(b.fala)}</div>`);
      if (b.perguntas.length) itens.push(`<div class="rot-item"><h3>Perguntas para a turma</h3><ul>${b.perguntas.map(p => `<li>${esc(p.texto)}${p.resposta ? ` <span class="resp">Resposta esperada: ${esc(p.resposta)}</span>` : ''}</li>`).join('')}</ul></div>`);
      if (b.apoios.length) itens.push(`<div class="rot-item"><h3>Apoios</h3>${lista(b.apoios)}</div>`);
      if (b.tempoExtra) itens.push(`<div class="rot-item"><h3>Se sobrar ou faltar tempo</h3>${texto(b.tempoExtra)}</div>`);
      sec(`<section class="rot-bloco"><h2><span class="rot-n">${b.n}</span>${esc(b.titulo)}<span class="rot-tempo">${intervalo(b)} · ${minutos(b.minutos)}</span></h2>${itens.join('')}</section>`);
    }
  }
  const fim = [];
  if (r && r.verificacao) fim.push(`<h3>Verificação da aprendizagem</h3>${texto(r.verificacao)}`);
  if (r && r.tarefa) fim.push(`<h3>Tarefa para casa</h3>${texto(r.tarefa)}`);
  if (r && r.fontes.length) fim.push(`<h3>Fontes</h3>${lista(r.fontes)}`);
  if (fim.length) sec(`<section class="rot-sec">${fim.join('')}</section>`);

  for (const ap of res.apostilas.filter(x => x.adaptada)) {
    const partes = [`<p><b>Apoios:</b> ${esc(ap.apoiosTexto || ap.apoios.map(k => APOIOS[k]).join(', ') || '—')}${ap.copias ? ` · <b>Cópias:</b> ${ap.copias}` : ''}</p>`];
    if (ap.mudou) partes.push(`<h3>O que mudou</h3>${texto(ap.mudou)}`);
    if (ap.sairam) partes.push(`<h3>Atividades que saíram</h3>${texto(ap.sairam)}`);
    if (ap.dicas.length) partes.push(`<h3>Dicas de mediação</h3>${lista(ap.dicas)}`);
    sec(`<section class="rot-sec"><h2>${esc(ap.nome)}</h2>${partes.join('')}<p class="rot-pei">Esta versão complementa o plano individual do aluno (PEI) e o trabalho do AEE, quando houver.</p></section>`);
  }
  for (const ap of res.apostilas) { const g = gabaritoDaApostila(ap); if (g) sec(g, 'questao'); }
  if (res.slides.length) {
    sec(`<section class="rot-sec"><h2>Slides e notas</h2><table class="rot-tab"><thead><tr><th>Nº</th><th>Slide</th><th>O que dizer</th></tr></thead><tbody>
      ${res.slides.map(s => `<tr><td class="n">${s.n}</td><td><b>${esc(s.titulo)}</b></td><td>${esc(s.notas)}</td></tr>`).join('')}</tbody></table></section>`);
  }
  return { colunas: 1, adaptada: false, classe: 'roteiro', topo, pecas, rodape: `${esc(a.titulo || 'Aula')} · Roteiro do professor`, codigo: '' };
}

// ---------- apostila (turma ou adaptada) ----------
function atividadeHTML(q, urls) {
  if (q.tipo !== 'pratica') return marcadores(questaoHTML(q, urls, { mostrarValor: false }));
  const figs = q.imagens.map(i => figura(i, urls)).join('');
  return `<article class="questao tipo-pratica"><div class="enunciado"><span class="num">${q.n}.</span>${texto(q.enunciado)}</div>${figs}
    <div class="quadro-pratica" style="height:${Math.max(3, Math.min(30, q.linhas || 12)) * 7.5}mm"></div></article>`;
}

export function partesDaApostila(ap, res, { escola, urls, info }) {
  const a = res.aula;
  const campos = { professor: true, serie: true, data: true, nome: true, numero: true, ...((escola && escola.campos) || {}), nota: false };
  const esc2 = escola ? { ...escola, campos } : { modo: 'campos', nome: a.escola, campos, extra: {} };
  const provaLike = { titulo: ap.titulo || a.titulo || 'Aula', escola: a.escola, professor: semTituloProf(a.professor), turma: a.turma };
  let topo = cabecalhoHTML(esc2, provaLike, { rotulo: '' }, urls, { professor: semTituloProf(info.professor) });
  if (ap.aprender) topo += `<div class="ap-aprender">${texto(ap.aprender)}</div>`;
  if (ap.rotina.length) topo += `<div class="ap-rotina"><b>Hoje, na aula:</b><ol>${ap.rotina.map(p => `<li><span class="caixinha"></span>${marcadores(esc(p.replace(/^\d+[.)]\s*/, '')))}</li>`).join('')}</ol></div>`;
  const pecas = [];
  for (const s of ap.secoes) {
    const figs = s.imagens.map(i => figura(i, urls)).join('');
    pecas.push({ tipo: 'bloco', html: `<section class="bloco ap-secao"><h2>${esc(s.titulo)}</h2>${s.texto ? `<div class="texto-base">${texto(s.texto)}</div>` : ''}${figs}${s.lembrar ? `<div class="lembrar"><b>Para lembrar</b>${texto(s.lembrar)}</div>` : ''}</section>` });
  }
  if (ap.glossario.length) pecas.push({ tipo: 'questao', html: `<section class="ap-glossario"><h2>Glossário</h2><dl>${ap.glossario.map(g => `<div><dt>${esc(g.termo)}</dt><dd>${marcadores(esc(g.significado))}</dd></div>`).join('')}</dl></section>` });
  ap.atividades.forEach((q, k) => pecas.push({ tipo: 'questao', html: `${k === 0 ? '<h2 class="ap-ativ-titulo">Atividades</h2>' : ''}${atividadeHTML(q, urls)}` }));
  const visao = ap.apoios.includes('visao');
  const classe = ['apostila', visao ? 'visao' : '', ap.adaptada ? `apoio-${ap.apoios.join(' apoio-')}` : ''].join(' ');
  // a folha do aluno não diz "adaptada": só uma sigla discreta no rodapé, para o professor separar as cópias
  return { colunas: 1, adaptada: ap.adaptada, classe, topo, pecas, rodape: `${esc(provaLike.titulo)} · Apostila${ap.sigla ? ` (${ap.sigla})` : ''}`, codigo: '',
    tamanho: ap.adaptada ? (visao ? 18 : 14) : 11 };
}

// ---------- slides ----------
function slideHTML(s, total, res, urls) {
  const tipo = s.n === 1 ? 'abertura' : s.n === total && total > 2 ? 'encerramento' : 'conteudo';
  const img = s.imagens[0];
  const urlImg = img && urls.get(img.arquivo === '[inserir]' || !img.arquivo ? `[inserir]|${img.legenda}` : img.arquivo);
  const figura = img ? (urlImg ? `<figure class="sl-fig"><img src="${urlImg}" alt="${esc(img.legenda)}">${img.legenda ? `<figcaption>${esc(img.legenda)}</figcaption>` : ''}</figure>`
    : `<figure class="sl-fig falta"><div>Imagem: ${esc(img.legenda || img.arquivo)}</div></figure>`) : '';
  const itens = s.itens;
  const corpo = tipo === 'abertura'
    ? itens.map(i => `<p>${marcadores(esc(i))}</p>`).join('')
    : itens.length > 1 ? `<ul>${itens.map(i => `<li>${marcadores(esc(i))}</li>`).join('')}</ul>` : itens.map(i => `<p>${marcadores(esc(i))}</p>`).join('');
  const rodape = tipo === 'abertura' ? [res.aula && res.aula.escola, res.aula && res.aula.professor && semTituloProf(res.aula.professor)].filter(Boolean).map(esc).join(' · ')
    : esc((res.aula && res.aula.titulo) || '');
  return `<section class="slide ${tipo} ${figura ? 'com-imagem' : ''}" data-n="${s.n}"><div class="sl-miolo">
      <div class="sl-texto">${tipo === 'abertura' ? `<h1>${esc(s.titulo)}</h1>` : `<h2>${esc(s.titulo)}</h2>`}<div class="sl-corpo">${corpo}</div></div>${figura}</div>
    <footer class="sl-rodape"><span>${rodape}</span><span>${s.n}/${total}</span></footer></section>`;
}

export function slidesHTML(res, urls) {
  return res.slides.map(s => slideHTML(s, res.slides.length, res, urls)).join('');
}
