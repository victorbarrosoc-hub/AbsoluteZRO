// Os ícones que só a Decupar usa, no mesmo traço de app/icones.js (24 × 24, linha de 1,7, pontas redondas).

import { html } from '../../preact.js'

const CORPOS = {
  pausar: '<path d="M9 6.5v11M15 6.5v11"/>',
  tocar: '<path d="M8.5 6.2v11.6a.6.6 0 0 0 .9.5l9.3-5.8a.6.6 0 0 0 0-1L9.4 5.7a.6.6 0 0 0-.9.5Z"/>',
  cenas: '<rect x="3.5" y="6" width="11" height="12" rx="2.4"/><path d="M17.5 7.5v9M20.5 9v6"/>',
  camadas: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 4v16M4 9h5M4 15h5" opacity=".55"/><circle cx="14.5" cy="12" r="3"/>',
  painel: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M14.5 4.5v15"/>',
  rosto: '<path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16"/><path d="M9.5 10v.5M14.5 10v.5M9.5 14.5c1.4 1.2 3.6 1.2 5 0"/>',
  ajustes: '<path d="M5 7h9M18 7h1M5 17h3M12 17h7"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  meta: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r=".9" fill="currentColor"/>',
  baixar: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19.5h14"/>',
  aceitar: '<path d="m4.5 12.5 4 4 6-8"/><path d="m11.5 16.5 1 0 7-8.5" opacity=".6"/>',
  enviar: '<path d="M20.5 3.5 10 14"/><path d="M20.5 3.5 14 20.5l-4-6.5-6.5-4Z"/>',
  tratar: '<path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5-5.5-2L10 9Z"/>',
  desfazer: '<path d="M8 6 4 10l4 4"/><path d="M4 10h10a5.5 5.5 0 0 1 0 11h-3"/>',
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
