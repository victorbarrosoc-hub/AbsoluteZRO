// Imagens sintéticas e um look conhecido, para medir se a LUT chega perto do estilo da referência.

import { codigoParaOklab, oklabParaCodigo } from '../src/cor/oklab.js'

/** Gerador pseudoaleatório com semente (mulberry32): o teste dá sempre o mesmo resultado. */
export function aleatorio(semente) {
  let t = semente >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * "Cena" sintética: manchas de cor com luz variada (céu, pele, verde, neutros), como um frame comum tem. Cada
 * semente dá outra cena com a mesma variedade.
 */
export function cena(semente, largura = 160, altura = 90) {
  const rnd = aleatorio(semente)
  const pixels = new Float32Array(largura * altura * 3)
  const paleta = [
    [0.55, 0.62, 0.75], // céu
    [0.78, 0.6, 0.5], // pele
    [0.3, 0.42, 0.22], // verde
    [0.5, 0.5, 0.5], // neutro
    [0.2, 0.18, 0.2], // sombra
    [0.92, 0.9, 0.86], // alto
    [0.6, 0.25, 0.2], // vermelho
  ]
  const manchas = Array.from({ length: 40 }, () => ({
    x: rnd() * largura,
    y: rnd() * altura,
    r: 6 + rnd() * 30,
    cor: paleta[Math.floor(rnd() * paleta.length)],
    luz: 0.35 + rnd() * 1.1,
  }))
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      let m = manchas[0]
      let melhor = Infinity
      for (const k of manchas) {
        const d = Math.hypot(x - k.x, y - k.y) / k.r
        if (d < melhor) {
          melhor = d
          m = k
        }
      }
      const grad = 0.75 + 0.5 * (1 - y / altura) + (rnd() - 0.5) * 0.08
      const i = (y * largura + x) * 3
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(1, Math.max(0, m.cor[c] * m.luz * grad))
    }
  return { largura, altura, pixels }
}

/** Look conhecido: S suave com preto levantado, sombras frias, altos quentes, menos saturação. */
export function lookConhecido(r, g, b) {
  const [L, a, bb] = codigoParaOklab(r, g, b)
  const L2 = 0.04 + 0.9 * (L + 0.07 * Math.sin(2 * Math.PI * L))
  const a2 = 0.8 * a - 0.012 * (1 - L) + 0.004 * L
  const b2 = 0.8 * bb - 0.03 * (1 - L) + 0.03 * L
  return oklabParaCodigo(L2, a2, b2)
}

export function aplicarEmImagem(img, f) {
  const pixels = new Float32Array(img.pixels.length)
  for (let i = 0; i < pixels.length; i += 3) {
    const o = f(img.pixels[i], img.pixels[i + 1], img.pixels[i + 2])
    pixels[i] = o[0]
    pixels[i + 1] = o[1]
    pixels[i + 2] = o[2]
  }
  return { ...img, pixels }
}

/**
 * Distância média em Oklab entre duas imagens do mesmo tamanho (≈ 0,02 já é diferença visível lado a lado).
 * `soCor`: ignora a luz e mede só a cor (a, b).
 */
export function distanciaMedia(x, y, { soCor = false } = {}) {
  let soma = 0
  const n = x.pixels.length / 3
  for (let i = 0; i < x.pixels.length; i += 3) {
    const p = codigoParaOklab(x.pixels[i], x.pixels[i + 1], x.pixels[i + 2])
    const q = codigoParaOklab(y.pixels[i], y.pixels[i + 1], y.pixels[i + 2])
    soma += Math.hypot(soCor ? 0 : p[0] - q[0], p[1] - q[1], p[2] - q[2])
  }
  return soma / n
}
