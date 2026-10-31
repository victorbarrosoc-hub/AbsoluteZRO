// O movimento da câmera entre dois quadros, a partir dos pares de pontos rastreados (src/estabilizar/rastreio.js):
// uma similaridade (deslocamento, giro e escala) em volta do centro do quadro, por RANSAC com dois pontos e refinada
// por mínimos quadrados nos pontos que concordam (Umeyama, em números complexos: q = a·p + t, a = s·e^{iθ}).

/** Gerador determinístico (o mesmo vídeo dá sempre a mesma análise). */
function acaso(semente = 12345) {
  let s = semente >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** a e t que levam os pontos p aos q (mínimos quadrados), com os índices dados. */
function ajustar(p, q, idx) {
  let pxm = 0
  let pym = 0
  let qxm = 0
  let qym = 0
  for (const i of idx) {
    pxm += p[i][0]
    pym += p[i][1]
    qxm += q[i][0]
    qym += q[i][1]
  }
  const n = idx.length
  pxm /= n
  pym /= n
  qxm /= n
  qym /= n
  let re = 0
  let im = 0
  let den = 0
  for (const i of idx) {
    const ax = p[i][0] - pxm
    const ay = p[i][1] - pym
    const bx = q[i][0] - qxm
    const by = q[i][1] - qym
    // (b) · conj(a)
    re += bx * ax + by * ay
    im += by * ax - bx * ay
    den += ax * ax + ay * ay
  }
  if (den < 1e-9) return null
  const ar = re / den
  const ai = im / den
  return { ar, ai, tx: qxm - (ar * pxm - ai * pym), ty: qym - (ar * pym + ai * pxm) }
}

const erro = (m, p, q) => {
  const x = m.ar * p[0] - m.ai * p[1] + m.tx - q[0]
  const y = m.ai * p[0] + m.ar * p[1] + m.ty - q[1]
  return x * x + y * y
}

/**
 * Similaridade de `de` para `para` (pontos em px, com o centro do quadro em `centro`). Devolve { dx, dy (px), da (rad),
 * ds (ln da escala), inliers } ou null quando não há pontos que concordem (quadro liso, desfocado, corte).
 */
export function similaridade(de, para, centro, { limiar = 1.5, iteracoes = 200, minimo = 6 } = {}) {
  const n = de.length
  if (n < minimo) return null
  const p = de.map(([x, y]) => [x - centro[0], y - centro[1]])
  const q = para.map(([x, y]) => [x - centro[0], y - centro[1]])
  const r = acaso(n * 7919)
  const l2 = limiar * limiar
  let melhor = null
  for (let it = 0; it < iteracoes; it++) {
    const i = Math.floor(r() * n)
    let j = Math.floor(r() * n)
    if (j === i) j = (j + 1) % n
    const m = ajustar(p, q, [i, j])
    if (!m) continue
    const dentro = []
    for (let k = 0; k < n; k++) if (erro(m, p[k], q[k]) <= l2) dentro.push(k)
    if (!melhor || dentro.length > melhor.length) melhor = dentro
  }
  if (!melhor || melhor.length < minimo) return null
  // refina duas vezes (o conjunto que concorda pode crescer com o modelo melhor)
  let idx = melhor
  let m = ajustar(p, q, idx)
  for (let passo = 0; passo < 2 && m; passo++) {
    const novo = []
    for (let k = 0; k < n; k++) if (erro(m, p[k], q[k]) <= l2) novo.push(k)
    if (novo.length < minimo) break
    idx = novo
    m = ajustar(p, q, idx)
  }
  if (!m) return null
  return { dx: m.tx, dy: m.ty, da: Math.atan2(m.ai, m.ar), ds: Math.log(Math.hypot(m.ar, m.ai)), inliers: idx.length }
}
