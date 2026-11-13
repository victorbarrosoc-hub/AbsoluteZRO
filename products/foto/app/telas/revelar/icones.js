// Os ícones que só a Revelar usa, no mesmo traço de app/icones.js (24 × 24, 1,7, currentColor). Os comuns vêm de lá.

import { html } from '../../preact.js'
import { Icone as Comum, NOMES_DE_ICONE } from '../../icones.js'

const CORPOS = {
  auto: '<path d="m4 20 10.5-10.5"/><path d="m13 8 3 3"/><path d="M17.5 3.5v3M16 5h3M20 9.5v2M19 10.5h2M9.5 3.5v2M8.5 4.5h2"/>',
  avisos: '<path d="M4 18 18 4"/><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M4 11 11 4M13 20l7-7"/>',
  cortar: '<path d="M7 3.5V17h13.5"/><path d="M3.5 7H17v13.5"/>',
  gota: '<path d="M12 3.8c3 3.8 5.5 6.7 5.5 10a5.5 5.5 0 0 1-11 0c0-3.3 2.5-6.2 5.5-10Z"/>',
  girar: '<path d="M5 12a7 7 0 1 0 2-5"/><path d="M5 3.8V8h4.2"/>',
  espelhar: '<path d="M12 3.5v17"/><path d="M8.5 7 4 17h4.5ZM15.5 7 20 17h-4.5Z"/>',
  virar: '<path d="M3.5 12h17"/><path d="M7 8.5 17 4v4.5ZM7 15.5 17 20v-4.5Z"/>',
  regua: '<path d="m3.5 15.5 12-12 5 5-12 12Z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  colar: '<path d="M9 4.5h6v3H9z"/><path d="M15 6h2.5a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2H9"/>',
  refazer: '<path d="M16 6l4 4-4 4"/><path d="M20 10H10a5.5 5.5 0 0 0 0 11h3"/>',
  painel: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M14.5 4.5v15"/>',
  versoes: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8.5"/>',
  exportar: '<path d="M12 15V3.5"/><path d="m7.5 8 4.5-4.5L16.5 8"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  sincronizar: '<path d="M4.5 11a7.5 7.5 0 0 1 13-4.5L20 9"/><path d="M20 4v5h-5"/><path d="M19.5 13a7.5 7.5 0 0 1-13 4.5L4 15"/><path d="M4 20v-5h5"/>',
  zerar: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4v5h5"/>',
  encaixar: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
}

/** Ícone da Revelar ou, se não for daqui, o comum. */
export function Icone({ nome, classe }) {
  if (!CORPOS[nome]) return NOMES_DE_ICONE.includes(nome) ? html`<${Comum} nome=${nome} classe=${classe} />` : null
  return html`<svg
    class=${classe}
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: CORPOS[nome] }}
  ></svg>`
}
