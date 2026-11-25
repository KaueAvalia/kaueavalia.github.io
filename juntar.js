// Kauê — junta o que veio de outro aparelho com o que já está aqui, sem perder o que é mais recente.
// Cada nota guarda quando e em qual aparelho foi lançada (turma.marcas); na junção, fica a mais recente de cada aluno.
import { nota2 } from './notas.js';

// data de um carimbo ({ em, aparelho }) ou de um texto ISO; sem carimbo = '' (mais antigo que tudo)
export const quando = x => (x == null ? '' : typeof x === 'string' ? x : x.em || '');
const alteradaEm = r => quando(r && r.alterada) || (r && r.atualizadaEm) || '';

// prova ou escola: fica a versão alterada por último; empate ou sem data dos dois lados: a do arquivo
export function decidir(local, vindo) {
  if (!local) return 'nova';
  const a = alteradaEm(local), b = alteradaEm(vindo);
  if (a && b && a === b) return 'igual';
  return b >= a ? 'vindo' : 'local';
}

const vazio = t => ({ alunos: [], avaliacoes: [], periodos: [], notas: {}, faltas: {}, marcas: {}, removidos: {}, config: {}, ...t });
const temCelula = (t, av, al) => !!((t.notas[av] && al in t.notas[av]) || (t.faltas[av] && t.faltas[av][al]) || (t.marcas[av] && t.marcas[av][al]));
const celula = (t, av, al) => ({
  nota: t.notas[av] ? t.notas[av][al] : undefined,
  falta: !!(t.faltas[av] && t.faltas[av][al]),
  marca: t.marcas[av] ? t.marcas[av][al] : undefined,
});
const mesmaNota = (a, b) => a.falta === b.falta && (a.nota ?? null) === (b.nota ?? null);

// une duas listas por id: o item alterado por último vence; o que foi tirado em qualquer aparelho sai
function juntarItens(daqui, doArquivo, removidos) {
  const mapa = new Map(daqui.map(x => [x.id, { x, lado: 'local' }]));
  let novos = 0;
  for (const y of doArquivo) {
    const ja = mapa.get(y.id);
    if (!ja) { mapa.set(y.id, { x: y, lado: 'vindo' }); if (!removidos[y.id]) novos++; }
    else if (quando(y.alterado) > quando(ja.x.alterado)) mapa.set(y.id, { x: y, lado: 'vindo' });
  }
  const tirados = daqui.filter(x => removidos[x.id]).length;
  return { lista: [...mapa.values()].filter(({ x }) => !removidos[x.id]).map(({ x }) => ({ ...x })), novos, tirados };
}

// junta duas versões da mesma turma. Devolve a turma junta e um resumo do que veio do arquivo.
export function juntarTurmas(localBruto, vindoBruto) {
  const L = vazio(localBruto), V = vazio(vindoBruto);
  const resumo = { notasVindas: 0, notasMantidas: 0, alunosNovos: 0, avaliacoesNovas: 0, tirados: 0 };

  const removidos = { ...L.removidos };
  for (const [id, em] of Object.entries(V.removidos)) if (!removidos[id] || em > removidos[id]) removidos[id] = em;

  // nome, disciplina, escola, períodos e configuração: fica o que foi editado por último
  const baseVinda = quando(V.estrutura) > quando(L.estrutura);
  const base = baseVinda ? V : L, outra = baseVinda ? L : V;
  const periodos = [...base.periodos, ...outra.periodos.filter(p => !base.periodos.some(b => b.id === p.id))].map(p => ({ ...p }));

  const alunos = juntarItens(L.alunos, V.alunos, removidos);
  const avaliacoes = juntarItens(L.avaliacoes, V.avaliacoes, removidos);
  resumo.alunosNovos = alunos.novos; resumo.avaliacoesNovas = avaliacoes.novos; resumo.tirados = alunos.tirados + avaliacoes.tirados;

  const out = {
    ...L, nome: base.nome, disciplina: base.disciplina, escolaId: base.escolaId, anoLetivo: base.anoLetivo, divisao: base.divisao,
    config: { ...base.config }, estrutura: base.estrutura, periodos, removidos,
    alunos: alunos.lista, avaliacoes: avaliacoes.lista, notas: {}, faltas: {}, marcas: {},
    criada: L.criada || V.criada, criadaEm: L.criadaEm || V.criadaEm,
  };
  // a turma junta conta como alterada quando foi alterada por último num dos dois aparelhos
  if (quando(V.alterada) > quando(L.alterada)) { out.alterada = V.alterada; out.atualizadaEm = V.atualizadaEm; }

  const avL = new Map(L.avaliacoes.map(a => [a.id, a])), avV = new Map(V.avaliacoes.map(a => [a.id, a]));
  const idsAlunos = new Set(out.alunos.map(a => a.id));
  for (const av of out.avaliacoes) {
    const ids = new Set([L, V].flatMap(t => ['notas', 'faltas', 'marcas'].flatMap(k => Object.keys(t[k][av.id] || {}))));
    for (const al of ids) {
      if (!idsAlunos.has(al)) continue;
      const tl = temCelula(L, av.id, al), tv = temCelula(V, av.id, al);
      const cl = celula(L, av.id, al), cv = celula(V, av.id, al);
      let lado;
      if (!tv) lado = 'local';
      else if (!tl) lado = 'vindo';
      else {
        const a = quando(cl.marca), b = quando(cv.marca);
        if (b > a) lado = 'vindo';
        else if (a > b) lado = 'local';
        // empate ou dados sem carimbo: fica a daqui, a não ser que só o arquivo tenha nota
        else lado = cl.nota == null && !cl.falta && (cv.nota != null || cv.falta) ? 'vindo' : 'local';
      }
      const usar = lado === 'vindo' ? cv : cl;
      if (tl && tv && !mesmaNota(cl, cv)) resumo[lado === 'vindo' ? 'notasVindas' : 'notasMantidas']++;
      else if (!tl && tv && (cv.nota != null || cv.falta)) resumo.notasVindas++;
      // a nota acompanha o valor da coluna, se um dos aparelhos mudou quanto ela vale
      const avLado = (lado === 'vindo' ? avV : avL).get(av.id);
      let nota = usar.nota;
      if (nota != null && avLado && avLado.valorMax && av.valorMax && avLado.valorMax !== av.valorMax) nota = nota2(nota * av.valorMax / avLado.valorMax);
      if (nota !== undefined) (out.notas[av.id] = out.notas[av.id] || {})[al] = nota;
      if (usar.falta) (out.faltas[av.id] = out.faltas[av.id] || {})[al] = true;
      if (usar.marca) (out.marcas[av.id] = out.marcas[av.id] || {})[al] = usar.marca;
    }
  }
  return { turma: out, resumo };
}

// correções (o que foi marcado em cada questão): fica a mais recente; aluno que ficou com falta perde a correção
export function juntarCorrecoes(locais, vindas, turmaJunta) {
  const mapa = new Map(locais.map(c => [c.id, c]));
  const gravar = [], apagar = [];
  for (const c of vindas) {
    const l = mapa.get(c.id);
    if (!l || quando(c.em) > quando(l.em)) { gravar.push(c); mapa.set(c.id, c); }
  }
  for (const c of mapa.values()) {
    const faltou = turmaJunta.faltas[c.avaliacaoId] && turmaJunta.faltas[c.avaliacaoId][c.alunoId];
    const existe = turmaJunta.avaliacoes.some(a => a.id === c.avaliacaoId) && turmaJunta.alunos.some(a => a.id === c.alunoId);
    if (faltou || !existe) {
      const i = gravar.indexOf(c); if (i >= 0) gravar.splice(i, 1);
      if (locais.some(x => x.id === c.id)) apagar.push(c.id);
    }
  }
  return { gravar, apagar };
}
