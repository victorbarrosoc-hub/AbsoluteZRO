// Histogramas do motor: o da TELA (luma e RGB do que vai ser visto, em código 0..1) e o da CENA, em EV em torno do
// cinza médio — é sobre este que a tela desenha as margens (quanto do arquivo cabe acima e abaixo do cinza).

import { luminancia } from './cor/espacos.js'
import { CINZA, PESO_MAXIMO } from './tela.js'

/**
 * Histograma da imagem de tela (dados 0..1, 3 por pixel). `casas` por canal; `luma` usa os pesos de luminância do
 * espaço da imagem sobre o código (é a "luma" de vídeo: o que os histogramas de câmera mostram).
 * Devolve { casas, luma, r, g, b, pixels, estourado: [r, g, b], preto: [r, g, b] } (frações em 1 e em 0).
 */
export function histogramaDaTela(imagem, { casas = 256, espaco = imagem.espaco ?? 'srgb', passo = 1 } = {}) {
  const { largura, altura, dados } = imagem
  const Y = luminancia(espaco)
  const luma = new Uint32Array(casas)
  const canais = [new Uint32Array(casas), new Uint32Array(casas), new Uint32Array(casas)]
  const estourado = [0, 0, 0]
  const preto = [0, 0, 0]
  let pixels = 0
  const casa = (v) => {
    const i = (v * casas) | 0
    return i < 0 ? 0 : i >= casas ? casas - 1 : i
  }
  for (let y = 0; y < altura; y += passo) {
    for (let x = 0; x < largura; x += passo) {
      const o = (y * largura + x) * 3
      for (let c = 0; c < 3; c++) {
        const v = dados[o + c]
        canais[c][casa(v)]++
        if (v >= 1) estourado[c]++
        else if (v <= 0) preto[c]++
      }
      luma[casa(Y[0] * dados[o] + Y[1] * dados[o + 1] + Y[2] * dados[o + 2])]++
      pixels++
    }
  }
  const fracao = (v) => v.map((n) => n / Math.max(1, pixels))
  return { casas, luma, r: canais[0], g: canais[1], b: canais[2], pixels, estourado: fracao(estourado), preto: fracao(preto) }
}

/**
 * Histograma da cena em EV em torno do cinza médio: casa k cobre de evMin + k/porEv a evMin + (k + 1)/porEv.
 * `ev` é o deslocamento a somar (exposição do usuário + exposição base), para o histograma acompanhar o controle sem
 * tocar na imagem. `abaixo` e `acima` contam o que ficou fora da faixa (preto absoluto e ruído negativo caem em
 * `abaixo`). `percentil(p)` devolve o EV abaixo do qual está a fração p da imagem.
 */
export function histogramaDaCena(imagem, { evMin = -12, evMax = 8, porEv = 4, ev = 0, passo = 1 } = {}) {
  const { largura, altura, dados } = imagem
  const Y = luminancia('rec2020')
  const w0 = Y[0] * (1 - PESO_MAXIMO)
  const w1 = Y[1] * (1 - PESO_MAXIMO)
  const w2 = Y[2] * (1 - PESO_MAXIMO)
  const n = (evMax - evMin) * porEv
  const casas = new Uint32Array(n)
  let abaixo = 0
  let acima = 0
  let pixels = 0
  for (let y = 0; y < altura; y += passo) {
    for (let x = 0; x < largura; x += passo) {
      const o = (y * largura + x) * 3
      const r = dados[o]
      const g = dados[o + 1]
      const b = dados[o + 2]
      const mx = r > g ? (r > b ? r : b) : g > b ? g : b
      const v = w0 * r + w1 * g + w2 * b + PESO_MAXIMO * mx
      pixels++
      if (!(v > 0)) {
        abaixo++
        continue
      }
      const k = Math.floor((Math.log2(v / CINZA) + ev - evMin) * porEv)
      if (k < 0) abaixo++
      else if (k >= n) acima++
      else casas[k]++
    }
  }
  return {
    evMin,
    evMax,
    porEv,
    casas,
    abaixo,
    acima,
    pixels,
    percentil(p) {
      const alvo = p * pixels
      let soma = abaixo
      if (soma >= alvo) return evMin
      for (let k = 0; k < n; k++) {
        if (soma + casas[k] >= alvo) return evMin + (k + (alvo - soma) / Math.max(1, casas[k])) / porEv
        soma += casas[k]
      }
      return evMax
    },
  }
}
