// Fluxo óptico para câmera lenta (sem DOM): a conta em volta do modelo. O modelo (RIFE 4.25, Practical-RIFE, MIT, hzwer;
// exportado "em campos": fluxo + máscara, app/fluxo-worker.js) estima o movimento entre os quadros A e B numa resolução
// menor (lado maior 640, múltiplo de 64); aqui o quadro novo é montado em RESOLUÇÃO CHEIA a partir dos quadros reais:
// cada pixel busca A e B no lugar para onde o movimento aponta (warp) e a máscara do modelo diz quanto vem de cada um
// (quem aparece só num dos lados, na oclusão). Assim o detalhe é o da câmera, não o de uma imagem reduzida.
//
// Contra artefato: onde A e B deslocados discordam muito (o movimento não foi entendido), o pixel vira a mistura dos
// dois; se isso pega uma parte grande do quadro, o quadro inteiro vira mistura (e a contagem diz). Corte de cena e
// quadro exato da câmera nem chegam aqui (app/render.js).

/** Lado maior do quadro em que o movimento é estimado, e o múltiplo que o RIFE 4.25 pede. */
export const LADO = 640
export const MULTIPLO = 64

/** Tamanho do modelo para um quadro w × h: { mw, mh (o quadro reduzido), pw, ph (com a borda até o múltiplo) }. */
export function tamanhoDoModelo(w, h, lado = LADO) {
  const e = Math.min(1, lado / Math.max(w, h))
  const mw = Math.max(MULTIPLO, Math.round(w * e))
  const mh = Math.max(MULTIPLO, Math.round(h * e))
  const pw = Math.ceil(mw / MULTIPLO) * MULTIPLO
  const ph = Math.ceil(mh / MULTIPLO) * MULTIPLO
  return { mw, mh, pw, ph }
}

/** RGBA (w × h) → tensor RGB 0..1 [3, ph, pw] reduzido para mw × mh (média de caixa), borda repetida até ph × pw. */
export function paraTensor(rgba, w, h, { mw, mh, pw, ph }) {
  const out = new Float32Array(3 * pw * ph)
  const sx = w / mw
  const sy = h / mh
  for (let y = 0; y < ph; y++) {
    const yy = Math.min(mh - 1, y)
    const y0 = Math.floor(yy * sy)
    const y1 = Math.max(y0 + 1, Math.min(h, Math.floor((yy + 1) * sy)))
    for (let x = 0; x < pw; x++) {
      const xx = Math.min(mw - 1, x)
      const x0 = Math.floor(xx * sx)
      const x1 = Math.max(x0 + 1, Math.min(w, Math.floor((xx + 1) * sx)))
      let r = 0
      let g = 0
      let b = 0
      for (let v = y0; v < y1; v++)
        for (let u = x0; u < x1; u++) {
          const i = (v * w + u) * 4
          r += rgba[i]
          g += rgba[i + 1]
          b += rgba[i + 2]
        }
      const n = (y1 - y0) * (x1 - x0) * 255
      const o = y * pw + x
      out[o] = r / n
      out[pw * ph + o] = g / n
      out[2 * pw * ph + o] = b / n
    }
  }
  return out
}

/** Amostra bilinear de um canal de um campo [ph × pw] na posição (x, y) do campo. */
function campo(c, pw, ph, x, y) {
  if (x < 0) x = 0
  else if (x > pw - 1.001) x = pw - 1.001
  if (y < 0) y = 0
  else if (y > ph - 1.001) y = ph - 1.001
  const x0 = x | 0
  const y0 = y | 0
  const ax = x - x0
  const ay = y - y0
  const i = y0 * pw + x0
  return (c[i] * (1 - ax) + c[i + 1] * ax) * (1 - ay) + (c[i + pw] * (1 - ax) + c[i + pw + 1] * ax) * ay
}

/**
 * O quadro novo em resolução cheia. a, b: RGBA w × h; fluxo: Float32Array [4, ph, pw] (dx0, dy0, dx1, dy1 em px do
 * modelo: onde buscar em A e em B); mascara: [ph, pw] (0..1, quanto vem de A); f: a fração entre A e B (só para a
 * mistura de segurança). Devolve { rgba, confianca (0..1: fração do quadro em que A e B deslocados concordam), mistura
 * (o quadro inteiro virou mistura) }.
 */
export function montarQuadro(a, b, w, h, fluxo, mascara, tam, f, { limite = 36, maximoRuim = 0.2 } = {}) {
  const { mw, mh, pw, ph } = tam
  const N = pw * ph
  const fx0 = fluxo.subarray(0, N)
  const fy0 = fluxo.subarray(N, 2 * N)
  const fx1 = fluxo.subarray(2 * N, 3 * N)
  const fy1 = fluxo.subarray(3 * N, 4 * N)
  // px do quadro cheio por px do modelo
  const ex = w / mw
  const ey = h / mh
  const out = new Uint8ClampedArray(w * h * 4)
  let ruins = 0
  const amostra = (img, x, y, k) => {
    if (x < 0) x = 0
    else if (x > w - 1.001) x = w - 1.001
    if (y < 0) y = 0
    else if (y > h - 1.001) y = h - 1.001
    const x0 = x | 0
    const y0 = y | 0
    const ax = x - x0
    const ay = y - y0
    const i = (y0 * w + x0) * 4 + k
    return (img[i] * (1 - ax) + img[i + 4] * ax) * (1 - ay) + (img[i + w * 4] * (1 - ax) + img[i + w * 4 + 4] * ax) * ay
  }
  for (let y = 0; y < h; y++) {
    const my = (y + 0.5) / ey - 0.5
    for (let x = 0; x < w; x++) {
      const mx = (x + 0.5) / ex - 0.5
      const x0 = x + campo(fx0, pw, ph, mx, my) * ex
      const y0 = y + campo(fy0, pw, ph, mx, my) * ey
      const x1 = x + campo(fx1, pw, ph, mx, my) * ex
      const y1 = y + campo(fy1, pw, ph, mx, my) * ey
      const m = Math.min(1, Math.max(0, campo(mascara, pw, ph, mx, my)))
      const o = (y * w + x) * 4
      const r0 = amostra(a, x0, y0, 0)
      const g0 = amostra(a, x0, y0, 1)
      const b0 = amostra(a, x0, y0, 2)
      const r1 = amostra(b, x1, y1, 0)
      const g1 = amostra(b, x1, y1, 1)
      const b1 = amostra(b, x1, y1, 2)
      // discordância entre A e B deslocados, pesada onde os dois contam (na oclusão só um conta: não é erro)
      const e = (Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1)) / 3
      const peso = 4 * m * (1 - m)
      const c = Math.max(0, Math.min(1, 1 - (e * peso - limite / 2) / (limite / 2)))
      if (c < 0.5) ruins++
      const ir = r0 * m + r1 * (1 - m)
      const ig = g0 * m + g1 * (1 - m)
      const ib = b0 * m + b1 * (1 - m)
      // onde não confia: a mistura simples dos dois quadros reais (macia, sem rasgar)
      out[o] = c * ir + (1 - c) * (a[o] * (1 - f) + b[o] * f)
      out[o + 1] = c * ig + (1 - c) * (a[o + 1] * (1 - f) + b[o + 1] * f)
      out[o + 2] = c * ib + (1 - c) * (a[o + 2] * (1 - f) + b[o + 2] * f)
      out[o + 3] = 255
    }
  }
  const confianca = 1 - ruins / (w * h)
  if (1 - confianca > maximoRuim) {
    for (let i = 0; i < out.length; i += 4) {
      out[i] = a[i] * (1 - f) + b[i] * f
      out[i + 1] = a[i + 1] * (1 - f) + b[i + 1] * f
      out[i + 2] = a[i + 2] * (1 - f) + b[i + 2] * f
    }
    return { rgba: out, confianca, mistura: true }
  }
  return { rgba: out, confianca, mistura: false }
}
