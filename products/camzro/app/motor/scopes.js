// CAMZRO · desenha os scopes (histograma, forma de onda luma ou RGB parade, vectorscope) a partir da cópia pequena
// do quadro que o monitor devolve. As contas são as do núcleo (nucleo/cor.js); aqui só pinta, com ImageData
// reaproveitado (nada de alocar a cada quadro).

import { histograma, formaDeOnda, vectorscope, alvosVectorscope, ANGULO_PELE } from '../nucleo/cor.js'

const L = 256
const A = 128

function preparar(canvas, w, h) {
  canvas.width = w
  canvas.height = h
  const c = canvas.getContext('2d', { alpha: true })
  return { c, img: c.createImageData(w, h) }
}

/** Forma de onda: colunas × 256 níveis → canvas 256 × 128, com linhas de 0, 50 e 100 IRE. modo 'luma' | 'parade'. */
export function criarFormaDeOnda(canvas) {
  const { c, img } = preparar(canvas, L, A)
  return (rgba, w, h, modo = 'luma') => {
    const { grade, colunas } = formaDeOnda(rgba, w, h, { colunas: modo === 'parade' ? 255 : L, modo })
    const d = img.data
    d.fill(0)
    const ganho = 255 / Math.max(1, (h / 8) | 0)
    const terco = colunas / 3
    for (let col = 0; col < colunas; col++) {
      const x = Math.min(L - 1, Math.floor((col / colunas) * L))
      const canal = modo === 'parade' ? Math.floor(col / terco) : -1
      for (let n = 0; n < 256; n++) {
        const v = grade[col * 256 + n]
        if (!v) continue
        const y = A - 1 - Math.floor((n / 255) * (A - 1))
        const i = (y * L + x) * 4
        const k = Math.min(255, v * ganho)
        if (canal < 0) {
          d[i] = d[i + 1] = d[i + 2] = 255
        } else {
          d[i] = canal === 0 ? 255 : 60
          d[i + 1] = canal === 1 ? 255 : 60
          d[i + 2] = canal === 2 ? 255 : 60
        }
        d[i + 3] = Math.max(d[i + 3], 40 + k * 0.85)
      }
    }
    c.putImageData(img, 0, 0)
    c.strokeStyle = 'rgba(255,255,255,0.22)'
    c.lineWidth = 1
    for (const ire of [0, 50, 100]) {
      const y = Math.round(A - 1 - (ire / 100) * (A - 1)) + 0.5
      c.beginPath()
      c.moveTo(0, y)
      c.lineTo(L, y)
      c.stroke()
    }
  }
}

/** Histograma de luma com o RGB por trás. Devolve também o quanto cortou em cima e embaixo (para o aviso). */
export function criarHistograma(canvas) {
  const { c } = preparar(canvas, L, A)
  return (rgba) => {
    const h = histograma(rgba, 1)
    c.clearRect(0, 0, L, A)
    let max = 1
    for (let i = 2; i < 254; i++) max = Math.max(max, h.y[i], h.r[i], h.g[i], h.b[i])
    const pintar = (arr, cor) => {
      c.fillStyle = cor
      c.beginPath()
      c.moveTo(0, A)
      for (let i = 0; i < 256; i++) c.lineTo(i, A - Math.min(A, (arr[i] / max) * A))
      c.lineTo(L, A)
      c.fill()
    }
    c.globalCompositeOperation = 'lighter'
    pintar(h.r, 'rgba(255,59,48,0.35)')
    pintar(h.g, 'rgba(52,199,89,0.35)')
    pintar(h.b, 'rgba(10,132,255,0.35)')
    c.globalCompositeOperation = 'source-over'
    pintar(h.y, 'rgba(255,255,255,0.55)')
    return { cortadoEmCima: h.cortadoEmCima, cortadoEmbaixo: h.cortadoEmbaixo }
  }
}

/** Vectorscope 128 × 128 com os alvos a 75% e a linha de pele. */
export function criarVectorscope(canvas) {
  const T = 128
  const { c, img } = preparar(canvas, T, T)
  const alvos = alvosVectorscope(0.75)
  return (rgba, zoom = 1) => {
    const { grade } = vectorscope(rgba, { tam: T, zoom })
    const d = img.data
    d.fill(0)
    for (let i = 0; i < grade.length; i++) {
      if (!grade[i]) continue
      const k = Math.min(255, 70 + grade[i] * 18)
      const o = i * 4
      d[o] = d[o + 1] = d[o + 2] = 255
      d[o + 3] = k
    }
    c.putImageData(img, 0, 0)
    const meio = (T - 1) / 2
    c.strokeStyle = 'rgba(255,255,255,0.2)'
    c.beginPath()
    c.arc(meio, meio, meio, 0, Math.PI * 2)
    c.stroke()
    // linha de pele (123°)
    const ang = (ANGULO_PELE * Math.PI) / 180
    c.strokeStyle = 'rgba(255,179,64,0.6)'
    c.beginPath()
    c.moveTo(meio, meio)
    c.lineTo(meio + Math.cos(ang) * meio, meio - Math.sin(ang) * meio)
    c.stroke()
    c.strokeStyle = 'rgba(255,255,255,0.55)'
    for (const a of alvos) {
      const x = (a.cb * zoom + 0.5) * (T - 1)
      const y = (0.5 - a.cr * zoom) * (T - 1)
      c.strokeRect(x - 3, y - 3, 6, 6)
    }
  }
}
