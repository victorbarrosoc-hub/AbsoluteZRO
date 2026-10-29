// Relay · glifos (traço de 1,8 em 24×24, a linha dos ícones da família). Destinos em formas genéricas (play, câmera,
// nota, balão): o Relay não usa logo de terceiros.

const G = {
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" stroke="none"/>',
  shorts: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M10.6 9.6v4.8l4-2.4z" fill="currentColor" stroke="none"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor"/>',
  tiktok: '<path d="M13.5 3v11.2a3.7 3.7 0 1 1-3.2-3.66"/><path d="M13.5 3c.4 2.6 2.2 4.4 4.8 4.6"/>',
  whatsapp: '<path d="M4.5 19.5l1.1-3.6A8 8 0 1 1 8.4 18.6z"/>',
  vimeo: '<path d="M3 8.5l1.4 1.3c1.2-1 2-1.3 2.4.5L8.6 17c.8 2.4 1.8 2.4 3.4.3 2.5-3.3 5.6-7.6 6.8-10.6.9-2.3-1.5-3.8-4.6-.9"/>',
  apple: '<path d="M12 7.2c.2-2.2 1.6-3.8 3.6-4.2.2 2.1-1.4 4-3.6 4.2z" fill="currentColor" stroke="none"/><path d="M16.8 12.6c0-2.2 1.7-3.2 1.8-3.3a4 4 0 0 0-3.4-1.8c-1.4-.1-2.5.8-3.2.8s-1.8-.8-3-.8C6.8 7.6 5 9.1 5 12.2c0 3.8 2.7 8.3 4.6 8.3.9 0 1.5-.6 2.6-.6s1.5.6 2.6.6c1.6 0 2.9-2.4 3.5-4.1-1.8-.8-1.5-2.3-1.5-3.8z"/>',
  linkedin: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.5"/><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2"/><path d="M3 12.5h18"/>',
  xcom: '<path d="M4 6.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6l-4.5 4v-4H7a3 3 0 0 1-3-3z"/>',
  tv: '<rect x="2.5" y="4.5" width="19" height="12.5" rx="2.5"/><path d="M8.5 20.5h7M12 17v3.5"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4.5M8.5 20.5h7"/><path d="M10.2 7.8v4.4l3.8-2.2z" fill="currentColor" stroke="none"/>',
  site: '<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M2.5 8.5h19"/><circle cx="5.5" cy="6.25" r="0.5" fill="currentColor"/><circle cx="7.5" cy="6.25" r="0.5" fill="currentColor"/><path d="M10.5 11.5v5l4-2.5z" fill="currentColor" stroke="none"/>',
  proxy: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/><path d="M6.5 10h3M6.5 14h6"/>',
  peso: '<path d="M7.5 8h9l2.5 12H5z"/><circle cx="12" cy="5.5" r="2.5"/>',
  envelope: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.8 6.5l8.2 6.2 8.2-6.2"/>',
  onda: '<path d="M3 12h1.5M6.5 8v8M10 5v14M13.5 9v6M17 6.5v11M20.5 10.5v3"/>',
  // interface
  soltar: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 14.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5"/>',
  baixar: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4 19.5h16"/>',
  pasta: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  aviso: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.9" r="0.4" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="0.5" fill="currentColor"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  lua: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  cadeado: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  lupa: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  cor: '<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>',
  camadas: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
  estrela: '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  lixo: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  ficha: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  seta: '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
}

/** `<svg>` de um glifo (string), para innerHTML em lugares fixos. */
export const svg = (nome, classe = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${classe ? ` class="${classe}"` : ''}>${G[nome] ?? G.info}</svg>`

/** Elemento <svg> de um glifo. */
export function icone(nome, classe = '') {
  const t = document.createElement('template')
  t.innerHTML = svg(nome, classe)
  return t.content.firstChild
}

/** Troca todo `<i data-icone="nome">` da página pelo glifo. */
export function icones(raiz = document) {
  for (const i of raiz.querySelectorAll('i[data-icone]')) i.replaceWith(icone(i.dataset.icone, i.className))
}
