// Da análise (o movimento da câmera em cada quadro) à correção de cada quadro (sem DOM). O caminho clássico: soma os
// movimentos (a trajetória da câmera), suaviza com uma gaussiana nos dois sentidos (sem atraso) e corrige cada quadro
// pela diferença entre o caminho suave e o real. Depois, o zoom fixo que esconde a borda em todos os quadros; se
// passar do recorte máximo, a correção inteira fica mais fraca (um número só para o clipe, como a "Força" do DaVinci),
// em vez de forçar quadro a quadro.
//
// Unidades: deslocamento em frações da LARGURA do quadro (vale para qualquer resolução), giro em radianos, escala em
// ln. Movimento do quadro k = como o conteúdo andou do quadro k−1 para o k (o primeiro é zero).

/** Gaussiana nos dois sentidos (sem atraso), com as pontas espelhadas. sigma em quadros. */
export function suavizar(v, sigma) {
  const n = v.length
  if (!n || sigma <= 0) return Float64Array.from(v)
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = new Float64Array(2 * r + 1)
  let soma = 0
  for (let i = -r; i <= r; i++) soma += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma))
  for (let i = 0; i < k.length; i++) k[i] /= soma
  // espelho em volta da ponta (2·v0 − v[i]): continua a reta, sem puxar o caminho para dentro na ponta
  const em = (i) => (i < 0 ? 2 * v[0] - v[Math.min(n - 1, -i)] : i >= n ? 2 * v[n - 1] - v[Math.max(0, 2 * n - 2 - i)] : v[i])
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = -r; j <= r; j++) s += k[j + r] * em(i + j)
    out[i] = s
  }
  return out
}

const CAMPOS = ['dx', 'dy', 'da', 'ds']

/** A trajetória (soma dos movimentos) de cada campo. */
export function trajetoria(movs) {
  const t = Object.fromEntries(CAMPOS.map((c) => [c, new Float64Array(movs.length)]))
  for (const c of CAMPOS) {
    let s = 0
    movs.forEach((m, i) => (t[c][i] = s += m?.[c] || 0))
  }
  return t
}

/**
 * Quanto zoom o quadro corrigido precisa para não mostrar borda. Correção: x' = e^{ds}·R(da)·x + (dx, dy), em volta do
 * centro, com x em frações da largura; aspecto = altura ÷ largura.
 */
export function zoomNecessario({ dx, dy, da, ds }, aspecto) {
  const e = Math.exp(-ds)
  const c = Math.cos(-da) * e
  const s = Math.sin(-da) * e
  // M = e^{−ds}·R(−da); um ponto de saída o vem de x = u·M·o − M·t (u = 1/zoom)
  const Btx = c * dx - s * dy
  const Bty = s * dx + c * dy
  let u = 1
  for (const ox of [-0.5, 0.5])
    for (const oy of [-aspecto / 2, aspecto / 2]) {
      const Ax = c * ox - s * oy
      const Ay = s * ox + c * oy
      for (const [A, B, meio] of [
        [Ax, Btx, 0.5],
        [Ay, Bty, aspecto / 2],
      ]) {
        if (A > 1e-12) u = Math.min(u, (meio + B) / A)
        else if (A < -1e-12) u = Math.min(u, (B - meio) / A)
      }
    }
  return u <= 1e-6 ? Infinity : 1 / u
}

/**
 * A correção de cada quadro e o zoom fixo. movs: [{ dx, dy, da, ds }] (null = sem medida, vale zero); fps; suavidade
 * (segundos: quanto o caminho novo demora para seguir a câmera; maior = mais parado); recorteMax (zoom máximo, ex.
 * 1,2 = até 20%); aspecto. Devolve { zoom, forca (0..1), correcoes: [{ dx, dy, da, ds }] }.
 */
export function corrigir(movs, { fps, suavidade = 1, recorteMax = 1.2, aspecto = 9 / 16 } = {}) {
  const t = trajetoria(movs)
  const sigma = Math.max(1, suavidade * fps)
  const delta = Object.fromEntries(CAMPOS.map((c) => [c, suavizar(t[c], sigma).map((v, i) => v - t[c][i])]))
  const n = movs.length
  const zoomCom = (k) => {
    let z = 1
    for (let i = 0; i < n; i++) z = Math.max(z, zoomNecessario({ dx: k * delta.dx[i], dy: k * delta.dy[i], da: k * delta.da[i], ds: k * delta.ds[i] }, aspecto))
    return z
  }
  let forca = 1
  let zoom = zoomCom(1)
  if (zoom > recorteMax) {
    // a correção mais forte que cabe no recorte máximo (o zoom cresce com a força)
    let a = 0
    let b = 1
    for (let i = 0; i < 24; i++) {
      const m = (a + b) / 2
      if (zoomCom(m) <= recorteMax) a = m
      else b = m
    }
    forca = a
    zoom = zoomCom(a)
  }
  const correcoes = Array.from({ length: n }, (_, i) => ({ dx: forca * delta.dx[i], dy: forca * delta.dy[i], da: forca * delta.da[i], ds: forca * delta.ds[i] }))
  return { zoom, forca, correcoes }
}

/**
 * Tremor (RMS do que sobra do movimento depois de tirar o movimento lento, σ = 0,5 s), em px de um quadro de 1920 de
 * largura, antes e depois da correção. É a medida do que a estabilização tirou (docs/validation.md).
 */
export function tremor(movs, fps, correcoes = null) {
  const n = movs.length
  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    dx[i] = movs[i]?.dx || 0
    dy[i] = movs[i]?.dy || 0
    if (correcoes && i > 0) {
      dx[i] += correcoes[i].dx - correcoes[i - 1].dx
      dy[i] += correcoes[i].dy - correcoes[i - 1].dy
    }
  }
  const lx = suavizar(dx, 0.5 * fps)
  const ly = suavizar(dy, 0.5 * fps)
  let s = 0
  for (let i = 1; i < n; i++) s += (dx[i] - lx[i]) ** 2 + (dy[i] - ly[i]) ** 2
  return Math.sqrt(s / Math.max(1, n - 1)) * 1920
}
