// Kauê — contas da planilha da turma: totais por período, resultado do ano e arredondamento

export const PERIODOS_MODELO = {
  trimestre: ['1º trimestre', '2º trimestre', '3º trimestre'],
  bimestre: ['1º bimestre', '2º bimestre', '3º bimestre', '4º bimestre'],
  semestre: ['1º semestre', '2º semestre'],
};

export const ARREDONDAMENTOS = {
  centesimo: 'Não arredondar (duas casas)',
  decimo: 'Uma casa decimal',
  meio: 'Para o meio ponto mais próximo',
  meioCima: 'Para o meio ponto de cima',
  inteiro: 'Para o número inteiro mais próximo',
};

export function arredondar(v, modo = 'decimo') {
  if (v == null || Number.isNaN(v)) return null;
  const e = 1e-9; // evita 6,49999 por causa da conta com vírgula flutuante
  switch (modo) {
    case 'meio': return Math.round(v * 2 + e) / 2;
    case 'meioCima': return Math.ceil(v * 2 - e) / 2;
    case 'inteiro': return Math.round(v + e);
    case 'decimo': return Math.round(v * 10 + e) / 10;
    default: return Math.round(v * 100 + e) / 100;
  }
}

export const nota2 = v => (v == null ? null : Math.round(v * 100 + 1e-9) / 100);

export const avaliacoesDoPeriodo = (turma, periodoId) => turma.avaliacoes.filter(a => a.periodoId === periodoId);

export function notaDe(turma, avaliacaoId, alunoId) {
  const n = turma.notas && turma.notas[avaliacaoId] ? turma.notas[avaliacaoId][alunoId] : null;
  return n == null ? null : n;
}

export function faltou(turma, avaliacaoId, alunoId) {
  return !!(turma.faltas && turma.faltas[avaliacaoId] && turma.faltas[avaliacaoId][alunoId]);
}

// total de um aluno num período: soma das notas lançadas (sem nota não conta)
export function totalPeriodo(turma, periodoId, alunoId) {
  const notas = avaliacoesDoPeriodo(turma, periodoId).map(a => notaDe(turma, a.id, alunoId)).filter(n => n != null);
  if (!notas.length) return null;
  return arredondar(notas.reduce((s, n) => s + n, 0), turma.config && turma.config.arredondamento);
}

export const maximoPeriodo = (turma, periodoId) =>
  nota2(avaliacoesDoPeriodo(turma, periodoId).reduce((s, a) => s + (Number(a.valorMax) || 0), 0));

// resultado do ano: média ou soma dos períodos que já têm avaliações
export function resultadoAno(turma, alunoId) {
  const comAvaliacao = turma.periodos.filter(p => avaliacoesDoPeriodo(turma, p.id).length);
  const totais = comAvaliacao.map(p => totalPeriodo(turma, p.id, alunoId)).filter(t => t != null);
  if (!totais.length) return null;
  const soma = totais.reduce((s, t) => s + t, 0);
  const modo = (turma.config && turma.config.resultadoAno) || 'media';
  return arredondar(modo === 'soma' ? soma : soma / totais.length, turma.config && turma.config.arredondamento);
}

// alunos em ordem de chamada (número; quem não tem número vai por nome, no fim)
export function alunosEmOrdem(turma, { incluirInativos = false } = {}) {
  return [...turma.alunos].filter(a => incluirInativos || !a.inativo).sort((a, b) => {
    const na = a.numero == null || a.numero === '' ? Infinity : Number(a.numero);
    const nb = b.numero == null || b.numero === '' ? Infinity : Number(b.numero);
    if (na !== nb) return na - nb;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

// lê uma lista colada: "12 Ana Souza", "12 - Ana Souza; 2024001", "Ana Souza<TAB>2024001"
export function lerListaDeAlunos(texto) {
  const alunos = [];
  String(texto || '').split(/\r?\n/).forEach(linha => {
    let l = linha.trim();
    if (!l) return;
    let numero = null, matricula = '';
    const partes = l.split(/\t|;/).map(s => s.trim()).filter(Boolean);
    if (partes.length > 1) {
      // a parte só com dígitos no fim é a matrícula; no começo, o número de chamada
      if (/^\d{1,3}$/.test(partes[0])) numero = Number(partes.shift());
      if (partes.length > 1 && /^[\d.\-/]+$/.test(partes[partes.length - 1])) matricula = partes.pop();
      l = partes.join(' ');
    }
    const m = l.match(/^(\d{1,3})\s*[-–.)º:]?\s+(.+)$/);
    if (numero == null && m) { numero = Number(m[1]); l = m[2]; }
    const nome = l.replace(/\s+/g, ' ').trim();
    if (nome) alunos.push({ numero, nome, matricula });
  });
  return alunos;
}

export function lerNumero(texto) {
  if (texto == null) return null;
  const s = String(texto).trim().replace(',', '.');
  if (s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}
