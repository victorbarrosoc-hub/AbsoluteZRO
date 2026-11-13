// Os avisos de corte e o antes/depois em JS: o mesmo que a placa desenha (gpu/glsl.js, passos PONTO, FINAL e COMPOR),
// para a prévia sem placa de vídeo, que o worker da revelação (app/motor/motor-worker.js) revela sozinho.
//
//   marcasDosAvisos(base, ajustes, { regiao, largura, altura, corte }) → Uint8Array por pixel da saída: 0 a 3 canais
//       cortados no sensor (+4 abaixo do piso de ruído); foto pronta: 3 onde o código original já era 255
//   pintarAvisos(rgba, largura, altura, marcas, avisos, { x0, y0 })   perdida sólida, recuperável e sombra em listras
//   comporAntes(rgba, antes, largura, posicao)                       o antes à esquerda da divisória, e a linha dela
//
// Perdido = os três canais cortados no sensor (sem dado no arquivo). Recuperável = um ou dois canais cortados, ou a
// tela corta mas o arquivo tem dado. Sombra = abaixo do piso de ruído medido no arquivo (Latitude).

import { luminancia } from './cor/espacos.js'
import { geometria } from './revelar.js'
import { MARGENS, PESO_MAXIMO, criarTela } from './tela.js'

/** Cores dos avisos (código da tela): neutras, distintas entre si e da foto. */
export const AVISOS = {
  perdida: [0.06, 0.06, 0.06], // altas luzes sem dado no arquivo (três canais cortados no sensor): sólido
  recuperavel: [0.5, 0.5, 0.5], // a tela corta, ou um ou dois canais cortados, mas o arquivo tem dado: listras
  sombra: [0.93, 0.93, 0.93], // abaixo do piso de ruído medido no arquivo: listras
}
const BYTES = Object.fromEntries(Object.entries(AVISOS).map(([k, v]) => [k, v.map((c) => Math.round(c * 255))]))
/** A cor da linha da divisória (0,94 de código). */
const DIVISORIA = Math.round(0.94 * 255)

/**
 * O que a máscara de avisos precisa de uma base RAW: a matriz Rec.2020 → câmera (já com o branco) e o limiar de corte
 * por canal. Sai de `corDaCamera(negativo)` quando o negativo existe (exato); sem ele, do neutro da câmera guardado na
 * base, tratando Rec.2020 como espaço de câmera (aproximado: `exato: false`).
 */
export function corteDaBase(base, { cor = null, limiar = 0.98 } = {}) {
  if (base.origem !== 'raw') return null
  if (cor?.paraRec2020 && cor?.ganhos) {
    return { matriz: inverter3(cor.paraRec2020), limiar: cor.ganhos.map((g) => limiar * g), exato: true }
  }
  const neutro = base.branco?.neutroCamera
  if (!Array.isArray(neutro) || !neutro.every((v) => v > 0)) return null
  const maior = Math.max(...neutro)
  return { matriz: [1, 0, 0, 0, 1, 0, 0, 0, 1], limiar: neutro.map((v) => (limiar * maior) / v), exato: false }
}

function inverter3(m) {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  const l0 = [A, -(b * i - c * h), b * f - c * e]
  const l1 = [B, a * i - c * g, -(a * f - c * d)]
  const l2 = [C, -(a * h - b * g), a * e - b * d]
  return [...l0, ...l1, ...l2].map((v) => v / det)
}

/**
 * As marcas por pixel da saída de `revelar(base, ajustes, { regiao })` (zoom 1: um pixel do quadro por pixel). Cada
 * pixel lê o pixel da base que cai no centro dele, pela mesma geometria. `corte`: o da base (padrão `base.corte` ou
 * `corteDaBase(base)`).
 */
export function marcasDosAvisos(base, ajustes, { regiao = null, largura, altura, corte = base.corte ?? corteDaBase(base) } = {}) {
  const geo = geometria(base, ajustes)
  const W = largura ?? regiao?.largura ?? geo.largura
  const H = altura ?? regiao?.altura ?? geo.altura
  const x0 = regiao?.x ?? 0
  const y0 = regiao?.y ?? 0
  const [a, b, c, d, e, f] = geo.mapa
  const { largura: bw, altura: bh, dados } = base.imagem
  const original =
    !corte && base.origem === 'imagem' ? criarTela(base.espaco ?? 'srgb', { altas: MARGENS.altas.padrao, sombras: MARGENS.sombras.padrao }) : null
  const abaixo = base.latitude?.margem?.abaixoDoCinza
  const piso = Number.isFinite(abaixo) ? 0.18 * 2 ** (-abaixo - (base.exposicaoBase ?? 0)) : 0
  const Y = luminancia('rec2020')
  const pesos = Y.map((v) => v * (1 - PESO_MAXIMO))
  const M = corte?.matriz
  const L = corte?.limiar
  const codigo = [0, 0, 0]
  const marcas = new Uint8Array(W * H)
  const alto = 254.5 / 255
  const baixo = 0.5 / 255
  for (let y = 0; y < H; y++) {
    const py = y0 + y + 0.5
    for (let x = 0; x < W; x++) {
      const px = x0 + x + 0.5
      const bx = Math.min(bw - 1, Math.max(0, Math.floor(a * px + b * py + c)))
      const by = Math.min(bh - 1, Math.max(0, Math.floor(d * px + e * py + f)))
      const o = (by * bw + bx) * 3
      const r = dados[o]
      const g = dados[o + 1]
      const bl = dados[o + 2]
      let marca = 0
      if (M) {
        marca = (M[0] * r + M[1] * g + M[2] * bl >= L[0]) + (M[3] * r + M[4] * g + M[5] * bl >= L[1]) + (M[6] * r + M[7] * g + M[8] * bl >= L[2])
      } else if (original) {
        original.aplicar(r, g, bl, codigo)
        if (codigo[0] >= alto || codigo[1] >= alto || codigo[2] >= alto) marca = 3
        if (codigo[0] <= baixo && codigo[1] <= baixo && codigo[2] <= baixo) marca |= 4
      }
      if (piso > 0 && pesos[0] * r + pesos[1] * g + pesos[2] * bl + PESO_MAXIMO * Math.max(r, g, bl) < piso) marca |= 4
      marcas[y * W + x] = marca
    }
  }
  return marcas
}

/**
 * Pinta os avisos sobre o RGBA de 8 bits da tela. `avisos`: true | { altas, sombras }. `x0`, `y0`: onde o pixel (0, 0)
 * fica na vista (as listras diagonais de 8 px seguem a vista, não o pedaço).
 */
export function pintarAvisos(rgba, largura, altura, marcas, avisos, { x0 = 0, y0 = 0 } = {}) {
  if (!avisos) return rgba
  const altas = avisos === true || avisos.altas !== false
  const sombras = avisos === true || avisos.sombras !== false
  const pintar = (i, cor) => {
    rgba[i] = cor[0]
    rgba[i + 1] = cor[1]
    rgba[i + 2] = cor[2]
  }
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const k = y * largura + x
      const i = k * 4
      const m = marcas[k]
      const sombra = m >= 4
      const cortados = m & 3
      const listra = (x0 + x + y0 + y) % 8 < 4
      if (altas) {
        if (cortados === 3) pintar(i, BYTES.perdida)
        else if (listra && (cortados > 0 || rgba[i] >= 255 || rgba[i + 1] >= 255 || rgba[i + 2] >= 255)) pintar(i, BYTES.recuperavel)
      }
      if (sombras && sombra && listra) pintar(i, BYTES.sombra)
    }
  }
  return rgba
}

/** Antes | depois: o antes à esquerda da divisória (`posicao` de 0 a 1 da largura), e a linha de 1 px dela. */
export function comporAntes(rgba, antes, largura, posicao) {
  const divisoria = Math.max(0, Math.min(1, posicao ?? 0.5)) * largura
  const altura = rgba.length / 4 / largura
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const meio = x + 0.5
      const i = (y * largura + x) * 4
      if (Math.abs(meio - divisoria) < 1) {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = DIVISORIA
        rgba[i + 3] = 255
      } else if (meio < divisoria) {
        rgba[i] = antes[i]
        rgba[i + 1] = antes[i + 1]
        rgba[i + 2] = antes[i + 2]
        rgba[i + 3] = antes[i + 3]
      }
    }
  }
  return rgba
}
