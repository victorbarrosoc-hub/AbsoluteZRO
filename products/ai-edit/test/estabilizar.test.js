// Estabilização por imagem (src/estabilizar), com tremor de valor conhecido: uma textura que a "câmera" percorre com uma
// panorâmica lenta e um tremor aleatório (deslocamento, giro e escala) em cada quadro. A análise tem de medir o
// movimento de verdade, e a correção tem de tirar o tremor, guardar a panorâmica e não mostrar borda.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Analisador, correcoesDoTrecho } from '../src/estabilizar/index.js'
import { corrigir, suavizar, tremor, zoomNecessario } from '../src/estabilizar/trajetoria.js'
import { similaridade } from '../src/estabilizar/movimento.js'

const W = 320
const H = 180
const acaso = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)

// ruído de valor em três escalas (cantos por todo lado, como uma cena de verdade)
const r = acaso(42)
const G = 64
const grades = [8, 20, 48].map(() => Float32Array.from({ length: G * G }, () => r()))
function mundo(x, y) {
  let v = 0
  ;[8, 20, 48].forEach((passo, k) => {
    const gx = x / passo + 20
    const gy = y / passo + 20
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0
    const a = (i, j) => grades[k][(((j % G) + G) % G) * G + (((i % G) + G) % G)]
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    v += ((a(x0, y0) * (1 - sx) + a(x0 + 1, y0) * sx) * (1 - sy) + (a(x0, y0 + 1) * (1 - sx) + a(x0 + 1, y0 + 1) * sx) * sy) * [110, 80, 50][k]
  })
  return v
}

/** O quadro que a câmera vê com (tx, ty, θ, s): tela x = s·R(θ)·mundo + t (em volta do centro). */
function quadro({ tx, ty, th, s }) {
  const d = new Float32Array(W * H)
  const c = Math.cos(-th) / s
  const n = Math.sin(-th) / s
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const px = x - W / 2 - tx
      const py = y - H / 2 - ty
      d[y * W + x] = mundo(c * px - n * py, n * px + c * py)
    }
  return { w: W, h: H, d }
}

function camera(n, { tremorPx = 6, giro = 0.012, zoom = 0.008 } = {}) {
  const r = acaso(7)
  return Array.from({ length: n }, (_, k) => ({ tx: -1.2 * k + (r() - 0.5) * 2 * tremorPx, ty: 0.4 * k + (r() - 0.5) * 2 * tremorPx, th: (r() - 0.5) * 2 * giro, s: Math.exp((r() - 0.5) * 2 * zoom) }))
}

// movimento verdadeiro do quadro k−1 para o k (o mesmo modelo q = a·p + t que a análise mede)
function verdade(cam, k) {
  const A = cam[k]
  const B = cam[k - 1]
  const ar = (A.s / B.s) * Math.cos(A.th - B.th)
  const ai = (A.s / B.s) * Math.sin(A.th - B.th)
  return { dx: A.tx - (ar * B.tx - ai * B.ty), dy: A.ty - (ai * B.tx + ar * B.ty), da: A.th - B.th, ds: Math.log(A.s / B.s) }
}

test('similaridade: RANSAC acha o movimento mesmo com pontos errados no meio', () => {
  const r = acaso(3)
  const a = 1.02
  const th = 0.03
  const de = Array.from({ length: 80 }, () => [r() * 300, r() * 160])
  const para = de.map(([x, y], i) => {
    if (i % 5 === 0) return [r() * 300, r() * 160] // 20% de lixo
    const px = x - 150
    const py = y - 80
    return [a * (Math.cos(th) * px - Math.sin(th) * py) + 5 + 150, a * (Math.sin(th) * px + Math.cos(th) * py) - 3 + 80]
  })
  const m = similaridade(de, para, [150, 80])
  assert.ok(Math.abs(m.dx - 5) < 1e-6 && Math.abs(m.dy + 3) < 1e-6)
  assert.ok(Math.abs(m.da - th) < 1e-9 && Math.abs(m.ds - Math.log(a)) < 1e-9)
  assert.ok(m.inliers >= 64)
})

test('análise: mede o movimento de verdade quadro a quadro (erro abaixo de 0,15 px)', () => {
  const cam = camera(14)
  const an = new Analisador()
  const movs = cam.map((c) => an.adicionar(quadro(c)))
  let pior = 0
  for (let k = 1; k < cam.length; k++) {
    const v = verdade(cam, k)
    const m = movs[k]
    assert.ok(m, `quadro ${k} medido`)
    // erro no canto do quadro (deslocamento + o que giro e escala causam lá)
    const erro = Math.hypot(m.dx * W - v.dx, m.dy * W - v.dy) + Math.hypot(W / 2, H / 2) * (Math.abs(m.da - v.da) + Math.abs(m.ds - v.ds))
    pior = Math.max(pior, erro)
  }
  assert.ok(pior < 0.15, `pior erro ${pior.toFixed(3)} px`)
})

test('correção: tira o tremor (mais de 90%), guarda a panorâmica e o zoom esconde toda borda', () => {
  const fps = 30
  const cam = camera(150)
  const movs = cam.map((_, k) => (k === 0 ? null : (({ dx, dy, da, ds }) => ({ dx: dx / W, dy: dy / W, da, ds }))(verdade(cam, k))))
  const { zoom, forca, correcoes } = corrigir(movs, { fps, suavidade: 1, recorteMax: 1.3, aspecto: H / W })
  const antes = tremor(movs, fps)
  const depois = tremor(movs, fps, correcoes)
  assert.ok(depois < antes * 0.1, `tremor ${antes.toFixed(2)} → ${depois.toFixed(2)} px`)
  assert.equal(forca, 1)
  assert.ok(zoom > 1 && zoom <= 1.3)
  for (const c of correcoes) assert.ok(zoomNecessario(c, H / W) <= zoom + 1e-9, 'nenhum quadro mostra borda')
  // a panorâmica (1,2 px por quadro) continua: a correção não puxa a câmera de volta ao começo
  const meio = correcoes.slice(40, 110)
  assert.ok(Math.max(...meio.map((c) => Math.abs(c.dx * W))) < 20, 'correção pequena no meio: a panorâmica fica')
})

test('recorte máximo: com tremor forte, a correção fica mais fraca e o zoom não passa do limite', () => {
  const fps = 30
  const cam = camera(90, { tremorPx: 30 })
  const movs = cam.map((_, k) => (k === 0 ? null : (({ dx, dy, da, ds }) => ({ dx: dx / W, dy: dy / W, da, ds }))(verdade(cam, k))))
  const { zoom, forca } = corrigir(movs, { fps, suavidade: 1, recorteMax: 1.1, aspecto: H / W })
  assert.ok(forca < 1 && forca > 0)
  assert.ok(zoom <= 1.1 + 1e-6)
  assert.ok(tremor(movs, fps, corrigir(movs, { fps, recorteMax: 1.1, aspecto: H / W }).correcoes) < tremor(movs, fps))
})

test('trecho de um clipe: só os quadros dele, a partir da análise guardada (4 números por quadro)', () => {
  const fps = 30
  const cam = camera(60)
  const mov = new Float32Array(4 * 60)
  for (let k = 1; k < 60; k++) {
    const v = verdade(cam, k)
    mov.set([v.dx / W, v.dy / W, v.da, v.ds], 4 * k)
  }
  const r = correcoesDoTrecho({ n: 60, fps, mov }, 10, 40, { suavidade: 0.5, recorte: 1.25 }, H / W)
  assert.equal(r.ini, 10)
  assert.equal(r.correcoes.length, 30)
  // suavizar nas pontas espelha (continua a reta): uma reta passa igual
  const reta = Float64Array.from({ length: 50 }, (_, i) => 3 * i + 1)
  assert.ok(suavizar(reta, 6).every((v, i) => Math.abs(v - reta[i]) < 1e-9))
})
