// Ícones: traço único, 24 × 24, 1,7 de espessura, na cor do texto (currentColor). Só o que as telas usam.
// <${Icone} nome="pasta" /> — decorativo por padrão (aria-hidden); quem dá o nome é o botão em volta.

import { html } from './preact.js'

const CORPOS = {
  pasta: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
  fotos: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  bandeira: '<path d="M6 21V4.5"/><path d="M6 5h11l-2.2 3.8L17 12.5H6"/>',
  estrela: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8Z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  lua: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/>',
  set: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.6-.4 4.6 1.2 5 4"/>',
  // a Z: o anel com a estrela de 4 pontas às 3 horas
  z: '<circle cx="12" cy="12" r="7.5"/><path d="M19.5 8.8l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" fill="currentColor" stroke="none"/>',
  // as quatro abas
  decupar: '<rect x="3.5" y="4.5" width="7" height="7" rx="2"/><rect x="13.5" y="4.5" width="7" height="7" rx="2"/><rect x="3.5" y="14.5" width="7" height="5" rx="2"/><path d="m13.8 17 2.2 2.2 4.2-4.4"/>',
  revelar: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  estilos: '<path d="m12 3.5 8.5 4.6-8.5 4.6-8.5-4.6Z"/><path d="m3.5 12.4 8.5 4.6 8.5-4.6"/><path d="m3.5 16.4 8.5 4.6 8.5-4.6"/>',
  entregar: '<path d="M20.5 3.5 10 14"/><path d="M20.5 3.5 14 20.5l-4-6.5-6.5-4Z"/>',
  esquerda: '<path d="m14.5 5-7 7 7 7"/>',
  direita: '<path d="m9.5 5 7 7-7 7"/>',
  baixo: '<path d="m6 9.5 6 6 6-6"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M11 8.5v5M8.5 11h5"/>',
  comparar: '<rect x="3.5" y="5" width="7.5" height="14" rx="2.2"/><rect x="13" y="5" width="7.5" height="14" rx="2.2"/>',
  grade: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  ordenar: '<path d="M7 5v14M7 19l-3-3M7 19l3-3M17 19V5M17 5l-3 3M17 5l3 3"/>',
  filtro: '<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
  tres: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
  sair: '<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  pessoa: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 19.5c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  aviso: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>',
  desfazer: '<path d="M8 6 4 10l4 4"/><path d="M4 10h10a5.5 5.5 0 0 1 0 11h-3"/>',
  teclado: '<rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M6.5 10h.1M10 10h.1M13.5 10h.1M17 10h.1M6.5 14h.1M17 14h.1M9.5 14h5"/>',
  pilha: '<rect x="4" y="8.5" width="13" height="11" rx="2.5"/><path d="M7.5 5h10A2.5 2.5 0 0 1 20 7.5v8.5"/>',
  soltar: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>',
  trocar: '<path d="M4 8h13l-3.5-3.5"/><path d="M20 16H7l3.5 3.5"/>',
  ligar: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  lapis: '<path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19Z"/><path d="m14.5 6.5 3 3"/>',
  lixo: '<path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.8 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.500 7"/>',
  tamanho: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="4" y="14.5" width="5" height="5" rx="1.6"/><rect x="14.5" y="14.5" width="5" height="5" rx="1.6"/><rect x="14.5" y="6" width="5" height="5" rx="1.6"/>',
}

/** Os nomes que existem (para os testes e para quem monta menu). */
export const NOMES_DE_ICONE = Object.keys(CORPOS)

export function Icone({ nome, tamanho, cheio, classe }) {
  const corpo = CORPOS[nome]
  if (!corpo) return null
  return html`<svg
    class=${classe}
    viewBox="0 0 24 24"
    width=${tamanho ?? 24}
    height=${tamanho ?? 24}
    fill=${cheio ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: corpo }}
  />`
}
