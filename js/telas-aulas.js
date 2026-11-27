// Kauê — aulas: colar as partes do Assistente de Aulas, conferir, imprimir o roteiro e as apostilas, apresentar os slides
import * as db from './db.js';
import { lerAula, APOIOS } from './formato-aula.js';
import { partesDoRoteiro, partesDaApostila, slidesHTML, semTituloProf } from './render-aula.js';
import { diagramar } from './diagramar.js';
import { FONTES_PROVA } from './render-prova.js';
import { professorPadrao } from './provas-dados.js';
import { backupDaAula } from './backup.js';
import { $, $$, esc, uid, baixar, nomeArquivo, medirImagem, prepararImagem, aviso } from './util.js';
import { carimbo, descreverCarimbo, sufixoArquivo } from './aparelho.js';

const tela = () => document.getElementById('tela');
let urls = [];
const liberar = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };
const urlDe = blob => { const u = URL.createObjectURL(blob); urls.push(u); return u; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const ASSISTENTE = '../downloads/Assistente-de-Aulas-Kaue.pdf';

async function carregarAula(id) {
  const aula = await db.pegar('aulas', id);
  if (!aula) return null;
  const res = lerAula(aula.texto);
  const escola = aula.escolaId ? await db.pegar('escolas', aula.escolaId) : null;
  return { aula, res, escola };
}
async function arquivosDaAula(aula, escola) {
  const mapa = new Map();
  for (const a of await db.arquivosDe(aula.id)) if (a.blob) mapa.set(a.chave, a);
  if (escola) for (const a of await db.arquivosDe(escola.id)) if (a.blob) mapa.set(a.chave, a);
  return mapa;
}
async function salvar(aula) {
  const cb = await carimbo();
  if (!aula.criada) aula.criada = cb;
  aula.alterada = cb; aula.atualizadaEm = cb.em;
  await db.guardar('aulas', aula);
}

// ---------- lista ----------
export async function telaAulas() {
  liberar();
  const aulas = (await db.todos('aulas')).sort((a, b) => (b.atualizadaEm || '').localeCompare(a.atualizadaEm || ''));
  const item = a => `<a class="cartao prova-item" href="#/aula/${a.id}">
      <div class="prova-num">${a.duracao ? `${a.duracao} min` : 'Aula'}</div>
      <div><h3>${esc(a.titulo || 'Aula sem título')}</h3>
      <p class="meta">${[a.disciplina, a.turma].filter(Boolean).map(esc).join(' · ')}${a.slides ? ` · ${plural(a.slides, 'slide', 'slides')}` : ''}</p>
      <p class="meta pequeno">Alterada em ${esc(descreverCarimbo(a.alterada || a.atualizadaEm))}</p></div></a>`;
  tela().innerHTML = `
    <section class="cabeca"><h1>Suas aulas</h1><a class="botao principal grande" href="#/aula/nova">+ Colar uma aula</a></section>
    ${aulas.length ? `<div class="lista">${aulas.map(item).join('')}</div>` : `<div class="cartao vazio"><img src="../img/apple-touch-icon.png" alt="" width="64" height="64">
      <h2>Nenhuma aula ainda</h2><p>Planeje a aula com o <a href="${ASSISTENTE}">Assistente de Aulas Kauê</a> no Claude, no ChatGPT ou no Gemini. Na etapa 6, escolha montar no Kauê. Depois, copie os blocos de código das respostas e cole aqui.</p>
      <p class="ajuda">O Kauê monta o roteiro do professor, a apostila da turma, as versões adaptadas e os slides, de graça e sem internet.</p>
      <a class="botao principal" href="#/aula/nova">Colar a primeira aula</a></div>`}`;
}

// ---------- colar / editar o texto ----------
export async function telaAulaTexto(id) {
  liberar();
  const existente = id ? await db.pegar('aulas', id) : null;
  const acrescentar = /[?&]acrescentar/.test(location.hash);
  tela().innerHTML = `
    <section class="cabeca"><h1>${existente ? (acrescentar ? 'Acrescentar uma parte' : 'Editar o texto da aula') : 'Colar uma aula'}</h1></section>
    <div class="cartao">
      <label for="texto" class="rotulo">Cole aqui as respostas da IA</label>
      <p class="ajuda">Pode colar todas as partes de uma vez ou uma embaixo da outra, conforme chegarem. O Kauê lê só os blocos de código. Se a IA refizer uma parte, cole a nova no fim: vale a última.</p>
      <textarea id="texto" class="texto-prova" spellcheck="false" placeholder="# AULA&#10;titulo: Expressionismo no Brasil&#10;...">${esc(existente ? existente.texto : '')}</textarea>
      <div class="acoes"><button class="botao principal" id="ler">Ler a aula</button>
        <a class="botao" href="${existente ? `#/aula/${id}` : '#/aulas'}">Cancelar</a></div>
    </div>
    <div id="resultado"></div>`;
  const ta = $('#texto');
  $('#ler').addEventListener('click', () => mostrarLeitura(ta, existente));
  if (existente && acrescentar) {
    ta.value = ta.value.replace(/\s*$/, '') + '\n\n';
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollTop = ta.scrollHeight;
  } else if (existente) mostrarLeitura(ta, existente);
  else ta.focus();
}

function irParaLinha(ta, linha) {
  const linhas = ta.value.split('\n');
  const ini = linhas.slice(0, linha - 1).join('\n').length + (linha > 1 ? 1 : 0);
  ta.focus();
  ta.setSelectionRange(ini, ini + (linhas[linha - 1] || '').length);
  const alturaLinha = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  ta.scrollTop = Math.max(0, (linha - 4) * alturaLinha);
  ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

const itemMsg = (e, cls) => `<li class="${cls}"><button class="linha" data-linha="${e.linha}">linha ${e.linha}</button> ${esc(e.msg)}</li>`;

function resumoDaAula(res) {
  const r = res.resumo, a = res.aula || {};
  const turma = res.apostilas.find(x => !x.adaptada);
  const linhas = [];
  if (res.roteiro) linhas.push(`Roteiro: ${plural(r.blocos, 'bloco', 'blocos')}, ${r.minutos} minutos${a.duracaoMin && a.duracaoMin !== r.minutos ? ` <b class="alerta">(a aula tem ${a.duracaoMin})</b>` : ''}`);
  if (turma) linhas.push(`Apostila da turma: ${plural(turma.secoes.length, 'seção', 'seções')}, ${plural(turma.atividades.length, 'atividade', 'atividades')}`);
  res.apostilas.filter(x => x.adaptada).forEach(ap => linhas.push(`${esc(ap.nome)}: ${plural(ap.atividades.length, 'atividade', 'atividades')}${ap.copias ? `, ${plural(ap.copias, 'cópia', 'cópias')}` : ''}`));
  if (r.slides) linhas.push(plural(r.slides, 'slide', 'slides'));
  if (r.imagens) linhas.push(`${plural(r.imagens, 'imagem', 'imagens')} para anexar depois`);
  if (r.faltam.length && res.aula) linhas.push(`<span class="alerta">Ainda não veio: ${r.faltam.join(', ')}. Você pode acrescentar depois.</span>`);
  return linhas;
}

function mostrarLeitura(ta, existente) {
  const res = lerAula(ta.value);
  const ok = !res.erros.length;
  const a = res.aula || {};
  $('#resultado').innerHTML = `
    <div class="cartao ${ok ? 'tudo-certo' : 'com-erros'}">
      <h2>${ok ? (res.avisos.length ? 'Aula lida, com avisos' : 'Aula lida sem erros') : 'A aula tem erros para corrigir'}</h2>
      ${res.aula ? `<p><b>${esc(a.titulo || 'Sem título')}</b>${[a.disciplina, a.turma].filter(Boolean).map(x => ' · ' + esc(x)).join('')}</p>` : ''}
      <ul class="resumo">${resumoDaAula(res).map(l => `<li>${l}</li>`).join('')}</ul>
      ${res.erros.length ? `<h3>Erros (${res.erros.length})</h3><ul class="msgs">${res.erros.map(e => itemMsg(e, 'erro')).join('')}</ul>` : ''}
      ${res.avisos.length ? `<h3>Avisos (${res.avisos.length})</h3><ul class="msgs">${res.avisos.map(e => itemMsg(e, 'avisoi')).join('')}</ul>` : ''}
      ${!ok ? '<p class="ajuda">Corrija no texto acima (toque em "linha" para ir até o ponto) e leia de novo. Se preferir, peça à IA para refazer a parte e cole a resposta nova no fim.</p>' : ''}
      ${ok ? `<div class="acoes"><button class="botao principal" id="salvar">${existente ? 'Salvar as alterações' : 'Continuar'}</button></div>` : ''}
    </div>`;
  $$('#resultado .linha').forEach(b => b.addEventListener('click', () => irParaLinha(ta, Number(b.dataset.linha))));
  const bt = $('#salvar');
  if (bt) bt.addEventListener('click', async () => {
    bt.disabled = true;
    const aula = existente ? { ...existente } : { id: uid() };
    if (!existente) {
      const escolas = await db.todos('escolas');
      const nome = (a.escola || '').toLowerCase().trim();
      const achou = escolas.find(e => nome && e.nome.toLowerCase().trim() === nome) || (escolas.length === 1 ? escolas[0] : null);
      aula.escolaId = achou ? achou.id : null;
    }
    Object.assign(aula, { texto: ta.value, titulo: a.titulo || '', disciplina: a.disciplina || '', turma: a.turma || '', duracao: a.duracaoMin || null, slides: res.slides.length });
    await salvar(aula);
    await db.pedirArmazenamentoPersistente();
    aviso(existente ? 'Aula atualizada.' : 'Aula guardada neste aparelho.');
    location.hash = `#/aula/${aula.id}`;
  });
}

// ---------- uma aula ----------
function conferencia(res, arquivos) {
  const r = res.roteiro, a = res.aula;
  const ok = [], atencao = [];
  if (r && a && a.duracaoMin) {
    const tempos = res.avisos.filter(x => /somam|começa aos|minuto 0|termina antes|falta o "tempo"/.test(x.msg));
    if (!tempos.length) ok.push(`Os blocos somam ${r.total} minutos, a duração da aula.`);
  }
  if (r && res.slides.length && r.blocos.some(b => b.slidesLista)) {
    const sl = res.avisos.filter(x => /slide/i.test(x.msg));
    if (!sl.length) ok.push(`Os ${res.slides.length} slides aparecem no roteiro.`);
  }
  const todas = res.apostilas.flatMap(ap => ap.atividades.map(q => ({ ap, q })));
  const semResposta = todas.filter(({ q }) => ['discursiva', 'pratica'].includes(q.tipo) && !q.resposta);
  if (todas.length && !semResposta.length) ok.push('Todas as atividades têm resposta no gabarito.');
  semResposta.forEach(({ ap, q }) => atencao.push(`${ap.adaptada ? ap.nome : 'Apostila da turma'}, atividade ${q.n}: sem a resposta esperada.`));
  const faltamImg = res.imagens.filter(i => !arquivos.get(i.chave));
  if (res.imagens.length && !faltamImg.length) ok.push('Todas as imagens estão anexadas.');
  if (faltamImg.length) atencao.push(`${plural(faltamImg.length, 'imagem ainda não foi anexada', 'imagens ainda não foram anexadas')}. Sem ela, sai um quadro com a descrição.`);
  res.resumo.faltam.forEach(f => atencao.push(`Ainda não veio: ${f}. Quando a IA entregar, toque em "Acrescentar uma parte".`));
  res.avisos.forEach(x => atencao.push(x.msg));
  return { ok, atencao };
}

export async function telaAula(id) {
  liberar();
  const dados = await carregarAula(id);
  if (!dados) { location.hash = '#/aulas'; return; }
  const { aula, res } = dados;
  const a = res.aula || {};
  const escolas = await db.todos('escolas');
  const arquivos = await arquivosDaAula(aula, dados.escola);
  const conf = conferencia(res, arquivos);
  const turma = res.apostilas.find(x => !x.adaptada);
  const adaptadas = res.apostilas.filter(x => x.adaptada);

  const linhaImg = i => {
    const arq = arquivos.get(i.chave);
    return `<li class="img-item">${arq ? `<img src="${urlDe(arq.blob)}" alt="">` : `<div class="img-falta">${i.inserir ? 'inserir' : 'falta'}</div>`}
      <div><b>${esc(i.inserir ? (i.legenda || 'Imagem a inserir') : i.arquivo)}</b><br><span class="meta">${esc(i.onde.join(' · '))}</span></div>
      <label class="botao pequeno">${arq ? 'Trocar' : 'Anexar'}<input type="file" accept="image/*" data-chave="${esc(i.chave)}" hidden></label>
      ${arq ? `<button class="botao pequeno sutil" data-tirar="${esc(i.chave)}">Tirar</button>` : ''}</li>`;
  };
  const mat = (titulo, detalhe, href, extra = '') => `<div class="mat-item"><div><b>${titulo}</b><small>${detalhe}</small></div>${href ? `<a class="botao" href="${href}">PDF</a>` : ''}${extra}</div>`;

  tela().innerHTML = `
    <section class="cabeca"><div><p class="sobre">Aula${a.duracaoMin ? ` · ${a.duracaoMin} minutos` : ''}</p><h1>${esc(a.titulo || aula.titulo || 'Aula')}</h1>
      <p class="meta">${[a.disciplina, a.turma, a.professor && semTituloProf(a.professor)].filter(Boolean).map(esc).join(' · ')}</p>
      <p class="meta pequeno carimbo">${aula.criada ? `Criada em ${esc(descreverCarimbo(aula.criada))}` : ''}${aula.alterada && (!aula.criada || aula.alterada.em !== aula.criada.em) ? ` · Alterada em ${esc(descreverCarimbo(aula.alterada))}` : ''}</p></div></section>
    ${res.erros.length ? `<div class="cartao com-erros"><b>O texto desta aula tem erros.</b> <a href="#/aula/${id}/texto">Corrigir</a></div>` : ''}

    <div class="cartao ${conf.atencao.length ? 'lembrete' : 'tudo-certo'}" id="conferencia"><h2>Conferência</h2>
      <ul class="conferencia">${conf.ok.map(t => `<li class="ok">${esc(t)}</li>`).join('')}${conf.atencao.map(t => `<li class="atencao">${esc(t)}</li>`).join('')}</ul>
      <p class="ajuda">O Kauê confere os tempos, os slides e as respostas. O conteúdo, quem revisa é você.</p></div>

    <div class="grade-cartoes">
    <div class="cartao"><h2>1. Escola e cabeçalho</h2>
      <select id="escola" class="campo-form"><option value="">Sem escola cadastrada (usa o nome da aula)</option>${escolas.map(e => `<option value="${e.id}" ${e.id === aula.escolaId ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
      <p class="ajuda">O cabeçalho da escola vai na apostila. <a href="#/escola/nova">Cadastrar uma escola</a></p></div>
    <div class="cartao"><h2>2. Imagens</h2>
      ${res.imagens.length ? `<ul class="imgs">${res.imagens.map(linhaImg).join('')}</ul><p class="ajuda">A mesma imagem vale para a apostila e para o slide. Imagem que faltar sai como um quadro com a descrição.</p>` : '<p class="ajuda">Esta aula não usa imagens.</p>'}</div>
    </div>

    <div class="cartao destaque"><h2>3. Material para imprimir</h2>
      <div class="material">
        ${res.roteiro || res.apostilas.length ? mat('Roteiro do professor', 'Tempos, falas, perguntas, apoios, gabaritos e notas dos slides', `#/aula/${id}/imprimir/roteiro`) : ''}
        ${turma ? mat('Apostila da turma', `${plural(turma.secoes.length, 'seção', 'seções')}, ${plural(turma.atividades.length, 'atividade', 'atividades')}`, `#/aula/${id}/imprimir/turma`) : ''}
        ${adaptadas.map(ap => mat(esc(ap.nome), [ap.copias && plural(ap.copias, 'cópia', 'cópias'), ap.apoios.includes('visao') ? 'letra 18' : 'letra 14', ap.apoios.map(k => APOIOS[k]).join(', ')].filter(Boolean).join(' · '), `#/aula/${id}/imprimir/${ap.chave}`)).join('')}
      </div>
      ${adaptadas.length ? '<p class="ajuda">A folha do aluno não diz "adaptada": só o rodapé traz uma sigla discreta (A1, A2…) para você separar as cópias.</p>' : ''}
    </div>

    <div class="cartao"><h2>4. Slides</h2>
      ${res.slides.length ? `<p>${plural(res.slides.length, 'slide', 'slides')}: o primeiro é a abertura e o último, o encerramento.</p>
      <div class="acoes"><a class="botao principal" href="#/aula/${id}/slides">Ver e apresentar</a><button class="botao" id="pptx">Baixar em PowerPoint</button></div>
      <p class="ajuda">No PowerPoint ou no Google Apresentações, você pode mudar o visual. As notas de cada slide vão junto.</p>`
      : '<p class="ajuda">Esta aula ainda não tem slides. Quando a IA entregar a parte dos slides, toque em "Acrescentar uma parte".</p>'}</div>

    <div class="cartao"><h2>Mais</h2><div class="acoes">
      <a class="botao" href="#/aula/${id}/texto?acrescentar">Acrescentar uma parte</a>
      <a class="botao" href="#/aula/${id}/texto">Editar o texto</a>
      <button class="botao" id="exportar">Enviar para outro aparelho</button>
      <button class="botao perigo" id="excluir">Excluir</button></div>
      <p class="ajuda">"Acrescentar uma parte" abre o texto no fim, para colar a próxima resposta da IA ou uma parte refeita.</p></div>`;

  $('#escola').addEventListener('change', async e => { aula.escolaId = e.target.value || null; await salvar(aula); telaAula(id); });
  $$('input[type=file][data-chave]').forEach(inp => inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    const blob = await prepararImagem(f);
    const { largura, altura } = await medirImagem(blob);
    await db.guardar('arquivos', { id: `${aula.id}::${inp.dataset.chave}`, dono: aula.id, chave: inp.dataset.chave, nome: f.name, tipo: blob.type || f.type, blob, largura, altura });
    await salvar(aula); aviso('Imagem anexada.'); telaAula(id);
  }));
  $$('[data-tirar]').forEach(b => b.addEventListener('click', async () => { await db.apagar('arquivos', `${aula.id}::${b.dataset.tirar}`); await salvar(aula); telaAula(id); }));
  const bp = $('#pptx'); if (bp) bp.addEventListener('click', () => baixarPptx(id, bp));
  $('#exportar').addEventListener('click', async () => {
    baixar(`kaue-aula-${nomeArquivo(aula.titulo)}-${await sufixoArquivo()}.json`, new Blob([JSON.stringify(await backupDaAula(aula.id))], { type: 'application/json' }));
  });
  $('#excluir').addEventListener('click', async () => {
    if (!confirm(`Excluir a aula "${aula.titulo}"? As imagens dela também saem deste aparelho. Não dá para desfazer.`)) return;
    await db.apagarArquivosDe(aula.id); await db.apagar('aulas', aula.id);
    aviso('Aula excluída.'); location.hash = '#/aulas';
  });
}

async function baixarPptx(id, botao) {
  const antes = botao.textContent;
  botao.disabled = true; botao.textContent = 'Gerando…';
  try {
    const { slidesPptx } = await import('./slides-pptx.js');
    const { aula, res, escola } = await carregarAula(id);
    const blob = await slidesPptx(res, await arquivosDaAula(aula, escola));
    baixar(`slides-${nomeArquivo(aula.titulo)}.pptx`, blob);
  } catch (e) { console.error(e); aviso('Não consegui gerar o PowerPoint: ' + e.message, 'erro'); }
  finally { botao.disabled = false; botao.textContent = antes; }
}

// ---------- imprimir: roteiro, apostila da turma, adaptadas ----------
export async function telaImprimirAula(id, qual) {
  liberar();
  const dados = await carregarAula(id);
  if (!dados) { location.hash = '#/aulas'; return; }
  const { aula, res, escola } = dados;
  const arquivos = await arquivosDaAula(aula, escola);
  const mapa = new Map([...arquivos].map(([k, x]) => [k, urlDe(x.blob)]));
  const ap = qual === 'roteiro' ? null : res.apostilas.find(x => x.chave === qual);
  if (qual !== 'roteiro' && !ap) { location.hash = `#/aula/${id}`; return; }
  const rotulo = qual === 'roteiro' ? 'Roteiro do professor' : ap.adaptada ? ap.nome : 'Apostila da turma';
  document.body.classList.add('modo-impressao');
  tela().innerHTML = `
    <div class="barra-impressao nao-imprimir">
      <a class="botao" href="#/aula/${id}">‹ Voltar</a>
      <div class="barra-titulo"><b>${esc(aula.titulo || 'Aula')}</b> · ${esc(rotulo)}</div>
      <button class="botao principal" id="imprimir" disabled>Imprimir ou salvar PDF</button>
    </div>
    <p class="dica-impressao nao-imprimir" id="encaixe">Montando as folhas…</p>
    <div class="folhas" id="folhas" style="--fonte-prova:${FONTES_PROVA.atkinson.css}"></div>`;
  const v = qual === 'roteiro' ? partesDoRoteiro(res)
    : partesDaApostila(ap, res, { escola, urls: mapa, info: { professor: res.aula.professor || await professorPadrao(escola) } });
  const tam = v.tamanho || 10.5;
  const resumo = await diagramar($('#folhas'), [v], { tamanho: tam, tamanhoAdaptada: tam, minimo: qual === 'roteiro' ? 0.9 : 0.95, minimoAdaptada: 1, tetoAdaptada: null });
  if (!$('#encaixe')) return;
  const pags = resumo[0].paginas[0];
  $('#encaixe').innerHTML = `<b>${plural(pags, 'página', 'páginas')}${ap && ap.copias ? ` · ${plural(ap.copias, 'cópia', 'cópias')}` : ''}.</b> As folhas já vêm no tamanho certo: na janela de impressão, deixe a escala em <b>100%</b> (ou Padrão) e escolha <b>Salvar como PDF</b> ou a sua impressora.${ap && ap.apoios.includes('visao') ? ' Esta versão usa letra 18.' : ''}`;
  $('#imprimir').disabled = false;
  document.title = `${aula.titulo || 'Aula'} – ${rotulo}`;
  $('#imprimir').addEventListener('click', () => window.print());
  window.addEventListener('hashchange', () => { document.title = 'Kauê'; }, { once: true });
}

// ---------- slides: ver, apresentar, PDF, PowerPoint ----------
export async function telaSlides(id) {
  liberar();
  const dados = await carregarAula(id);
  if (!dados) { location.hash = '#/aulas'; return; }
  const { aula, res, escola } = dados;
  if (!res.slides.length) { location.hash = `#/aula/${id}`; return; }
  const arquivos = await arquivosDaAula(aula, escola);
  const mapa = new Map([...arquivos].map(([k, x]) => [k, urlDe(x.blob)]));
  document.body.classList.add('modo-impressao', 'modo-slides');
  document.getElementById('css-paginas').textContent = '@page { size: 254mm 142.875mm; margin: 0; }';
  tela().innerHTML = `
    <div class="barra-impressao nao-imprimir">
      <a class="botao" href="#/aula/${id}">‹ Voltar</a>
      <div class="barra-titulo"><b>${esc(aula.titulo || 'Aula')}</b> · ${plural(res.slides.length, 'slide', 'slides')}</div>
      <div class="acoes-barra"><button class="botao principal" id="apresentar">Apresentar</button><button class="botao" id="pdf">Salvar em PDF</button><button class="botao" id="pptx">PowerPoint</button></div>
    </div>
    <p class="dica-impressao nao-imprimir">Em <b>Apresentar</b>, passe os slides com as setas, a barra de espaço ou um toque nas laterais da tela; Esc sai. Toque num slide para começar por ele.
      <label class="chave inline"><input type="checkbox" id="verNotas"><span>Mostrar as notas do professor</span></label></p>
    <div class="slides-deck" id="deck">${slidesHTML(res, mapa)}</div>`;
  // notas embaixo de cada slide, só na tela
  $$('#deck .slide').forEach(el => {
    const s = res.slides[Number(el.dataset.n) - 1];
    if (s.notas) el.insertAdjacentHTML('afterend', `<div class="sl-notas nao-imprimir" hidden><b>Notas · slide ${s.n}</b> ${esc(s.notas)}</div>`);
  });
  $('#verNotas').addEventListener('change', e => $$('.sl-notas').forEach(n => { n.hidden = !e.target.checked; }));
  $('#apresentar').addEventListener('click', () => apresentar(0));
  $$('#deck .slide').forEach((el, k) => el.addEventListener('click', () => apresentar(k)));
  $('#pdf').addEventListener('click', () => window.print());
  $('#pptx').addEventListener('click', () => baixarPptx(id, $('#pptx')));
  document.title = `${aula.titulo || 'Aula'} – Slides`;
  window.addEventListener('hashchange', () => { document.title = 'Kauê'; document.body.classList.remove('modo-slides'); }, { once: true });
}

function apresentar(inicio) {
  const slides = $$('#deck .slide');
  if (!slides.length) return;
  const cont = document.createElement('div');
  cont.className = 'apresentacao nao-imprimir';
  cont.setAttribute('role', 'dialog'); cont.setAttribute('aria-label', 'Apresentação dos slides');
  cont.innerHTML = '<div class="ap-palco"></div><div class="ap-contador"></div><button class="ap-sair" type="button" aria-label="Sair da apresentação">×</button>';
  document.body.appendChild(cont);
  const palco = cont.querySelector('.ap-palco');
  let i = Math.max(0, Math.min(slides.length - 1, inicio));
  const mostrar = () => {
    palco.innerHTML = '';
    palco.appendChild(slides[i].cloneNode(true));
    cont.querySelector('.ap-contador').textContent = `${i + 1} / ${slides.length}`;
  };
  const ir = d => { const n = i + d; if (n >= 0 && n < slides.length) { i = n; mostrar(); } };
  const sair = () => {
    document.removeEventListener('keydown', tecla);
    document.removeEventListener('fullscreenchange', saiuTela);
    window.removeEventListener('hashchange', sair);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    cont.remove();
  };
  const tecla = e => {
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); ir(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); ir(-1); }
    else if (e.key === 'Home') { i = 0; mostrar(); }
    else if (e.key === 'End') { i = slides.length - 1; mostrar(); }
    else if (e.key === 'Escape') sair();
  };
  const saiuTela = () => { if (!document.fullscreenElement) sair(); };
  document.addEventListener('keydown', tecla);
  document.addEventListener('fullscreenchange', saiuTela);
  window.addEventListener('hashchange', sair);
  cont.querySelector('.ap-sair').addEventListener('click', e => { e.stopPropagation(); sair(); });
  palco.addEventListener('click', e => { ir(e.clientX < window.innerWidth * 0.3 ? -1 : 1); });
  let x0 = null;
  palco.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  palco.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) { ir(dx < 0 ? 1 : -1); e.preventDefault(); }
  });
  mostrar();
  if (cont.requestFullscreen) cont.requestFullscreen().catch(() => {});
}

