// Drive híbrido (docs/CONTAS.md §13): a linha do modo em Ajustes e a faixa "Arquivos escolhidos" da tela Drive e do
// seletor de pasta. Regras e textos em lib/modo-drive.js.
import { html } from '/vendor/preact-htm.js'
import { DICA_MODO, NOME_MODO, modoDe, urlEscolher } from '../lib/modo-drive.js'
import { toast } from '../lib/toasts.js'
import { openExternal } from '../lib/desktop.js'
import { siteUrl } from '../lib/cloud.js'
import { Icon } from './icons.js'
import { Button } from './common.js'

/**
 * "Escolher do Drive" (lib/modo-drive.js › urlEscolher): abre o SOBEDESCE no navegador do sistema, no Picker daquele
 * Drive. Devolve se abriu (conta deste computador não tem o modo).
 */
export function abrirEscolherDoDrive(accountId) {
  const url = urlEscolher(accountId, siteUrl())
  if (!url) return false
  openExternal(url)
  toast('info', 'Escolha no navegador. O que você escolher aparece em Liberados.', { duration: 6000 })
  return true
}

/** "Acesso ao Drive · Arquivos escolhidos", numa linha, com o que muda recolhido (os textos de Sua conta no site). */
export function ModoDoDrive({ account }) {
  if (!account) return null
  const modo = modoDe(account)
  return html`<details class="modo-linha" data-modo-drive=${modo}>
    <summary>
      <span class=${modo === 'total' ? 'modo-ponto is-total' : 'modo-ponto'} aria-hidden="true"></span>
      <span>Acesso ao Drive</span>
      <b>${NOME_MODO[modo]}</b>
    </summary>
    <ul>${DICA_MODO[modo].map((t) => html`<li>${t}</li>`)}</ul>
  </details>`
}

/**
 * A faixa do modo Arquivos escolhidos: diz se o lugar aberto aparece inteiro e oferece "Escolher do Drive" (abre o
 * SOBEDESCE no navegador, no Picker; o escolhido aparece em Liberados). `completo`: a pasta é do SOBEDESCE.
 */
export function FaixaArquivos({ accountId, completo, compact = false }) {
  const escolher = () => abrirEscolherDoDrive(accountId)
  return html`<div class=${compact ? 'modo-faixa is-compact' : 'modo-faixa'} role="note" data-modo-faixa=${completo ? 'completo' : 'incompleto'}>
    <span class="modo-faixa-ic" aria-hidden="true"><${Icon} name="key" size=${16} strokeWidth=${1.9} /></span>
    <span class="modo-faixa-txt">
      <b>${NOME_MODO.arquivos}</b>
      <small>${completo ? 'Pasta do SOBEDESCE: aparece tudo.' : 'Só aparece o que passou pelo SOBEDESCE.'}</small>
    </span>
    <${Button} size="sm" icon="external" onClick=${escolher} title="Abre o SOBEDESCE no navegador para escolher no Google Drive">Escolher do Drive</${Button}>
    ${compact
      ? null
      : html`<details class="modo-faixa-dica">
          <summary>O que muda</summary>
          <ul>${DICA_MODO.arquivos.map((t) => html`<li>${t}</li>`)}</ul>
        </details>`}
  </div>`
}
