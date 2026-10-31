// Fluxo óptico (src/fluxo.js), sem o modelo: o tamanho em que o movimento é estimado, a entrada reduzida e o quadro
// novo montado em resolução cheia. Com o movimento certo, o quadro do meio sai igual ao de verdade; com um movimento
// absurdo, a confiança cai e o quadro vira a mistura dos dois (nada de rasgo). O modelo de verdade roda no teste de tela
// "fluxo óptico" (test/tela.test.js) e a medida com footage real está em docs/validation.md.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LADO, MULTIPLO, montarQuadro, paraTensor, tamanhoDoModelo } from '../src/fluxo.js'
import { MODELO_FLUXO } from '../src/modelos.js'

test('tamanho do modelo: lado maior 640, múltiplo de 64, sem aumentar quadro pequeno', () => {
  assert.deepEqual(tamanhoDoModelo(1920, 1080), { mw: 640, mh: 360, pw: 640, ph: 384 })
  assert.deepEqual(tamanhoDoModelo(1080, 1920), { mw: 360, mh: 640, pw: 384, ph: 640 })
  assert.deepEqual(tamanhoDoModelo(320, 240), { mw: 320, mh: 240, pw: 320, ph: 256 })
  for (const [w, h] of [[3840, 2160], [1280, 720], [1080, 1350]]) {
    const t = tamanhoDoModelo(w, h)
    assert.equal(Math.max(t.mw, t.mh), LADO)
    assert.equal(t.pw % MULTIPLO, 0)
    assert.equal(t.ph % MULTIPLO, 0)
  }
  // o modelo é fixo: commit, hash e licença (vendor/LICENSE-rife.txt)
  assert.match(MODELO_FLUXO.caminho, /^glowskeleton\/goblin-models\/resolve\/[0-9a-f]{40}\/rife\/interp_model\.onnx$/)
  assert.match(MODELO_FLUXO.sha256, /^[0-9a-f]{64}$/)
})

// uma textura lisa (o que o fluxo entende), deslocada de (sx, sy) px
const W = 256
const H = 144
function textura(sx, sy) {
  const d = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = x - sx
      const v = y - sy
      const i = (y * W + x) * 4
      d[i] = 128 + 80 * Math.sin(u / 9) * Math.cos(v / 13)
      d[i + 1] = 128 + 70 * Math.sin((u + v) / 17)
      d[i + 2] = 128 + 60 * Math.cos(u / 21 - v / 11)
      d[i + 3] = 255
    }
  return d
}
const psnr = (a, b) => {
  let se = 0
  let n = 0
  // longe da borda (o que entrou pela borda não existe em nenhum dos dois quadros)
  for (let y = 12; y < H - 12; y++)
    for (let x = 12; x < W - 12; x++)
      for (let c = 0; c < 3; c++) {
        const e = a[(y * W + x) * 4 + c] - b[(y * W + x) * 4 + c]
        se += e * e
        n++
      }
  return 10 * Math.log10((255 * 255) / (se / n))
}

test('quadro novo: com o movimento certo (a meio caminho de 8 px, 4 px), sai o quadro do meio de verdade', () => {
  const a = textura(0, 0)
  const b = textura(8, 4)
  const verdade = textura(4, 2)
  const tam = tamanhoDoModelo(W, H, 128)
  const N = tam.pw * tam.ph
  const ex = W / tam.mw
  // o modelo diria: para o quadro do meio, busque em A 4 px para trás e em B 4 px para frente (em px do modelo)
  const fluxo = new Float32Array(4 * N)
  fluxo.fill(-4 / ex, 0, N)
  fluxo.fill(-2 / ex, N, 2 * N)
  fluxo.fill(4 / ex, 2 * N, 3 * N)
  fluxo.fill(2 / ex, 3 * N, 4 * N)
  const mascara = new Float32Array(N).fill(0.5)
  const r = montarQuadro(a, b, W, H, fluxo, mascara, tam, 0.5)
  assert.equal(r.mistura, false)
  assert.ok(r.confianca > 0.99, `confiança ${r.confianca}`)
  const mistura = a.map((v, i) => (v + b[i]) / 2)
  const pFluxo = psnr(r.rgba, verdade)
  const pMistura = psnr(mistura, verdade)
  assert.ok(pFluxo > 38, `fluxo ${pFluxo.toFixed(1)} dB`)
  assert.ok(pFluxo > pMistura + 8, `fluxo ${pFluxo.toFixed(1)} dB × mistura ${pMistura.toFixed(1)} dB`)
})

test('movimento absurdo: A e B deslocados discordam, a confiança cai e o quadro vira a mistura (sem rasgar)', () => {
  const a = textura(0, 0)
  const b = textura(8, 4)
  const tam = tamanhoDoModelo(W, H, 128)
  const N = tam.pw * tam.ph
  const fluxo = new Float32Array(4 * N)
  let s = 7
  for (let i = 0; i < fluxo.length; i++) fluxo[i] = (((s = (s * 9301 + 49297) % 233280) / 233280) - 0.5) * 60
  const r = montarQuadro(a, b, W, H, fluxo, new Float32Array(N).fill(0.5), tam, 0.5)
  assert.equal(r.mistura, true)
  assert.ok(r.confianca < 0.8)
  for (let i = 0; i < r.rgba.length; i += 4) assert.ok(Math.abs(r.rgba[i] - (a[i] + b[i]) / 2) <= 1)
})

test('entrada do modelo: RGB 0..1 reduzido por média e borda repetida até o múltiplo', () => {
  const a = textura(0, 0)
  const tam = tamanhoDoModelo(W, H, 128)
  const t = paraTensor(a, W, H, tam)
  assert.equal(t.length, 3 * tam.pw * tam.ph)
  assert.ok(t.every((v) => v >= 0 && v <= 1))
  // a última linha válida se repete na borda de baixo
  const linha = (y) => t.subarray(y * tam.pw, (y + 1) * tam.pw)
  assert.deepEqual([...linha(tam.ph - 1)], [...linha(tam.mh - 1)])
})
