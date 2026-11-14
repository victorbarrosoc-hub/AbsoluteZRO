// Os ícones que só a Decupar usa, no mesmo traço de app/icones.js (24 × 24, linha de 1,7, pontas redondas).

import { html } from '../../preact.js'

const CORPOS = {
  pausar: '<path d="M9 6.5v11M15 6.5v11"/>',
  tocar: '<path d="M8.5 6.2v11.6a.6.6 0 0 0 .9.5l9.3-5.8a.6.6 0 0 0 0-1L9.4 5.7a.6.6 0 0 0-.9.5Z"/>',
  camadas: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 4v16M4 9h5M4 15h5" opacity=".55"/><circle cx="14.5" cy="12" r="3"/>',
  meta: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r=".9" fill="currentColor"/>',
  aceitar: '<path d="m4.5 12.5 4 4 6-8"/><path d="m11.5 16.5 1 0 7-8.5" opacity=".6"/>',
  tratar: '<path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5-5.5-2L10 9Z"/>',
  duvida: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><circle cx="12" cy="16.9" r=".9" fill="currentColor" stroke="none"/>',
  calibrar: '<path d="M5 7h8M17 7h2M5 17h2M11 17h8"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
}

export function Icone2({ nome, tamanho }) {
  const corpo = CORPOS[nome]
  if (!corpo) return null
  return html`<svg
    viewBox="0 0 24 24"
    width=${tamanho ?? 24}
    height=${tamanho ?? 24}
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: corpo }}
  />`
}
