// Kauê — leitor do Formato Kauê – Aula
// Lê as partes que o Assistente de Aulas entrega (roteiro, apostila, adaptadas e slides), cada uma num bloco de código,
// coladas juntas ou uma embaixo da outra. As atividades usam o mesmo formato das questões da prova.
// Funciona no navegador e no Node (módulo ES, sem dependências além do leitor da prova).
import { lerFormatoKaue } from './formato-kaue.js';

const semAcento = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const normChave = s => semAcento(s).toLowerCase().trim().replace(/[\s-]+/g, '_');
const limpa = s => (s || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const normNome = s => semAcento(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const RE = {
  aula: /^#\s*AULA\b\s*:?\s*$/i,
  roteiro: /^##\s*ROTEIRO\b.*$/i,
  adaptada: /^##\s*(?:APOSTILA\s+)?ADAPTADA\b\s*[:–-]?\s*(.*)$/i,
  apostila: /^##\s*APOSTILA\b(?:\s+DA\s+TURMA)?\s*[:–-]?\s*(.*)$/i,
  slides: /^##\s*SLIDES\b.*$/i,
  outra2: /^##\s+\S/,
  bloco: /^###\s*BLOCO\b\s*\d*\s*[:–.-]?\s*(.*)$/i,
  secao: /^###\s*SE[ÇC][ÃA]O\b\s*\d*\s*[:–.-]?\s*(.*)$/i,
  glossario: /^###\s*GLOSS[ÁA]RIO\b.*$/i,
  atividade: /^###\s*(?:ATIVIDADE|QUEST[ÃA]O)\b\s*(\d*)(.*)$/i,
  slide: /^###\s*SLIDE\b\s*(\d*)\s*[:–.-]?\s*(.*)$/i,
  verificacao: /^###\s*VERIFICA[ÇC][ÃA]O\b.*$/i,
  tarefa: /^###\s*TAREFA\b.*$/i,
  fontes: /^###\s*FONTES?\b.*$/i,
  outra3: /^###\s+\S/,
  campo: /^([A-Za-zÀ-ÿ_ ()]{2,26}?)\s*:\s?(.*)$/,
  nivel2: /^##\s*(SE[ÇC][ÃA]O|GLOSS[ÁA]RIO|ATIVIDADE|QUEST[ÃA]O|BLOCO|SLIDE\s*\d|VERIFICA[ÇC][ÃA]O|TAREFA|FONTES?\b)/i,
  atividades: /^###\s*ATIVIDADES\s*:?\s*$/i,
  conversa: /^(parte \d+ de \d+|posso seguir|responda ok|a seguir vem a parte|copie o bloco)/i,
  item: /^[-•*]\s+(.*)$/,
  numerado: /^\d+[.)]\s+(.*)$/,
};

// campos de cada parte: nome normalizado → [nome no objeto, jeito: 'linha' | 'texto' | 'lista']
const C = (pares) => new Map(pares.map(([k, v, j]) => [k, [v, j]]));
const CAMPOS = {
  aula: C([['titulo', 'titulo', 'linha'], ['tema', 'titulo', 'linha'], ['disciplina', 'disciplina', 'linha'], ['turma', 'turma', 'linha'], ['serie', 'turma', 'linha'],
    ['ano', 'turma', 'linha'], ['escola', 'escola', 'linha'], ['professor', 'professor', 'linha'], ['professora', 'professor', 'linha'], ['professor(a)', 'professor', 'linha'],
    ['duracao', 'duracao', 'linha'], ['objetivo', 'objetivo', 'texto'], ['objetivos', 'objetivo', 'texto'], ['antes', 'antes', 'texto'],
    ['o_que_precisam_saber_antes', 'antes', 'texto'], ['bncc', 'bncc', 'lista'], ['materiais', 'materiais', 'lista']]),
  bloco: C([['tempo', 'tempo', 'linha'], ['resumo', 'resumo', 'texto'], ['slides', 'slides', 'linha'], ['slide', 'slides', 'linha'], ['fazer', 'fazer', 'lista'],
    ['o_que_fazer', 'fazer', 'lista'], ['fala', 'fala', 'texto'], ['fala_sugerida', 'fala', 'texto'], ['perguntas', 'perguntas', 'lista'],
    ['perguntas_para_a_turma', 'perguntas', 'lista'], ['apoios', 'apoios', 'lista'], ['tempo_extra', 'tempoExtra', 'texto'], ['se_sobrar_ou_faltar_tempo', 'tempoExtra', 'texto'],
    ['se_faltar_tempo', 'tempoExtra', 'texto'], ['plano_b', 'tempoExtra', 'texto']]),
  verificacao: C([['texto', 'verificacao', 'texto']]),
  tarefa: C([['texto', 'tarefa', 'texto']]),
  apostila: C([['titulo', 'titulo', 'linha'], ['aprender', 'aprender', 'texto'], ['apoios', 'apoios', 'linha'], ['copias', 'copias', 'linha'], ['mudou', 'mudou', 'texto'],
    ['o_que_mudou', 'mudou', 'texto'], ['dicas', 'dicas', 'lista'], ['rotina', 'rotina', 'lista'], ['sairam', 'sairam', 'texto'], ['atividades_que_sairam', 'sairam', 'texto']]),
  secao: C([['texto', 'texto', 'texto'], ['lembrar', 'lembrar', 'texto'], ['para_lembrar', 'lembrar', 'texto'], ['imagem', 'imagens', 'imagem']]),
  slide: C([['titulo', 'titulo', 'linha'], ['texto', 'texto', 'texto'], ['imagem', 'imagens', 'imagem'], ['notas', 'notas', 'texto'], ['notas_do_professor', 'notas', 'texto']]),
};

export const APOIOS = {
  leitura: 'Leitura e escrita iniciais', compreensao: 'Compreensão de textos e enunciados', atencao: 'Atenção e organização',
  motora: 'Coordenação motora fina', visao: 'Visão', previsibilidade: 'Comunicação e previsibilidade', desafio: 'Desafio a mais', outro: 'Outro',
};
const APOIO_POR_PALAVRA = [[/leitura|escrita|alfabet/, 'leitura'], [/compreens|enunciad/, 'compreensao'], [/aten[cç]|organiza/, 'atencao'],
  [/motor/, 'motora'], [/previs|comunica|rotina/, 'previsibilidade'], [/vis[aã]o|visual|letra (ampliada|grande)|contraste/, 'visao'], [/desafio|altas hab/, 'desafio']];
const APOIO_POR_NUMERO = ['', 'leitura', 'compreensao', 'atencao', 'motora', 'visao', 'previsibilidade', 'desafio', 'outro'];
export function lerApoios(texto) {
  const t = semAcento(texto || '').toLowerCase();
  const achados = new Set();
  t.split(/[,;·]|\se\s/).forEach(parte => {
    const p = parte.trim(); if (!p) return;
    if (/^[1-8]$/.test(p)) { achados.add(APOIO_POR_NUMERO[Number(p)]); return; }
    const m = APOIO_POR_PALAVRA.find(([re]) => re.test(p));
    achados.add(m ? m[1] : 'outro');
  });
  return [...achados];
}

const TIPOS_PRATICA = /^(pratica|pratica ou criativa|atividade pratica|criativa|desenho|producao|jogo|dinamica)$/;

function lerImagem(v) {
  const [arquivo, ...resto] = v.split('|');
  return { arquivo: arquivo.trim() || '[inserir]', legenda: resto.join('|').trim() };
}

// "0-5", "0–5 min", "5 a 20" → { inicio, fim }; "5 min" → { minutos }
function lerTempo(v) {
  const t = semAcento(v || '').toLowerCase();
  const m = t.match(/(\d+)\s*(?:-|–|a|ate)\s*(\d+)/);
  if (m) return { inicio: Number(m[1]), fim: Number(m[2]) };
  const s = t.match(/(\d+)/);
  return s ? { minutos: Number(s[1]) } : {};
}
// "2 a 8", "9, 10", "1" → [números]; "nenhum" → []
export function lerSlides(v) {
  const t = semAcento(v || '').toLowerCase();
  const lista = [];
  for (const m of t.matchAll(/(\d+)\s*(?:-|–|a|ate)\s*(\d+)|(\d+)/g)) {
    if (m[3]) lista.push(Number(m[3]));
    else for (let k = Number(m[1]); k <= Number(m[2]) && k - Number(m[1]) < 60; k++) lista.push(k);
  }
  return [...new Set(lista)];
}
function lerDuracao(v) {
  const t = semAcento(v || '').toLowerCase();
  const m = t.match(/(\d+)\s*aulas?\s*de\s*(\d+)/);
  if (m) return Number(m[1]) * Number(m[2]);
  const h = t.match(/(\d+)\s*h(?:ora)?s?\s*(?:e\s*)?(\d+)?/);
  if (h) return Number(h[1]) * 60 + Number(h[2] || 0);
  const s = t.match(/(\d+)/);
  return s ? Number(s[1]) : null;
}
// "Pergunta? (Resposta esperada: ...)" ou "Pergunta? | resposta"
function lerPergunta(t) {
  const m = t.match(/^(.*?)\s*\(\s*resposta(?:\s+esperada)?\s*:\s*(.*)\)\s*\.?$/i) || t.match(/^(.*?)\s+\|\s+(.*)$/);
  return m ? { texto: m[1].trim(), resposta: m[2].trim() } : { texto: t.trim(), resposta: '' };
}
// "- termo: significado"
function lerVerbete(t) {
  const m = t.match(/^(.+?)\s*[:–—-]\s+(.*)$/);
  return m ? { termo: m[1].replace(/\*\*/g, '').trim(), significado: m[2].trim() } : { termo: t.trim(), significado: '' };
}

// só o que está dentro dos blocos de código (```), com o número da linha original; sem blocos, o texto todo
function linhasUteis(todas) {
  const temBloco = todas.some(l => /^\s*```/.test(l));
  if (!temBloco) return todas.map((texto, i) => ({ texto, n: i + 1, solto: true }));
  const out = [];
  let dentro = false;
  todas.forEach((texto, i) => {
    if (/^\s*```/.test(texto)) { dentro = !dentro; if (!dentro) out.push({ texto: '', n: i + 1 }); return; }
    if (dentro) out.push({ texto, n: i + 1 });
  });
  return out;
}

export function lerAula(textoEntrada) {
  const todas = String(textoEntrada || '').replace(/\r\n?/g, '\n').split('\n');
  const linhas = linhasUteis(todas);
  const res = { aula: null, roteiro: null, apostilas: [], slides: [], erros: [], avisos: [] };
  const erro = (linha, msg) => res.erros.push({ linha, msg });
  const aviso = (linha, msg) => res.avisos.push({ linha, msg });

  // partes lidas, na ordem em que aparecem (a mesma parte colada de novo substitui a anterior)
  const partes = { aula: [], roteiro: [], apostila: [], slides: [] };
  let parte = null;        // parte atual: { tipo, obj }
  let alvo = null;         // objeto que recebe os campos (a aula, um bloco, uma seção, um slide…)
  let tipoAlvo = null;     // chave em CAMPOS
  let ultimo = null;       // { obj, prop, jeito } que recebe as linhas seguintes
  let ativ = null;         // atividade em leitura: linhas guardadas para o leitor da prova

  const fecharAtividade = () => { if (ativ) { ativ.ap.ativLinhas.push(...ativ.linhas); ativ = null; } };
  const mudar = (tipo, obj) => { fecharAtividade(); alvo = obj; tipoAlvo = tipo; ultimo = null; };
  const novaApostila = (n, nome, adaptada) => ({ linha: n, nome, adaptada, titulo: '', aprender: '', apoios: '', copias: null, mudou: '', dicas: [],
    rotina: [], sairam: '', secoes: [], glossario: [], ativLinhas: [], atividades: [] });

  for (const { texto, n, solto } of linhas) {
    let l = texto.trim();
    // texto copiado sem os blocos de código: a conversa da IA entre as partes fecha a parte anterior
    if (solto && RE.conversa.test(l)) { fecharAtividade(); parte = null; mudar(null, null); continue; }
    if (parte && RE.nivel2.test(l)) l = '#' + l;   // "## SEÇÃO" dentro de uma parte vale como "### SEÇÃO"
    if (ativ) {
      // dentro de uma atividade, tudo vai para o leitor da prova até o próximo título
      if (!/^#{1,3}\s/.test(l)) { ativ.linhas.push({ texto, n }); continue; }
      fecharAtividade();
    }
    if (!l) {
      if (ultimo && ultimo.jeito === 'texto') { if (ultimo.obj[ultimo.prop]) ultimo.obj[ultimo.prop] += '\n\n'; }
      else if (ultimo && ultimo.jeito === 'lista') ultimo = { ...ultimo, fechada: true };
      continue;
    }
    let m;
    if (RE.aula.test(l)) {
      const obj = { linha: n, titulo: '', disciplina: '', turma: '', escola: '', professor: '', duracao: '', objetivo: '', antes: '', bncc: [], materiais: [] };
      partes.aula.push(obj); parte = { tipo: 'aula', obj }; mudar('aula', obj); continue;
    }
    if (RE.roteiro.test(l)) {
      const obj = { linha: n, blocos: [], verificacao: '', tarefa: '', fontes: [] };
      partes.roteiro.push(obj); parte = { tipo: 'roteiro', obj }; mudar(null, null); continue;
    }
    if ((m = l.match(RE.adaptada))) {
      const obj = novaApostila(n, m[1].trim() || 'Adaptada', true);
      partes.apostila.push(obj); parte = { tipo: 'apostila', obj }; mudar('apostila', obj); continue;
    }
    if ((m = l.match(RE.apostila))) {
      const obj = novaApostila(n, 'Turma', false);
      if (m[1] && !/^da turma$/i.test(m[1].trim())) obj.titulo = m[1].trim();
      partes.apostila.push(obj); parte = { tipo: 'apostila', obj }; mudar('apostila', obj); continue;
    }
    if (RE.slides.test(l)) {
      const obj = { linha: n, lista: [] };
      partes.slides.push(obj); parte = { tipo: 'slides', obj }; mudar(null, null); continue;
    }
    if (RE.outra2.test(l)) { aviso(n, `Parte desconhecida, ignorada: "${l.slice(0, 60)}"`); parte = null; mudar(null, null); continue; }

    // títulos de terceiro nível, conforme a parte
    if (RE.atividades.test(l)) { mudar(null, null); continue; }
    if (l.startsWith('###')) {
      const tipo = parte && parte.tipo;
      if (tipo === 'roteiro' && (m = l.match(RE.bloco))) {
        const b = { linha: n, titulo: m[1].trim(), tempo: '', resumo: '', slides: null, fazer: [], fala: '', perguntas: [], apoios: [], tempoExtra: '' };
        parte.obj.blocos.push(b); mudar('bloco', b); continue;
      }
      if (tipo === 'roteiro' && RE.verificacao.test(l)) { mudar('verificacao', parte.obj); ultimo = { obj: parte.obj, prop: 'verificacao', jeito: 'texto' }; continue; }
      if (tipo === 'roteiro' && RE.tarefa.test(l)) { mudar('tarefa', parte.obj); ultimo = { obj: parte.obj, prop: 'tarefa', jeito: 'texto' }; continue; }
      if (tipo === 'roteiro' && RE.fontes.test(l)) { mudar(null, parte.obj); ultimo = { obj: parte.obj, prop: 'fontes', jeito: 'lista', cadaLinha: true }; continue; }
      if (tipo === 'apostila' && (m = l.match(RE.secao))) {
        const s = { linha: n, titulo: m[1].trim(), texto: '', lembrar: '', imagens: [] };
        parte.obj.secoes.push(s); mudar('secao', s); continue;
      }
      if (tipo === 'apostila' && RE.glossario.test(l)) { mudar(null, parte.obj); ultimo = { obj: parte.obj, prop: 'glossario', jeito: 'lista', cadaLinha: true }; continue; }
      if (tipo === 'apostila' && (m = l.match(RE.atividade))) {
        mudar(null, null);
        ativ = { ap: parte.obj, linhas: [{ texto: '### QUESTÃO', n, numeroEscrito: m[1] ? Number(m[1]) : null }] };
        continue;
      }
      if (tipo === 'slides' && (m = l.match(RE.slide))) {
        const s = { linha: n, numeroEscrito: m[1] ? Number(m[1]) : null, titulo: m[2].trim(), texto: '', imagens: [], notas: '' };
        parte.obj.lista.push(s); mudar('slide', s); continue;
      }
      aviso(n, parte ? `Título fora do lugar, ignorado: "${l.slice(0, 60)}"` : `Linha fora de uma parte da aula: "${l.slice(0, 60)}"`);
      mudar(null, null); continue;
    }

    // campo: valor
    if (tipoAlvo && (m = l.match(RE.campo))) {
      const def = CAMPOS[tipoAlvo].get(normChave(m[1]));
      if (def) {
        const [prop, jeito] = def;
        const valor = m[2].trim();
        if (jeito === 'imagem') { alvo.imagens.push(lerImagem(valor)); ultimo = null; }
        else if (jeito === 'lista') {
          alvo[prop] = valor ? [valor] : [];
          ultimo = { obj: alvo, prop, jeito: 'lista', cadaLinha: prop === 'bncc' };
        } else {
          alvo[prop] = valor;
          ultimo = jeito === 'texto' ? { obj: alvo, prop, jeito: 'texto' } : null;
        }
        continue;
      }
    }

    // item de lista
    if ((m = l.match(RE.item) || (ultimo && ultimo.jeito === 'lista' && l.match(RE.numerado)))) {
      if (ultimo && ultimo.jeito === 'lista') {
        ultimo.obj[ultimo.prop].push(m[1].trim()); ultimo.fechada = false; continue;
      }
      if (ultimo && ultimo.jeito === 'texto') {
        const atual = ultimo.obj[ultimo.prop] || '';
        ultimo.obj[ultimo.prop] = atual + (atual && !atual.endsWith('\n') ? '\n' : '') + '• ' + m[1].trim();
        continue;
      }
    }
    // continuação
    if (ultimo && ultimo.jeito === 'lista') {
      const lista = ultimo.obj[ultimo.prop];
      if (lista.length && !ultimo.fechada && !ultimo.cadaLinha) { lista[lista.length - 1] += ' ' + l; continue; }
      lista.push(l); ultimo.fechada = false; continue;
    }
    if (ultimo && ultimo.jeito === 'texto') {
      const atual = ultimo.obj[ultimo.prop] || '';
      ultimo.obj[ultimo.prop] = atual + (atual && !atual.endsWith('\n') ? '\n' : '') + l;
      continue;
    }
    // fora de uma parte é conversa da IA (quando o texto veio sem blocos de código): não atrapalha
    if (parte) aviso(n, `Linha não reconhecida e ignorada: "${l.slice(0, 60)}"`);
  }
  fecharAtividade();

  // a mesma parte colada mais de uma vez: vale a última
  const ultimaDe = (lista, nome, linhaDe = x => x.linha) => {
    if (lista.length > 1) aviso(linhaDe(lista[lista.length - 1]), `${nome} apareceu ${lista.length} vezes; usei a última.`);
    return lista.length ? lista[lista.length - 1] : null;
  };
  res.aula = ultimaDe(partes.aula, 'A Parte 1 (# AULA)');
  res.roteiro = ultimaDe(partes.roteiro, 'O roteiro');
  const slidesParte = ultimaDe(partes.slides, 'A parte dos slides');
  const porNome = new Map();
  for (const ap of partes.apostila) {
    const chave = ap.adaptada ? 'a:' + normNome(ap.nome) : 'turma';
    if (porNome.has(chave)) aviso(ap.linha, `${ap.adaptada ? `A "${ap.nome}"` : 'A apostila da turma'} apareceu de novo; usei a última.`);
    porNome.set(chave, ap);
  }
  res.apostilas = [...porNome.values()].sort((a, b) => Number(a.adaptada) - Number(b.adaptada));
  res.slides = slidesParte ? slidesParte.lista : [];

  finalizar(res, erro, aviso);
  res.erros.sort((a, b) => a.linha - b.linha);
  res.avisos.sort((a, b) => a.linha - b.linha);
  return res;
}

// as atividades de uma apostila: o leitor da prova faz o trabalho; as práticas viram "discursiva" lá e voltam a ser práticas aqui
function lerAtividades(ap, erro, aviso) {
  if (!ap.ativLinhas.length) return;
  const praticas = new Set(), comEspaco = new Set();
  const escritos = [];
  let k = -1;
  const saida = ap.ativLinhas.map(({ texto, n, numeroEscrito }) => {
    const l = texto.trim();
    if (/^###\s*QUEST/.test(l)) { k++; escritos.push({ numero: numeroEscrito, n }); return texto; }
    const t = l.match(/^tipo\s*:\s*(.*)$/i);
    if (t && TIPOS_PRATICA.test(semAcento(t[1]).toLowerCase().trim())) { praticas.add(k); return 'tipo: discursiva'; }
    if (/^(linhas|espa[çc]o)\s*:/i.test(l)) { comEspaco.add(k); return l.replace(/^espa[çc]o\s*:/i, 'linhas:'); }
    return texto;
  });
  const r = lerFormatoKaue(saida.join('\n'));
  const linhaOriginal = x => (ap.ativLinhas[Math.max(0, Math.min(ap.ativLinhas.length - 1, x - 1))] || {}).n || ap.linha;
  r.erros.filter(e => !/# PROVA|Nenhuma questão/.test(e.msg)).forEach(e => erro(linhaOriginal(e.linha), troca(e.msg)));
  r.avisos.filter(e => !/Dados da prova|valor total|zero ou negativo/.test(e.msg))
    .filter(e => !(praticas.has(r.questoes.findIndex(q => q.linha === e.linha)) && /sem "resposta"/.test(e.msg)))
    .forEach(e => aviso(linhaOriginal(e.linha), troca(e.msg)));
  r.questoes.forEach((q, i) => {
    if (praticas.has(i)) { q.tipo = 'pratica'; q.gabarito = 'prática'; if (!comEspaco.has(i)) q.linhas = 12; }
    q.linha = linhaOriginal(q.linha);
    const e = escritos[i];
    if (e && e.numero && e.numero !== i + 1) aviso(e.n, `${ap.adaptada ? ap.nome + ': a' : 'A'} atividade escrita como nº ${e.numero} é a ${i + 1}ª da apostila. Confira se o roteiro cita o número certo.`);
  });
  ap.atividades = r.questoes;
}
const troca = msg => msg.replace(/Questão (\d+)/g, 'Atividade $1').replace(/questão/g, 'atividade').replace(/### QUESTÃO/g, '### ATIVIDADE');

function finalizar(res, erro, aviso) {
  const a = res.aula;
  if (!a) {
    if (!res.roteiro && !res.apostilas.length && !res.slides.length) erro(1, 'Não encontrei a aula. Cole o bloco de código que começa com "# AULA" (Parte 1) e, depois, os blocos das outras partes.');
    else erro(1, 'Falta a Parte 1, o bloco que começa com "# AULA", com o título, a turma e o roteiro.');
  } else {
    a.objetivo = limpa(a.objetivo); a.antes = limpa(a.antes);
    if (!a.titulo) erro(a.linha, 'Falta o "titulo" da aula.');
    a.duracaoMin = lerDuracao(a.duracao);
    if (!a.duracao) aviso(a.linha, 'Falta a "duracao" da aula, em minutos.');
  }

  // roteiro: tempos seguidos, soma igual à duração
  const r = res.roteiro;
  if (r) {
    r.verificacao = limpa(r.verificacao); r.tarefa = limpa(r.tarefa);
    let fimAnterior = 0;
    r.blocos.forEach((b, i) => {
      b.n = i + 1;
      ['resumo', 'fala', 'tempoExtra'].forEach(c => { b[c] = limpa(b[c]); });
      b.perguntas = b.perguntas.map(lerPergunta);
      const t = lerTempo(b.tempo);
      if (t.inicio != null) { b.inicio = t.inicio; b.fim = t.fim; }
      else if (t.minutos != null) { b.inicio = fimAnterior; b.fim = fimAnterior + t.minutos; }
      else { aviso(b.linha, `Bloco ${b.n}: falta o "tempo" (ex.: tempo: 0-5).`); b.inicio = fimAnterior; b.fim = fimAnterior; }
      b.minutos = b.fim - b.inicio;
      if (b.minutos < 0) aviso(b.linha, `Bloco ${b.n}: o tempo termina antes de começar (${b.tempo}).`);
      if (i > 0 && b.inicio !== fimAnterior) aviso(b.linha, `Bloco ${b.n} começa aos ${b.inicio} min, mas o anterior termina aos ${fimAnterior} min.`);
      fimAnterior = b.fim;
      b.slidesLista = b.slides == null ? null : lerSlides(b.slides);
      if (!b.titulo) aviso(b.linha, `Bloco ${b.n} sem nome.`);
    });
    r.total = r.blocos.reduce((s, b) => s + Math.max(0, b.minutos), 0);
    if (!r.blocos.length) aviso(r.linha, 'O roteiro não tem blocos (cada um começa com "### BLOCO: nome").');
    else if (a && a.duracaoMin && r.total !== a.duracaoMin) aviso(r.linha, `Os blocos somam ${r.total} minutos, e a aula tem ${a.duracaoMin}.`);
    else if (a && a.duracaoMin && r.blocos[0].inicio !== 0) aviso(r.blocos[0].linha, 'O primeiro bloco deveria começar no minuto 0.');
  }

  // apostilas: textos, atividades, apoios
  for (const ap of res.apostilas) {
    ap.aprender = limpa(ap.aprender); ap.mudou = limpa(ap.mudou); ap.sairam = limpa(ap.sairam);
    ap.secoes.forEach(s => { s.texto = limpa(s.texto); s.lembrar = limpa(s.lembrar); if (!s.texto && !s.lembrar && !s.imagens.length) aviso(s.linha, `Seção "${s.titulo}" sem texto.`); });
    ap.glossario = ap.glossario.map(lerVerbete);
    ap.apoiosTexto = ap.apoios;
    ap.apoios = ap.adaptada ? lerApoios(ap.apoiosTexto || ap.nome.replace(/^adaptada\s*\d*\s*[–—-]?\s*/i, '')) : [];
    const nCopias = String(ap.copias || '').match(/\d+/);
    ap.copias = nCopias ? Number(nCopias[0]) : null;
    lerAtividades(ap, erro, aviso);
    delete ap.ativLinhas;
    if (!ap.secoes.length && !ap.atividades.length) aviso(ap.linha, `${ap.adaptada ? `"${ap.nome}"` : 'A apostila da turma'} está vazia.`);
  }
  res.apostilas.filter(x => x.adaptada).forEach((ap, i) => { ap.chave = `a${i + 1}`; ap.sigla = `A${i + 1}`; });
  const turma = res.apostilas.find(x => !x.adaptada);
  if (turma) { turma.chave = 'turma'; turma.sigla = ''; }

  // slides: numeração e ligação com o roteiro
  res.slides.forEach((s, i) => {
    s.n = i + 1;
    s.texto = limpa(s.texto); s.notas = limpa(s.notas);
    if (s.numeroEscrito && s.numeroEscrito !== s.n) aviso(s.linha, `O slide escrito como nº ${s.numeroEscrito} é o ${s.n}º da lista.`);
    if (!s.titulo) aviso(s.linha, `Slide ${s.n} sem título.`);
    s.itens = s.texto.split('\n').map(x => x.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);
  });
  if (r && res.slides.length) {
    const usados = new Set();
    r.blocos.forEach(b => (b.slidesLista || []).forEach(x => {
      usados.add(x);
      if (x > res.slides.length) aviso(b.linha, `Bloco ${b.n} cita o slide ${x}, mas há só ${res.slides.length} slides.`);
    }));
    const sobra = res.slides.filter(s => !usados.has(s.n)).map(s => s.n);
    if (r.blocos.some(b => b.slidesLista) && sobra.length)
      aviso(r.linha, `${sobra.length > 1 ? 'Os slides' : 'O slide'} ${juntar(sobra)} não ${sobra.length > 1 ? 'aparecem' : 'aparece'} em nenhum bloco do roteiro.`);
  }

  // imagens e resumo
  const imagens = new Map();
  const add = (img, onde) => {
    const chave = img.arquivo === '[inserir]' || !img.arquivo ? `[inserir]|${img.legenda}` : img.arquivo;
    if (!imagens.has(chave)) imagens.set(chave, { chave, arquivo: img.arquivo, legenda: img.legenda, inserir: img.arquivo === '[inserir]', onde: [] });
    imagens.get(chave).onde.push(onde);
  };
  res.apostilas.forEach(ap => {
    const nome = ap.adaptada ? ap.sigla : 'apostila';
    ap.secoes.forEach(s => s.imagens.forEach(i => add(i, `${nome}, "${s.titulo}"`)));
    ap.atividades.forEach(q => q.imagens.forEach(i => add(i, `${nome}, atividade ${q.n}`)));
  });
  res.slides.forEach(s => s.imagens.forEach(i => add(i, `slide ${s.n}`)));
  res.imagens = [...imagens.values()];
  res.resumo = {
    blocos: r ? r.blocos.length : 0, minutos: r ? r.total : 0,
    secoes: turma ? turma.secoes.length : 0, atividades: turma ? turma.atividades.length : 0,
    adaptadas: res.apostilas.filter(x => x.adaptada).length, slides: res.slides.length, imagens: res.imagens.length,
    faltam: [!r && 'roteiro', !turma && 'apostila da turma', !res.slides.length && 'slides'].filter(Boolean),
  };
}

const juntar = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : String(l[0]));

export default lerAula;
