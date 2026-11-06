// Ícones dos canais e dos botões (traço, como os da família). Marcação fixa deste arquivo: nada vindo da rede entra aqui.
const NS = 'http://www.w3.org/2000/svg'

const TRACOS = {
  geral: 'M4 10v4h3l5 4V6L7 10H4ZM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  direcao: 'M4 9h16v10H4zM4 9l2.5-4h13L17 9M9 5l-2.5 4M14 5l-2.5 4',
  producao: 'M9 4h6v3H9zM7 5.5H5.5V20h13V5.5H17M8.5 12l2 2 4-4',
  camera: 'M3 8h11v9H3zM14 11l7-3.5v10L14 14',
  som: 'M5 10v4M9 6v12M13 9v6M17 4v16M21 10v4',
  luz: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z',
  arte: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.4-1-1.6-1-2.9 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3ZM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  elenco: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
  ouvir: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4zM17 14h3v6h-3z',
  falar: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM6 11a6 6 0 0 0 12 0M12 17v4',
}

/** Um <svg> de traço com o ícone `nome`. */
export function icone(nome) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(NS, 'path')
  p.setAttribute('d', TRACOS[nome] || TRACOS.geral)
  svg.append(p)
  return svg
}
