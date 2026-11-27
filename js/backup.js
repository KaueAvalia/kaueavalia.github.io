// Kauê — backup em arquivo: guarda tudo, leva uma prova ou uma turma para outro aparelho e junta na volta
import { todos, pegar, guardar, apagar, arquivosDe, correcoesDaTurma } from './db.js';
import { blobParaBase64, base64ParaBlob } from './util.js';
import { carimbo, aparelho, descreverCarimbo, dataHora } from './aparelho.js';
import { decidir, juntarTurmas, juntarCorrecoes } from './juntar.js';

const FORMATO = 'kaue-backup';
// o que é deste aparelho e nunca vem de outro: o nome dele e a data do último backup feito aqui
const CONFIG_LOCAL = ['aparelho', 'ultimoBackup'];

async function arquivosParaJson(lista) {
  const out = [];
  for (const a of lista) {
    const { blob, ...resto } = a;
    out.push({ ...resto, base64: blob ? await blobParaBase64(blob) : null });
  }
  return out;
}

async function cabecalho(tipo) {
  const origem = await carimbo();
  return { formato: FORMATO, versao: 3, exportadoEm: origem.em, origem, tipo };
}

export async function backupCompleto() {
  const [provas, escolas, arquivos, config, turmas, correcoes, aulas] = await Promise.all([todos('provas'), todos('escolas'), todos('arquivos'),
    todos('config'), todos('turmas'), todos('correcoes'), todos('aulas')]);
  return { ...await cabecalho('completo'), provas, escolas, config: config.filter(c => !CONFIG_LOCAL.includes(c.chave)), turmas, correcoes, aulas,
    arquivos: await arquivosParaJson(arquivos) };
}

// uma aula, com a escola e as imagens
export async function backupDaAula(aulaId) {
  const aula = await pegar('aulas', aulaId);
  const escola = aula.escolaId ? await pegar('escolas', aula.escolaId) : null;
  const arquivos = [...await arquivosDe(aulaId), ...(escola ? await arquivosDe(escola.id) : [])];
  return { ...await cabecalho('aula'), provas: [], aulas: [aula], escolas: escola ? [escola] : [], config: [], arquivos: await arquivosParaJson(arquivos) };
}

export async function backupDaProva(provaId) {
  const prova = await pegar('provas', provaId);
  const escola = prova.escolaId ? await pegar('escolas', prova.escolaId) : null;
  const arquivos = [...await arquivosDe(provaId), ...(escola ? await arquivosDe(escola.id) : [])];
  return { ...await cabecalho('prova'), provas: [prova], escolas: escola ? [escola] : [], config: [], arquivos: await arquivosParaJson(arquivos) };
}

// uma turma, com as notas, as correções e as provas que ela usa (sem as imagens: a correção não precisa delas)
export async function backupDaTurma(turmaId) {
  const turma = await pegar('turmas', turmaId);
  const ids = [...new Set(turma.avaliacoes.filter(a => a.provaId).map(a => a.provaId))];
  const provas = (await Promise.all(ids.map(id => pegar('provas', id)))).filter(Boolean);
  const idsEscolas = [...new Set([turma.escolaId, ...provas.map(p => p.escolaId)].filter(Boolean))];
  const escolas = (await Promise.all(idsEscolas.map(id => pegar('escolas', id)))).filter(Boolean);
  return { ...await cabecalho('turma'), provas, escolas, turmas: [turma], correcoes: await correcoesDaTurma(turmaId), config: [], arquivos: [] };
}

export function lerBackup(texto) {
  let dados;
  try { dados = JSON.parse(texto); } catch (e) { throw new Error('Este arquivo não é um backup do Kauê.'); }
  if (!dados || dados.formato !== FORMATO) throw new Error('Este arquivo não é um backup do Kauê.');
  return dados;
}

// Junta o arquivo com o que já existe aqui, sem apagar nada que não esteja nele:
// prova e escola: fica a versão alterada por último; turma: junta aluno por aluno, nota por nota, ficando a mais recente.
// Com { simular: true }, só calcula o que vai acontecer (para mostrar antes).
export async function restaurar(dados, { simular = false } = {}) {
  const gravar = (loja, obj) => (simular ? null : guardar(loja, obj));
  const r = { origem: dados.origem || null, exportadoEm: dados.exportadoEm, tipo: dados.tipo, conflitos: [],
    provas: { novas: [], atualizadas: [], mantidas: [], iguais: [] }, escolas: { novas: [], atualizadas: [], mantidas: [], iguais: [] },
    aulas: { novas: [], atualizadas: [], mantidas: [], iguais: [] }, turmas: [] };
  const destino = { nova: 'novas', vindo: 'atualizadas', local: 'mantidas', igual: 'iguais' };
  const donosVindos = new Set();

  const existentes = await todos('provas');
  for (const p of dados.provas || []) {
    const local = existentes.find(e => e.id === p.id);
    const d = decidir(local, p);
    r.provas[destino[d]].push(p);
    if (d === 'nova' || d === 'vindo') {
      const mesmoNumero = existentes.find(e => e.numero === p.numero && e.id !== p.id);
      if (mesmoNumero) r.conflitos.push({ numero: p.numero, titulo: p.titulo, outro: mesmoNumero.titulo });
      // a marca de impressão mais recente continua valendo
      const copia = { ...p };
      if (local && local.impressao && (!p.impressao || local.impressao.em > p.impressao.em)) { copia.impressao = local.impressao; copia.impressaEm = local.impressaEm; }
      await gravar('provas', copia); donosVindos.add(p.id);
    }
  }
  for (const au of dados.aulas || []) {
    const d = decidir(await pegar('aulas', au.id), au);
    r.aulas[destino[d]].push(au);
    if (d === 'nova' || d === 'vindo') { await gravar('aulas', au); donosVindos.add(au.id); }
  }
  for (const e of dados.escolas || []) {
    const d = decidir(await pegar('escolas', e.id), e);
    r.escolas[destino[d]].push(e);
    if (d === 'nova' || d === 'vindo') { await gravar('escolas', e); donosVindos.add(e.id); }
  }

  const correcoesVindas = dados.correcoes || [];
  for (const t of dados.turmas || []) {
    const local = await pegar('turmas', t.id);
    const vindas = correcoesVindas.filter(c => c.turmaId === t.id);
    if (!local) {
      const notas = Object.values(t.notas || {}).reduce((s, col) => s + Object.values(col).filter(v => v != null).length, 0);
      r.turmas.push({ nome: t.nome, nova: true, alunos: (t.alunos || []).filter(a => !a.inativo).length, notas });
      await gravar('turmas', t);
      for (const c of vindas) await gravar('correcoes', c);
      continue;
    }
    const { turma, resumo } = juntarTurmas(local, t);
    r.turmas.push({ nome: turma.nome, nova: false, ...resumo, alteradaAqui: local.alterada, alteradaNoArquivo: t.alterada });
    if (simular) continue;
    await guardar('turmas', turma);
    const corr = juntarCorrecoes(await correcoesDaTurma(t.id), vindas, turma);
    for (const c of corr.gravar) await guardar('correcoes', c);
    for (const id of corr.apagar) await apagar('correcoes', id);
  }

  // imagens: entram as da prova ou escola que veio do arquivo, e as que faltam aqui
  let imagens = 0;
  for (const a of dados.arquivos || []) {
    if (!donosVindos.has(a.dono) && await pegar('arquivos', a.id)) continue;
    imagens++;
    if (simular) continue;
    const { base64, ...resto } = a;
    await guardar('arquivos', { ...resto, blob: base64 ? base64ParaBlob(base64, a.tipo) : null });
  }
  r.imagens = imagens;

  // configurações: só o nome do professor, e só se ainda não houver aqui
  for (const c of dados.config || []) {
    if (c.chave !== 'professor' || CONFIG_LOCAL.includes(c.chave)) continue;
    if (!(await pegar('config', 'professor'))) await gravar('config', c);
  }
  return r;
}

// o resumo em frases curtas, para mostrar antes de restaurar e depois
export async function resumoEmLinhas(r) {
  const eu = await aparelho();
  const linhas = [];
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  if (r.origem) {
    linhas.push({ tipo: 'origem', texto: `Arquivo gerado em ${descreverCarimbo(r.origem, { meuId: eu.id })}${r.origem.aparelho ? '' : ' (aparelho sem nome)'}.` });
    if (r.origem.aparelhoId === eu.id) linhas.push({ tipo: 'aviso', texto: 'Este arquivo saiu deste mesmo aparelho. Se a ideia era trazer o que foi feito no outro, escolha o arquivo que veio de lá.' });
  } else if (r.exportadoEm) linhas.push({ tipo: 'origem', texto: `Arquivo gerado em ${dataHora(r.exportadoEm)}, por uma versão antiga do Kauê (sem o nome do aparelho).` });
  const dias = r.exportadoEm ? Math.floor((Date.now() - new Date(r.exportadoEm)) / 864e5) : 0;
  if (dias >= 3) linhas.push({ tipo: 'aviso', texto: `Este arquivo tem ${dias} dias. Confira se não há um mais recente.` });

  const p = r.provas;
  const partes = [];
  if (p.novas.length) partes.push(plural(p.novas.length, 'nova', 'novas'));
  if (p.atualizadas.length) partes.push(`${plural(p.atualizadas.length, 'atualizada', 'atualizadas')} (a do arquivo é mais recente)`);
  if (p.mantidas.length) partes.push(`${p.mantidas.length} sem mudança (a daqui é mais recente)`);
  if (p.iguais.length) partes.push(`${p.iguais.length} já igual aqui`);
  if (partes.length) linhas.push({ tipo: 'item', texto: `Provas: ${partes.join(', ')}.` });

  for (const t of r.turmas) {
    if (t.nova) { linhas.push({ tipo: 'item', texto: `Turma ${t.nome}: nova neste aparelho, com ${plural(t.alunos, 'aluno', 'alunos')} e ${plural(t.notas, 'nota', 'notas')}.` }); continue; }
    const q = [];
    if (t.notasVindas) q.push(`${plural(t.notasVindas, 'nota entra ou é atualizada', 'notas entram ou são atualizadas')}`);
    if (t.notasMantidas) q.push(`${plural(t.notasMantidas, 'nota daqui é mais recente e fica', 'notas daqui são mais recentes e ficam')}`);
    if (t.alunosNovos) q.push(plural(t.alunosNovos, 'aluno novo', 'alunos novos'));
    if (t.avaliacoesNovas) q.push(plural(t.avaliacoesNovas, 'avaliação nova', 'avaliações novas'));
    if (t.tirados) q.push(`${plural(t.tirados, 'aluno ou avaliação sai', 'alunos ou avaliações saem')} (foram tirados no outro aparelho)`);
    linhas.push({ tipo: 'item', texto: `Turma ${t.nome}: ${q.length ? q.join('; ') : 'nada muda, as notas já são as mesmas'}.` });
  }
  const au = r.aulas || { novas: [], atualizadas: [], mantidas: [], iguais: [] };
  const pa = [];
  if (au.novas.length) pa.push(plural(au.novas.length, 'nova', 'novas'));
  if (au.atualizadas.length) pa.push(`${plural(au.atualizadas.length, 'atualizada', 'atualizadas')} (a do arquivo é mais recente)`);
  if (au.mantidas.length) pa.push(`${au.mantidas.length} sem mudança (a daqui é mais recente)`);
  if (au.iguais.length) pa.push(`${au.iguais.length} já igual aqui`);
  if (pa.length) linhas.push({ tipo: 'item', texto: `Aulas: ${pa.join(', ')}.` });
  const e = r.escolas;
  if (e.novas.length || e.atualizadas.length) linhas.push({ tipo: 'item', texto: `Escolas: ${[e.novas.length && plural(e.novas.length, 'nova', 'novas'), e.atualizadas.length && plural(e.atualizadas.length, 'atualizada', 'atualizadas')].filter(Boolean).join(', ')}.` });
  if (r.imagens) linhas.push({ tipo: 'item', texto: `${plural(r.imagens, 'imagem', 'imagens')} de prova, de aula ou de cabeçalho.` });
  for (const c of r.conflitos) linhas.push({ tipo: 'aviso', texto: `A prova nº ${String(c.numero).padStart(3, '0')} (${c.titulo}) tem o mesmo número de "${c.outro}", que já está aqui. Na correção, confira qual é qual.` });
  return linhas;
}
