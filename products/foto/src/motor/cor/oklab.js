// Oklab (Björn Ottosson, 2020, "A perceptual color space for image processing", domínio público): luz L, a (verde ↔
// magenta), b (azul ↔ amarelo). É onde o motor mede e mexe em matiz e saturação, e a métrica dos testes (ΔE = distância
// euclidiana em L, a, b).
//
// As matrizes para um espaço RGB qualquer saem da matriz publicada sRGB linear → LMS (cujas linhas somam 1 exato)
// vezes a matriz derivada das primárias: assim cinza (r = g = b) dá a = b = 0 também em Rec.2020 e P3.
//
// A cena não tem teto e pode ter negativo pequeno (ruído): a raiz cúbica aceita os dois, e Oklab é homogêneo — dobrar a
// luz multiplica L, a e b por 2^(1/3) sem girar o matiz nem mudar a croma relativa C/L. É por isso que os controles de
// cor do motor trabalham com matiz e C/L: o mesmo número dá o mesmo resultado em qualquer exposição.

import { inversa, mulM } from './matriz.js'
import { matrizEntre, xyzParaRgb } from './espacos.js'

const SRGB_PARA_LMS = [0.4122214708, 0.5363325363, 0.0514459929, 0.2119034982, 0.6806995451, 0.1073969566, 0.0883024619, 0.2817188376, 0.6299787005]
// LMS' (já com a raiz cúbica) → Lab
export const LMS_PARA_LAB = [0.2104542553, 0.793617785, -0.0040720468, 1.9779984951, -2.428592205, 0.4505937099, 0.0259040371, 0.7827717662, -0.808675766]
export const LAB_PARA_LMS = inversa(LMS_PARA_LAB)

const guardadas = new Map()

/**
 * Conversor de um espaço RGB linear ('rec2020', 'srgb', 'p3'…) para Oklab e de volta.
 * `paraLms` e `deLms` são as matrizes 3×3 que a GPU recebe; `paraOklab(r, g, b, saida)` e `deOklab(L, a, b, saida)`
 * escrevem três números em `saida` (qualquer coisa indexável) e não alocam.
 */
export function criarOklab(espaco = 'rec2020') {
  if (guardadas.has(espaco)) return guardadas.get(espaco)
  const M = mulM(SRGB_PARA_LMS, matrizEntre(espaco, 'srgb'))
  const Mi = inversa(M)
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = M
  const [i0, i1, i2, i3, i4, i5, i6, i7, i8] = Mi
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = LMS_PARA_LAB
  const [b0, b1, b2, b3, b4, b5, b6, b7, b8] = LAB_PARA_LMS
  const conversor = {
    espaco,
    paraLms: M,
    deLms: Mi,
    paraOklab(r, g, b, saida) {
      const l = Math.cbrt(m0 * r + m1 * g + m2 * b)
      const m = Math.cbrt(m3 * r + m4 * g + m5 * b)
      const s = Math.cbrt(m6 * r + m7 * g + m8 * b)
      saida[0] = a0 * l + a1 * m + a2 * s
      saida[1] = a3 * l + a4 * m + a5 * s
      saida[2] = a6 * l + a7 * m + a8 * s
      return saida
    },
    deOklab(L, a, b, saida) {
      const l = b0 * L + b1 * a + b2 * b
      const m = b3 * L + b4 * a + b5 * b
      const s = b6 * L + b7 * a + b8 * b
      const l3 = l * l * l
      const m3c = m * m * m
      const s3 = s * s * s
      saida[0] = i0 * l3 + i1 * m3c + i2 * s3
      saida[1] = i3 * l3 + i4 * m3c + i5 * s3
      saida[2] = i6 * l3 + i7 * m3c + i8 * s3
      return saida
    },
  }
  guardadas.set(espaco, conversor)
  return conversor
}

const XYZ_PARA_SRGB = xyzParaRgb('srgb')
const srgb = () => criarOklab('srgb')

/** XYZ (D65, Y = 1 no branco) → [L, a, b]. */
export function xyzParaOklab(X, Y, Z) {
  const m = XYZ_PARA_SRGB
  return srgb().paraOklab(m[0] * X + m[1] * Y + m[2] * Z, m[3] * X + m[4] * Y + m[5] * Z, m[6] * X + m[7] * Y + m[8] * Z, [0, 0, 0])
}

/** [L, a, b] → [L, C, h] com h em graus de 0 a 360. */
export function paraOklch(L, a, b) {
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return [L, Math.hypot(a, b), h < 0 ? h + 360 : h]
}

/** [L, C, h em graus] → [L, a, b]. */
export function deOklch(L, C, h) {
  const r = (h * Math.PI) / 180
  return [L, C * Math.cos(r), C * Math.sin(r)]
}

/** ΔE em Oklab entre duas cores RGB lineares do mesmo espaço. Cerca de 0,02 já se vê lado a lado. */
export function deltaE(espaco, r1, g1, b1, r2, g2, b2) {
  const o = criarOklab(espaco)
  const p = o.paraOklab(r1, g1, b1, [0, 0, 0])
  const q = o.paraOklab(r2, g2, b2, [0, 0, 0])
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

// O círculo de cores dos controles (0 = vermelho, 60 = amarelo, 120 = verde, 180 = ciano, 240 = azul, 300 = magenta) é
// o do HSV sobre sRGB, o que os seletores de cor mostram. Oklab tem outro ângulo para as mesmas cores (vermelho em
// 29°, amarelo em 110°…). Esta função dá o matiz Oklab, em radianos, da cor pura daquele grau do círculo.
export function matizDoCirculo(graus) {
  const h = (((graus % 360) + 360) % 360) / 60
  const x = 1 - Math.abs((h % 2) - 1)
  const rgb = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x]
  // HSV é sobre o código sRGB: lineariza antes de entrar em Oklab
  const lin = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const lab = srgb().paraOklab(lin[0], lin[1], lin[2], [0, 0, 0])
  return Math.atan2(lab[2], lab[1])
}
