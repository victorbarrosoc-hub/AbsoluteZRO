// Espaços de cor usados pela referência → LUT.
//
//   código Rec.709 (0–1, gama 2,4, o que o monitor mostra)  ⇄  luz linear Rec.709  ⇄  Oklab (L, a, b)
//
// Oklab (Björn Ottosson, 2020, domínio público) separa luz (L) de cor (a: verde ↔ magenta, b: azul ↔ amarelo) de um
// jeito próximo de como a gente enxerga; é nele que as duas imagens são comparadas.

export const GAMA = 2.4

export const decodificar = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v ** GAMA)
export const codificar = (L) => (L <= 0 ? 0 : L >= 1 ? 1 : L ** (1 / GAMA))

/** RGB linear Rec.709 → Oklab. */
export function linearParaOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Oklab → RGB linear Rec.709 (pode sair fora de 0–1). */
export function oklabParaLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export const codigoParaOklab = (r, g, b) => linearParaOklab(decodificar(r), decodificar(g), decodificar(b))

// folga para o arredondamento das matrizes (as cores puras do Rec.709 voltam a ±1e-5)
const FOLGA = 1e-4
const dentro = (c) => c[0] >= -FOLGA && c[0] <= 1 + FOLGA && c[1] >= -FOLGA && c[1] <= 1 + FOLGA && c[2] >= -FOLGA && c[2] <= 1 + FOLGA

/**
 * Oklab → código Rec.709. Cor que não cabe no Rec.709 perde saturação (mesma luz, mesmo matiz) até caber, em vez de
 * cortar canal a canal, que muda o matiz.
 */
export function oklabParaCodigo(L, a, b) {
  L = Math.min(1, Math.max(0, L))
  let lin = oklabParaLinear(L, a, b)
  if (!dentro(lin)) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const t = (lo + hi) / 2
      if (dentro(oklabParaLinear(L, a * t, b * t))) lo = t
      else hi = t
    }
    lin = oklabParaLinear(L, a * lo, b * lo)
  }
  // resto de arredondamento perto do preto vira zero (a gama 2,4 amplia 1e-7 em 0,001)
  const limpo = (v) => (Math.abs(v) < 2e-6 ? 0 : v)
  return [codificar(limpo(lin[0])), codificar(limpo(lin[1])), codificar(limpo(lin[2]))]
}
