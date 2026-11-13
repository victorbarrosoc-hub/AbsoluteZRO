// Espaços RGB do motor: primárias e branco em xy (as dos padrões), matrizes DERIVADAS delas (nunca copiadas de tabela,
// para não herdar arredondamento) e as curvas de transferência.
//
//   sRGB / Rec.709   IEC 61966-2-1 e ITU-R BT.709      Display P3   SMPTE EG 432-1 com branco D65 e curva sRGB
//   Rec.2020         ITU-R BT.2020                      Adobe RGB    Adobe RGB (1998), gama 563/256
//   ProPhoto         ROMM RGB, ISO 22028-2 (branco D50, gama 1,8 com trecho reto)
//
// O espaço de trabalho do motor é Rec.2020 linear com branco D65.

import { inversa, mulM, mulV } from './matriz.js'
import { matrizAdaptacao } from './adaptacao.js'

export const D65 = [0.3127, 0.329]
export const D50 = [0.3457, 0.3585]

export const ESPACOS = {
  srgb: { nome: 'sRGB', primarias: [0.64, 0.33, 0.3, 0.6, 0.15, 0.06], branco: D65, curva: 'srgb' },
  p3: { nome: 'Display P3', primarias: [0.68, 0.32, 0.265, 0.69, 0.15, 0.06], branco: D65, curva: 'srgb' },
  rec2020: { nome: 'Rec.2020', primarias: [0.708, 0.292, 0.17, 0.797, 0.131, 0.046], branco: D65, curva: 'rec2020' },
  adobe: { nome: 'Adobe RGB (1998)', primarias: [0.64, 0.33, 0.21, 0.71, 0.15, 0.06], branco: D65, curva: 'gama22' },
  prophoto: { nome: 'ProPhoto RGB', primarias: [0.7347, 0.2653, 0.1596, 0.8404, 0.0366, 0.0001], branco: D50, curva: 'prophoto' },
}

export const TRABALHO = 'rec2020'

/** xy → XYZ com Y = 1. */
export const xyParaXYZ = ([x, y]) => [x / y, 1, (1 - x - y) / y]
/** XYZ → xy. */
export const XYZParaXy = ([X, Y, Z]) => {
  const s = X + Y + Z
  return [X / s, Y / s]
}

const espacoDe = (e) => {
  const esp = typeof e === 'string' ? ESPACOS[e] : e
  if (!esp) throw new Error(`Espaço de cor desconhecido: ${e}`)
  return esp
}

/**
 * RGB linear → XYZ, pelas primárias e pelo branco: as colunas são as primárias em XYZ, escaladas para que RGB (1,1,1)
 * dê o branco com Y = 1 (SMPTE RP 177).
 */
export function rgbParaXyz(espaco) {
  const { primarias: p, branco } = espacoDe(espaco)
  const R = xyParaXYZ([p[0], p[1]])
  const G = xyParaXYZ([p[2], p[3]])
  const B = xyParaXYZ([p[4], p[5]])
  const M = [R[0], G[0], B[0], R[1], G[1], B[1], R[2], G[2], B[2]]
  const S = mulV(inversa(M), xyParaXYZ(branco))
  return M.map((v, i) => v * S[i % 3])
}

export const xyzParaRgb = (espaco) => inversa(rgbParaXyz(espaco))

/** RGB linear de um espaço para outro. Brancos diferentes (ProPhoto é D50) passam por adaptação cromática. */
export function matrizEntre(de, para, metodo = 'bradford') {
  const a = espacoDe(de)
  const b = espacoDe(para)
  let m = rgbParaXyz(a)
  if (a.branco[0] !== b.branco[0] || a.branco[1] !== b.branco[1]) m = mulM(matrizAdaptacao(xyParaXYZ(a.branco), xyParaXYZ(b.branco), metodo), m)
  return mulM(xyzParaRgb(b), m)
}

/** Pesos da luminância (linha Y da matriz RGB → XYZ). */
export const luminancia = (espaco) => rgbParaXyz(espaco).slice(3, 6)

// ─────────── curvas de transferência (código da tela ⇄ luz linear, 0..1) ───────────

// BT.2020: α e β exatos (a solução do encontro dos dois trechos), como no texto da recomendação para 12 bits.
const ALFA = 1.09929682680944
const BETA = 0.018053968510807
const GAMA_ADOBE = 563 / 256

export const CURVAS = {
  linear: { codificar: (v) => v, decodificar: (v) => v },
  // IEC 61966-2-1
  srgb: {
    codificar: (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055),
    decodificar: (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4),
  },
  // Adobe RGB (1998) Color Image Encoding, 4.3.4.2
  gama22: { codificar: (v) => (v <= 0 ? 0 : v ** (1 / GAMA_ADOBE)), decodificar: (c) => (c <= 0 ? 0 : c ** GAMA_ADOBE) },
  // ITU-R BT.2020-2, tabela 4 (a mesma forma do BT.709)
  rec2020: {
    codificar: (v) => (v < BETA ? 4.5 * v : ALFA * v ** 0.45 - (ALFA - 1)),
    decodificar: (c) => (c < 4.5 * BETA ? c / 4.5 : ((c + (ALFA - 1)) / ALFA) ** (1 / 0.45)),
  },
  // ISO 22028-2 (ROMM): reta de inclinação 16 abaixo de 1/512
  prophoto: {
    codificar: (v) => (v < 1 / 512 ? 16 * v : v ** (1 / 1.8)),
    decodificar: (c) => (c < 16 / 512 ? c / 16 : c ** 1.8),
  },
}

export const curvaDe = (espaco) => CURVAS[espacoDe(espaco).curva]
