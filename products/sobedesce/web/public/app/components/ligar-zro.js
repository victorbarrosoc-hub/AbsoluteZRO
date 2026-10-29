// "Agora sua conta é Absolute ZRO" (lib/ligar-zro.js): a tela inteira no lugar das abas e, com envio andando, a faixa
// fixa em cima (a fila continua embaixo). O botão é um link de verdade para o vincular de sempre.
import { html } from '../vendor/preact-htm.js'
import { BOTAO, LIGAR, recadoDe, TITULO } from '../lib/ligar-zro.js'

/** Símbolo flat da Absolute ZRO (uma cor só, herda a cor do texto), o mesmo do site. */
export function SimboloZro({ size = 96 }) {
  return html`<svg class="lz-simbolo" width=${size} height=${size} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M74.00 40.02C75.00 47.51 77.33 49.00 94.82 50.00C77.33 51.00 75.00 52.49 74.00 59.98C73.00 52.49 70.67 51.00 53.18 50.00C70.67 49.00 73.00 47.51 74.00 40.02Z" />
    <path fill-rule="evenodd" d="M9.70 50.00a34.30 34.30 0 1 0 68.60 0a34.30 34.30 0 1 0 -68.60 0ZM18.30 50.00a25.70 25.70 0 1 0 51.40 0a25.70 25.70 0 1 0 -51.40 0Z" />
  </svg>`
}

export function LigarZroTela({ temDrive, erro }) {
  const recado = recadoDe(erro)
  return html`<main class="lz-tela" data-ligar-zro="tela">
    <${SimboloZro} size=${96} />
    <h1 class="lz-titulo">${TITULO}</h1>
    ${recado ? html`<p class=${erro === 'zro_recusado' ? 'lz-recado' : 'lz-recado is-erro'} role=${erro === 'zro_recusado' ? 'status' : 'alert'}>${recado}</p>` : null}
    <a class="btn btn-primary btn-xl lz-botao" href=${LIGAR}><span>${BOTAO}</span></a>
    <p class="lz-nota">${temDrive ? 'Seu Google Drive continua conectado.' : 'Nada muda nos seus arquivos.'}</p>
  </main>`
}

/**
 * Com envio andando: a mesma pergunta numa faixa que não sai, sem parar a fila. O link abre em outra janela (no app
 * instalado, a folha do navegador por cima): sair desta página pararia o envio, que roda aqui. Ao voltar, a conta é
 * conferida de novo (lib/auth.js) e a faixa some.
 */
export function LigarZroFaixa() {
  return html`<div class="lz-faixa" role="region" aria-label=${TITULO} data-ligar-zro="faixa">
    <${SimboloZro} size=${28} />
    <span class="lz-faixa-texto"><b>${TITULO}</b><span>Seu envio continua enquanto isso.</span></span>
    <a class="btn btn-primary btn-sm" href=${LIGAR} target="_blank" rel="noopener"><span>Continuar</span></a>
  </div>`
}
