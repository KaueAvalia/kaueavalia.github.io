// Kauê — turmas, planilha de notas por período, avaliações e correção pelo código
import * as db from './db.js';
import { $, $$, esc, uid, num, dataCurta, NOMES_TIPO, baixar, nomeArquivo, aviso } from './util.js';
import { PERIODOS_MODELO, ARREDONDAMENTOS, arredondar, nota2, avaliacoesDoPeriodo, notaDe, faltou, totalPeriodo,
  maximoPeriodo, resultadoAno, alunosEmOrdem, lerListaDeAlunos, lerNumero } from './notas.js';
import { marcacaoVazia, pontuar, totalDaCorrecao, notaNaColuna, preencherMultiplas } from './correcao.js';
import { lerCodigo, nomeVersao, LETRAS_VERSAO, VERSAO_ADAPTADA } from './versoes.js';
import { carregarProva, montarTudo, assinatura } from './provas-dados.js';
import { textoHTML } from './render-prova.js';
import { backupDaTurma } from './backup.js';
import { montarXlsx } from './xlsx.js';
import { aparelho, carimbo, descreverCarimbo, dataHora, sufixoArquivo } from './aparelho.js';

const tela = () => document.getElementById('tela');
const fmt = v => (v == null ? '—' : num(v));
const params = () => new URLSearchParams((location.hash.split('?')[1]) || '');

async function pegarTurma(id) {
  const t = await db.pegar('turmas', id);
  if (!t) return null;
  t.notas = t.notas || {}; t.faltas = t.faltas || {}; t.marcas = t.marcas || {}; t.removidos = t.removidos || {}; t.config = { arredondamento: 'decimo', resultadoAno: 'media', ...(t.config || {}) };
  return t;
}
// toda gravação da turma leva o carimbo de aparelho, data e hora
async function salvarTurma(t, cb) {
  cb = cb || await carimbo();
  if (!t.criada) t.criada = cb;
  t.alterada = cb; t.atualizadaEm = cb.em;
  await db.guardar('turmas', t);
}
// cada nota (ou falta) guarda quando e onde foi lançada: é o que decide a junção entre aparelhos
function marcarCelula(t, avId, alunoId, cb) { (t.marcas[avId] = t.marcas[avId] || {})[alunoId] = cb; }
const quemLancou = (t, avId, alunoId) => (t.marcas && t.marcas[avId] && t.marcas[avId][alunoId]) || null;
async function textoGerado(t) {
  const a = await aparelho();
  return `Gerado pelo Kauê em ${dataHora(new Date().toISOString())}${a.nome ? ' · ' + a.nome : ''}${t && t.alterada ? `. Última alteração da turma: ${descreverCarimbo(t.alterada)}` : ''}`;
}

// ---------- lista de turmas ----------
export async function telaTurmas() {
  const turmas = (await db.todos('turmas')).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const escolas = new Map((await db.todos('escolas')).map(e => [e.id, e.nome]));
  tela().innerHTML = `<section class="cabeca"><h1>Turmas</h1><a class="botao principal" href="#/turma/nova">+ Nova turma</a></section>
    ${turmas.length ? `<div class="lista">${turmas.map(t => `<a class="cartao prova-item" href="#/turma/${t.id}">
      <div class="prova-num">${esc(String(t.anoLetivo || ''))}</div>
      <div><h3>${esc(t.nome)}</h3><p class="meta">${[t.disciplina, escolas.get(t.escolaId)].filter(Boolean).map(esc).join(' · ')}</p>
      <p class="meta pequeno">${t.alunos.filter(a => !a.inativo).length} alunos · ${t.avaliacoes.length} avaliações${t.alterada ? ` · alterada em ${esc(descreverCarimbo(t.alterada))}` : ''}</p></div></a>`).join('')}</div>`
    : `<div class="cartao vazio"><h2>Nenhuma turma ainda</h2><p>Cadastre a turma com a lista de alunos. Cada avaliação vira uma coluna da planilha, separada por trimestre ou bimestre, e a correção pelo código lança a nota sozinha.</p>
      <a class="botao principal" href="#/turma/nova">Cadastrar a primeira turma</a></div>`}`;
}

// ---------- criar ou editar a turma ----------
export async function telaTurmaForm(id) {
  const nova = !id;
  const t = nova ? { id: uid(), nome: '', disciplina: '', escolaId: null, anoLetivo: new Date().getFullYear(), periodos: [], alunos: [], avaliacoes: [], notas: {}, faltas: {},
    config: { arredondamento: 'decimo', resultadoAno: 'media' }, divisao: 'trimestre' } : await pegarTurma(id);
  if (!t) { location.hash = '#/turmas'; return; }
  const escolas = await db.todos('escolas');
  tela().innerHTML = `<section class="cabeca"><h1>${nova ? 'Nova turma' : 'Editar a turma'}</h1></section>
    <div class="cartao form">
      <label class="rotulo" for="nome">Nome da turma</label><input id="nome" class="campo-form" value="${esc(t.nome)}" placeholder="6º ano A">
      <label class="rotulo" for="disc">Disciplina</label><input id="disc" class="campo-form" value="${esc(t.disciplina)}" placeholder="Artes">
      <label class="rotulo" for="escola">Escola</label><select id="escola" class="campo-form"><option value="">Sem escola</option>
        ${escolas.map(e => `<option value="${e.id}" ${e.id === t.escolaId ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
      <label class="rotulo" for="ano">Ano letivo</label><input id="ano" class="campo-form curto" type="number" value="${esc(t.anoLetivo)}">
      ${nova ? `<span class="rotulo">Divisão do ano</span><div class="segmentos" id="divisao">${Object.keys(PERIODOS_MODELO).map(k =>
        `<button data-v="${k}" class="${t.divisao === k ? 'ativo' : ''}">${k === 'trimestre' ? 'Trimestres' : k === 'bimestre' ? 'Bimestres' : 'Semestres'}</button>`).join('')}</div>`
      : `<span class="rotulo">Períodos</span>${t.periodos.map(p => `<input class="campo-form periodo" data-id="${p.id}" value="${esc(p.nome)}">`).join('')}`}
      <label class="rotulo" for="arred">Arredondamento do total do período e do ano</label>
      <select id="arred" class="campo-form">${Object.entries(ARREDONDAMENTOS).map(([k, v]) => `<option value="${k}" ${t.config.arredondamento === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label class="rotulo" for="res">Resultado do ano</label>
      <select id="res" class="campo-form"><option value="media" ${t.config.resultadoAno === 'media' ? 'selected' : ''}>Média dos períodos</option>
        <option value="soma" ${t.config.resultadoAno === 'soma' ? 'selected' : ''}>Soma dos períodos</option></select>
      <div class="acoes"><button class="botao principal" id="salvar">${nova ? 'Criar turma' : 'Salvar'}</button>
        <a class="botao" href="${nova ? '#/turmas' : '#/turma/' + t.id}">Cancelar</a>
        ${nova ? '' : '<button class="botao perigo" id="excluir">Excluir turma</button>'}</div>
    </div>`;
  if (nova) $('#divisao').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; t.divisao = b.dataset.v;
    $$('#divisao button').forEach(x => x.classList.toggle('ativo', x === b)); });
  $('#salvar').addEventListener('click', async () => {
    t.nome = $('#nome').value.trim(); t.disciplina = $('#disc').value.trim(); t.escolaId = $('#escola').value || null;
    t.anoLetivo = Number($('#ano').value) || new Date().getFullYear();
    t.config.arredondamento = $('#arred').value; t.config.resultadoAno = $('#res').value;
    if (!t.nome) { aviso('Escreva o nome da turma.', 'erro'); return; }
    const cb = await carimbo();
    if (nova) { t.periodos = PERIODOS_MODELO[t.divisao].map(n => ({ id: uid(), nome: n })); t.criadaEm = cb.em; }
    else $$('.periodo').forEach(i => { const p = t.periodos.find(x => x.id === i.dataset.id); if (p && i.value.trim()) p.nome = i.value.trim(); });
    t.estrutura = cb;
    await salvarTurma(t, cb);
    aviso(nova ? 'Turma criada. Agora, os alunos.' : 'Turma salva.');
    location.hash = nova ? `#/turma/${t.id}/alunos` : `#/turma/${t.id}`;
  });
  const exc = $('#excluir');
  if (exc) exc.addEventListener('click', async () => {
    if (!confirm(`Excluir a turma ${t.nome}, com todas as notas e correções? Não dá para desfazer. Se quiser guardar, baixe antes o Excel ou o backup.`)) return;
    for (const c of await db.correcoesDaTurma(t.id)) await db.apagar('correcoes', c.id);
    await db.apagar('turmas', t.id); aviso('Turma excluída.'); location.hash = '#/turmas';
  });
}

// ---------- alunos ----------
export async function telaAlunos(id) {
  const t = await pegarTurma(id);
  if (!t) { location.hash = '#/turmas'; return; }
  const antes = new Map(t.alunos.map(a => [a.id, JSON.stringify([a.numero ?? null, a.nome, a.matricula || '', !!a.inativo])]));
  const linhas = () => alunosEmOrdem(t, { incluirInativos: true }).map(a => `<tr data-id="${a.id}" class="${a.inativo ? 'inativo' : ''}">
    <td><input class="campo-form mini-campo" inputmode="numeric" data-k="numero" value="${a.numero ?? ''}" aria-label="Número de chamada"></td>
    <td><input class="campo-form" data-k="nome" value="${esc(a.nome)}" aria-label="Nome"></td>
    <td><input class="campo-form" data-k="matricula" value="${esc(a.matricula || '')}" aria-label="Matrícula" placeholder="opcional"></td>
    <td class="centro"><input type="checkbox" data-k="inativo" ${a.inativo ? 'checked' : ''} aria-label="Saiu da turma"></td>
    <td><button class="botao pequeno sutil" data-tirar="${a.id}" aria-label="Tirar ${esc(a.nome)}">✕</button></td></tr>`).join('');
  const desenhar = () => {
    tela().innerHTML = `<section class="cabeca"><div><p class="sobre">${esc(t.nome)}</p><h1>Alunos</h1></div><a class="botao" href="#/turma/${t.id}">Ir para a planilha ›</a></section>
      <div class="cartao"><h2>Colar uma lista</h2>
        <p class="ajuda">Um aluno por linha. Pode vir com o número de chamada na frente e a matrícula no fim, separada por ponto e vírgula ou tabulação, como sai do Excel: <code>12 Ana Souza; 2024001</code>.</p>
        <textarea id="lista" class="texto-prova curto-ta" placeholder="1 Ana Souza&#10;2 Bruno Lima&#10;3 Carla Dias"></textarea>
        <div class="acoes"><button class="botao principal" id="adicionarLista">Adicionar os alunos</button></div></div>
      <div class="cartao"><h2>${t.alunos.length} aluno${t.alunos.length === 1 ? '' : 's'}</h2>
        ${t.alunos.length ? `<div class="rolagem"><table class="tabela-alunos"><thead><tr><th>Nº</th><th>Nome</th><th>Matrícula</th><th>Saiu</th><th></th></tr></thead><tbody>${linhas()}</tbody></table></div>` : '<p class="ajuda">Nenhum aluno ainda.</p>'}
        <div class="acoes"><button class="botao" id="umAluno">+ Um aluno</button><button class="botao principal" id="salvar">Salvar</button></div>
        <p class="ajuda">"Saiu" tira o aluno da planilha sem apagar as notas dele.</p></div>`;
    $('#adicionarLista').addEventListener('click', () => {
      ler();
      const novos = lerListaDeAlunos($('#lista').value);
      if (!novos.length) { aviso('Cole ao menos um nome.', 'erro'); return; }
      const nomes = new Set(t.alunos.map(a => a.nome.toLowerCase()));
      let n = 0;
      novos.forEach(a => { if (!nomes.has(a.nome.toLowerCase())) { t.alunos.push({ id: uid(), ...a }); n++; } });
      aviso(`${n} aluno${n === 1 ? '' : 's'} adicionado${n === 1 ? '' : 's'}${n < novos.length ? ` (${novos.length - n} já estavam na lista)` : ''}. Toque em Salvar.`);
      desenhar();
    });
    $('#umAluno').addEventListener('click', () => { ler(); t.alunos.push({ id: uid(), numero: null, nome: '', matricula: '' }); desenhar();
      const ultimo = $$('input[data-k=nome]').find(i => !i.value); if (ultimo) ultimo.focus(); });
    $$('[data-tirar]').forEach(b => b.addEventListener('click', () => {
      ler();
      const a = t.alunos.find(x => x.id === b.dataset.tirar);
      const temNota = t.avaliacoes.some(av => notaDe(t, av.id, a.id) != null);
      if (temNota && !confirm(`${a.nome} já tem notas. Tirar mesmo? Se o aluno saiu da turma, prefira marcar "Saiu".`)) return;
      t.alunos = t.alunos.filter(x => x.id !== a.id); desenhar();
    }));
    $('#salvar').addEventListener('click', async () => {
      ler();
      t.alunos = t.alunos.filter(a => a.nome.trim());
      const cb = await carimbo();
      for (const a of t.alunos) if (antes.get(a.id) !== JSON.stringify([a.numero ?? null, a.nome, a.matricula || '', !!a.inativo])) a.alterado = cb.em;
      for (const idAntigo of antes.keys()) if (!t.alunos.some(a => a.id === idAntigo)) t.removidos[idAntigo] = cb.em;
      await salvarTurma(t, cb); aviso('Alunos salvos.'); location.hash = `#/turma/${t.id}`;
    });
  };
  const ler = () => $$('.tabela-alunos tbody tr').forEach(tr => {
    const a = t.alunos.find(x => x.id === tr.dataset.id); if (!a) return;
    const n = tr.querySelector('[data-k=numero]').value.trim();
    a.numero = n === '' ? null : Number(n) || null;
    a.nome = tr.querySelector('[data-k=nome]').value.trim();
    a.matricula = tr.querySelector('[data-k=matricula]').value.trim();
    a.inativo = tr.querySelector('[data-k=inativo]').checked;
  });
  desenhar();
}

// ---------- planilha da turma ----------
export async function telaTurma(id) {
  const t = await pegarTurma(id);
  if (!t) { location.hash = '#/turmas'; return; }
  const escola = t.escolaId ? await db.pegar('escolas', t.escolaId) : null;
  const provas = new Map((await db.todos('provas')).map(p => [p.id, p]));
  const aba = params().get('p') || (t.periodos[0] && t.periodos[0].id);
  const alunos = alunosEmOrdem(t);
  const abas = [...t.periodos.map(p => `<a class="${aba === p.id ? 'ativo' : ''}" href="#/turma/${t.id}?p=${p.id}">${esc(p.nome)}</a>`),
    `<a class="${aba === 'resumo' ? 'ativo' : ''}" href="#/turma/${t.id}?p=resumo">Resumo do ano</a>`].join('');

  let tabela = '';
  if (!alunos.length) tabela = `<div class="cartao vazio"><h2>A turma ainda não tem alunos</h2><a class="botao principal" href="#/turma/${t.id}/alunos">Cadastrar os alunos</a></div>`;
  else if (aba === 'resumo') {
    const per = t.periodos;
    tabela = `<div class="rolagem planilha-caixa"><table class="planilha"><thead><tr><th class="fixa n">Nº</th><th class="fixa nome">Aluno</th>
      ${per.map(p => `<th>${esc(p.nome)}<small>${fmt(maximoPeriodo(t, p.id))}</small></th>`).join('')}<th class="total">Resultado<small>${t.config.resultadoAno === 'soma' ? 'soma' : 'média'}</small></th></tr></thead>
      <tbody>${alunos.map(a => `<tr><td class="fixa n">${a.numero ?? ''}</td><td class="fixa nome">${esc(a.nome)}</td>
        ${per.map(p => `<td>${fmt(totalPeriodo(t, p.id, a.id))}</td>`).join('')}<td class="total">${fmt(resultadoAno(t, a.id))}</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    const avs = avaliacoesDoPeriodo(t, aba);
    const cab = avs.map(av => {
      const p = av.provaId ? provas.get(av.provaId) : null;
      return `<th><a class="cab-aval" href="#/turma/${t.id}/avaliacao/${av.id}">${esc(av.nome)}</a><small>vale ${fmt(av.valorMax)}${av.tipo === 'kaue' ? ` · prova nº ${p ? String(p.numero).padStart(3, '0') : '?'}` : ' · à mão'}</small>
        ${av.tipo === 'kaue' ? `<a class="botao pequeno corrigir" href="#/turma/${t.id}/corrigir/${av.id}">Corrigir</a>` : ''}</th>`;
    }).join('');
    const celula = (av, a) => {
      const n = notaDe(t, av.id, a.id), f = faltou(t, av.id, a.id);
      const m = quemLancou(t, av.id, a.id);
      const dica = m ? ` title="Lançada em ${esc(descreverCarimbo(m))}"` : '';
      if (av.tipo === 'kaue') return `<td><a class="nota-link ${n == null ? 'vazia' : ''}"${dica} href="#/turma/${t.id}/corrigir/${av.id}/${a.id}">${f ? 'F' : fmt(n)}</a></td>`;
      return `<td><input class="nota-input"${dica} inputmode="decimal" data-av="${av.id}" data-al="${a.id}" value="${f ? 'F' : n == null ? '' : num(n)}" aria-label="${esc(av.nome)}, ${esc(a.nome)}"></td>`;
    };
    const mediaCol = av => { const ns = alunos.map(a => notaDe(t, av.id, a.id)).filter(n => n != null); return ns.length ? nota2(ns.reduce((s, n) => s + n, 0) / ns.length) : null; };
    tabela = avs.length || true ? `<div class="rolagem planilha-caixa"><table class="planilha"><thead><tr><th class="fixa n">Nº</th><th class="fixa nome">Aluno</th>${cab}
      <th class="total">Total<small>${fmt(maximoPeriodo(t, aba))}</small></th></tr></thead>
      <tbody>${alunos.map(a => `<tr><td class="fixa n">${a.numero ?? ''}</td><td class="fixa nome">${esc(a.nome)}</td>${avs.map(av => celula(av, a)).join('')}
        <td class="total">${fmt(totalPeriodo(t, aba, a.id))}</td></tr>`).join('')}</tbody>
      ${avs.length ? `<tfoot><tr><td class="fixa n"></td><td class="fixa nome">Média da turma</td>${avs.map(av => `<td>${fmt(mediaCol(av))}</td>`).join('')}<td class="total"></td></tr></tfoot>` : ''}</table></div>
      ${!avs.length ? `<p class="ajuda">Este período ainda não tem avaliações. Toque em "+ Avaliação" para criar a primeira coluna.</p>` : ''}` : '';
  }

  tela().innerHTML = `<section class="cabeca"><div><p class="sobre">${esc(String(t.anoLetivo))}${escola ? ' · ' + esc(escola.nome) : ''}</p><h1>${esc(t.nome)}</h1>
      <p class="meta">${[t.disciplina, `${alunos.length} alunos`].filter(Boolean).map(esc).join(' · ')}</p>
      ${t.alterada ? `<p class="meta pequeno carimbo">Última alteração: ${esc(descreverCarimbo(t.alterada))}</p>` : ''}</div>
      ${aba !== 'resumo' && alunos.length ? `<a class="botao principal" href="#/turma/${t.id}/avaliacao/nova?p=${aba}">+ Avaliação</a>` : ''}</section>
    <nav class="abas" aria-label="Períodos">${abas}</nav>
    ${tabela}
    <div class="acoes">
      <a class="botao" href="#/turma/${t.id}/alunos">Alunos</a>
      <button class="botao" id="excel">Excel</button>
      <a class="botao" href="#/turma/${t.id}/imprimir">PDF</a>
      <button class="botao" id="imagem">Imagem</button>
      <button class="botao" id="enviar">Enviar para outro aparelho</button>
      <a class="botao sutil" href="#/turma/${t.id}/editar">Editar a turma</a>
    </div>
    <p class="ajuda">Nas colunas à mão, digite a nota e passe para a próxima; "F" marca falta. Nas provas do Kauê, toque na nota para corrigir.</p>`;

  $$('.nota-input').forEach(inp => {
    inp.addEventListener('change', async () => {
      const av = t.avaliacoes.find(x => x.id === inp.dataset.av);
      const txt = inp.value.trim();
      t.notas[av.id] = t.notas[av.id] || {}; t.faltas[av.id] = t.faltas[av.id] || {};
      const cb = await carimbo();
      if (/^f$/i.test(txt)) { t.notas[av.id][inp.dataset.al] = null; t.faltas[av.id][inp.dataset.al] = true; }
      else {
        const v = lerNumero(txt);
        if (Number.isNaN(v) || (v != null && (v < 0 || v > av.valorMax + 1e-9))) { aviso(`Nota inválida. Use um número de 0 a ${num(av.valorMax)}, ou F para falta.`, 'erro'); inp.focus(); inp.select(); return; }
        t.notas[av.id][inp.dataset.al] = v == null ? null : nota2(v);
        delete t.faltas[av.id][inp.dataset.al];
        if (v != null) inp.value = num(nota2(v));
      }
      marcarCelula(t, av.id, inp.dataset.al, cb);
      inp.title = `Lançada em ${descreverCarimbo(cb)}`;
      await salvarTurma(t, cb);
      const tr = inp.closest('tr'); const tot = tr.querySelector('.total');
      if (tot) tot.textContent = fmt(totalPeriodo(t, aba, inp.dataset.al));
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const todas = $$('.nota-input'); const i = todas.indexOf(inp);
      const col = todas.filter(x => x.dataset.av === inp.dataset.av); const k = col.indexOf(inp); (col[k + 1] || todas[i + 1] || inp).focus(); } });
  });
  $('#excel').addEventListener('click', () => exportarExcel(t, escola));
  $('#imagem').addEventListener('click', () => exportarImagem(t, escola, aba));
  $('#enviar').addEventListener('click', async () => {
    const dados = await backupDaTurma(t.id);
    baixar(`kaue-turma-${nomeArquivo(t.nome)}-${await sufixoArquivo()}.json`, new Blob([JSON.stringify(dados)], { type: 'application/json' }));
    aviso('Arquivo da turma baixado. No outro aparelho, abra o Kauê em Backup e escolha o arquivo.');
  });
}

// ---------- avaliação (coluna) ----------
export async function telaAvaliacao(turmaId, avId) {
  const t = await pegarTurma(turmaId);
  if (!t) { location.hash = '#/turmas'; return; }
  const nova = !avId || avId === 'nova';
  const provas = (await db.todos('provas')).sort((a, b) => b.numero - a.numero);
  const av = nova ? { id: uid(), periodoId: params().get('p') || t.periodos[0].id, nome: '', tipo: provas.length ? 'kaue' : 'manual', provaId: provas[0] ? provas[0].id : null, valorMax: 10 }
    : { ...t.avaliacoes.find(a => a.id === avId) };
  if (!av.id) { location.hash = `#/turma/${t.id}`; return; }
  tela().innerHTML = `<section class="cabeca"><div><p class="sobre">${esc(t.nome)}</p><h1>${nova ? 'Nova avaliação' : 'Editar avaliação'}</h1></div></section>
    <div class="cartao form">
      <span class="rotulo">Tipo</span>
      <div class="modos dois">
        <label class="modo"><input type="radio" name="tipo" value="kaue" ${av.tipo === 'kaue' ? 'checked' : ''} ${provas.length ? '' : 'disabled'}><span><b>Prova do Kauê</b><small>Corrigida pelo código impresso na folha</small></span></label>
        <label class="modo"><input type="radio" name="tipo" value="manual" ${av.tipo === 'manual' ? 'checked' : ''}><span><b>Nota lançada à mão</b><small>Trabalho, participação, caderno, prova de fora</small></span></label>
      </div>
      <div id="escolherProva" class="sub-op"><label class="rotulo" for="prova">Prova</label>
        <select id="prova" class="campo-form">${provas.map(p => `<option value="${p.id}" ${p.id === av.provaId ? 'selected' : ''}>Nº ${String(p.numero).padStart(3, '0')} · ${esc(p.titulo || 'Prova')}${p.turma || p.serie ? ' · ' + esc(p.turma || p.serie) : ''}</option>`).join('')}</select></div>
      <label class="rotulo" for="nome">Nome da coluna</label><input id="nome" class="campo-form" value="${esc(av.nome)}" placeholder="Prova 1">
      <label class="rotulo" for="per">Período</label><select id="per" class="campo-form">${t.periodos.map(p => `<option value="${p.id}" ${p.id === av.periodoId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <label class="rotulo" for="valor">Quanto vale na planilha</label><input id="valor" class="campo-form curto" inputmode="decimal" value="${num(av.valorMax)}">
      <p class="ajuda" id="ajudaValor"></p>
      <div class="acoes"><button class="botao principal" id="salvar">Salvar</button><a class="botao" href="#/turma/${t.id}?p=${av.periodoId}">Cancelar</a>
        ${nova ? '' : '<button class="botao perigo" id="excluir">Excluir a coluna</button>'}</div>
    </div>`;
  const atualizar = async () => {
    const tipo = ($('input[name=tipo]:checked') || {}).value;
    $('#escolherProva').hidden = tipo !== 'kaue';
    if (tipo === 'kaue') {
      const p = provas.find(x => x.id === $('#prova').value);
      if (p) {
        const dados = await carregarProva(p.id);
        if (!$('#nome') || !dados) return; // a tela mudou enquanto a prova carregava
        const vt = dados.res.prova.valor_total || dados.res.resumo.somaValores;
        if (!$('#nome').value || $('#nome').dataset.auto) { $('#nome').value = p.titulo || 'Prova'; $('#nome').dataset.auto = '1'; }
        if (nova && !$('#valor').dataset.mexeu) $('#valor').value = num(vt);
        $('#ajudaValor').textContent = `A prova vale ${num(vt)} pontos. Se a coluna valer outro tanto, o Kauê converte (ex.: 8 de 10 vira 3,2 numa coluna de 4).`;
      }
    } else $('#ajudaValor').textContent = '';
  };
  $('#nome').addEventListener('input', () => { delete $('#nome').dataset.auto; });
  $('#valor').addEventListener('input', () => { $('#valor').dataset.mexeu = '1'; });
  tela().addEventListener('change', atualizar);
  await atualizar();
  $('#salvar').addEventListener('click', async () => {
    const valor = lerNumero($('#valor').value);
    if (!valor || Number.isNaN(valor) || valor <= 0) { aviso('Informe quanto a avaliação vale na planilha.', 'erro'); return; }
    const tipo = $('input[name=tipo]:checked').value;
    const antes = t.avaliacoes.find(a => a.id === av.id);
    const cb = await carimbo();
    Object.assign(av, { alterado: cb.em, tipo, provaId: tipo === 'kaue' ? $('#prova').value : null, nome: $('#nome').value.trim() || (tipo === 'kaue' ? 'Prova' : 'Avaliação'),
      periodoId: $('#per').value, valorMax: valor });
    if (antes) {
      // se o valor da coluna mudou, as notas convertidas das provas do Kauê acompanham
      if (antes.valorMax !== valor && t.notas[av.id]) for (const k of Object.keys(t.notas[av.id])) if (t.notas[av.id][k] != null) t.notas[av.id][k] = nota2(t.notas[av.id][k] * valor / antes.valorMax);
      Object.assign(antes, av);
    } else t.avaliacoes.push(av);
    await salvarTurma(t, cb); aviso('Avaliação salva.');
    location.hash = `#/turma/${t.id}?p=${av.periodoId}`;
  });
  const exc = $('#excluir');
  if (exc) exc.addEventListener('click', async () => {
    if (!confirm(`Excluir a coluna "${av.nome}" e as notas dela? Não dá para desfazer.`)) return;
    const cb = await carimbo();
    t.avaliacoes = t.avaliacoes.filter(a => a.id !== av.id); delete t.notas[av.id]; delete t.faltas[av.id]; delete t.marcas[av.id];
    t.removidos[av.id] = cb.em;
    for (const c of await db.correcoesDaTurma(t.id)) if (c.avaliacaoId === av.id) await db.apagar('correcoes', c.id);
    await salvarTurma(t, cb); location.hash = `#/turma/${t.id}?p=${av.periodoId}`;
  });
}

// ---------- correção: lista de alunos da avaliação ----------
export async function telaCorrigirLista(turmaId, avId) {
  const t = await pegarTurma(turmaId);
  const av = t && t.avaliacoes.find(a => a.id === avId);
  if (!av) { location.hash = '#/turmas'; return; }
  const dados = av.provaId ? await carregarProva(av.provaId) : null;
  const alunos = alunosEmOrdem(t);
  const feitas = alunos.filter(a => notaDe(t, av.id, a.id) != null || faltou(t, av.id, a.id)).length;
  const primeiro = alunos.find(a => notaDe(t, av.id, a.id) == null && !faltou(t, av.id, a.id));
  tela().innerHTML = `<section class="cabeca"><div><p class="sobre">${esc(t.nome)} · vale ${num(av.valorMax)}</p><h1>Corrigir: ${esc(av.nome)}</h1>
      <p class="meta">${dados ? `Prova nº ${String(dados.prova.numero).padStart(3, '0')} · ${esc(dados.prova.titulo)}` : '<b class="alerta">A prova desta coluna não está neste aparelho.</b>'}</p></div>
      ${primeiro && dados ? `<a class="botao principal grande" href="#/turma/${t.id}/corrigir/${av.id}/${primeiro.id}">Começar${feitas ? ' do próximo' : ''}</a>` : ''}</section>
    <div class="progresso" role="progressbar" aria-valuenow="${feitas}" aria-valuemax="${alunos.length}"><span style="width:${alunos.length ? feitas / alunos.length * 100 : 0}%"></span></div>
    <p class="meta">${feitas} de ${alunos.length} corrigidas</p>
    ${!dados ? '<div class="cartao com-erros">Abra o Kauê no aparelho onde a prova foi montada e use "Enviar para outro aparelho" na prova ou na turma; depois, aqui, em Backup, escolha o arquivo.</div>' : ''}
    <div class="lista-corrigir">${alunos.map(a => {
      const n = notaDe(t, av.id, a.id), f = faltou(t, av.id, a.id);
      const m = (n != null || f) ? quemLancou(t, av.id, a.id) : null;
      return `<div class="aluno-linha"><a href="#/turma/${t.id}/corrigir/${av.id}/${a.id}"><span class="num-aluno">${a.numero ?? ''}</span> ${esc(a.nome)}${m ? `<small class="carimbo">${esc(descreverCarimbo(m))}</small>` : ''}</a>
        <span class="estado ${f ? 'falta' : n == null ? 'pendente' : 'feita'}">${f ? 'Faltou' : n == null ? 'Pendente' : num(n)}</span>
        <button class="botao pequeno sutil" data-falta="${a.id}">${f ? 'Tirar falta' : 'Faltou'}</button></div>`;
    }).join('')}</div>
    <div class="acoes"><a class="botao" href="#/turma/${t.id}?p=${av.periodoId}">‹ Voltar à planilha</a></div>`;
  $$('[data-falta]').forEach(b => b.addEventListener('click', async () => {
    const al = b.dataset.falta;
    t.faltas[av.id] = t.faltas[av.id] || {}; t.notas[av.id] = t.notas[av.id] || {};
    const cb = await carimbo();
    if (t.faltas[av.id][al]) delete t.faltas[av.id][al];
    else { t.faltas[av.id][al] = true; t.notas[av.id][al] = null; await db.apagar('correcoes', `${av.id}|${al}`); }
    marcarCelula(t, av.id, al, cb);
    await salvarTurma(t, cb); telaCorrigirLista(turmaId, avId);
  }));
}

// ---------- correção de um aluno ----------
export async function telaCorrigir(turmaId, avId, alunoId) {
  const t = await pegarTurma(turmaId);
  const av = t && t.avaliacoes.find(a => a.id === avId);
  const aluno = t && t.alunos.find(a => a.id === alunoId);
  if (!av || !aluno) { location.hash = '#/turmas'; return; }
  const dados = await carregarProva(av.provaId);
  if (!dados) { location.hash = `#/turma/${t.id}/corrigir/${av.id}`; return; }
  const { prova, res } = dados;
  const montadas = montarTudo(prova, res);
  const mudou = prova.impressao && prova.impressao.assinatura !== assinatura(prova);
  const anterior = await db.pegar('correcoes', `${av.id}|${aluno.id}`);
  const alunos = alunosEmOrdem(t);
  const i = alunos.findIndex(a => a.id === aluno.id);
  const ant = alunos[i - 1], prox = alunos[i + 1];
  let montada = anterior ? montadas.find(m => m.versao === anterior.versao) : null;
  let marcacoes = anterior && montada ? { ...anterior.marcacoes } : {};
  const pontProva = res.prova.pontuacao || 'parcial';

  tela().innerHTML = `<section class="cabeca corrigir-cabeca"><div><p class="sobre">${esc(av.nome)} · ${esc(t.nome)}</p>
      <h1><span class="num-aluno">${aluno.numero ?? ''}</span> ${esc(aluno.nome)}</h1></div>
      <div class="navega">${ant ? `<a class="botao pequeno" href="#/turma/${t.id}/corrigir/${av.id}/${ant.id}">‹ Anterior</a>` : ''}
        <a class="botao pequeno" href="#/turma/${t.id}/corrigir/${av.id}">Lista</a>
        ${prox ? `<a class="botao pequeno" href="#/turma/${t.id}/corrigir/${av.id}/${prox.id}">Próximo ›</a>` : ''}</div></section>
    ${anterior ? `<p class="meta pequeno carimbo">Corrigida em ${esc(descreverCarimbo(anterior.carimbo || anterior.em))}. Se você salvar de novo, vale a correção nova.</p>` : ''}
    ${mudou ? `<div class="cartao lembrete">A prova mudou depois da impressão de ${dataCurta(prova.impressao.em)}. Confira se as respostas abaixo batem com a folha.</div>` : ''}
    <div class="cartao codigo-cartao">
      <label class="rotulo" for="codigo">Código da prova do aluno</label>
      <div class="linha-codigo"><input id="codigo" class="campo-form codigo-input" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="00000" value="${montada ? montada.codigo : ''}">
        <span id="codigoInfo" class="meta"></span></div>
      <p class="ajuda">Não dá para ler? Escolha a versão:
        ${montadas.map(m => `<button class="botao pequeno versao-btn" data-v="${m.versao}">${m.adaptada ? 'Adaptada' : m.letra}</button>`).join(' ')}</p>
    </div>
    <div id="folha"></div>
    <div class="barra-nota" id="barra" hidden></div>`;

  const codigo = $('#codigo');
  const escolher = m => {
    if (!montada || montada.versao !== m.versao) marcacoes = anterior && anterior.versao === m.versao ? { ...anterior.marcacoes } : {};
    montada = m; codigo.value = m.codigo;
    $('#codigoInfo').innerHTML = `<b class="ok-txt">✓ ${m.adaptada ? 'Versão adaptada' : 'Versão ' + m.letra}</b>`;
    desenharFolha();
  };
  const tentarCodigo = () => {
    const v = codigo.value.replace(/\D/g, '');
    if (v.length < 5) { $('#codigoInfo').textContent = ''; return; }
    const c = lerCodigo(v);
    if (!c) { $('#codigoInfo').innerHTML = '<b class="alerta">Código inválido. Confira os números.</b>'; return; }
    if (c.numero !== prova.numero) { $('#codigoInfo').innerHTML = `<b class="alerta">Este código é da prova nº ${String(c.numero).padStart(3, '0')}, não desta.</b>`; return; }
    const m = montadas.find(x => x.versao === c.versao);
    if (!m) { $('#codigoInfo').innerHTML = `<b class="alerta">A versão ${nomeVersao(c.versao)} não existe nesta prova.</b>`; return; }
    escolher(m);
  };
  codigo.addEventListener('input', tentarCodigo);
  $$('.versao-btn').forEach(b => b.addEventListener('click', () => escolher(montadas.find(m => m.versao === Number(b.dataset.v)))));

  function cartaoQuestao(q) {
    const r = pontuar(q, marcacoes[q.n], pontProva);
    const estado = r.pendente ? 'pendente' : r.estado;
    const selo = { pendente: 'Falta marcar', certa: 'Certa', errada: 'Errada', parcial: 'Parcial' }[estado];
    const marc = marcacoes[q.n];
    let corpo = '';
    if (q.tipo === 'multipla') {
      corpo = `<div class="opcoes">${q.alternativas.map(a => `<button class="op ${marc === a.letra ? 'marcada' : ''} ${marc != null && a.letra === q.gabarito ? 'gabarito' : ''}" data-q="${q.n}" data-v="${a.letra}">${a.letra.toUpperCase()}</button>`).join('')}
        <button class="op branco ${marc === '-' ? 'marcada' : ''}" data-q="${q.n}" data-v="-">Em branco</button></div>`;
    } else if (q.tipo === 'vf') {
      corpo = q.itensVF.map((it, k) => { const m = (marc || [])[k];
        return `<div class="item-marcar"><span class="txt-item">${esc(it.texto)}</span><div class="opcoes">${['V', 'F'].map(x => `<button class="op ${m === x ? 'marcada' : ''} ${m != null && x === it.resposta ? 'gabarito' : ''}" data-q="${q.n}" data-k="${k}" data-v="${x}">${x}</button>`).join('')}</div></div>`; }).join('');
    } else if (q.tipo === 'associe') {
      corpo = q.colunaB.map((it, k) => { const m = (marc || [])[k];
        return `<div class="item-marcar"><span class="txt-item">${esc(it.texto)}</span><div class="opcoes">${q.colunaA.map(a => `<button class="op ${m === a.letra ? 'marcada' : ''} ${m != null && a.letra === it.resposta ? 'gabarito' : ''}" data-q="${q.n}" data-k="${k}" data-v="${a.letra}">${a.letra}</button>`).join('')}</div></div>`; }).join('');
    } else if (q.tipo === 'complete') {
      corpo = q.lacunas.map((l, k) => { const m = (marc || [])[k];
        return `<div class="item-marcar"><span class="txt-item">Lacuna ${k + 1}: <b>${esc(l[0])}</b>${l.length > 1 ? ` <small>(também vale: ${l.slice(1).map(esc).join(', ')})</small>` : ''}</span>
          <div class="opcoes"><button class="op ${m === true ? 'marcada' : ''}" data-q="${q.n}" data-k="${k}" data-v="1">Certo</button><button class="op ${m === false ? 'marcada' : ''}" data-q="${q.n}" data-k="${k}" data-v="0">Errado</button></div></div>`; }).join('');
    } else {
      const passos = []; const valor = q.valor || 0;
      for (let v = 0; v <= valor + 1e-9 && passos.length < 13; v += valor <= 3 ? 0.25 : 0.5) passos.push(nota2(v));
      const usar = valor <= 3 ? passos.filter(v => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9 || (q.criterios || []).some(c => Math.abs(c.valor - v) < 1e-9)) : passos;
      corpo = `<div class="esperada"><b>Resposta esperada:</b> ${esc(q.resposta || '—')}
        ${(q.aceitas || []).length ? `<div class="aceitas"><b>Também vale:</b><ul>${q.aceitas.map(a => `<li>${esc(a.texto)}</li>`).join('')}</ul></div>` : ''}
        ${(q.criterios || []).length ? `<div class="criterios"><b>Critérios:</b><ul>${q.criterios.map(c => `<li><b>${num(c.valor)}</b> — ${esc(c.texto)}</li>`).join('')}</ul></div>` : ''}</div>
        <div class="opcoes">${usar.map(v => `<button class="op pontos ${marc != null && Math.abs(Number(marc) - v) < 1e-9 ? 'marcada' : ''}" data-q="${q.n}" data-v="${v}">${num(v)}</button>`).join('')}
          <input class="campo-form mini-campo outro" inputmode="decimal" placeholder="outro" data-q="${q.n}" aria-label="Outra nota para a questão ${q.n}"></div>`;
    }
    return `<article class="q-corrigir estado-${estado}" id="q${q.n}"><header><span class="qn">${q.n}</span><span class="qt">${NOMES_TIPO[q.tipo]} · ${num(q.valor)} pt</span>
      <span class="selo">${selo}${!r.pendente && r.pontos !== r.max ? ` · ${num(r.pontos)}` : ''}</span></header>
      <details><summary>Ver o enunciado</summary><div class="enun">${textoHTML(q.enunciado, { lacunas: q.tipo === 'complete' })}</div></details>${corpo}</article>`;
  }

  function barra() {
    const tot = totalDaCorrecao(montada, marcacoes, pontProva);
    const nota = notaNaColuna(tot.pontos, montada.total, av.valorMax);
    $('#barra').hidden = false;
    $('#barra').innerHTML = `<div><b>${num(tot.pontos)}</b> de ${num(montada.total)} pontos → <b>${num(nota)}</b> na planilha (vale ${num(av.valorMax)})
      ${tot.pendentes.length ? `<br><span class="alerta">Falta marcar: questão ${tot.pendentes.join(', ')}</span>` : ''}</div>
      <div class="acoes-barra"><button class="botao" id="salvar">Salvar</button>${prox ? '<button class="botao principal" id="salvarProx">Salvar e próximo ›</button>' : ''}</div>`;
    $('#salvar').addEventListener('click', () => salvar(false));
    const sp = $('#salvarProx'); if (sp) sp.addEventListener('click', () => salvar(true));
  }

  function desenharFolha() {
    const mult = montada.questoes.filter(q => q.tipo === 'multipla');
    $('#folha').innerHTML = `${mult.length > 1 ? `<div class="cartao rapido"><label class="rotulo" for="letras">Múltiplas de uma vez</label>
        <p class="ajuda">Digite as letras que o aluno marcou, em ordem (${mult.length} questões). Use "-" para resposta em branco ou rasurada.</p>
        <div class="linha-codigo"><input id="letras" class="campo-form codigo-input" autocomplete="off" autocapitalize="none" placeholder="${'abcde'.slice(0, Math.min(5, mult.length))}…" value="${mult.map(q => marcacoes[q.n] || '').join('')}">
        <button class="botao" id="aplicarLetras">Aplicar</button></div></div>` : ''}
      <div id="questoes">${montada.questoes.map(cartaoQuestao).join('')}</div>`;
    const al = $('#aplicarLetras');
    if (al) {
      const aplicar = () => { const r = preencherMultiplas(montada, $('#letras').value, marcacoes); marcacoes = r.marcacoes;
        mult.forEach(q => { $(`#q${q.n}`).outerHTML = cartaoQuestao(q); }); ligar(); barra();
        if (r.usadas < r.total) aviso(`Faltam ${r.total - r.usadas} letra(s) para as múltiplas.`); };
      al.addEventListener('click', aplicar);
      $('#letras').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); aplicar(); } });
    }
    ligar(); barra();
  }

  function ligar() {
    $$('#questoes .op').forEach(b => { if (b.dataset.ligado) return; b.dataset.ligado = '1'; b.addEventListener('click', () => {
      const n = Number(b.dataset.q); const q = montada.questoes.find(x => x.n === n);
      if (q.tipo === 'multipla') marcacoes[n] = b.dataset.v;
      else if (q.tipo === 'discursiva') marcacoes[n] = Number(b.dataset.v);
      else {
        const lista = Array.isArray(marcacoes[n]) ? [...marcacoes[n]] : marcacaoVazia(q);
        lista[Number(b.dataset.k)] = q.tipo === 'complete' ? b.dataset.v === '1' : b.dataset.v;
        marcacoes[n] = lista;
      }
      $(`#q${n}`).outerHTML = cartaoQuestao(q); ligar(); barra();
    }); });
    $$('#questoes input.outro').forEach(inp => { if (inp.dataset.ligado) return; inp.dataset.ligado = '1'; inp.addEventListener('change', () => {
      const n = Number(inp.dataset.q); const q = montada.questoes.find(x => x.n === n); const v = lerNumero(inp.value);
      if (v == null || Number.isNaN(v) || v < 0 || v > q.valor) { aviso(`Use um valor de 0 a ${num(q.valor)}.`, 'erro'); return; }
      marcacoes[n] = nota2(v); $(`#q${n}`).outerHTML = cartaoQuestao(q); ligar(); barra();
    }); });
  }

  async function salvar(irProximo) {
    const tot = totalDaCorrecao(montada, marcacoes, pontProva);
    if (tot.pendentes.length && !confirm(`Ainda falta marcar a questão ${tot.pendentes.join(', ')}. Salvar assim mesmo (o que falta conta zero)?`)) return;
    const nota = notaNaColuna(tot.pontos, montada.total, av.valorMax);
    const cb = await carimbo();
    await db.guardar('correcoes', { id: `${av.id}|${aluno.id}`, turmaId: t.id, avaliacaoId: av.id, alunoId: aluno.id, provaId: prova.id,
      codigo: montada.codigo, versao: montada.versao, marcacoes, pontos: tot.pontos, totalVersao: montada.total, nota, em: cb.em, carimbo: cb });
    const atual = await pegarTurma(t.id);
    atual.notas[av.id] = atual.notas[av.id] || {}; atual.notas[av.id][aluno.id] = nota;
    if (atual.faltas[av.id]) delete atual.faltas[av.id][aluno.id];
    marcarCelula(atual, av.id, aluno.id, cb);
    await salvarTurma(atual, cb);
    aviso(`${aluno.nome}: ${num(nota)}`);
    if (irProximo) {
      const proximoPendente = alunos.slice(i + 1).find(a => notaDe(atual, av.id, a.id) == null && !faltou(atual, av.id, a.id)) || prox;
      location.hash = `#/turma/${t.id}/corrigir/${av.id}/${proximoPendente.id}`;
    } else location.hash = `#/turma/${t.id}/corrigir/${av.id}`;
  }

  if (montada) escolher(montada); else codigo.focus();
}

// ---------- tabelas para exportar ----------
function tabelaDoPeriodo(t, periodoId) {
  const avs = avaliacoesDoPeriodo(t, periodoId);
  const cab = ['Nº', 'Aluno', ...avs.map(a => `${a.nome} (${num(a.valorMax)})`), `Total (${num(maximoPeriodo(t, periodoId))})`];
  const linhas = alunosEmOrdem(t).map(a => [a.numero ?? '', a.nome, ...avs.map(av => faltou(t, av.id, a.id) ? 'F' : notaDe(t, av.id, a.id)), totalPeriodo(t, periodoId, a.id)]);
  return { cab, linhas };
}
function tabelaResumo(t) {
  const cab = ['Nº', 'Aluno', ...t.periodos.map(p => `${p.nome} (${num(maximoPeriodo(t, p.id))})`), `Resultado (${t.config.resultadoAno === 'soma' ? 'soma' : 'média'})`];
  const linhas = alunosEmOrdem(t).map(a => [a.numero ?? '', a.nome, ...t.periodos.map(p => totalPeriodo(t, p.id, a.id)), resultadoAno(t, a.id)]);
  return { cab, linhas };
}

async function exportarExcel(t, escola) {
  const gerado = await textoGerado(t);
  const sub = [t.disciplina, escola && escola.nome, t.anoLetivo].filter(Boolean).join(' · ');
  const aba = (nome, { cab, linhas }) => ({
    nome, paisagem: cab.length > 7, congelar: { x: 2, y: 4 },
    larguras: [6, 34, ...cab.slice(2).map(c => Math.min(22, Math.max(11, c.length + 2)))],
    alturas: { 3: 30 },
    linhas: [[{ v: `${t.nome} – ${nome}`, s: 1 }], [{ v: sub, s: 6 }], [],
      cab.map(c => ({ v: c, s: 2 })),
      ...linhas.map(l => l.map((v, k) => (k === 0 ? { v: v === '' ? null : Number(v), s: 0 } : k === l.length - 1 ? { v, s: typeof v === 'number' ? 4 : 5 } : v))),
      [], [{ v: `${gerado}. F = faltou.`, s: 6 }]],
  });
  const abas = [...t.periodos.map(p => aba(p.nome, tabelaDoPeriodo(t, p.id))), aba('Resumo do ano', tabelaResumo(t))];
  baixar(`notas-${nomeArquivo(t.nome)}-${t.anoLetivo}.xlsx`, montarXlsx(abas, { titulo: `Notas – ${t.nome}` }));
}

// imagem PNG da aba aberta (difícil de alterar, boa para mandar no grupo da escola)
async function exportarImagem(t, escola, aba) {
  await document.fonts.ready;
  const { cab, linhas } = aba === 'resumo' ? tabelaResumo(t) : tabelaDoPeriodo(t, aba);
  const nomeAba = aba === 'resumo' ? 'Resumo do ano' : (t.periodos.find(p => p.id === aba) || {}).nome;
  const esc2 = 2, alturaLinha = 34, margem = 28;
  const ctx0 = document.createElement('canvas').getContext('2d');
  ctx0.font = "600 15px 'Atkinson Hyperlegible Next', Arial";
  const larguras = cab.map((c, k) => Math.max(k === 0 ? 44 : 70, Math.min(k === 1 ? 320 : 180,
    Math.max(ctx0.measureText(c).width, ...linhas.map(l => ctx0.measureText(l[k] == null ? '—' : typeof l[k] === 'number' ? num(l[k]) : String(l[k])).width)) + 22)));
  let largura = larguras.reduce((s, w) => s + w, 0) + margem * 2;
  const altura = margem * 2 + 76 + alturaLinha * (linhas.length + 1) + 34;
  ctx0.font = "12px 'Atkinson Hyperlegible Next', Arial";
  const larguraRodape = ctx0.measureText(`${await textoGerado(t)} · F = faltou`).width + margem * 2;
  largura = Math.max(largura, larguraRodape);
  const c = document.createElement('canvas'); c.width = largura * esc2; c.height = altura * esc2;
  const g = c.getContext('2d'); g.scale(esc2, esc2);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, largura, altura);
  g.fillStyle = '#16202A'; g.font = "22px 'Cal Sans', Arial"; g.fillText(`${t.nome} – ${nomeAba}`, margem, margem + 22);
  g.font = "14px 'Atkinson Hyperlegible Next', Arial"; g.fillStyle = '#545C63';
  g.fillText([t.disciplina, escola && escola.nome, t.anoLetivo].filter(Boolean).join(' · '), margem, margem + 46);
  let y = margem + 76;
  const linha = (cels, cab2) => {
    let x = margem;
    if (cab2) { g.fillStyle = '#F1EAD8'; g.fillRect(margem, y, largura - margem * 2, alturaLinha); }
    cels.forEach((v, k) => {
      const txt = v == null || v === '' ? (cab2 || k < 2 ? '' : '—') : typeof v === 'number' && !cab2 && k > 0 ? num(v) : String(v);
      g.font = cab2 || k === cels.length - 1 ? "700 15px 'Atkinson Hyperlegible Next', Arial" : "15px 'Atkinson Hyperlegible Next', Arial";
      g.fillStyle = '#16202A';
      let t2 = txt; while (g.measureText(t2).width > larguras[k] - 14 && t2.length > 1) t2 = t2.slice(0, -2) + '…';
      g.textAlign = k > 1 ? 'center' : 'left';
      g.fillText(t2, k > 1 ? x + larguras[k] / 2 : x + 8, y + 22);
      x += larguras[k];
    });
    g.textAlign = 'left';
    g.strokeStyle = '#D8CFBA'; g.lineWidth = 1; g.beginPath(); g.moveTo(margem, y + alturaLinha); g.lineTo(largura - margem, y + alturaLinha); g.stroke();
    y += alturaLinha;
  };
  linha(cab, true); linhas.forEach(l => linha(l, false));
  g.font = "12px 'Atkinson Hyperlegible Next', Arial"; g.fillStyle = '#545C63';
  g.fillText(`${await textoGerado(t)} · F = faltou`, margem, y + 24);
  c.toBlob(b => baixar(`notas-${nomeArquivo(t.nome)}-${nomeArquivo(nomeAba)}.png`, b), 'image/png');
}

// ---------- impressão da planilha (PDF) ----------
export async function telaImprimirTurma(id) {
  const t = await pegarTurma(id);
  if (!t) { location.hash = '#/turmas'; return; }
  const escola = t.escolaId ? await db.pegar('escolas', t.escolaId) : null;
  const sub = [t.disciplina, escola && escola.nome, t.anoLetivo].filter(Boolean).map(esc).join(' · ');
  const gerado = esc(await textoGerado(t));
  const tabelaHTML = (titulo, { cab, linhas }) => `<section class="folha planilha-folha" style="page:${cab.length > 8 ? 'planilhaDeitada' : 'planilhaEmPe'}">
    <h1>${esc(t.nome)} – ${esc(titulo)}</h1><p class="sub">${sub}</p>
    <table class="planilha-impressa"><thead><tr>${cab.map((c, k) => `<th class="${k === 1 ? 'nome' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map((v, k) => `<td class="${k === 1 ? 'nome' : ''} ${k === l.length - 1 ? 'total' : ''}">${v == null || v === '' ? (k < 2 ? '' : '—') : typeof v === 'number' && k > 0 ? num(v) : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="rodape-planilha">${gerado} · F = faltou</p></section>`;
  document.getElementById('css-paginas').textContent = '@page planilhaDeitada { size: A4 landscape; margin: 12mm; } @page planilhaEmPe { size: A4; margin: 12mm; }';
  document.body.classList.add('modo-impressao');
  tela().innerHTML = `<div class="barra-impressao nao-imprimir"><a class="botao" href="#/turma/${t.id}">‹ Voltar</a>
      <div class="barra-titulo"><b>${esc(t.nome)}</b> · notas</div><button class="botao principal" id="imprimir">Imprimir ou salvar PDF</button></div>
    <p class="dica-impressao nao-imprimir">Cada período sai numa página, e o resumo do ano na última. Na janela de impressão, escolha <b>Salvar como PDF</b>.</p>
    <div class="folhas">${t.periodos.map(p => tabelaHTML(p.nome, tabelaDoPeriodo(t, p.id))).join('')}${tabelaHTML('Resumo do ano', tabelaResumo(t))}</div>`;
  $('#imprimir').addEventListener('click', () => window.print());
}
