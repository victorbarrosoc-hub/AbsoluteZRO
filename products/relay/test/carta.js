// Carta de teste da cor: faixas em código de câmera (S-Log3 e afins, código ÷ 1023), gravadas como o arquivo de
// verdade chega (faixa de vídeo: o RGB esticado é o código sem o 64 e escalado por 876), e o que cada faixa deve virar
// pela conta da própria Revela (src/cor.js).

import { funcaoDaReceita } from '../src/cor.js'

/** Código da câmera (0–1) de cada faixa: preto do log, sombra, cinza 18% do S-Log3 (~420/1023), luz, cores. */
export const FAIXAS = [
  [0.1, 0.1, 0.1],
  [0.3, 0.3, 0.3],
  [0.41, 0.41, 0.41],
  [0.55, 0.55, 0.55],
  [0.5, 0.36, 0.32],
  [0.33, 0.44, 0.5],
  [0.34, 0.5, 0.36],
  [0.62, 0.6, 0.45],
]

/** Quadro RGB48 (rgb48le) com as faixas lado a lado. */
export function quadroRgb48(largura, altura) {
  const buf = Buffer.alloc(largura * altura * 6)
  const faixa = largura / FAIXAS.length
  for (let y = 0; y < altura; y++)
    for (let x = 0; x < largura; x++) {
      const codigo = FAIXAS[Math.min(FAIXAS.length - 1, Math.floor(x / faixa))]
      for (let c = 0; c < 3; c++) {
        const esticado = Math.min(1, Math.max(0, (codigo[c] * 1023 - 64) / 876))
        buf.writeUInt16LE(Math.round(esticado * 65535), (y * largura + x) * 6 + c * 2)
      }
    }
  return buf
}

/** O que cada faixa deve virar (RGB de tela 0–255), pela receita. */
export const esperado = (receita, look = null) => {
  const f = funcaoDaReceita(receita, look)
  return FAIXAS.map((c) => f(...c).map((v) => v * 255))
}

/** O centro de cada faixa num quadro RGB24 (rgb24 de faixa cheia). */
export function centros(rgb24, largura, altura) {
  const faixa = largura / FAIXAS.length
  const y = Math.floor(altura / 2)
  return FAIXAS.map((_, i) => {
    const x = Math.floor(faixa * i + faixa / 2)
    const o = (y * largura + x) * 3
    return [rgb24[o], rgb24[o + 1], rgb24[o + 2]]
  })
}

/** Maior diferença (0–255) entre o medido e o esperado, canal a canal. */
export const maiorDiferenca = (medido, alvo) => Math.max(...medido.flatMap((px, i) => px.map((v, c) => Math.abs(v - alvo[i][c]))))
