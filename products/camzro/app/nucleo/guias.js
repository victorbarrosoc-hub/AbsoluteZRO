// CAMZRO · guias de enquadramento e anamórfico. Contas puras.
//
// - Guia de proporção: o maior retângulo da proporção pedida que cabe no quadro, centrado (2,39 dentro de 16:9 vira
//   faixa em cima e embaixo; 9:16 dentro de 16:9 vira faixa nas laterais). Serve para filmar já pensando no corte
//   (cinema, Reels, feed) sem perder o quadro inteiro.
// - Área segura: 90% (ação) e 80% (título), como nas normas de TV; 93% e 90% na norma nova (SMPTE ST 2046-1).
// - Desanamorfizar: a lente anamórfica espreme a imagem na horizontal pelo fator (1,33×, 1,5×, 1,8×, 2×). A prévia
//   estica de volta; o arquivo fica como a câmera gravou (o editor desanamorfiza com o mesmo fator do sidecar).

export const PROPORCOES = [
  { id: '2.39', valor: 2.39, rotulo: '2,39' },
  { id: '2.0', valor: 2, rotulo: '2:1' },
  { id: '1.85', valor: 1.85, rotulo: '1,85' },
  { id: '16:9', valor: 16 / 9, rotulo: '16:9' },
  { id: '4:3', valor: 4 / 3, rotulo: '4:3' },
  { id: '1:1', valor: 1, rotulo: '1:1' },
  { id: '4:5', valor: 4 / 5, rotulo: '4:5' },
  { id: '9:16', valor: 9 / 16, rotulo: '9:16' },
]

export const ANAMORFICOS = [1, 1.33, 1.5, 1.55, 1.6, 1.8, 2]

/** Retângulo { x, y, largura, altura } (0–1 do quadro) da proporção dentro do quadro de largura × altura. */
export function guia(proporcao, largura, altura) {
  const quadro = largura / altura
  if (proporcao >= quadro) {
    const h = quadro / proporcao
    return { x: 0, y: (1 - h) / 2, largura: 1, altura: h }
  }
  const w = proporcao / quadro
  return { x: (1 - w) / 2, y: 0, largura: w, altura: 1 }
}

/** Área segura centrada (fração do quadro). */
export const areaSegura = (fracao) => ({ x: (1 - fracao) / 2, y: (1 - fracao) / 2, largura: fracao, altura: fracao })

/** Proporção de exibição depois de desanamorfizar: 16:9 com 1,33× → 2,37. */
export const proporcaoDesanamorfizada = (largura, altura, fator) => (largura * fator) / altura

/** Tamanho da prévia esticada para caber numa caixa (contain), em px. */
export function caixaDaPrevia(largura, altura, fator, caixaL, caixaA) {
  const p = proporcaoDesanamorfizada(largura, altura, fator)
  return p >= caixaL / caixaA ? { largura: caixaL, altura: caixaL / p } : { largura: caixaA * p, altura: caixaA }
}

/**
 * Nível (horizonte) pelo acelerômetro: com o aparelho deitado na horizontal (paisagem), o ângulo de rolagem sai da
 * gravidade nos eixos x e y do aparelho. Devolve graus (0 = nivelado) e se está dentro da tolerância.
 */
export function nivel(gx, gy, { orientacao = 0, tolerancia = 0.5 } = {}) {
  let ang = (Math.atan2(gx, gy) * 180) / Math.PI
  ang = ((ang + orientacao + 540) % 360) - 180
  if (ang > 90) ang -= 180
  if (ang < -90) ang += 180
  return { graus: ang, nivelado: Math.abs(ang) <= tolerancia }
}
