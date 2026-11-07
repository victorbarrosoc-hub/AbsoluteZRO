// Ícones de traço do RADION (como os da família). Marcação fixa deste arquivo: nada vindo da rede entra aqui.
const NS = 'http://www.w3.org/2000/svg'

const TRACOS = {
  // canais
  geral: 'M4 9.5h3.5L12 5v14l-4.5-4.5H4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  todos: 'M4 9.5h3.5L12 5v14l-4.5-4.5H4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  direcao: 'M3 9h18v11H3zM3 9l2.5-5 15 2.5-1 2.5M8 4.5l2 3.5M13 5.3l2 3.5',
  producao: 'M5 4h14v17H5zM9 4h6v3H9zM9 13l2 2 4-4',
  camera: 'M3 7h13v10H3zM16 11l5-3v8l-5-3z',
  som: 'M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4',
  luz: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  arte: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1-1.5-1-2.6 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2zM7.5 11h.01M10.5 7.2h.01M15 7.8h.01',
  elenco: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  // botões e páginas
  ouvir: 'M4 15v-3a8 8 0 0 1 16 0v3M3 14h4.5v6.5H5a2 2 0 0 1-2-2zM16.5 14H21v4.5a2 2 0 0 1-2 2h-2.5z',
  fone: 'M4 15v-3a8 8 0 0 1 16 0v3M3 14h4.5v6.5H5a2 2 0 0 1-2-2zM16.5 14H21v4.5a2 2 0 0 1-2 2h-2.5z',
  falar: 'M9 3h6v11H9zM5 11a7 7 0 0 0 14 0M12 18v3',
  micoff: 'M9 9V6a3 3 0 0 1 5.7-1.3M15 10v1a3 3 0 0 1-4.6 2.5M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18',
  casa: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  ar: 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2',
  cal: 'M3.5 5h17v15.5h-17zM3.5 10h17M8 3v4M16 3v4',
  gente: 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  sino: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  balao: 'M4 5.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H9l-4.5 3.5V17H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z',
  setores: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  ajustes: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  apps: 'M6 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM12 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM18 4.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM6 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM12 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM18 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM6 16.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM12 16.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM18 16.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
  painel: 'M3.5 4.5h17v15h-17zM9 4.5v15',
  mais: 'M12 5v14M5 12h14',
  sol: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  lua: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  seta: 'm9 5 7 7-7 7',
  coroa: 'M4 18 3 7l5 4 4-6 4 6 5-4-1 11z',
  escudo: 'M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6zM9 12l2 2 4-4',
  mao: 'M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 15l-1.3-3.2a1.5 1.5 0 0 1 2.7-1.3L8 14',
  mover: 'M5 9 2 12l3 3M19 9l3 3-3 3M2 12h20',
  sair: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  relogio: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  cadeado: 'M5 10.5h14v10H5zM8 10.5V7.5a4 4 0 0 1 8 0v3',
  check: 'm5 12 4.5 4.5L19 7',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 7.5h.01',
  compacto: 'M3.5 5h17v14h-17zM12.5 12h5v4h-5z',
  expandir: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
  lapis: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4',
  x: 'M6 6l12 12M18 6 6 18',
}

/** Um <svg> de traço com o ícone `nome`. */
export function icone(nome, classe = 'ic') {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', classe)
  const p = document.createElementNS(NS, 'path')
  p.setAttribute('d', TRACOS[nome] || TRACOS.geral)
  svg.append(p)
  return svg
}

/** Põe os ícones marcados no HTML: data-ic (o ícone é o conteúdo) e data-ic-antes (antes do texto). */
export function porIcones(raiz = document) {
  for (const el of raiz.querySelectorAll('[data-ic]')) if (!el.querySelector(':scope > svg.ic')) el.prepend(icone(el.dataset.ic))
  for (const el of raiz.querySelectorAll('[data-ic-antes]')) if (!el.querySelector(':scope > svg.ic')) el.prepend(icone(el.dataset.icAntes))
}
