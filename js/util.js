// Kauê — utilidades
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export const num = v => (v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ','));
export const pontos = v => `${num(v)} ${Math.abs(v - 1) < 1e-9 ? 'ponto' : 'pontos'}`;
export const pontosQuestao = v => (v == null ? '' : `${Number.isInteger(v) ? v + ',0' : num(v)} ${v <= 1 ? 'ponto' : 'pontos'}`);

export const dataCurta = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const NOMES_TIPO = {
  multipla: 'Múltipla escolha', vf: 'Verdadeiro ou falso', associe: 'Associar colunas',
  complete: 'Completar lacunas', discursiva: 'Discursiva',
};

export function baixar(nome, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const nomeArquivo = s => String(s || 'prova').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'prova';

export function blobParaBase64(blob) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = () => falha(r.error);
    r.readAsDataURL(blob);
  });
}
export function base64ParaBlob(b64, tipo) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo || 'application/octet-stream' });
}

// tamanho de uma imagem, em pixels
export function medirImagem(blob) {
  return new Promise(ok => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { ok({ largura: img.naturalWidth, altura: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { ok({ largura: 800, altura: 600 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

// reduz fotos muito grandes antes de guardar (economiza espaço e deixa a impressão leve)
export async function prepararImagem(arquivo, maxLado = 2000) {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) return arquivo;
  const { largura, altura } = await medirImagem(arquivo);
  if (Math.max(largura, altura) <= maxLado) return arquivo;
  const escala = maxLado / Math.max(largura, altura);
  const bmp = await createImageBitmap(arquivo);
  const c = document.createElement('canvas');
  c.width = Math.round(largura * escala); c.height = Math.round(altura * escala);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const tipo = arquivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return new Promise(ok => c.toBlob(b => ok(b || arquivo), tipo, 0.9));
}

export function aviso(msg, tipo = 'ok') {
  let caixa = document.getElementById('avisos');
  if (!caixa) { caixa = document.createElement('div'); caixa.id = 'avisos'; document.body.appendChild(caixa); }
  const el = document.createElement('div');
  el.className = `aviso-flutuante ${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  caixa.appendChild(el);
  setTimeout(() => el.classList.add('saindo'), 3200);
  setTimeout(() => el.remove(), 3700);
}
