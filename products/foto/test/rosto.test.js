// Núcleo do rosto em evento (src/rosto/), em Node, sem modelo e sem foto de ninguém:
//   - alinhamento: a semelhança de Umeyama e o recorte bilinear contra o `alignCrop` do OpenCV (FaceRecognizerSF), com
//     a referência gerada uma vez em Python (cv2 5.0, os mesmos 5 pontos, uma textura por fórmula): matriz até 1e-4 e
//     os pixels amostrados iguais;
//   - int8: a perda medida em vetores normalizados (cos ≥ 0,9999), o formato e o que é recusado;
//   - a decisão com os limiares do estudo (D.3): uma sonda, duas de três, rosto pequeno, colado, perfil, nota baixa;
//   - juntar os 3 quadros, a qualidade da selfie e a máquina da captura;
//   - o plano das passadas do detector e a leitura da saída;
//   - as receitas do ONNX (scripts/onnx.mjs): o protobuf lido e regravado byte a byte e, com os originais em
//     .modelos-rosto/, os derivados com o sha256 de modelos.json.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inverter, LADO, MOLDE, recortar, semelhanca, tensorDoDetector, tensorDoRosto } from '../src/rosto/alinhar.js'
import { cosseno, desquantizar, deBase64, normalizar, paraBase64, quantizar, vetorDeTexto, vetorParaTexto, vetorValido } from '../src/rosto/assinatura.js'
import { faixa, LIMIARES, ligar, paraRemover, procurar, rostoQueVale } from '../src/rosto/decidir.js'
import { decodificar, invasao, passadas, passadaUnica, suprimir } from '../src/rosto/detectar.js'
import { avaliarQuadro, DICAS, nitidez, pose } from '../src/rosto/qualidade.js'
import { criarCaptura, juntar, serveParaEtapa } from '../src/rosto/quadros.js'
import { PELA_VERSAO, TEXTOS, textoDoRegistro } from '../src/rosto/textos.js'
import { gravar, ler, RECEITAS, sfaceP8, yunetDinamico } from '../scripts/onnx.mjs'
import { modelosDeRosto, PASTA_ROSTO } from '../scripts/modelos.mjs'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const EXIGIR = process.env.FOTO_EXIGIR === '1'

/** Gerador com semente (mulberry32) e normal por Box-Muller. */
function sorteio(semente) {
  let s = semente >>> 0
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u())
  return { u, normal, vetor: (n = 128) => normalizar(Float32Array.from({ length: n }, normal)) }
}
/** Um vetor a um cosseno `c` de `base` (normalizado). */
function aoCosseno(base, c, r) {
  const ruido = r.vetor()
  let p = 0
  for (let i = 0; i < 128; i++) p += ruido[i] * base[i]
  const orto = normalizar(ruido.map((x, i) => x - p * base[i]))
  return normalizar(base.map((x, i) => c * x + Math.sqrt(1 - c * c) * orto[i]))
}

// ───────── alinhamento ─────────

// Referência: cv2.FaceRecognizerSF.alignCrop (OpenCV 5.0.0) com estes pontos; `m` foi lida de volta do recorte de uma
// imagem que guarda a própria coordenada em cada pixel; `amostras` = [x, y, [R, G, B]] do recorte da textura abaixo.
const REFERENCIA = [
  {
    pontos: [[250.3, 210.7], [330.9, 205.2], [292.4, 255.8], [262.1, 300.4], [325.6, 296.9]],
    m: [0.4463385, 0.0182337, -0.0182337, 0.4463385, -69.7929661, -46.7088767],
    amostras: [[10, 10, [48, 15, 234]], [56, 56, [245, 193, 33]], [40, 52, [28, 164, 232]], [73, 51, [36, 232, 21]], [56, 72, [152, 8, 65]], [41, 92, [231, 245, 139]],
      [70, 92, [161, 169, 157]], [100, 20, [82, 242, 10]], [5, 100, [93, 8, 60]], [90, 90, [119, 32, 9]], [30, 70, [16, 65, 144]], [80, 40, [19, 46, 8]]],
  },
  {
    pontos: [[101.5, 160.2], [139.8, 171.4], [113, 190.7], [100.4, 210.3], [131.2, 219.8]],
    m: [0.8252689, -0.1451892, 0.1451892, 0.8252689, -68.3344449, -68.2831458],
    amostras: [[10, 10, [219, 159, 237]], [56, 56, [230, 122, 194]], [40, 52, [73, 137, 62]], [73, 51, [207, 187, 247]], [56, 72, [245, 15, 243]], [41, 92, [179, 99, 241]],
      [70, 92, [144, 64, 142]], [100, 20, [26, 129, 246]], [5, 100, [64, 210, 53]], [90, 90, [8, 31, 25]], [30, 70, [28, 10, 78]], [80, 40, [168, 247, 246]]],
  },
  {
    pontos: [[400, 300], [460, 300], [430, 340], [405, 370], [455, 370]],
    m: [0.5814086, -0.0032277, 0.0032277, 0.5814086, -195.0640121, -122.0645531],
    amostras: [[10, 10, [135, 237, 229]], [56, 56, [247, 22, 244]], [40, 52, [74, 30, 161]], [73, 51, [90, 29, 172]], [56, 72, [202, 193, 137]], [41, 92, [247, 127, 94]],
      [70, 92, [22, 227, 61]], [100, 20, [19, 128, 202]], [5, 100, [34, 22, 242]], [90, 90, [241, 243, 215]], [30, 70, [46, 242, 221]], [80, 40, [59, 175, 203]]],
  },
]
/** A textura da referência (640 × 480, RGBA), a mesma fórmula do script em Python. */
function textura() {
  const W = 640
  const H = 480
  const dados = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      dados[i] = Math.round(128 + 120 * Math.sin(x * 0.07 + y * 0.03))
      dados[i + 1] = Math.round(128 + 120 * Math.cos(x * 0.02 - y * 0.06))
      dados[i + 2] = Math.round(128 + 120 * Math.sin((x + y) * 0.045))
      dados[i + 3] = 255
    }
  }
  return { largura: W, altura: H, dados }
}

test('alinhar: a semelhança bate com a do alignCrop do OpenCV (até 1e-4) e o recorte, pixel a pixel nas amostras', () => {
  const img = textura()
  for (const c of REFERENCIA) {
    const m = semelhanca(c.pontos, MOLDE)
    for (let i = 0; i < 6; i++) assert.ok(Math.abs(m[i] - c.m[i]) < 1e-4, `m[${i}] ${m[i]} × ${c.m[i]}`)
    const r = recortar(img, c.pontos)
    assert.equal(r.largura, LADO)
    for (const [x, y, rgb] of c.amostras) for (let k = 0; k < 3; k++) assert.ok(Math.abs(r.dados[(y * 112 + x) * 4 + k] - rgb[k]) <= 1, `(${x}, ${y}) canal ${k}`)
  }
})

test('alinhar: o molde vai nele mesmo; rotação, escala e translação conhecidas voltam; sem reflexão', () => {
  const id = semelhanca(MOLDE, MOLDE)
  for (const [a, b] of id.map((v, i) => [v, [1, 0, 0, 1, 0, 0][i]])) assert.ok(Math.abs(a - b) < 1e-9)
  // pontos = molde girado 20°, ×2,5 e deslocado: a semelhança devolve a inversa exata
  const ang = (20 * Math.PI) / 180
  const pontos = MOLDE.map(([x, y]) => [2.5 * (Math.cos(ang) * x - Math.sin(ang) * y) + 300, 2.5 * (Math.sin(ang) * x + Math.cos(ang) * y) + 120])
  const m = semelhanca(pontos, MOLDE)
  const ida = inverter(m)
  assert.ok(Math.abs(ida[0] - 2.5 * Math.cos(ang)) < 1e-9 && Math.abs(ida[1] - 2.5 * Math.sin(ang)) < 1e-9)
  assert.ok(Math.abs(ida[4] - 300) < 1e-7 && Math.abs(ida[5] - 120) < 1e-7)
  // espelhado: a semelhança não reflete (determinante positivo), só encaixa o melhor que dá
  const espelho = MOLDE.map(([x, y]) => [200 - x, y])
  const me = semelhanca(espelho, MOLDE)
  assert.ok(me[0] * me[3] - me[1] * me[2] > 0)
})

test('alinhar: tensores do SFace (RGB, NCHW) e do YuNet (BGR, NCHW)', () => {
  const r = { dados: new Uint8ClampedArray(112 * 112 * 4).fill(0) }
  r.dados.set([10, 20, 30, 255], 0)
  const t = tensorDoRosto(r)
  assert.deepEqual([t[0], t[112 * 112], t[2 * 112 * 112]], [10, 20, 30])
  const d = tensorDoDetector(new Uint8ClampedArray([10, 20, 30, 255, 1, 2, 3, 255]), 2, 1)
  assert.deepEqual([...d], [30, 3, 20, 2, 10, 1])
})

// ───────── int8 ─────────

test('int8: perda medida em 2.000 vetores (cos ≥ 0,9999), 128 bytes, 172 caracteres, ida e volta', () => {
  const r = sorteio(7)
  let min = 1
  let soma = 0
  for (let i = 0; i < 2000; i++) {
    const v = r.vetor()
    const q = quantizar(v)
    const c = cosseno(v, q)
    min = Math.min(min, c)
    soma += c
    assert.ok(vetorValido(q))
  }
  assert.ok(min >= 0.9999, `cos mínimo ${min}`)
  assert.ok(soma / 2000 >= 0.99995, `cos médio ${soma / 2000}`)
  // a busca com int8 nos dois lados dá a mesma conta que com float (até a 3ª casa)
  const a = r.vetor()
  const b = aoCosseno(a, 0.47, r)
  assert.ok(Math.abs(cosseno(quantizar(a), quantizar(b)) - 0.47) < 2e-3)
  const q = quantizar(a)
  const texto = vetorParaTexto(q)
  assert.equal(texto.length, 172)
  assert.deepEqual([...vetorDeTexto(texto)], [...q])
  assert.ok(cosseno(desquantizar(q), a) > 0.9999)
  assert.deepEqual([...deBase64(paraBase64(new Uint8Array([1, 2, 3, 250])))], [1, 2, 3, 250])
})

test('int8: só passa vetor bem-formado (o maior componente 127, espalhado, 128 dimensões)', () => {
  const r = sorteio(3)
  const bom = quantizar(r.vetor())
  assert.ok(vetorValido(bom))
  const pico = new Int8Array(128)
  pico[5] = 127
  assert.equal(vetorValido(pico), false, 'um componente só')
  const baixo = Int8Array.from(bom, (x) => Math.trunc(x / 2))
  assert.equal(vetorValido(baixo), false, 'sem o 127')
  assert.equal(vetorValido(new Int8Array(64)), false)
  const menos128 = Int8Array.from(bom)
  menos128[0] = -128
  assert.equal(vetorValido(menos128), false)
  assert.equal(vetorDeTexto('A'.repeat(172)), null)
  assert.equal(vetorDeTexto(vetorParaTexto(pico)), null)
  assert.equal(vetorDeTexto('não é base64'), null)
  assert.equal(vetorDeTexto(vetorParaTexto(bom).slice(0, 170)), null)
})

// ───────── decisão ─────────

test('decidir: os limiares do estudo (D.3)', () => {
  const bom = { largura: 60, nota: 0.9, colado: false, perfil: false }
  assert.equal(faixa([0.5], bom), 'eu')
  assert.equal(faixa([0.499], bom), 'talvez')
  assert.equal(faixa([0.4], bom), 'talvez')
  assert.equal(faixa([0.399], bom), null)
  // duas de três ≥ 0,45
  assert.equal(faixa([0.46, 0.45, 0.2], bom), 'eu')
  assert.equal(faixa([0.6, 0.44, 0.3], bom), 'talvez', 'um quadro só acima não basta com três')
  assert.equal(faixa([0.46, 0.46], bom), 'eu')
  assert.equal(faixa([0.39, 0.38, 0.1], bom), null)
  // rosto que não vale "É você" cai em "Talvez"
  for (const ruim of [{ largura: 22 }, { nota: 0.74 }, { colado: true }, { perfil: true }]) {
    const r = { ...bom, ...ruim }
    assert.equal(rostoQueVale(r), false)
    assert.equal(faixa([0.8, 0.8, 0.8], r), 'talvez', JSON.stringify(ruim))
  }
  assert.equal(faixa([], bom), null)
  assert.equal(LIMIARES.eu, 0.5)
  assert.equal(LIMIARES.euEmDois, 0.45)
  assert.equal(LIMIARES.talvez, 0.4)
})

test('decidir: procurar devolve cada foto uma vez, na melhor faixa, ordenada, até 200; ligar e remover', () => {
  const r = sorteio(11)
  const eu = r.vetor()
  const outra = r.vetor()
  const sondas = [aoCosseno(eu, 0.8, r), aoCosseno(eu, 0.75, r), aoCosseno(eu, 0.7, r)].map(quantizar)
  const rosto = (foto, v, extra = {}) => ({ foto, v: quantizar(v), largura: 80, nota: 0.9, colado: false, perfil: false, ...extra })
  const rostos = [
    rosto('f1', aoCosseno(eu, 0.9, r)),
    rosto('f1', outra),
    rosto('f2', aoCosseno(eu, 0.85, r), { colado: true }),
    rosto('f3', outra),
    rosto('f4', aoCosseno(eu, 0.75, r)),
    rosto('f5', aoCosseno(eu, 0.95, r), { naoBuscar: true }),
  ]
  const { eu: e, talvez: t } = procurar(sondas, rostos)
  assert.deepEqual(e.sort(), ['f1', 'f4'])
  assert.deepEqual(t, ['f2'])
  // até 200
  const muitas = Array.from({ length: 260 }, (_, i) => rosto(`m${i}`, aoCosseno(eu, 0.9, r)))
  const m = procurar(sondas, muitas)
  assert.equal(m.eu.length + m.talvez.length, 200)
  // ligar (com consentimento) e remover (≥ 0,45)
  const lig = ligar([{ id: 'p1', vetores: sondas }], rostos)
  assert.deepEqual(lig.map((l) => `${l.foto}:${l.faixa}`).sort(), ['f1:eu', 'f2:talvez', 'f4:eu'])
  assert.deepEqual(paraRemover(sondas, rostos).map((x) => x.foto).sort(), ['f1', 'f2', 'f4', 'f5'])
})

// ───────── os 3 quadros ─────────

test('quadros: juntar fica com os 3 que concordam, com os 2 quando um destoa, e recusa quando nenhum par concorda', () => {
  const r = sorteio(5)
  const base = r.vetor()
  const tres = [aoCosseno(base, 0.9, r), aoCosseno(base, 0.88, r), aoCosseno(base, 0.86, r)]
  const j = juntar(tres)
  assert.equal(j.ok, true)
  assert.equal(j.vetores.length, 3)
  assert.ok(j.concordancia >= 0.6)
  const umFora = [tres[0], tres[1], r.vetor()]
  const j2 = juntar(umFora)
  assert.equal(j2.ok, true)
  assert.equal(j2.vetores.length, 2)
  assert.ok(j2.vetores.includes(tres[0]) && j2.vetores.includes(tres[1]))
  const nada = juntar([r.vetor(), r.vetor(), r.vetor()])
  assert.equal(nada.ok, false)
  assert.equal(juntar([]).ok, false)
})

/** Pontos de um rosto de frente (dio 60 px) com guinada g e rolagem em graus. */
function pontosDe({ g = 0, rolar = 0, dio = 60, cx = 160, cy = 120 } = {}) {
  const a = (rolar * Math.PI) / 180
  const crus = [[-dio / 2, 0], [dio / 2, 0], [g * dio, dio * 0.6], [-dio * 0.35, dio * 1.1], [dio * 0.35, dio * 1.1]]
  return crus.map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)])
}
/** Um recorte de 112 com luz e textura escolhidas. */
function recorteDe({ luz = 120, textura = 40 } = {}) {
  const r = sorteio(9)
  const dados = new Uint8ClampedArray(112 * 112 * 4)
  for (let i = 0; i < 112 * 112; i++) {
    const v = luz + textura * (r.u() - 0.5)
    dados.set([v, v, v, 255], i * 4)
  }
  return { largura: 112, altura: 112, dados }
}

test('qualidade: pose pelos 5 pontos e os portões da selfie (distância, rolagem, luz, nitidez, um rosto)', () => {
  assert.ok(Math.abs(pose(pontosDe()).guinada) < 1e-9)
  assert.ok(Math.abs(pose(pontosDe({ g: 0.25 })).guinada - 0.25) < 1e-9)
  assert.ok(Math.abs(pose(pontosDe({ rolar: 20 })).rolagem - 20) < 1e-9)
  const rosto = (p) => ({ nota: 0.9, largura: 70, pontos: p })
  assert.equal(avaliarQuadro({ rostos: [], ladoDoQuadro: 320 }).dica, 'sem-rosto')
  assert.equal(avaliarQuadro({ rostos: [rosto(pontosDe()), rosto(pontosDe({ cx: 60 }))], ladoDoQuadro: 320 }).dica, 'um-rosto')
  assert.equal(avaliarQuadro({ rostos: [rosto(pontosDe({ dio: 15 }))], ladoDoQuadro: 320 }).dica, 'perto')
  assert.equal(avaliarQuadro({ rostos: [rosto(pontosDe({ dio: 30 }))], ladoDoQuadro: 640 }).dica, 'perto', 'no quadro de 640 pede 40 px')
  assert.equal(avaliarQuadro({ rostos: [rosto(pontosDe({ rolar: 18 }))], ladoDoQuadro: 320 }).dica, 'reto')
  assert.equal(avaliarQuadro({ rostos: [rosto(pontosDe())], ladoDoQuadro: 320, recorte: recorteDe({ luz: 20 }) }).dica, 'luz')
  assert.equal(avaliarQuadro({ rostos: [rosto(pontosDe())], ladoDoQuadro: 320, recorte: recorteDe({ luz: 230, textura: 10 }) }).dica, 'forte')
  assert.equal(avaliarQuadro({ rostos: [rosto(pontosDe())], ladoDoQuadro: 320, recorte: recorteDe({ textura: 0 }) }).dica, 'firme')
  const ok = avaliarQuadro({ rostos: [rosto(pontosDe())], ladoDoQuadro: 320, recorte: recorteDe() })
  assert.equal(ok.ok, true)
  assert.ok(ok.medidas.vol >= 15 && ok.medidas.luz > 35 && ok.medidas.luz < 200)
  // nitidez: liso dá 0; ruído forte dá muito (por isso a concordância dos quadros é o segundo portão)
  assert.ok(nitidez(recorteDe({ textura: 0 })).vol < 1e-6)
  for (const d of ['sem-rosto', 'um-rosto', 'perto', 'reto', 'luz', 'forte', 'firme', 'frente', 'virar', 'outro']) assert.ok(DICAS[d], d)
})

test('quadros: a captura pede de frente → girado → o outro lado, recomeça depois de 6 s e barra outra pessoa', () => {
  const r = sorteio(21)
  const base = r.vetor()
  const v = () => aoCosseno(base, 0.9, r)
  const c = criarCaptura()
  const q = (g, agora, vetor = v()) => c.passo({ ok: true, dica: null, pose: pose(pontosDe({ g })), vetor, agora })
  assert.equal(q(0.3, 0).pegou, false, 'girado antes de estar de frente')
  assert.equal(q(0.02, 100).pegou, true)
  assert.equal(c.etapa(), 1)
  assert.equal(q(0.05, 200).dica, 'virar')
  assert.equal(q(0.2, 300).pegou, true)
  assert.equal(q(0.2, 400).pegou, false, 'mesmo lado')
  assert.equal(q(-0.2, 500, r.vetor()).pegou, false, 'outra pessoa no quadro')
  const fim = q(-0.2, 600)
  assert.equal(fim.pronto, true)
  assert.equal(fim.vetores.length, 3)
  // intervalo grande: recomeça
  const c2 = criarCaptura()
  c2.passo({ ok: true, pose: pose(pontosDe()), vetor: v(), agora: 0 })
  assert.equal(c2.etapa(), 1)
  c2.passo({ ok: true, pose: pose(pontosDe({ g: 0.2 })), vetor: v(), agora: 7000 })
  assert.equal(c2.etapa(), 0)
  // quadro ruim: a dica é a da qualidade
  assert.equal(c2.passo({ ok: false, dica: 'luz', pose: null, agora: 7100 }).dica, 'luz')
  assert.equal(serveParaEtapa(2, { guinada: 0.2 }, null), false)
  assert.equal(serveParaEtapa(1, { guinada: 0.5 }), false, 'perfil demais')
})

// ───────── detector ─────────

test('detectar: passadas na prévia de 1616 (global + ladrilhos) e no quadro da selfie', () => {
  const p = passadas(1616, 1077)
  assert.equal(p[0].L, 640)
  assert.ok(Math.abs(p[0].k - 640 / 1616) < 1e-12)
  assert.equal(p.length, 1 + 3 * 2)
  for (const t of p.slice(1)) {
    assert.ok(t.sx >= 0 && t.sy >= 0 && t.sx + t.sw <= 1616 + 1e-6 && t.sy + t.sh <= 1077 + 1e-6)
    assert.equal(t.k, 1)
  }
  assert.equal(passadas(600, 400).length, 1, 'pequena: uma passada')
  const u = passadaUnica(640, 480)
  assert.deepEqual([u.L, u.A, u.k], [320, 256, 0.5])
})

test('detectar: a saída do YuNet vira caixa e pontos na imagem; repetidos somem; colado é medido', () => {
  const L = 64
  const A = 64
  const passada = { sx: 100, sy: 50, sw: 128, sh: 128, k: 0.5, L, A, borda: null }
  const saidas = {}
  for (const s of [8, 16, 32]) {
    const n = (L / s) * (A / s)
    saidas[`cls_${s}`] = new Float32Array(n)
    saidas[`obj_${s}`] = new Float32Array(n)
    saidas[`bbox_${s}`] = new Float32Array(n * 4)
    saidas[`kps_${s}`] = new Float32Array(n * 10)
  }
  // uma detecção no passo 16, célula (1, 2): centro (1,5 · 16, 2,5 · 16) = (24, 40) na entrada
  const i = 2 * 4 + 1
  saidas.cls_16[i] = 0.9
  saidas.obj_16[i] = 0.9
  saidas.bbox_16.set([0.5, 0.5, Math.log(2), Math.log(2)], i * 4)
  saidas.kps_16.set([0, 0, 1, 0, 0.5, 0.5, 0, 1, 1, 1], i * 10)
  const [f] = decodificar(saidas, passada)
  assert.ok(Math.abs(f.nota - 0.9) < 1e-6)
  assert.ok(Math.abs(f.x - (100 + (24 - 16) / 0.5)) < 1e-6 && Math.abs(f.largura - 64) < 1e-6)
  assert.deepEqual(f.pontos[0], [100 + 32, 50 + 64])
  const dois = suprimir([f, { ...f, nota: 0.5, x: f.x + 2 }])
  assert.equal(dois.length, 1)
  assert.equal(dois[0].nota, f.nota)
  assert.ok(invasao(f, [f, { ...f, x: f.x + f.largura / 2 }]) >= 0.5)
  assert.equal(invasao(f, [f, { ...f, x: f.x + f.largura * 2 }]), 0)
  // no ladrilho, o rosto cortado pela borda interna fica para o vizinho
  const cortado = decodificar(saidas, { ...passada, sw: 70, borda: { x0: false, y0: false, x1: true, y1: false } })
  assert.equal(cortado.length, 0)
  assert.equal(decodificar(saidas, { ...passada, borda: { x0: true, y0: false, x1: false, y1: false } }).length, 1, 'longe da borda: fica')
})

// ───────── textos ─────────

test('textos: cada texto tem versão única e entra no registro com título, corpo e caixa', () => {
  const versoes = Object.values(TEXTOS).map((t) => t.versao)
  assert.equal(new Set(versoes).size, versoes.length)
  for (const [k, t] of Object.entries(TEXTOS)) {
    assert.equal(PELA_VERSAO[t.versao], k)
    assert.ok(textoDoRegistro(k).includes(t.corpo))
  }
  assert.match(TEXTOS.busca.corpo, /A selfie fica no seu celular/)
  assert.match(TEXTOS.cartazAberta.corpo, /^Neste evento você pode achar suas fotos pelo rosto\. A selfie não sai do seu celular\./)
  assert.match(TEXTOS.busca.caixa, /18 anos/)
})

// ───────── ONNX ─────────

test('onnx: o protobuf volta byte a byte; as receitas mudam só o que dizem', () => {
  // uma mensagem com varint, 64 bits, 32 bits e campo aninhado, fora de ordem
  const interna = gravar([{ n: 1, t: 0, v: 300n }])
  const m = gravar([
    { n: 2, t: 2, v: Buffer.from('abc') },
    { n: 1, t: 0, v: 5n },
    { n: 3, t: 1, v: Buffer.alloc(8, 1) },
    { n: 4, t: 5, v: Buffer.alloc(4, 2) },
    { n: 5, t: 2, v: interna },
  ])
  assert.deepEqual(gravar(ler(m)), m)
  assert.equal(ler(ler(m).find((c) => c.n === 5).v)[0].v, 300n)
  assert.equal(typeof RECEITAS['yunet-dinamico'], 'function')
  assert.equal(typeof RECEITAS['sface-p8'], 'function')
})

const fontes = existsSync(PASTA_ROSTO) ? modelosDeRosto().fontes.filter((f) => existsSync(join(PASTA_ROSTO, f.arquivo))) : []
const semFontes = fontes.length === 2 ? false : 'sem os originais em .modelos-rosto/ (rode npm run modelos)'

test('os modelos de rosto são exigidos no CI', { skip: !EXIGIR }, () => {
  assert.equal(semFontes, false, semFontes || '')
})

test('onnx: YuNet dinâmico e SFace p8 saem dos originais com o sha256 de modelos.json', { skip: semFontes }, () => {
  const rosto = modelosDeRosto(join(RAIZ, 'modelos.json'))
  const sha = (b) => createHash('sha256').update(b).digest('hex')
  const de = (arquivo) => readFileSync(join(PASTA_ROSTO, arquivo))
  const [y, s] = rosto.modelos
  for (const f of rosto.fontes) assert.equal(sha(de(f.arquivo)), f.sha256)
  const original = de(y.de)
  assert.deepEqual(gravar(ler(original)), original, 'ler e gravar sem mudar nada devolve o mesmo arquivo')
  assert.equal(sha(yunetDinamico(original)), y.sha256)
  const p8 = sfaceP8(de(s.de))
  assert.equal(p8.trocados, 20)
  assert.equal(sha(p8.bytes), s.sha256)
  assert.ok(p8.bytes.length < de(s.de).length / 3.8)
})
