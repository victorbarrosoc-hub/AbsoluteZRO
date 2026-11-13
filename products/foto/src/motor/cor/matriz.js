// Matrizes 3×3 em lista plana de 9 números, linha a linha (m[0..2] = primeira linha), o mesmo formato das matrizes de
// câmera do negativo e dos `mat3` que a GPU recebe (lá em coluna a coluna: quem envia transpõe).

export const identidade = () => [1, 0, 0, 0, 1, 0, 0, 0, 1]

/** a · b (primeiro aplica b, depois a). */
export function mulM(a, b) {
  const s = new Array(9)
  for (let l = 0; l < 3; l++) {
    for (let c = 0; c < 3; c++) s[l * 3 + c] = a[l * 3] * b[c] + a[l * 3 + 1] * b[3 + c] + a[l * 3 + 2] * b[6 + c]
  }
  return s
}

/** m · v */
export function mulV(m, v) {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
}

/** Inversa pela adjunta (em float64). Lança se a matriz não tem inversa: matriz de câmera estragada não vira cor. */
export function inversa(m) {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (!(Math.abs(det) > 1e-300)) throw new Error('Matriz sem inversa')
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det]
}

export const diagonal = (d) => [d[0], 0, 0, 0, d[1], 0, 0, 0, d[2]]

export const escalar = (m, k) => m.map((v) => v * k)

/** t·a + (1 − t)·b, termo a termo. */
export const misturarM = (a, b, t) => a.map((v, i) => t * v + (1 - t) * b[i])
