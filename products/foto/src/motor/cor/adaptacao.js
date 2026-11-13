// Adaptação cromática de von Kries: XYZ visto sob um branco → XYZ equivalente sob outro. As duas matrizes de cones:
//   Bradford   Lam (1985), a do ICC e da especificação DNG (perfil de câmera → D50)
//   CAT16      Li, Li, Wang, Zu, Luo, Cui, Melgosa, Brill, Pointer (2017), "Comprehensive color solutions: CAM16,
//              CAT16, and CAM16-UCS", Color Research & Application 42(6) — a do controle de branco do motor
// Adaptação completa (D = 1): o branco de origem vira exatamente o branco de destino.

import { diagonal, inversa, mulM, mulV } from './matriz.js'

export const BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296]
export const CAT16 = [0.401288, 0.650173, -0.051461, -0.250268, 1.204414, 0.045854, -0.002079, 0.048952, 0.953127]

const CONES = { bradford: BRADFORD, cat16: CAT16 }

/** Matriz 3×3 que leva XYZ sob `brancoDe` a XYZ sob `brancoPara` (brancos em XYZ, Y = 1). */
export function matrizAdaptacao(brancoDe, brancoPara, metodo = 'cat16') {
  const M = CONES[metodo]
  if (!M) throw new Error(`Adaptação desconhecida: ${metodo}`)
  const a = mulV(M, brancoDe)
  const b = mulV(M, brancoPara)
  return mulM(inversa(M), mulM(diagonal([b[0] / a[0], b[1] / a[1], b[2] / a[2]]), M))
}
