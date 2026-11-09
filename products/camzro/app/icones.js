// CAMZRO · ícones de traço (24 × 24, linha 1,75), no desenho dos símbolos do sistema. Entram nos elementos com
// data-ic="nome" (sem SVG solto no HTML; a CSP não deixa script inline).

const P = {
  falsa: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M8 5v14M12 5v14M16 5v14"/>',
  zebra: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M5 15 13 5M9 19l11-13M15 19l5-6"/>',
  foco: '<path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="2.5"/>',
  guias: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M3.5 9h17M3.5 15h17"/>',
  grade: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.2 4.5v15M14.8 4.5v15M3.5 9.5h17M3.5 14.5h17"/>',
  scopes: '<path d="M4 19V5M4 19h16"/><path d="M7 15l3-5 3 3 4-7"/>',
  lut: '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>',
  lupa: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.6-4.6M11 8.5v5M8.5 11h5"/>',
  nivel: '<path d="M3 12h18"/><circle cx="12" cy="12" r="3"/>',
  mono: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  claquete: '<path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="m4 10-.6-3.4 15.4-2.7.6 3.4zM8.5 6.2l2 3.2M13.5 5.3l2 3.2"/>',
  biblioteca: '<rect x="3.5" y="6.5" width="13" height="13" rx="2.5"/><path d="M7 3.5h10.5a3 3 0 0 1 3 3V17"/>',
  ajustes: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  trocar: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  estrela: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/>',
  estrelaCheia: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill="currentColor"/>',
  compartilhar: '<path d="M12 4v11M8 8l4-4 4 4"/><path d="M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/>',
  lixo: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  pasta: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  relogio: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  som: '<path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2"/>',
  tocha: '<path d="M9 3h6l-1 6h-4zM10 9h4l-1 12h-2z"/>',
  calculadora: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8 7.5h8M8.5 12h1M11.5 12h1M14.5 12h1M8.5 16h1M11.5 16h1M14.5 16h1"/>',
  apps: '<circle cx="7" cy="7" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  preset: '<path d="M6 4h12v16l-6-4-6 4z"/>',
  baixar: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  alerta: '<path d="M12 4 3 19h18z"/><path d="M12 10v4M12 16.5v.5"/>',
  ok: '<path d="m5 12 4.5 4.5L19 7"/>',
  sincronia: '<path d="M4 12h3l2-5 4 10 2-5h5"/>',
  anamorfico: '<rect x="2.5" y="7" width="19" height="10" rx="2.5"/><path d="M6 12h12M8 10l-2 2 2 2M16 10l2 2-2 2"/>',
  espelho: '<path d="M12 3v18M9 7 4 12l5 5zM15 7l5 5-5 5z"/>',
  tema: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>',
}

export const ICONES = Object.freeze(Object.keys(P))

export function svg(nome) {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nome] || ''}</svg>`
}

/** Põe o ícone em todo elemento com data-ic dentro de `raiz`. */
export function pintar(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-ic]')) {
    if (el.dataset.icPronto === el.dataset.ic) continue
    el.insertAdjacentHTML('afterbegin', svg(el.dataset.ic))
    el.dataset.icPronto = el.dataset.ic
  }
}
