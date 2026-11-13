// Rosto em evento · qualidade da selfie e a pose pelos 5 pontos. Puro. Portões medidos na pesquisa
// (docs/estudo/rosto-em-evento.md, C.10, C.11 e D.3): nitidez (variância do Laplaciano da luma no centro 72 × 72 do
// recorte alinhado) ≥ 15; luz média de 35 a 200; distância entre os olhos ≥ 40 px no quadro de 640 (≥ 20 no de 320,
// que é o que a página do visitante analisa); rolagem < 15°; um rosto só.

export const PORTOES = Object.freeze({ nitidez: 15, luzMin: 35, luzMax: 200, olhos640: 40, rolagem: 15, frente: 0.15, giroMin: 0.12, giroMax: 0.45 })

/** Nitidez e luz do recorte alinhado de 112 (RGBA). */
export function nitidez({ dados }, lado = 112) {
  const L = new Float32Array(lado * lado)
  for (let i = 0; i < L.length; i++) L[i] = 0.2126 * dados[i * 4] + 0.7152 * dados[i * 4 + 1] + 0.0722 * dados[i * 4 + 2]
  const a = Math.round(lado * (20 / 112))
  const b = lado - a
  let s = 0
  let s2 = 0
  let n = 0
  let luz = 0
  for (let y = a; y < b; y++) {
    for (let x = a; x < b; x++) {
      const i = y * lado + x
      const v = L[i - 1] + L[i + 1] + L[i - lado] + L[i + lado] - 4 * L[i]
      s += v
      s2 += v * v
      luz += L[i]
      n++
    }
  }
  return { vol: s2 / n - (s / n) ** 2, luz: luz / n }
}

/**
 * Pose aproximada: guinada = deslocamento do nariz em relação ao meio dos olhos, ao longo da linha dos olhos, sobre a
 * distância entre os olhos (0 = de frente; o sinal diz o lado); rolagem em graus; dio = distância entre os olhos.
 */
export function pose(pontos) {
  const [od, oe, nz, bd, be] = pontos
  const dio = Math.hypot(oe[0] - od[0], oe[1] - od[1]) || 1
  const mx = (od[0] + oe[0]) / 2
  const my = (od[1] + oe[1]) / 2
  const ux = (oe[0] - od[0]) / dio
  const uy = (oe[1] - od[1]) / dio
  const guinada = ((nz[0] - mx) * ux + (nz[1] - my) * uy) / dio
  const bmx = (bd[0] + be[0]) / 2
  const bmy = (bd[1] + be[1]) / 2
  const face = Math.hypot(bmx - mx, bmy - my) || 1
  const arfagem = (-(nz[0] - mx) * uy + (nz[1] - my) * ux) / face
  return { guinada, arfagem, rolagem: (Math.atan2(oe[1] - od[1], oe[0] - od[0]) * 180) / Math.PI, dio }
}

/**
 * Um quadro da câmera serve? `rostos`: as detecções no quadro ({ pontos, nota, largura }); `ladoDoQuadro`: o lado
 * maior em que o detector viu o quadro; `recorte`: o recorte alinhado do rosto (para nitidez e luz), se houver.
 * Devolve { ok, dica, pose, medidas } com a dica mais útil primeiro:
 *   'sem-rosto' | 'um-rosto' | 'perto' | 'reto' | 'luz' | 'forte' | 'firme' | null
 */
export function avaliarQuadro({ rostos, ladoDoQuadro, recorte = null }) {
  if (!rostos?.length) return { ok: false, dica: 'sem-rosto' }
  const bons = rostos.filter((r) => r.nota >= 0.75)
  if (bons.length > 1) return { ok: false, dica: 'um-rosto' }
  const r = bons[0] ?? rostos[0]
  const p = pose(r.pontos)
  const minimo = (PORTOES.olhos640 * ladoDoQuadro) / 640
  if (p.dio < minimo) return { ok: false, dica: 'perto', pose: p }
  if (Math.abs(p.rolagem) >= PORTOES.rolagem) return { ok: false, dica: 'reto', pose: p }
  if (!recorte) return { ok: true, dica: null, pose: p }
  const m = nitidez(recorte)
  if (m.luz < PORTOES.luzMin) return { ok: false, dica: 'luz', pose: p, medidas: m }
  if (m.luz > PORTOES.luzMax) return { ok: false, dica: 'forte', pose: p, medidas: m }
  if (m.vol < PORTOES.nitidez) return { ok: false, dica: 'firme', pose: p, medidas: m }
  return { ok: true, dica: null, pose: p, medidas: m }
}

/** As dicas em português, curtas (a página do visitante mostra uma por vez). */
export const DICAS = Object.freeze({
  'sem-rosto': 'Mostre o rosto no oval',
  'um-rosto': 'Só você no quadro',
  perto: 'Chegue mais perto',
  reto: 'Deixe o celular reto',
  luz: 'Procure mais luz',
  forte: 'Luz forte demais',
  firme: 'Segure firme',
  frente: 'Olhe para a câmera',
  virar: 'Vire um pouco o rosto',
  outro: 'Agora para o outro lado',
})
