// Kauê — baixa os slides da aula em PowerPoint (.pptx), no próprio aparelho, com a biblioteca PptxGenJS (licença MIT)
import { blobParaBase64 } from './util.js';
import { semTituloProf } from './render-aula.js';

let carregando = null;
function carregarPptx() {
  if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  if (!carregando) carregando = new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/pptxgenjs/pptxgen.bundle.js', import.meta.url).href;
    s.onload = () => ok(window.PptxGenJS);
    s.onerror = () => { carregando = null; falha(new Error('Não consegui carregar o gerador de PowerPoint.')); };
    document.head.appendChild(s);
  });
  return carregando;
}

const COR = { mata: '2B6C4E', palha: 'F1EAD8', fundo: 'F8F4EA', jenipapo: '16202A', urucum: 'C4462D', cinza: '6B6B6B', branco: 'FFFFFF' };
const FONTE = 'Arial';
const L = 10, A = 5.625;   // polegadas, 16:9

// cabe a imagem dentro da caixa, sem cortar, centralizada
function caber(img, caixa) {
  const r = Math.min(caixa.w / (img.largura || 4), caixa.h / (img.altura || 3));
  const w = (img.largura || 4) * r, h = (img.altura || 3) * r;
  return { x: caixa.x + (caixa.w - w) / 2, y: caixa.y + (caixa.h - h) / 2, w, h };
}

export async function slidesPptx(res, arquivos) {
  const PptxGenJS = await carregarPptx();
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = (res.aula && res.aula.titulo) || 'Aula';
  pptx.author = semTituloProf(res.aula && res.aula.professor) || 'Kauê';
  pptx.company = 'Feito no Kauê';
  const total = res.slides.length;
  for (const s of res.slides) {
    const tipo = s.n === 1 ? 'abertura' : s.n === total && total > 2 ? 'encerramento' : 'conteudo';
    const escuro = tipo !== 'conteudo';
    const corTexto = escuro ? COR.palha : COR.jenipapo;
    const sl = pptx.addSlide();
    sl.background = { color: tipo === 'abertura' ? COR.mata : tipo === 'encerramento' ? COR.jenipapo : COR.fundo };
    const img = s.imagens[0];
    const chave = img ? (img.arquivo === '[inserir]' || !img.arquivo ? `[inserir]|${img.legenda}` : img.arquivo) : null;
    const arq = chave ? arquivos.get(chave) : null;
    const largTexto = img ? 5.0 : 8.8;

    if (tipo === 'abertura') {
      sl.addShape('rect', { x: 0.7, y: 1.35, w: 1.1, h: 0.09, fill: { color: COR.urucum }, line: { color: COR.urucum } });
      sl.addText(s.titulo, { x: 0.7, y: 1.5, w: img ? 5.2 : 8.6, h: 1.5, fontFace: FONTE, fontSize: 40, bold: true, color: COR.palha, valign: 'top', fit: 'shrink' });
      if (s.itens.length) sl.addText(s.itens.map(t => ({ text: t, options: { breakLine: true } })), { x: 0.7, y: 3.05, w: img ? 5.2 : 8.6, h: 1.6, fontFace: FONTE, fontSize: 20, color: COR.palha, valign: 'top', paraSpaceAfter: 6, fit: 'shrink' });
    } else {
      sl.addShape('rect', { x: 0.6, y: 0.5, w: 0.9, h: 0.08, fill: { color: COR.urucum }, line: { color: COR.urucum } });
      sl.addText(s.titulo, { x: 0.6, y: 0.65, w: 8.8, h: 0.95, fontFace: FONTE, fontSize: 30, bold: true, color: escuro ? COR.palha : COR.mata, valign: 'top', fit: 'shrink' });
      if (s.itens.length) {
        const varios = s.itens.length > 1;
        sl.addText(s.itens.map(t => ({ text: t, options: { bullet: varios ? { indent: 18 } : false, breakLine: true } })),
          { x: 0.6, y: 1.75, w: largTexto, h: 3.2, fontFace: FONTE, fontSize: 22, color: corTexto, valign: 'top', paraSpaceAfter: 10, fit: 'shrink' });
      }
    }
    if (img) {
      const caixa = { x: 5.9, y: tipo === 'abertura' ? 1.2 : 1.6, w: 3.5, h: 3.3 };
      let fimImg = caixa.y + caixa.h;
      if (arq && arq.blob) {
        const b64 = await blobParaBase64(arq.blob);
        const pos = caber(arq, { ...caixa, h: caixa.h - 0.35 });
        fimImg = pos.y + pos.h;
        sl.addImage({ data: `${arq.tipo || arq.blob.type || 'image/jpeg'};base64,${b64}`, ...pos, altText: img.legenda || '' });
      } else {
        sl.addShape('rect', { ...caixa, fill: { color: COR.branco }, line: { color: '888888', dashType: 'dash', width: 1 } });
        sl.addText(`Imagem: ${img.legenda || img.arquivo}`, { ...caixa, fontFace: FONTE, fontSize: 12, color: '555555', align: 'center', valign: 'middle', margin: 8 });
      }
      if (img.legenda && arq) sl.addText(img.legenda, { x: caixa.x, y: fimImg + 0.03, w: caixa.w, h: 0.35, fontFace: FONTE, fontSize: 9, color: escuro ? COR.palha : COR.cinza, align: 'center', fit: 'shrink' });
    }
    const rodape = tipo === 'abertura' ? [res.aula && res.aula.escola, res.aula && semTituloProf(res.aula.professor)].filter(Boolean).join(' · ') : ((res.aula && res.aula.titulo) || '');
    sl.addText(rodape, { x: 0.6, y: A - 0.5, w: 7.6, h: 0.3, fontFace: FONTE, fontSize: 10, color: escuro ? COR.palha : COR.cinza });
    sl.addText(`${s.n}/${total}`, { x: L - 1.6, y: A - 0.5, w: 1.0, h: 0.3, fontFace: FONTE, fontSize: 10, color: escuro ? COR.palha : COR.cinza, align: 'right' });
    if (s.notas) sl.addNotes(s.notas);
  }
  return pptx.write({ outputType: 'blob' });
}
