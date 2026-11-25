// Kauê — campo de opinião, usado no site e no app.
// Não há servidor do Kauê: a mensagem vai direto para um Formulário Google (ver opiniao-config.js).
// Sem internet, ela fica guardada neste aparelho e é enviada quando a conexão voltar.
import { FORMULARIO } from './opiniao-config.js';

const TIPOS = ['Comentário', 'Sugestão', 'Crítica', 'Elogio', 'Problema'];
const FILA = 'kaue-opinioes-pendentes';
const LIMITE = 2000;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const formularioAtivo = () => !!FORMULARIO.id && Object.values(FORMULARIO.campos).every(c => /^entry\.\d+$/.test(c));

// informações técnicas que ajudam a achar erros e não identificam ninguém
export function infoTecnica(origem, versao, ua = navigator.userAgent) {
  const aparelho = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'celular' : 'computador';
  const sistema = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'outro sistema';
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'outro navegador';
  return `Kauê ${versao} · ${origem} · ${aparelho} · ${sistema} · ${navegador}`;
}

const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function lerFila() { try { return JSON.parse(localStorage.getItem(FILA) || '[]'); } catch { return []; } }
function gravarFila(f) { try { f.length ? localStorage.setItem(FILA, JSON.stringify(f)) : localStorage.removeItem(FILA); return true; } catch { return false; } }

async function postar(m) {
  const corpo = new URLSearchParams();
  corpo.append(FORMULARIO.campos.tipo, m.tipo);
  corpo.append(FORMULARIO.campos.mensagem, m.mensagem);
  corpo.append(FORMULARIO.campos.email, m.email || '');
  corpo.append(FORMULARIO.campos.tecnico, m.tecnico);
  // "no-cors": o Google não devolve a resposta para outro site; se a rede falhar, o fetch dá erro e a mensagem fica na fila
  await fetch(`https://docs.google.com/forms/d/e/${FORMULARIO.id}/formResponse`, { method: 'POST', mode: 'no-cors', body: corpo });
}

// envia o que ficou guardado sem internet
let enviando = false;
export async function enviarPendentes() {
  if (enviando || !formularioAtivo() || !navigator.onLine) return 0;
  const fila = lerFila(); if (!fila.length) return 0;
  enviando = true;
  const sobra = []; let enviadas = 0;
  try {
    for (const m of fila) { try { await postar(m); enviadas++; } catch { sobra.push(m); } }
    // mensagens escritas enquanto o envio acontecia continuam na fila
    gravarFila([...sobra, ...lerFila().slice(fila.length)]);
  } finally { enviando = false; }
  return enviadas;
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { enviarPendentes(); });

// monta o formulário dentro de "caixa". origem: "site" ou "app"; termos: link para a seção de opinião dos termos
export function montarOpiniao(caixa, { origem, versao, termos }) {
  const tecnico = infoTecnica(origem, versao);
  const ativo = formularioAtivo();
  caixa.innerHTML = `
    <form class="opiniao" novalidate>
      <fieldset class="tipos"><legend class="rotulo">Sobre o quê?</legend>
        ${TIPOS.map((t, k) => `<label><input type="radio" name="tipo" value="${t}" ${k === 0 ? 'checked' : ''}><span>${t}</span></label>`).join('')}
      </fieldset>
      <label class="rotulo" for="op-mensagem">Sua mensagem</label>
      <textarea id="op-mensagem" class="campo-form" rows="6" maxlength="${LIMITE}" placeholder="O que ajudou, o que travou, o que faltou…"></textarea>
      <p class="ajuda linha-ajuda"><span class="alerta">Não escreva nomes de alunos.</span><span class="contador">0 de 2.000</span></p>
      <label class="rotulo" for="op-email">Seu e-mail <span class="opcional">(opcional, só se quiser resposta)</span></label>
      <input id="op-email" class="campo-form" type="email" inputmode="email" autocomplete="email" placeholder="nome@exemplo.com">
      <label class="isca" aria-hidden="true">Não preencha este campo <input name="site" tabindex="-1" autocomplete="off"></label>
      <p class="ajuda">Vai junto, para ajudar a achar erros: <span class="tecnico">${esc(tecnico)}</span>.</p>
      <div class="acoes"><button class="botao principal grande" type="submit">Enviar opinião</button></div>
      <p class="ajuda">Você não precisa se identificar. Só o criador do Kauê lê as mensagens. <a href="${esc(termos)}">Como sua mensagem é usada</a></p>
      <p class="resultado" role="status" aria-live="polite"></p>
    </form>`;
  const form = caixa.querySelector('form');
  const msg = form.querySelector('#op-mensagem');
  const email = form.querySelector('#op-email');
  const resultado = form.querySelector('.resultado');
  const botao = form.querySelector('button[type=submit]');
  const contar = () => { form.querySelector('.contador').textContent = `${msg.value.length.toLocaleString('pt-BR')} de ${LIMITE.toLocaleString('pt-BR')}`; };
  msg.addEventListener('input', contar);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    resultado.className = 'resultado';
    const texto = msg.value.trim();
    const mail = email.value.trim();
    if (texto.length < 3) { resultado.textContent = 'Escreva a sua mensagem antes de enviar.'; resultado.classList.add('alerta'); msg.focus(); return; }
    if (mail && !emailValido(mail)) { resultado.textContent = 'Confira o e-mail, ou deixe o campo vazio para enviar sem se identificar.'; resultado.classList.add('alerta'); email.focus(); return; }
    const m = { tipo: form.querySelector('input[name=tipo]:checked').value, mensagem: texto, email: mail, tecnico };
    // campo-isca: robôs preenchem; pessoas não veem
    if (form.querySelector('input[name=site]').value) { agradecer(false); return; }
    if (!ativo) {
      const assunto = encodeURIComponent(`Kauê: ${m.tipo}`);
      const corpo = encodeURIComponent(`${m.mensagem}\n\n${m.email ? 'E-mail para resposta: ' + m.email + '\n' : ''}${m.tecnico}`);
      resultado.innerHTML = `O envio pelo ${origem === 'app' ? 'app' : 'site'} ainda está sendo ativado. Enquanto isso, mande pelo seu e-mail (assim a mensagem deixa de ser anônima): <a href="mailto:kaueavalia@gmail.com?subject=${assunto}&body=${corpo}">escrever para kaueavalia@gmail.com</a>.`;
      return;
    }
    botao.disabled = true; botao.textContent = 'Enviando…';
    try {
      if (!navigator.onLine) throw new Error('sem internet');
      await postar(m);
      agradecer(false, !!mail);
    } catch {
      const fila = lerFila(); fila.push({ ...m, tecnico: `${m.tecnico} · escrita em ${new Date().toLocaleString('pt-BR')}, sem internet` });
      if (gravarFila(fila)) agradecer(true, !!mail);
      else { botao.disabled = false; botao.textContent = 'Enviar opinião'; resultado.textContent = 'Não deu para enviar agora. Tente de novo quando estiver com internet.'; resultado.classList.add('alerta'); }
    }
  });

  function agradecer(naFila, comEmail) {
    caixa.innerHTML = `<div class="opiniao-ok"><h2>${naFila ? 'Mensagem guardada' : 'Obrigado!'}</h2>
      <p>${naFila ? 'Você está sem internet. A mensagem ficou guardada neste aparelho e vai ser enviada sozinha quando a conexão voltar.'
        : 'Sua mensagem chegou. Cada opinião ajuda a deixar o Kauê melhor para quem está em sala de aula.'}</p>
      ${comEmail ? '<p>Se a mensagem pedir resposta, ela vai chegar no e-mail que você deixou.</p>' : ''}
      <button class="botao" type="button">Enviar outra mensagem</button></div>`;
    caixa.querySelector('button').addEventListener('click', () => montarOpiniao(caixa, { origem, versao, termos }));
  }
}
