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

/**
 * Onde o quadro de origem (cw × ch) cai na saída (L × A), com os ajustes do clipe (escala e posição, em volta do
 * centro) e depois o zoom do momento (punch-in sobre o quadro já montado). Uma conta só para a prévia e o render:
 * { x, y, w, h } em pixels da saída. Escala 1 = a origem cabe inteira no quadro (sobra vira faixa preta).
 */
export function posicionar(L, A, cw, ch, ajustes = {}, zoom = { escala: 1, foco: { x: 0.5, y: 0.5 } }) {
  const s = ajustes.escala ?? 1
  const fit = Math.min(L / cw, A / ch)
  const w0 = cw * fit * s
  const h0 = ch * fit * s
  const x0 = (L - w0) / 2 + (ajustes.x ?? 0) * L
  const y0 = (A - h0) / 2 + (ajustes.y ?? 0) * A
  const z = Math.max(1, zoom.escala || 1)
  const { sx, sy } = recorte(L, A, zoom)
  return { x: (x0 - sx) * z, y: (y0 - sy) * z, w: w0 * z, h: h0 * z }
}

/**
 * O mesmo, como transform CSS de um <video> que ocupa a tela inteira com object-fit: contain (origem 0 0): a imagem
 * dentro dele já está no lugar de escala 1; o transform leva esse retângulo para o de posicionar().
 */
export function transformCssClipe(L, A, cw, ch, ajustes = {}, zoom) {
  const base = posicionar(L, A, cw, ch, {}, { escala: 1, foco: { x: 0.5, y: 0.5 } })
  const r = posicionar(L, A, cw, ch, ajustes, zoom)
  const k = r.w / base.w
  if (Math.abs(k - 1) < 1e-6 && Math.abs(r.x - base.x) < 1e-6 && Math.abs(r.y - base.y) < 1e-6) return 'none'
  // ponto p da tela → p·k + t, com t tal que o canto da imagem vá de base para r
  const tx = r.x - base.x * k
  const ty = r.y - base.y * k
  return `translate(${(tx / L) * 100}%, ${(ty / A) * 100}%) scale(${k})`
}

/** dB → ganho linear (volume do Inspector). */
export const ganho = (db) => (db <= -60 ? 0 : 10 ** (db / 20))
