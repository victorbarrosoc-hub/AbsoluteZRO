// Rastreio de pontos entre dois quadros (sem DOM): pirâmide de imagens, cantos de Shi-Tomasi espalhados por uma grade e
// Lucas-Kanade piramidal (Bouguet) com conferência de ida e volta. É o primeiro passo da estabilização por imagem
// (src/estabilizar/index.js): os pontos que andaram dizem quanto a câmera andou. Algoritmos clássicos e públicos
// (Lucas-Kanade 1981, Shi-Tomasi 1994, Bouguet 2001), escritos aqui; nada copiado de código GPL.
//
// Imagem: { w, h, d: Float32Array } em tons de cinza (0–255).

/** Cinza a partir de RGBA (o getImageData do canvas). */
export function cinza(rgba, w, h) {
  const d = new Float32Array(w * h)
  for (let i = 0, j = 0; i < d.length; i++, j += 4) d[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]
  return { w, h, d }
}

/** Meia resolução com o filtro binomial [1 4 6 4 1]/16 (separável). */
export function reduzir(img) {
  const { w, h, d } = img
  const W = Math.max(1, w >> 1)
  const H = Math.max(1, h >> 1)
  const tmp = new Float32Array(W * h)
  const k = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16]
  const cx = (x) => (x < 0 ? -x : x >= w ? 2 * w - 2 - x : x)
  const cy = (y) => (y < 0 ? -y : y >= h ? 2 * h - 2 - y : y)
  for (let y = 0; y < h; y++)
    for (let X = 0; X < W; X++) {
      let s = 0
      for (let t = -2; t <= 2; t++) s += k[t + 2] * d[y * w + cx(2 * X + t)]
      tmp[y * W + X] = s
    }
  const out = new Float32Array(W * H)
  for (let Y = 0; Y < H; Y++)
    for (let X = 0; X < W; X++) {
      let s = 0
      for (let t = -2; t <= 2; t++) s += k[t + 2] * tmp[cy(2 * Y + t) * W + X]
      out[Y * W + X] = s
    }
  return { w: W, h: H, d: out }
}

/** Pirâmide: [nível 0 (a imagem), nível 1 (metade), ...]. */
export function piramide(img, niveis = 3) {
  const p = [img]
  for (let i = 1; i < niveis && p[i - 1].w > 24 && p[i - 1].h > 24; i++) p.push(reduzir(p[i - 1]))
  return p
}

/** Gradientes horizontais e verticais (diferença central). */
function gradientes({ w, h, d }) {
  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      gx[i] = (d[i + 1] - d[i - 1]) / 2
      gy[i] = (d[i + w] - d[i - w]) / 2
    }
  return { gx, gy }
}

const bil = (d, w, h, x, y) => {
  if (x < 0) x = 0
  else if (x > w - 1.001) x = w - 1.001
  if (y < 0) y = 0
  else if (y > h - 1.001) y = h - 1.001
  const x0 = x | 0
  const y0 = y | 0
  const fx = x - x0
  const fy = y - y0
  const i = y0 * w + x0
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + w] * (1 - fx) + d[i + w + 1] * fx) * fy
}

/**
 * Cantos bons para rastrear (menor autovalor do tensor de estrutura), espalhados: os melhores de cada célula de uma grade
 * gx × gy, longe da borda. Devolve [[x, y], ...].
 */
export function cantos(img, { gx = 8, gy = 6, porCelula = 3, margem = 12, raio = 2, distancia = 8 } = {}) {
  const { w, h } = img
  const { gx: Ix, gy: Iy } = gradientes(img)
  const forca = new Float32Array(w * h)
  let maximo = 0
  for (let y = margem; y < h - margem; y++)
    for (let x = margem; x < w - margem; x++) {
      let a = 0
      let b = 0
      let c = 0
      for (let v = -raio; v <= raio; v++)
        for (let u = -raio; u <= raio; u++) {
          const i = (y + v) * w + x + u
          a += Ix[i] * Ix[i]
          b += Ix[i] * Iy[i]
          c += Iy[i] * Iy[i]
        }
      const l = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b)
      forca[y * w + x] = l
      if (l > maximo) maximo = l
    }
  const minimo = maximo * 0.01
  const pts = []
  const cw = (w - 2 * margem) / gx
  const ch = (h - 2 * margem) / gy
  for (let j = 0; j < gy; j++)
    for (let i = 0; i < gx; i++) {
      const x0 = Math.floor(margem + i * cw)
      const y0 = Math.floor(margem + j * ch)
      const cand = []
      for (let y = y0; y < Math.min(h - margem, y0 + ch); y++)
        for (let x = x0; x < Math.min(w - margem, x0 + cw); x++) if (forca[y * w + x] > minimo) cand.push([forca[y * w + x], x, y])
      cand.sort((p, q) => q[0] - p[0])
      const escolhidos = []
      for (const [, x, y] of cand) {
        if (escolhidos.every(([a, b]) => (a - x) ** 2 + (b - y) ** 2 >= distancia * distancia)) escolhidos.push([x, y])
        if (escolhidos.length >= porCelula) break
      }
      pts.push(...escolhidos)
    }
  return pts
}

/** Um nível do Lucas-Kanade: o deslocamento d (a partir do palpite g) de p entre a e b. null = não dá para rastrear. */
function lkNivel(a, ga, b, px, py, g, raio, iteracoes) {
  const { w, h } = a
  let G11 = 0
  let G12 = 0
  let G22 = 0
  const n = (2 * raio + 1) ** 2
  const ia = new Float32Array(n)
  const ix = new Float32Array(n)
  const iy = new Float32Array(n)
  let k = 0
  for (let v = -raio; v <= raio; v++)
    for (let u = -raio; u <= raio; u++, k++) {
      const x = px + u
      const y = py + v
      ia[k] = bil(a.d, w, h, x, y)
      ix[k] = bil(ga.gx, w, h, x, y)
      iy[k] = bil(ga.gy, w, h, x, y)
      G11 += ix[k] * ix[k]
      G12 += ix[k] * iy[k]
      G22 += iy[k] * iy[k]
    }
  const det = G11 * G22 - G12 * G12
  const lmin = (G11 + G22) / 2 - Math.sqrt(((G11 - G22) / 2) ** 2 + G12 * G12)
  if (det < 1e-6 || lmin / n < 1e-3) return null
  let vx = 0
  let vy = 0
  for (let it = 0; it < iteracoes; it++) {
    let b1 = 0
    let b2 = 0
    k = 0
    for (let v = -raio; v <= raio; v++)
      for (let u = -raio; u <= raio; u++, k++) {
        const dI = ia[k] - bil(b.d, w, h, px + g[0] + vx + u, py + g[1] + vy + v)
        b1 += dI * ix[k]
        b2 += dI * iy[k]
      }
    const ex = (G22 * b1 - G12 * b2) / det
    const ey = (G11 * b2 - G12 * b1) / det
    vx += ex
    vy += ey
    if (ex * ex + ey * ey < 1e-4) break
  }
  return [g[0] + vx, g[1] + vy]
}

/** Lucas-Kanade piramidal: onde cada ponto de pa (pirâmide do quadro a) está em pb. null para o que se perdeu. */
export function lk(pa, pb, pontos, { raio = 7, iteracoes = 12, grads = null } = {}) {
  const gs = grads || pa.map(gradientes)
  return pontos.map(([x, y]) => {
    let g = [0, 0]
    for (let L = pa.length - 1; L >= 0; L--) {
      const e = 2 ** L
      const d = lkNivel(pa[L], gs[L], pb[L], x / e, y / e, g, raio, iteracoes)
      if (!d) return null
      g = L > 0 ? [2 * d[0], 2 * d[1]] : d
    }
    const nx = x + g[0]
    const ny = y + g[1]
    return nx < 0 || ny < 0 || nx > pa[0].w - 1 || ny > pa[0].h - 1 ? null : [nx, ny]
  })
}

/** Gradientes de cada nível (para reaproveitar quando o mesmo quadro é a origem de novo). */
export const gradientesDa = (p) => p.map(gradientes)

/**
 * Pares confiáveis entre os quadros a e b: rastreia de a para b e volta de b para a; fica só o que voltou a menos de
 * `volta` px de onde saiu. Devolve { de: [[x,y]...], para: [[x,y]...] }.
 */
export function pares(pa, pb, pontos, { volta = 0.7, grads = null, gradsB = null } = {}) {
  const ida = lk(pa, pb, pontos, { grads })
  const vivos = []
  for (let i = 0; i < pontos.length; i++) if (ida[i]) vivos.push(i)
  const voltaPts = lk(
    pb,
    pa,
    vivos.map((i) => ida[i]),
    { grads: gradsB },
  )
  const de = []
  const para = []
  vivos.forEach((i, k) => {
    const r = voltaPts[k]
    if (r && (r[0] - pontos[i][0]) ** 2 + (r[1] - pontos[i][1]) ** 2 <= volta * volta) {
      de.push(pontos[i])
      para.push(ida[i])
    }
  })
  return { de, para }
}
