// Kauê — app: telas, navegação e ligação entre as partes
import { lerFormatoKaue } from './formato-kaue.js';
import { provaPedeAdaptada, LETRAS_VERSAO } from './versoes.js';
import { configPadrao, assinatura, carregarProva, montarTudo, mapaDeArquivos, professorPadrao } from './provas-dados.js';
import { provaHTML, gabaritoHTML, cssPaginas, chaveImagem, FONTES_PROVA, textoHTML } from './render-prova.js';
import * as db from './db.js';
import { backupCompleto, backupDaProva, lerBackup, restaurar, resumoEmLinhas } from './backup.js';
import { telaTurmas, telaTurmaForm, telaTurma, telaAlunos, telaAvaliacao, telaCorrigirLista, telaCorrigir, telaImprimirTurma } from './telas-turmas.js';
import { TUTORIAL } from './tutorial.js';
import { aparelho, carimbo, nomearAparelho, descreverCarimbo, dataHora, sufixoArquivo, SUGESTOES_DE_NOME } from './aparelho.js';
import { $, $$, esc, uid, num, dataCurta, NOMES_TIPO, baixar, nomeArquivo, medirImagem, prepararImagem, aviso } from './util.js';

const VERSAO_APP = '1.2.0';
const tela = () => document.getElementById('tela');
let urlsAbertas = [];
const liberarUrls = () => { urlsAbertas.forEach(u => URL.revokeObjectURL(u)); urlsAbertas = []; };
const urlDe = blob => { const u = URL.createObjectURL(blob); urlsAbertas.push(u); return u; };

// todas as imagens que a prova cita, na ordem em que aparecem
function imagensCitadas(res) {
  const lista = [];
  const add = (img, onde) => {
    const chave = chaveImagem(img);
    const ja = lista.find(x => x.chave === chave);
    if (ja) { ja.onde.push(onde); return; }
    lista.push({ chave, arquivo: img.arquivo, legenda: img.legenda, inserir: img.arquivo === '[inserir]', onde: [onde] });
  };
  res.blocos.forEach(b => b.imagens.forEach(i => add(i, `bloco "${b.titulo}"`)));
  res.questoes.forEach((q, k) => {
    q.imagens.forEach(i => add(i, `questão ${k + 1}`));
    if (q.adaptadaQuestao) q.adaptadaQuestao.imagens.forEach(i => add(i, `questão ${k + 1} (adaptada)`));
  });
  if (res.prova.imagem_final) add({ arquivo: res.prova.imagem_final.split('|')[0].trim(), legenda: 'Imagem final' }, 'mensagem final');
  return lista;
}

// ---------- navegação ----------
const rotas = [
  [/^#?\/?$/, telaInicio],
  [/^#\/nova$/, () => telaTexto(null)],
  [/^#\/prova\/([^/]+)$/, m => telaProva(m[1])],
  [/^#\/prova\/([^/]+)\/texto$/, m => telaTexto(m[1])],
  [/^#\/imprimir\/([^/]+)\/([^/]+)$/, m => telaImprimir(m[1], m[2])],
  [/^#\/escolas$/, telaEscolas],
  [/^#\/escola\/([^/]+)$/, m => telaEscola(m[1])],
  [/^#\/backup$/, telaBackup],
  [/^#\/instrucoes$/, telaInstrucoes],
  [/^#\/turmas$/, telaTurmas],
  [/^#\/turma\/nova$/, () => telaTurmaForm(null)],
  [/^#\/turma\/([^/?]+)\/editar$/, m => telaTurmaForm(m[1])],
  [/^#\/turma\/([^/?]+)\/alunos$/, m => telaAlunos(m[1])],
  [/^#\/turma\/([^/?]+)\/imprimir$/, m => telaImprimirTurma(m[1])],
  [/^#\/turma\/([^/?]+)\/avaliacao\/([^/?]+)(\?.*)?$/, m => telaAvaliacao(m[1], m[2])],
  [/^#\/turma\/([^/?]+)\/corrigir\/([^/?]+)\/([^/?]+)$/, m => telaCorrigir(m[1], m[2], m[3])],
  [/^#\/turma\/([^/?]+)\/corrigir\/([^/?]+)$/, m => telaCorrigirLista(m[1], m[2])],
  [/^#\/turma\/([^/?]+)(\?.*)?$/, m => telaTurma(m[1])],
];

async function navegar() {
  liberarUrls();
  // troca o elemento da tela para não acumular ouvintes de uma tela na outra
  const velha = tela(); const nova = velha.cloneNode(false); velha.replaceWith(nova);
  document.body.classList.remove('modo-impressao');
  document.getElementById('css-paginas').textContent = '';
  const h = location.hash || '#/';
  for (const [re, fn] of rotas) {
    const m = h.match(re);
    if (m) {
      try { await fn(m); } catch (e) { console.error(e); tela().innerHTML = `<div class="cartao erro-geral"><h2>Algo deu errado</h2><p>${esc(e.message)}</p><a class="botao" href="#/">Voltar ao início</a></div>`; }
      const secao = h.startsWith('#/escola') ? '#/escolas' : h.startsWith('#/backup') ? '#/backup' : h.startsWith('#/turma') ? '#/turmas'
        : h.startsWith('#/instrucoes') ? '#/instrucoes' : '#/';
      $$('.topo nav a').forEach(a => a.classList.toggle('ativo', a.getAttribute('href') === secao));
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}

// ---------- início ----------
async function telaInicio() {
  const provas = (await db.todos('provas')).sort((a, b) => (b.atualizadaEm || '').localeCompare(a.atualizadaEm || ''));
  const escolas = await db.todos('escolas');
  const ultimoBackup = await db.config('ultimoBackup');
  const eu = await aparelho();
  const lista = provas.map(p => `<a class="cartao prova-item" href="#/prova/${p.id}">
      <div class="prova-num">Nº ${String(p.numero).padStart(3, '0')}</div>
      <div><h3>${esc(p.titulo || 'Prova sem título')}</h3>
      <p class="meta">${[p.disciplina, p.turma || p.serie].filter(Boolean).map(esc).join(' · ')}${p.questoes ? ` · ${p.questoes} questões` : ''}</p>
      <p class="meta pequeno">Alterada em ${esc(descreverCarimbo(p.alterada || p.atualizadaEm))}${p.impressaEm ? ' · impressa' : ''}</p></div></a>`).join('');
  const lembrete = provas.length && (!ultimoBackup || Date.now() - new Date(ultimoBackup) > 7 * 864e5)
    ? `<div class="cartao lembrete"><b>Faça um backup.</b> As provas ficam só neste aparelho. <a href="#/backup">Baixar o backup</a></div>` : '';
  tela().innerHTML = `
    <section class="cabeca"><h1>Suas provas</h1><a class="botao principal grande" href="#/nova">+ Colar uma prova</a></section>
    ${!eu.nome ? cartaoNomeAparelho() : ''}
    ${!escolas.length ? `<div class="cartao dica"><b>Primeiro passo:</b> cadastre sua escola para a prova sair com o cabeçalho certo. <a href="#/escola/nova">Cadastrar escola</a></div>` : ''}
    ${lembrete}
    ${provas.length ? `<div class="lista">${lista}</div>` : `<div class="cartao vazio"><img src="../img/apple-touch-icon.png" alt="" width="64" height="64">
      <h2>Nenhuma prova ainda</h2><p>Monte a prova com o Assistente de Provas Kauê no Claude, no ChatGPT ou no Gemini, copie o bloco de código da resposta e cole aqui.</p>
      <a class="botao principal" href="#/nova">Colar a primeira prova</a></div>`}`;
  ligarNomeAparelho(() => navegar());
}

// ---------- nome deste aparelho ----------
function cartaoNomeAparelho(atual = '') {
  return `<div class="cartao nome-aparelho"><h2>${atual ? 'Este aparelho' : 'Dê um nome a este aparelho'}</h2>
    <p>Cada prova, nota e backup vai mostrar em qual aparelho e a que horas foi feito. Assim, quando você usar o computador e o celular, sabe de onde veio cada coisa.</p>
    <div class="linha-codigo"><input id="nomeAparelho" class="campo-form" maxlength="40" value="${esc(atual)}" placeholder="Ex.: PC do Gustavo, Telefone 1, PC da escola" aria-label="Nome deste aparelho">
      <button class="botao principal" id="salvarAparelho">Salvar</button></div>
    <p class="sugestoes">${SUGESTOES_DE_NOME.map(n => `<button class="botao pequeno sutil" data-sugestao="${esc(n)}">${esc(n)}</button>`).join('')}</p>
    <p class="ajuda">O nome fica só neste aparelho. Use um nome diferente em cada um.</p></div>`;
}
function ligarNomeAparelho(depois) {
  const campo = $('#nomeAparelho'); if (!campo) return;
  $$('[data-sugestao]').forEach(b => b.addEventListener('click', () => { campo.value = b.dataset.sugestao; campo.focus(); }));
  const salvar = async () => {
    if (!campo.value.trim()) { aviso('Escreva um nome para este aparelho.', 'erro'); campo.focus(); return; }
    const a = await nomearAparelho(campo.value);
    aviso(`Este aparelho agora se chama "${a.nome}".`);
    depois && depois();
  };
  $('#salvarAparelho').addEventListener('click', salvar);
  campo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); salvar(); } });
}

// ---------- colar / editar o texto da prova ----------
async function telaTexto(id) {
  const existente = id ? await db.pegar('provas', id) : null;
  tela().innerHTML = `
    <section class="cabeca"><h1>${existente ? 'Editar o texto da prova' : 'Colar uma prova'}</h1></section>
    <div class="cartao">
      <label for="texto" class="rotulo">Cole aqui a resposta da IA</label>
      <p class="ajuda">Pode colar a resposta inteira: o Kauê lê só o que está dentro do bloco de código.</p>
      <textarea id="texto" class="texto-prova" spellcheck="false" placeholder="# PROVA&#10;titulo: Prova de Artes – 3º trimestre&#10;...">${esc(existente ? existente.texto : '')}</textarea>
      <div class="acoes"><button class="botao principal" id="ler">Ler a prova</button>
        ${existente ? `<a class="botao" href="#/prova/${id}">Cancelar</a>` : `<a class="botao" href="#/">Cancelar</a>`}</div>
    </div>
    <div id="resultado"></div>`;
  const ta = $('#texto');
  const ler = () => mostrarLeitura(ta, existente);
  $('#ler').addEventListener('click', ler);
  if (existente) ler();
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

function mostrarLeitura(ta, existente) {
  const res = lerFormatoKaue(ta.value);
  const r = res.resumo || {};
  const p = res.prova;
  const PLURAL = { multipla: ['múltipla escolha', 'múltipla escolha'], vf: ['verdadeiro ou falso', 'verdadeiro ou falso'], associe: ['associar colunas', 'associar colunas'],
    complete: ['completar lacunas', 'completar lacunas'], discursiva: ['discursiva', 'discursivas'] };
  const tipos = Object.entries(r.porTipo || {}).map(([t, n]) => `${n} ${PLURAL[t] ? PLURAL[t][n > 1 ? 1 : 0] : t}`).join(', ');
  const itemMsg = (e, cls) => `<li class="${cls}"><button class="linha" data-linha="${e.linha}">linha ${e.linha}</button> ${esc(e.msg)}</li>`;
  const ok = !res.erros.length && res.questoes.length;
  const somaOk = p.valor_total == null || Math.abs(r.somaValores - p.valor_total) < 0.011;
  $('#resultado').innerHTML = `
    <div class="cartao ${ok ? 'tudo-certo' : 'com-erros'}">
      <h2>${ok ? (res.avisos.length ? 'Prova lida, com avisos' : 'Prova lida sem erros') : 'A prova tem erros para corrigir'}</h2>
      ${res.questoes.length ? `<p><b>${esc(p.titulo || 'Sem título')}</b>${p.disciplina ? ' · ' + esc(p.disciplina) : ''}${p.serie ? ' · ' + esc(p.turma || p.serie) : ''}</p>
      <ul class="resumo">
        <li>${r.questoes} questões: ${tipos}</li>
        ${r.blocos ? `<li>${r.blocos} bloco${r.blocos > 1 ? 's' : ''} com texto-base</li>` : ''}
        <li class="${somaOk ? '' : 'alerta'}">Soma dos valores: ${num(r.somaValores)}${p.valor_total != null ? ` de ${num(p.valor_total)}` : ''}</li>
        ${r.imagens && r.imagens.length ? `<li>${r.imagens.length} ${r.imagens.length > 1 ? 'imagens' : 'imagem'} para anexar depois</li>` : ''}
        ${provaPedeAdaptada(res) ? `<li>Versão adaptada: ${r.naAdaptada} questões</li>` : ''}
        ${r.paraRevisar && r.paraRevisar.length ? `<li class="alerta">Para revisar: questão ${r.paraRevisar.join(', ')}</li>` : ''}
      </ul>` : ''}
      ${res.erros.length ? `<h3>Erros (${res.erros.length})</h3><ul class="msgs">${res.erros.map(e => itemMsg(e, 'erro')).join('')}</ul>` : ''}
      ${res.avisos.length ? `<h3>Avisos (${res.avisos.length})</h3><ul class="msgs">${res.avisos.map(e => itemMsg(e, 'avisoi')).join('')}</ul>` : ''}
      ${!ok ? '<p class="ajuda">Corrija no texto acima (toque em "linha" para ir até o ponto) e leia de novo. Se preferir, peça à IA para corrigir e cole a resposta nova.</p>' : ''}
      ${ok ? `<div class="acoes"><button class="botao principal" id="salvar">${existente ? 'Salvar as alterações' : 'Continuar'}</button></div>` : ''}
      ${ok && existente && existente.impressaEm ? '<p class="ajuda alerta">Esta prova já foi impressa. Se você mudar as questões, as versões impressas deixam de bater com o gabarito novo.</p>' : ''}
    </div>
    ${ok ? `<div class="cartao"><h2>Prévia das questões</h2><div class="previa">${previaQuestoes(res)}</div></div>` : ''}`;
  $$('#resultado .linha').forEach(b => b.addEventListener('click', () => irParaLinha(ta, Number(b.dataset.linha))));
  const salvar = $('#salvar');
  if (salvar) salvar.addEventListener('click', async () => {
    salvar.disabled = true;
    const id = await salvarProva(ta.value, res, existente);
    location.hash = `#/prova/${id}`;
  });
}

function previaQuestoes(res) {
  return res.questoes.map((q, k) => {
    let extra = '';
    if (q.tipo === 'multipla') extra = `<ol class="mini">${q.alternativas.map(a => `<li class="${a.certa ? 'certa' : ''}">${a.letra}) ${esc(a.texto)}</li>`).join('')}</ol>`;
    if (q.tipo === 'vf') extra = `<ol class="mini">${q.itensVF.map(v => `<li><b>${v.resposta}</b> ${esc(v.texto)}</li>`).join('')}</ol>`;
    if (q.tipo === 'associe') extra = `<ol class="mini">${q.colunaB.map(b => `<li><b>(${b.resposta})</b> ${esc(b.texto)}</li>`).join('')}</ol>`;
    if (q.tipo === 'discursiva') extra = `<p class="mini"><b>Resposta esperada:</b> ${esc(q.resposta)}</p>`;
    return `<div class="pq"><span class="pq-n">${k + 1}</span><div><span class="etq">${NOMES_TIPO[q.tipo] || ''}${q.valor != null ? ' · ' + num(q.valor) + ' pt' : ''}${q.revisar ? ' · <b class="alerta">revisar</b>' : ''}</span>
      ${textoHTML(q.enunciado, { lacunas: false })}${extra}</div></div>`;
  }).join('');
}

async function proximoNumero() {
  const usados = new Set((await db.todos('provas')).map(p => p.numero));
  for (let n = 1; n < 1000; n++) if (!usados.has(n)) return n;
  throw new Error('Este aparelho já tem 999 provas. Apague algumas para criar outras.');
}

async function salvarProva(texto, res, existente) {
  const cb = await carimbo(); const agora = cb.em;
  const p = res.prova;
  const prova = existente ? { ...existente } : { id: uid(), numero: await proximoNumero(), criadaEm: agora, criada: cb, config: configPadrao(res) };
  if (!existente) {
    const escolas = await db.todos('escolas');
    const nome = (p.escola || '').toLowerCase();
    const achou = escolas.find(e => nome && e.nome.toLowerCase() === nome) || (escolas.length === 1 ? escolas[0] : null);
    prova.escolaId = achou ? achou.id : null;
  }
  Object.assign(prova, { texto, atualizadaEm: agora, alterada: cb, titulo: p.titulo || '', disciplina: p.disciplina || '', serie: p.serie || '',
    turma: p.turma || '', questoes: res.questoes.length });
  await db.guardar('provas', prova);
  await db.pedirArmazenamentoPersistente();
  aviso(existente ? 'Prova atualizada.' : 'Prova guardada neste aparelho.');
  return prova.id;
}

// ---------- uma prova: escola, imagens, versões, impressão ----------
async function telaProva(id) {
  liberarUrls();
  const dados = await carregarProva(id);
  if (!dados) { location.hash = '#/'; return; }
  const { prova, res } = dados;
  const escolas = await db.todos('escolas');
  const imgs = imagensCitadas(res);
  const arquivos = await mapaDeArquivos(prova, dados.escola);
  const montadas = montarTudo(prova, res);
  const c = prova.config;
  const mudou = prova.impressao && prova.impressao.assinatura !== assinatura(prova);
  const temMultipla = res.questoes.some(q => q.tipo === 'multipla');

  const linhaImg = i => {
    const a = arquivos.get(i.chave);
    return `<li class="img-item">${a ? `<img src="${urlDe(a.blob)}" alt="">` : `<div class="img-falta">${i.inserir ? 'inserir' : 'falta'}</div>`}
      <div><b>${esc(i.inserir ? (i.legenda || 'Imagem a inserir') : i.arquivo)}</b><br><span class="meta">${esc(i.inserir ? 'sem arquivo no material' : i.legenda || '')} · ${esc(i.onde.join(', '))}</span></div>
      <label class="botao pequeno">${a ? 'Trocar' : 'Anexar'}<input type="file" accept="image/*" data-chave="${esc(i.chave)}" hidden></label>
      ${a ? `<button class="botao pequeno sutil" data-tirar="${esc(i.chave)}">Tirar</button>` : ''}</li>`;
  };
  const opcao = (nome, rotulo, marcado, ajuda = '') => `<label class="chave"><input type="checkbox" data-cfg="${nome}" ${marcado ? 'checked' : ''}><span>${rotulo}${ajuda ? `<small>${ajuda}</small>` : ''}</span></label>`;
  const versoesLinhas = montadas.map(m => {
    const resumo = m.questoes.filter(q => q.tipo === 'multipla').map(q => q.gabarito).join('').toUpperCase();
    const qual = m.adaptada ? 'adaptada' : m.letra;
    return `<tr><td><b>${m.adaptada ? 'Adaptada' : m.letra}</b></td><td class="codigo">${m.codigo}</td><td class="gab-mini">${resumo || '—'}</td>
      <td class="acoes-linha"><a class="botao pequeno" href="#/imprimir/${prova.id}/${qual}">PDF</a> <button class="botao pequeno" data-word="${qual}">Word</button></td></tr>`;
  }).join('');

  tela().innerHTML = `
    <section class="cabeca"><div><p class="sobre">Prova nº ${String(prova.numero).padStart(3, '0')}</p><h1>${esc(prova.titulo || 'Prova')}</h1>
      <p class="meta">${[res.prova.disciplina, res.prova.turma || res.prova.serie, res.prova.periodo].filter(Boolean).map(esc).join(' · ')} · ${res.questoes.length} questões · ${num(res.resumo.somaValores)} pontos</p>
      <p class="meta pequeno carimbo">${prova.criada || prova.criadaEm ? `Criada em ${esc(descreverCarimbo(prova.criada || prova.criadaEm))}` : ''}${prova.alterada && (!prova.criada || prova.alterada.em !== prova.criada.em) ? ` · Alterada em ${esc(descreverCarimbo(prova.alterada))}` : ''}${prova.impressao && prova.impressao.aparelho ? ` · Impressa em ${esc(descreverCarimbo(prova.impressao.aparelho))}` : ''}</p></div></section>
    ${res.erros.length ? `<div class="cartao com-erros"><b>O texto desta prova tem erros.</b> <a href="#/prova/${id}/texto">Corrigir</a></div>` : ''}
    ${mudou ? `<div class="cartao lembrete"><b>A prova mudou depois da impressão de ${dataCurta(prova.impressao.em)}.</b> As folhas já impressas não batem com as versões de agora. Imprima de novo.</div>` : ''}

    <div class="grade-cartoes">
    <div class="cartao"><h2>1. Escola e cabeçalho</h2>
      <select id="escola" class="campo-form"><option value="">Sem escola (cabeçalho simples)</option>${escolas.map(e => `<option value="${e.id}" ${e.id === prova.escolaId ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
      <p class="ajuda"><a href="#/escola/nova?voltar=${prova.id}">Cadastrar uma escola</a>${prova.escolaId ? ` · <a href="#/escola/${prova.escolaId}?voltar=${prova.id}">Editar o cabeçalho</a>` : ''}</p></div>

    <div class="cartao"><h2>2. Imagens</h2>
      ${imgs.length ? `<ul class="imgs">${imgs.map(linhaImg).join('')}</ul><p class="ajuda">Imagem que faltar sai como um quadro com a descrição, para você colar depois.</p>` : '<p class="ajuda">Esta prova não usa imagens.</p>'}</div>
    </div>

    <div class="cartao"><h2>3. Versões</h2>
      <div class="linha-form"><span class="rotulo">Quantas versões</span><div class="segmentos" id="quantas">${[1, 2, 3, 4].map(n => `<button data-n="${n}" class="${c.versoes === n ? 'ativo' : ''}">${n === 1 ? 'Só A' : 'A–' + LETRAS_VERSAO[n - 1]}</button>`).join('')}</div></div>
      ${opcao('embaralharAlternativas', 'Embaralhar as alternativas', c.embaralharAlternativas, 'A versão A fica como foi escrita; B, C e D mudam a ordem.')}
      ${opcao('embaralharQuestoes', 'Embaralhar a ordem das questões', c.embaralharQuestoes, 'Só dentro de cada bloco; o texto-base continua antes das suas questões.')}
      ${opcao('adaptada', 'Versão adaptada', c.adaptada, 'Uma coluna, letra maior e menos alternativas.')}
      ${c.adaptada && temMultipla ? `<div class="linha-form recuo"><span class="rotulo">Alternativas na adaptada</span><div class="segmentos" id="altAdapt">${[2, 3].map(n => `<button data-n="${n}" class="${c.adaptadaAlternativas === n ? 'ativo' : ''}">${n}</button>`).join('')}</div></div>
        <p class="ajuda recuo">Vale para as questões sem regra própria. Quando a prova diz "manter a, e", a regra da prova vale.</p>` : ''}
    </div>

    <div class="cartao"><h2>4. Aparência</h2>
      <div class="linha-form"><span class="rotulo">Colunas</span><div class="segmentos" id="colunas">${[1, 2].map(n => `<button data-n="${n}" class="${c.colunas === n ? 'ativo' : ''}">${n}</button>`).join('')}</div></div>
      <div class="linha-form"><span class="rotulo">Fonte</span><select id="fonte" class="campo-form curto">${Object.entries(FONTES_PROVA).map(([k, f]) => `<option value="${k}" ${c.fonte === k ? 'selected' : ''}>${f.nome}</option>`).join('')}</select></div>
      <div class="linha-form"><span class="rotulo">Tamanho da letra</span><div class="segmentos" id="tamanho">${[10, 10.5, 11, 12].map(n => `<button data-n="${n}" class="${c.tamanho === n ? 'ativo' : ''}">${num(n)}</button>`).join('')}</div></div>
      ${opcao('mostrarValor', 'Mostrar o valor de cada questão', c.mostrarValor)}
      ${temMultipla ? opcao('grade', 'Gabarito para o aluno marcar (grade com bolinhas)', c.grade) : ''}
    </div>

    <div class="cartao destaque"><h2>5. Imprimir</h2>
      <table class="tabela-versoes"><thead><tr><th>Versão</th><th>Código</th><th>Gabarito</th><th></th></tr></thead><tbody>${versoesLinhas}</tbody></table>
      <div class="acoes">
        <a class="botao principal" href="#/imprimir/${prova.id}/todas">Todas as versões em PDF</a>
        <a class="botao" href="#/imprimir/${prova.id}/gabarito">Gabarito em PDF</a>
        <button class="botao" data-word="gabarito">Gabarito em Word</button>
      </div>
      <p class="ajuda">O código vai impresso em cada folha. Na correção, você digita o código e o Kauê sabe qual gabarito usar.</p>
    </div>

    <div class="cartao"><h2>Mais</h2><div class="acoes">
      <a class="botao" href="#/prova/${prova.id}/texto">Editar o texto</a>
      <button class="botao" id="exportar">Enviar para outro aparelho</button>
      <button class="botao" id="duplicar">Duplicar</button>
      <button class="botao perigo" id="excluir">Excluir</button></div>
      <p class="ajuda">"Enviar para outro aparelho" baixa um arquivo com esta prova, a escola e as imagens. No outro aparelho, abra o Kauê em Backup e escolha o arquivo.</p></div>`;

  // escola
  $('#escola').addEventListener('change', async e => { prova.escolaId = e.target.value || null; await salvarCfg(prova); telaProva(id); });
  // imagens
  $$('input[type=file][data-chave]').forEach(inp => inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    const blob = await prepararImagem(f);
    const { largura, altura } = await medirImagem(blob);
    await db.guardar('arquivos', { id: `${prova.id}::${inp.dataset.chave}`, dono: prova.id, chave: inp.dataset.chave, nome: f.name, tipo: blob.type || f.type, blob, largura, altura });
    await salvarCfg(prova); aviso('Imagem anexada.'); telaProva(id);
  }));
  $$('[data-tirar]').forEach(b => b.addEventListener('click', async () => { await db.apagar('arquivos', `${prova.id}::${b.dataset.tirar}`); await salvarCfg(prova); telaProva(id); }));
  // configurações
  $$('[data-cfg]').forEach(inp => inp.addEventListener('change', async () => { prova.config[inp.dataset.cfg] = inp.checked; await salvarCfg(prova); telaProva(id); }));
  const segmento = (sel, chave) => { const el = $(sel); if (el) el.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return; prova.config[chave] = Number(b.dataset.n); await salvarCfg(prova); telaProva(id); }); };
  segmento('#quantas', 'versoes'); segmento('#altAdapt', 'adaptadaAlternativas'); segmento('#colunas', 'colunas'); segmento('#tamanho', 'tamanho');
  $('#fonte').addEventListener('change', async e => { prova.config.fonte = e.target.value; await salvarCfg(prova); });
  // Word
  $$('[data-word]').forEach(b => b.addEventListener('click', () => exportarWord(prova.id, b.dataset.word, b)));
  // mais
  $('#exportar').addEventListener('click', async () => {
    const dadosBk = await backupDaProva(prova.id);
    baixar(`kaue-prova-${String(prova.numero).padStart(3, '0')}-${nomeArquivo(prova.titulo)}-${await sufixoArquivo()}.json`, new Blob([JSON.stringify(dadosBk)], { type: 'application/json' }));
  });
  $('#duplicar').addEventListener('click', async () => {
    const cb = await carimbo();
    const nova = { ...prova, id: uid(), numero: await proximoNumero(), criadaEm: cb.em, criada: cb, atualizadaEm: cb.em, alterada: cb,
      titulo: prova.titulo + ' (cópia)', impressao: null, impressaEm: null };
    nova.texto = prova.texto;
    await db.guardar('provas', nova);
    for (const a of await db.arquivosDe(prova.id)) await db.guardar('arquivos', { ...a, id: `${nova.id}::${a.chave}`, dono: nova.id });
    aviso('Prova duplicada, com número novo.'); location.hash = `#/prova/${nova.id}`;
  });
  $('#excluir').addEventListener('click', async () => {
    if (!confirm(`Excluir a prova nº ${prova.numero} (${prova.titulo})? As imagens dela também saem deste aparelho. Não dá para desfazer.`)) return;
    await db.apagarArquivosDe(prova.id); await db.apagar('provas', prova.id);
    aviso('Prova excluída.'); location.hash = '#/';
  });
}

async function salvarCfg(prova) {
  const cb = await carimbo();
  prova.atualizadaEm = cb.em; prova.alterada = cb;
  await db.guardar('provas', prova);
}

// marca a impressão: guarda os gabaritos como foram impressos (a correção vai usar esta cópia)
async function registrarImpressao(prova, montadas) {
  const atual = await db.pegar('provas', prova.id);
  atual.impressaEm = atual.impressaEm || new Date().toISOString();
  atual.impressao = { em: new Date().toISOString(), aparelho: await carimbo(), assinatura: assinatura({ ...atual, config: prova.config }),
    versoes: montadas.map(m => ({ versao: m.versao, letra: m.letra, codigo: m.codigo, total: m.total, adaptada: m.adaptada, gabarito: m.gabarito })) };
  await db.guardar('provas', atual);
}

// ---------- visualizar e imprimir ----------
async function telaImprimir(id, qual) {
  const dados = await carregarProva(id);
  if (!dados) { location.hash = '#/'; return; }
  const { prova, res, escola } = dados;
  const montadas = montarTudo(prova, res);
  const arquivos = await mapaDeArquivos(prova, escola);
  const urls = new Map([...arquivos].map(([k, a]) => [k, urlDe(a.blob)]));
  const opcoes = prova.config;
  const info = { professor: await professorPadrao(escola) };
  let escolhidas = montadas, html;
  if (qual === 'gabarito') html = gabaritoHTML({ prova: res.prova, montadas });
  else {
    if (qual !== 'todas') escolhidas = montadas.filter(m => (qual === 'adaptada' ? m.adaptada : m.letra === qual && !m.adaptada));
    html = escolhidas.map(m => provaHTML({ prova: res.prova, montada: m, escola, urls, opcoes, info })).join('');
  }
  const rotulo = qual === 'gabarito' ? 'Gabarito' : qual === 'todas' ? 'Todas as versões' : qual === 'adaptada' ? 'Versão adaptada' : `Versão ${qual}`;
  document.getElementById('css-paginas').textContent = cssPaginas(montadas, res.prova, { numerar: qual !== 'todas', gerado: await textoGerado() });
  document.body.classList.add('modo-impressao');
  const fonte = (FONTES_PROVA[opcoes.fonte] || FONTES_PROVA.atkinson).css;
  tela().innerHTML = `
    <div class="barra-impressao nao-imprimir">
      <a class="botao" href="#/prova/${id}">‹ Voltar</a>
      <div class="barra-titulo"><b>${esc(res.prova.titulo || 'Prova')}</b> · ${rotulo}</div>
      <button class="botao principal" id="imprimir">Imprimir ou salvar PDF</button>
    </div>
    <p class="dica-impressao nao-imprimir">Na janela de impressão, escolha <b>Salvar como PDF</b> para ter o arquivo, ou a sua impressora. Deixe <b>Cabeçalhos e rodapés</b> desmarcado e as margens no padrão.</p>
    <div class="folhas" style="--fonte-prova:${fonte};--tam:${opcoes.tamanho || 10}pt">${html}</div>`;
  document.title = `${res.prova.titulo || 'Prova'} – ${rotulo}`;
  $('#imprimir').addEventListener('click', async () => {
    if (qual !== 'gabarito') await registrarImpressao(prova, montadas);
    window.print();
  });
  window.addEventListener('hashchange', () => { document.title = 'Kauê'; }, { once: true });
}

async function exportarWord(id, qual, botao) {
  const textoAntes = botao ? botao.textContent : '';
  if (botao) { botao.disabled = true; botao.textContent = 'Gerando…'; }
  try {
    const { provaDocx, gabaritoDocx } = await import('./word.js');
    const { prova, res, escola } = await carregarProva(id);
    const montadas = montarTudo(prova, res);
    const base = `${String(prova.numero).padStart(3, '0')}-${nomeArquivo(res.prova.titulo)}`;
    if (qual === 'gabarito') {
      baixar(`gabarito-${base}.docx`, await gabaritoDocx({ prova: res.prova, montadas, gerado: await textoGerado() }));
    } else {
      const m = montadas.find(x => (qual === 'adaptada' ? x.adaptada : x.letra === qual && !x.adaptada));
      const arquivos = await mapaDeArquivos(prova, escola);
      const blob = await provaDocx({ prova: res.prova, montada: m, escola, arquivos, opcoes: prova.config, info: { professor: await professorPadrao(escola) } });
      baixar(`prova-${base}-${qual === 'adaptada' ? 'adaptada' : 'versao-' + qual}.docx`, blob);
      await registrarImpressao(prova, montadas);
    }
  } catch (e) { console.error(e); aviso('Não consegui gerar o Word: ' + e.message, 'erro'); }
  finally { if (botao) { botao.disabled = false; botao.textContent = textoAntes; } }
}

// "Gerado em 25/11/2026 às 08:12 · PC do Gustavo"
async function textoGerado() {
  const a = await aparelho();
  return `Gerado em ${dataHora(new Date().toISOString())}${a.nome ? ' · ' + a.nome : ''}`;
}

// ---------- escolas ----------
async function telaEscolas() {
  const escolas = await db.todos('escolas');
  const modos = { campos: 'Campos', imagem: 'Imagem da escola', branco: 'Em branco' };
  tela().innerHTML = `<section class="cabeca"><h1>Escolas</h1><a class="botao principal" href="#/escola/nova">+ Nova escola</a></section>
    ${escolas.length ? `<div class="lista">${escolas.map(e => `<a class="cartao prova-item" href="#/escola/${e.id}"><div><h3>${esc(e.nome)}</h3><p class="meta">Cabeçalho: ${modos[e.modo] || 'Campos'}${e.alterada ? ` · alterada em ${esc(descreverCarimbo(e.alterada))}` : ''}</p></div></a>`).join('')}</div>`
      : '<div class="cartao vazio"><h2>Nenhuma escola</h2><p>Cada escola guarda o seu cabeçalho: o nome e a logo, uma imagem pronta ou um espaço em branco.</p></div>'}`;
}

const escolaPadrao = () => ({ id: uid(), nome: '', modo: 'campos', professor: '', alturaBranco: 35, camposNaImagem: true, camposNoBranco: false,
  areaTitulo: { ativa: false, x: 24, y: 27, w: 59, h: 47 }, campos: { professor: true, serie: true, data: true, nota: true, nome: true, numero: true }, extra: { rotulo: '', valor: '' } });

async function telaEscola(idParam) {
  const voltar = new URLSearchParams(location.hash.split('?')[1] || '').get('voltar');
  const id = idParam.split('?')[0];
  const nova = id === 'nova';
  const escola = nova ? escolaPadrao() : { ...escolaPadrao(), ...(await db.pegar('escolas', id)) };
  if (!nova && !escola.nome) { location.hash = '#/escolas'; return; }
  const arqs = new Map((await db.arquivosDe(escola.id)).map(a => [a.chave, a]));
  const pendentes = new Map(); // imagens escolhidas e ainda não salvas
  const professorCfg = await db.config('professor', '');
  if (nova && !escola.professor) escola.professor = professorCfg;

  const campo = (k, rot) => `<label class="chave inline"><input type="checkbox" data-campo="${k}" ${escola.campos[k] !== false ? 'checked' : ''}><span>${rot}</span></label>`;
  tela().innerHTML = `
    <section class="cabeca"><h1>${nova ? 'Nova escola' : esc(escola.nome)}</h1></section>
    <div class="cartao form">
      <label class="rotulo" for="nome">Nome da escola</label><input id="nome" class="campo-form" value="${esc(escola.nome)}" placeholder="Colégio Força Máxima">
      <label class="rotulo" for="prof">Professor(a) no cabeçalho</label><input id="prof" class="campo-form" value="${esc(escola.professor || '')}" placeholder="Seu nome, como deve sair na prova">
      <p class="ajuda">Se a prova trouxer o campo "professor", vale o da prova.</p>
      <span class="rotulo">Tipo de cabeçalho</span>
      <div class="modos">
        ${[['campos', 'Campos', 'Nome e logo da escola, título e quadros para preencher'], ['imagem', 'Imagem da escola', 'A faixa pronta da escola, com o título por cima ou abaixo'], ['branco', 'Em branco', 'Um espaço vazio no topo, para papel timbrado ou carimbo']]
          .map(([v, t, d]) => `<label class="modo"><input type="radio" name="modo" value="${v}" ${escola.modo === v ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}
      </div>
      <div id="op-campos" class="sub-op">
        <label class="rotulo">Logo da escola (opcional)</label>
        <label class="botao pequeno">${arqs.get('escola:logo') ? 'Trocar a logo' : 'Escolher a logo'}<input type="file" accept="image/*" data-img="escola:logo" hidden></label>
        ${arqs.get('escola:logo') ? '<button class="botao pequeno sutil" data-tirar="escola:logo">Tirar</button>' : ''}
      </div>
      <div id="op-imagem" class="sub-op">
        <label class="rotulo">Imagem do cabeçalho</label>
        <p class="ajuda">A faixa da escola, de preferência larga (como 1800 × 280 pixels).</p>
        <label class="botao pequeno">${arqs.get('escola:cabecalho') ? 'Trocar a imagem' : 'Escolher a imagem'}<input type="file" accept="image/*" data-img="escola:cabecalho" hidden></label>
        <label class="chave"><input type="checkbox" id="tituloSobre" ${escola.areaTitulo.ativa ? 'checked' : ''}><span>Escrever o título dentro da imagem<small>Ajuste a área abaixo para cair no espaço livre da faixa.</small></span></label>
        <div id="area" class="area-titulo">${['x:Da esquerda', 'y:Do topo', 'w:Largura', 'h:Altura'].map(s => { const [k, r] = s.split(':');
          return `<label>${r} <input type="range" min="0" max="100" value="${escola.areaTitulo[k]}" data-area="${k}"><output>${escola.areaTitulo[k]}%</output></label>`; }).join('')}</div>
        <label class="chave"><input type="checkbox" id="camposNaImagem" ${escola.camposNaImagem !== false ? 'checked' : ''}><span>Mostrar os campos abaixo da imagem</span></label>
      </div>
      <div id="op-branco" class="sub-op">
        <label class="rotulo" for="alturaBranco">Altura do espaço em branco (mm)</label><input id="alturaBranco" type="number" min="10" max="80" class="campo-form curto" value="${escola.alturaBranco}">
        <label class="chave"><input type="checkbox" id="camposNoBranco" ${escola.camposNoBranco ? 'checked' : ''}><span>Mostrar os campos abaixo do espaço</span></label>
      </div>
      <span class="rotulo">Campos do cabeçalho</span>
      <div class="campos-lista">${campo('professor', 'Professor(a)')}${campo('serie', 'Turma')}${campo('data', 'Data')}${campo('nota', 'Nota')}${campo('nome', 'Nome do aluno')}${campo('numero', 'Nº')}</div>
      <div class="extra"><label>Campo a mais <input id="extraRot" class="campo-form" value="${esc(escola.extra.rotulo)}" placeholder="Ex.: Unidade"></label>
        <label>Valor <input id="extraVal" class="campo-form" value="${esc(escola.extra.valor)}" placeholder="Ex.: Jardim Primavera"></label></div>
      <div class="acoes"><button class="botao principal" id="salvar">Salvar</button>
        <a class="botao" href="${voltar ? '#/prova/' + voltar : '#/escolas'}">Cancelar</a>
        ${nova ? '' : '<button class="botao perigo" id="excluir">Excluir escola</button>'}</div>
    </div>
    <div class="cartao"><h2>Prévia do cabeçalho</h2><div class="previa-cab folhas" id="previaCab"></div></div>`;

  const ler = () => {
    escola.nome = $('#nome').value.trim();
    escola.professor = $('#prof').value.trim();
    escola.modo = ($('input[name=modo]:checked') || {}).value || 'campos';
    escola.areaTitulo.ativa = $('#tituloSobre').checked;
    $$('[data-area]').forEach(r => { escola.areaTitulo[r.dataset.area] = Number(r.value); r.nextElementSibling.textContent = r.value + '%'; });
    escola.camposNaImagem = $('#camposNaImagem').checked;
    escola.alturaBranco = Number($('#alturaBranco').value) || 35;
    escola.camposNoBranco = $('#camposNoBranco').checked;
    $$('[data-campo]').forEach(cb => { escola.campos[cb.dataset.campo] = cb.checked; });
    escola.extra = { rotulo: $('#extraRot').value.trim(), valor: $('#extraVal').value.trim() };
  };
  const atualizar = () => {
    ler();
    ['campos', 'imagem', 'branco'].forEach(m => { $(`#op-${m}`).hidden = escola.modo !== m; });
    $('#area').hidden = !escola.areaTitulo.ativa;
    const urls = new Map();
    for (const k of ['escola:logo', 'escola:cabecalho']) {
      const b = pendentes.get(k) || (arqs.get(k) && arqs.get(k).blob);
      if (b) urls.set(k, urlDe(b));
    }
    const exemplo = { titulo: 'Prova de Artes – 3º trimestre', disciplina: 'Artes', serie: '6º ano', tempo: '50 minutos' };
    const montada = { versao: 1, letra: 'A', codigo: '00118', adaptada: false, itens: [], questoes: [], total: 10 };
    const html = provaHTML({ prova: exemplo, montada, escola, urls, opcoes: { grade: false }, info: { professor: escola.professor } });
    $('#previaCab').innerHTML = html;
  };
  tela().addEventListener('input', atualizar);
  tela().addEventListener('change', atualizar);
  $$('input[data-img]').forEach(inp => inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    pendentes.set(inp.dataset.img, await prepararImagem(f, 2400));
    inp.parentElement.firstChild.textContent = 'Imagem escolhida ✓ ';
    atualizar();
  }));
  $$('[data-tirar]').forEach(b => b.addEventListener('click', () => { pendentes.set(b.dataset.tirar, null); arqs.delete(b.dataset.tirar); b.remove(); atualizar(); }));
  $('#salvar').addEventListener('click', async () => {
    ler();
    if (!escola.nome) { aviso('Escreva o nome da escola.', 'erro'); $('#nome').focus(); return; }
    const cb = await carimbo();
    if (!escola.criada) escola.criada = cb;
    escola.alterada = cb; escola.atualizadaEm = cb.em;
    await db.guardar('escolas', escola);
    for (const [chave, blob] of pendentes) {
      const idArq = `${escola.id}::${chave}`;
      if (!blob) { await db.apagar('arquivos', idArq); continue; }
      const { largura, altura } = await medirImagem(blob);
      await db.guardar('arquivos', { id: idArq, dono: escola.id, chave, nome: chave, tipo: blob.type, blob, largura, altura });
    }
    if (escola.professor && !professorCfg) await db.definirConfig('professor', escola.professor);
    if (voltar) { const p = await db.pegar('provas', voltar); if (p && !p.escolaId) { p.escolaId = escola.id; await salvarCfg(p); } }
    aviso('Escola salva.');
    location.hash = voltar ? `#/prova/${voltar}` : '#/escolas';
  });
  const exc = $('#excluir');
  if (exc) exc.addEventListener('click', async () => {
    if (!confirm(`Excluir a escola ${escola.nome}? As provas continuam, com cabeçalho simples.`)) return;
    await db.apagarArquivosDe(escola.id); await db.apagar('escolas', escola.id);
    for (const p of await db.todos('provas')) if (p.escolaId === escola.id) { p.escolaId = null; await db.guardar('provas', p); }
    location.hash = '#/escolas';
  });
  atualizar();
}

// ---------- backup ----------
async function telaBackup() {
  const ultimo = await db.config('ultimoBackup');
  const eu = await aparelho();
  const persistente = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  let uso = '';
  try { const e = await navigator.storage.estimate(); uso = `${(e.usage / 1048576).toFixed(1)} MB usados`; } catch (e) { /* sem suporte */ }
  tela().innerHTML = `
    <section class="cabeca"><h1>Backup</h1><a class="botao" href="#/instrucoes" data-ir="t-aparelhos">Guia completo</a></section>
    ${cartaoNomeAparelho(eu.nome)}
    <div class="cartao"><h2>Baixar o backup</h2>
      <p>As provas, turmas, notas, escolas e imagens ficam guardadas só neste aparelho, neste navegador. O backup é um arquivo com tudo, para guardar no Drive ou levar para outro aparelho.</p>
      <p class="ajuda">O arquivo termina em <b>.json</b>, um formato de texto que só o Kauê precisa ler. Não abra para editar. O nome dele diz de qual aparelho e de que hora ele é, como <code>kaue-backup-${esc(nomeArquivo(eu.nome || 'sem-nome'))}-2026-11-25-0812.json</code>.</p>
      <p class="meta">${ultimo ? 'Último backup: ' + dataHora(ultimo) : 'Nenhum backup feito ainda.'}${uso ? ' · ' + uso : ''}${persistente ? ' · armazenamento protegido' : ''}</p>
      <div class="acoes"><button class="botao principal" id="baixar">Baixar o backup completo</button></div></div>
    <div class="cartao"><h2>Restaurar ou juntar</h2>
      <p>Abra um backup, ou o arquivo de uma prova ou turma que veio de outro aparelho. Antes de mudar qualquer coisa, o Kauê mostra o que vai acontecer.</p>
      <ul class="lista-ajuda">
        <li><b>Nada daqui é apagado.</b> O que está neste aparelho e não está no arquivo continua igual.</li>
        <li><b>Notas:</b> o Kauê junta aluno por aluno. Se a mesma nota foi lançada nos dois aparelhos, fica a mais recente.</li>
        <li><b>Provas e escolas:</b> fica a versão alterada por último.</li>
      </ul>
      <label class="botao">Escolher o arquivo<input type="file" id="arquivo" accept=".json,application/json" hidden></label>
      <div id="resultadoRest"></div></div>
    <div class="cartao"><h2>Sobre</h2><p class="meta">Kauê ${VERSAO_APP} · funciona sem internet depois da primeira abertura. Criado por Gustavo Valentino.</p></div>`;
  ligarNomeAparelho(() => telaBackup());
  $$('[data-ir]').forEach(a => a.addEventListener('click', () => sessionStorage.setItem('kaue-ir', a.dataset.ir)));
  $('#baixar').addEventListener('click', async () => {
    const dados = await backupCompleto();
    baixar(`kaue-backup-${await sufixoArquivo()}.json`, new Blob([JSON.stringify(dados)], { type: 'application/json' }));
    await db.definirConfig('ultimoBackup', new Date().toISOString());
    aviso('Backup baixado.');
  });
  const lista = linhas => `<ul class="resumo-restaurar">${linhas.map(l => `<li class="${l.tipo}">${esc(l.texto)}</li>`).join('')}</ul>`;
  $('#arquivo').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const caixa = $('#resultadoRest');
    try {
      const dados = lerBackup(await f.text());
      const previa = await restaurar(dados, { simular: true });
      caixa.innerHTML = `<div class="previa-restaurar"><h3>${esc(f.name)}</h3>${lista(await resumoEmLinhas(previa))}
        <div class="acoes"><button class="botao principal" id="confirmarRest">Restaurar e juntar</button><button class="botao" id="cancelarRest">Cancelar</button></div></div>`;
      $('#cancelarRest').addEventListener('click', () => { caixa.innerHTML = ''; e.target.value = ''; });
      $('#confirmarRest').addEventListener('click', async () => {
        $('#confirmarRest').disabled = true;
        const r = await restaurar(dados, { incluirConfig: dados.tipo === 'completo' });
        await db.pedirArmazenamentoPersistente();
        caixa.innerHTML = `<div class="previa-restaurar feito"><h3>Pronto</h3>${lista((await resumoEmLinhas(r)).filter(l => l.tipo !== 'origem'))}
          <p class="ajuda">Confira as turmas e provas. Se este aparelho vai continuar o trabalho, envie de volta depois.</p></div>`;
        e.target.value = '';
      });
    } catch (err) { caixa.innerHTML = ''; aviso(err.message, 'erro'); }
  });
}

// ---------- instruções (o mesmo tutorial do portal, guardado no app para funcionar sem internet) ----------
async function telaInstrucoes() {
  tela().innerHTML = `<section class="cabeca"><h1>Instruções</h1><a class="botao" href="../tutorial.html">Abrir no portal</a></section>
    <article class="tutorial no-app">${TUTORIAL.replaceAll('{{IMG}}', '../img/tutorial')}</article>`;
  $$('.tutorial a[href^="#t-"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); const alvo = document.getElementById(a.getAttribute('href').slice(1)); if (alvo) alvo.scrollIntoView({ behavior: 'smooth' }); }));
  const ir = sessionStorage.getItem('kaue-ir');
  if (ir) { sessionStorage.removeItem('kaue-ir'); const alvo = document.getElementById(ir); if (alvo) setTimeout(() => alvo.scrollIntoView(), 50); }
}

// ---------- início do app ----------
window.addEventListener('hashchange', navegar);
window.addEventListener('DOMContentLoaded', () => {
  navegar();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).then(reg => {
      reg.addEventListener('updatefound', () => {
        const nova = reg.installing;
        nova && nova.addEventListener('statechange', () => {
          if (nova.state === 'installed' && navigator.serviceWorker.controller) aviso('Há uma versão nova do Kauê. Feche e abra o app para usar.');
        });
      });
    }).catch(() => {});
  }
});
