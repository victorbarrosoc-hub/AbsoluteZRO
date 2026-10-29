// Revela · cena e tela. O look da Revela trabalha na luz da cena (scene-referred), como pedem Netflix, ACES, ARRI e
// RED: entra e sai em DaVinci Wide Gamut / Intermediate, e a passagem para a tela (DRT) é outra etapa, trocável:
// Rec.709 SDR, P3-D65 PQ 1000 nits ou Rec.2020 PQ. Assim o mesmo look serve para SDR e HDR e para qualquer câmera.
//
// A tela segue o desenho do ACES 2.0 (curva de tom do Daniele Siragusano, cinza 18% → 10 nits no SDR) e do OpenDRT
// (Jed Smith): a curva age só na luminância, os três canais mantêm a razão (o matiz não gira com a luz), a cor vai para
// o branco perto do pico (como a película) e a cor fora do gamut da tela é comprimida, nunca cortada canal a canal.
// No SDR a tela tem inversa: um still Rec.709 volta para a luz da cena e entra no mesmo motor.

import { CURVAS, GAMUTS, matrizGamut, rgbParaXyz } from './espacos.js'

const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]
const limitar = (v, a, b) => Math.min(b, Math.max(a, v))
const suave = (a, b, x) => {
  const t = limitar((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// ─────────── espaço de trabalho: DaVinci Wide Gamut / Intermediate ───────────

export const TRABALHO = { curva: 'davinci', gamut: 'dwg', nome: 'DaVinci Wide Gamut / Intermediate', sigla: 'DWG-DI' }
export const diParaLinear = CURVAS.davinci.paraLinear
export const linearParaDi = CURVAS.davinci.deLinear
/** Luminância (Y do XYZ) de um RGB linear em DWG. */
const Y_DWG = rgbParaXyz('dwg')[1]
export const luminancia = (rgb) => Y_DWG[0] * rgb[0] + Y_DWG[1] * rgb[1] + Y_DWG[2] * rgb[2]

/** Código de uma câmera (ou de outro espaço log) → luz linear em DWG. `espaco`: { curva, gamut }. */
export function paraTrabalho(espaco) {
  const c = CURVAS[espaco.curva]
  const M = matrizGamut(espaco.gamut, 'dwg')
  return (r, g, b) => mul(M, [c.paraLinear(r), c.paraLinear(g), c.paraLinear(b)])
}
/** Luz linear em DWG → código de outro espaço log (ACEScct, LogC4…), sem mapa de tom. */
export function deTrabalho(espaco) {
  const c = CURVAS[espaco.curva]
  const M = matrizGamut('dwg', espaco.gamut)
  return (rgb) => mul(M, rgb).map((v) => c.deLinear(v))
}

// ─────────── curva de tom (ACES 2.0, Daniele) ───────────

/**
 * Curva de tom para uma tela de `pico` nits: luz da cena (0,18 = cinza) → luz da tela relativa a 100 nits. Cinza vai a
 * 10 nits no SDR (14,5 em 1000 nits) e a cena chega no pico perto de 128 (≈ +9,5 stops). Com a inversa exata.
 */
export function curvaDeTom(pico = 100) {
  const nr = 100
  const g = 1.15
  const c = 0.18
  const cd = 10.013
  const wg = 0.14
  const t1 = 0.04
  const rHit = 128 + (896 - 128) * (Math.log(pico / nr) / Math.log(10000 / 100))
  const m0 = pico / nr
  const m1 = 0.5 * (m0 + Math.sqrt(m0 * (m0 + 4 * t1)))
  const u = ((rHit / m1) / (rHit / m1 + 1)) ** g
  const m = m1 / u
  const wi = Math.log(pico / 100) / Math.log(2)
  const ct = (cd / nr) * (1 + wi * wg)
  const gip = 0.5 * (ct + Math.sqrt(ct * (ct + 4 * t1)))
  const gipp2 = -(m1 * (gip / m) ** (1 / g)) / ((gip / m) ** (1 / g) - 1)
  const w2 = c / gipp2
  const s2 = w2 * m1
  const u2 = ((rHit / m1) / (rHit / m1 + w2)) ** g
  const m2 = m1 / u2
  const teto = m0
  return {
    pico: teto,
    ida(x) {
      if (!(x > 0)) return 0
      const f = m2 * (x / (x + s2)) ** g
      return Math.min(teto, (f * f) / (f + t1))
    },
    volta(h) {
      if (!(h > 0)) return 0
      const f = (h + Math.sqrt(h * h + 4 * h * t1)) / 2
      const y = Math.min(0.999999, (f / m2) ** (1 / g))
      return (s2 * y) / (1 - y)
    },
  }
}

// ─────────── compressão de gamut (como o ACES RGC) ───────────

const LIMITE = 1.3 // distância do acromático que vira 1 (a borda do gamut da tela)
const LIMIAR = 0.8 // até aqui a cor passa igual
const POTENCIA = 1.2
const ESCALA = (LIMITE - LIMIAR) / (((1 - LIMIAR) / (LIMITE - LIMIAR)) ** -POTENCIA - 1) ** (1 / POTENCIA)
function comprimirDistancia(d) {
  if (d < LIMIAR) return d
  const n = (d - LIMIAR) / ESCALA
  return LIMIAR + (ESCALA * n) / (1 + n ** POTENCIA) ** (1 / POTENCIA)
}
function descomprimirDistancia(d) {
  if (d < LIMIAR) return d
  const y = Math.min(0.999999, (d - LIMIAR) / ESCALA)
  return LIMIAR + (ESCALA * y) / (1 - y ** POTENCIA) ** (1 / POTENCIA)
}
/** Canais que fogem do gamut chegam perto da borda em curva suave (o maior canal fica): nada de canal cortado. */
export function comprimirGamut(rgb) {
  const ac = Math.max(rgb[0], rgb[1], rgb[2])
  if (ac <= 0) return [0, 0, 0]
  return rgb.map((v) => ac - comprimirDistancia((ac - v) / ac) * ac)
}
function descomprimirGamut(rgb) {
  const ac = Math.max(rgb[0], rgb[1], rgb[2])
  if (ac <= 0) return [0, 0, 0]
  return rgb.map((v) => ac - descomprimirDistancia(limitar((ac - v) / ac, 0, 1)) * ac)
}

// ─────────── telas ───────────

const PQ = { m1: 2610 / 16384, m2: (2523 / 4096) * 128, c1: 3424 / 4096, c2: (2413 / 4096) * 32, c3: (2392 / 4096) * 32 }
const pqDeNits = (L) => {
  const y = (limitar(L, 0, 10000) / 10000) ** PQ.m1
  return ((PQ.c1 + PQ.c2 * y) / (1 + PQ.c3 * y)) ** PQ.m2
}

/** As telas de saída. `codificacao`: gama 2.4 (BT.1886), sRGB ou PQ (ST 2084, em nits absolutos). */
export const TELAS = [
  { id: 'rec709', nome: 'Rec.709 · Gama 2.4 (SDR)', sigla: 'Gamma24_Rec709-D65', pico: 100, gamut: 'rec709', codificacao: 'gama24' },
  { id: 'srgb', nome: 'sRGB (web e celular)', sigla: 'sRGB_Rec709-D65', pico: 100, gamut: 'rec709', codificacao: 'srgb' },
  { id: 'p3d65-pq', nome: 'P3-D65 · PQ 1000 nits (HDR)', sigla: 'PQ_P3-D65_1000nits', pico: 1000, gamut: 'p3d65', codificacao: 'pq' },
  { id: 'rec2020-pq', nome: 'Rec.2020 · PQ 1000 nits (HDR)', sigla: 'PQ_Rec2020-D65_1000nits', pico: 1000, gamut: 'rec2020', codificacao: 'pq' },
]

/** Quanto a cor vai para o branco perto do pico (0 = cor inteira, 0,9 = quase branco), pela luz da tela 0–1. */
const paraOBranco = (hn) => 0.9 * suave(0.55, 1, hn) ** 1.5

/**
 * A "luz" de uma cor para a curva de tom: a luminância, com um piso de 20% do maior canal para azuis e roxos muito
 * saturados (de luminância quase zero ou negativa no gamut largo) não sumirem no preto. Homogênea: N(a·v) = a·N(v).
 */
function norma(Yt, v) {
  const Y = Math.max(0, Yt[0] * v[0] + Yt[1] * v[1] + Yt[2] * v[2])
  const m = 0.2 * Math.max(0, v[0], v[1], v[2])
  return ((Y ** 4 + m ** 4) / (1 + 0.2 ** 4)) ** 0.25
}

/**
 * A tela (DRT): luz linear em DWG → código da tela. `inverter(código)` faz o caminho de volta (só no SDR), para um
 * still Rec.709 entrar no motor como luz da cena.
 */
export function criarTela(id = 'rec709') {
  const tela = TELAS.find((t) => t.id === id)
  if (!tela) throw new Error(`Tela desconhecida: ${id}`)
  const tom = curvaDeTom(tela.pico)
  const pico = tom.pico // em unidades de 100 nits
  const M = matrizGamut('dwg', tela.gamut)
  const Mi = matrizGamut(tela.gamut, 'dwg')
  const Yt = rgbParaXyz(tela.gamut)[1]
  const curva = tela.codificacao === 'srgb' ? CURVAS.srgb : CURVAS.rec709

  function codificar(v) {
    if (tela.codificacao === 'pq') return pqDeNits(v * 100)
    return curva.deLinear(limitar(v / pico, 0, 1))
  }

  function aplicar(rgbDwg) {
    const v = mul(M, rgbDwg)
    const n = norma(Yt, v)
    if (!(n > 1e-7)) return [codificar(0), codificar(0), codificar(0)]
    const h = tom.ida(n)
    const k = paraOBranco(h / pico)
    let misto = v.map((x) => (x / n) * (1 - k) + k)
    const nm = norma(Yt, misto)
    misto = misto.map((x) => x / nm)
    let rgb = comprimirGamut(misto.map((x) => x * h))
    const maior = Math.max(...rgb)
    if (maior > pico) rgb = rgb.map((x) => h + ((x - h) * (pico - h)) / (maior - h))
    return rgb.map((x) => codificar(Math.max(0, x)))
  }

  function inverter(r, g, b) {
    if (tela.codificacao === 'pq') throw new Error('A volta só existe para telas SDR')
    // um pouco abaixo do pico: o branco cheio do still não vira luz infinita na cena
    const lin = descomprimirGamut([r, g, b].map((v) => Math.min(0.985, curva.paraLinear(limitar(v, 0, 1))) * pico))
    const h = norma(Yt, lin)
    if (!(h > 1e-7)) return [0, 0, 0]
    const k = paraOBranco(h / pico)
    const misto = lin.map((x) => x / h)
    // a razão de antes do "para o branco": a escala s que devolve norma 1 (busca binária, a norma cresce com s)
    const razao = (s) => misto.map((x) => (s * x - k) / (1 - k))
    const n = tom.volta(h)
    // longe do pico a cor não foi para o branco (k = 0): a razão é a própria mistura, sem busca
    if (k === 0) return mul(Mi, misto.map((x) => x * n))
    // perto do pico: a norma cresce suave com s (é quase uma reta), então a secante acha s em poucos passos; se não
    // convergir, a busca binária garante
    const erro = (s) => norma(Yt, razao(s)) - 1
    let s0 = 1
    let s1 = 1.01
    let e0 = erro(s0)
    let e1 = erro(s1)
    for (let i = 0; i < 12 && Math.abs(e1) > 1e-13 && e1 !== e0; i++) {
      const s2 = s1 - (e1 * (s1 - s0)) / (e1 - e0)
      s0 = s1
      e0 = e1
      s1 = s2
      e1 = erro(s1)
    }
    if (!(Math.abs(e1) <= 1e-9 && s1 > 0 && s1 < 64)) {
      let lo = 0
      let hi = 64
      for (let i = 0; i < 48; i++) {
        const meio = (lo + hi) / 2
        if (norma(Yt, razao(meio)) < 1) lo = meio
        else hi = meio
      }
      s1 = (lo + hi) / 2
    }
    return mul(Mi, razao(s1).map((x) => x * n))
  }

  return { ...tela, curvaDeTom: tom, aplicar, inverter }
}
