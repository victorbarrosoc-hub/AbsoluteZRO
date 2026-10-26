// Zoom (punch-in) num lugar só: a prévia (transform do <video>) e o render (recorte do quadro) usam a mesma conta,
// então o que se vê é o que sai.

/** Zoom ativo no quadro de origem q da mídia: { escala, foco } (escala 1 = sem zoom). */
export function zoomEm(zooms, midia, q) {
  for (const z of zooms) if (z.midia === midia && q >= z.qIni && q < z.qFim) return { escala: z.escala, foco: z.foco }
  return { escala: 1, foco: { x: 0.5, y: 0.5 } }
}

/** Recorte da imagem de origem (largura l, altura a) que enche a saída: { sx, sy, sl, sa }. */
export function recorte(l, a, { escala, foco }) {
  const e = Math.max(1, escala || 1)
  const sl = l / e
  const sa = a / e
  const sx = Math.min(l - sl, Math.max(0, foco.x * l - sl / 2))
  const sy = Math.min(a - sa, Math.max(0, foco.y * a - sa / 2))
  return { sx, sy, sl, sa }
}

/** O mesmo recorte como transform CSS de um elemento com origem 0 0 (prévia): "translate(...) scale(...)". */
export function transformCss(l, a, zoom) {
  const { sx, sy } = recorte(l, a, zoom)
  const e = Math.max(1, zoom.escala || 1)
  if (e === 1) return 'none'
  // em porcentagem do próprio elemento: vale para qualquer tamanho de tela
  return `translate(${((-sx * e) / l) * 100}%, ${((-sy * e) / a) * 100}%) scale(${e})`
}
