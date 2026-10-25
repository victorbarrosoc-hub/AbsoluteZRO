import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aplicar, assar } from '../src/cor/cube.js'
import { codigoParaOklab } from '../src/cor/oklab.js'
import { criarLook, descrever, descreverSaturacao } from '../src/cor/referencia.js'
import { aplicarEmImagem, cena, distanciaMedia, lookConhecido } from './apoio.js'

const comLut = (img, look, tamanho = 33) => {
  const lut = assar(look.aplicar, tamanho)
  return { lut, img: aplicarEmImagem(img, (r, g, b) => aplicar(lut, r, g, b)) }
}

test('referência igual ao material: a LUT não mexe', () => {
  const img = cena(1)
  const { lut } = comLut(img, criarLook(img, img))
  let pior = 0
  for (let i = 0; i < lut.dados.length; i += 3) {
    const n = lut.tamanho
    const p = i / 3
    const esperado = [(p % n) / (n - 1), (Math.floor(p / n) % n) / (n - 1), Math.floor(p / n / n) / (n - 1)]
    for (let c = 0; c < 3; c++) pior = Math.max(pior, Math.abs(lut.dados[i + c] - esperado[c]))
  }
  assert.ok(pior < 1e-4, `desvio máximo ${pior}`)
})

test('intensidade 0 não mexe; 1 aplica o estilo inteiro', () => {
  const mat = cena(2)
  const ref = aplicarEmImagem(cena(2), lookConhecido)
  const zero = criarLook(ref, mat, { intensidade: 0 })
  for (const [r, g, b] of [
    [0.1, 0.2, 0.3],
    [0.5, 0.5, 0.5],
    [0.9, 0.7, 0.6],
  ]) {
    const o = zero.aplicar(r, g, b)
    assert.ok(Math.abs(o[0] - r) < 1e-6 && Math.abs(o[1] - g) < 1e-6 && Math.abs(o[2] - b) < 1e-6)
  }
  const meia = distanciaMedia(comLut(mat, criarLook(ref, mat, { intensidade: 0.5 })).img, mat)
  const cheia = distanciaMedia(comLut(mat, criarLook(ref, mat, { intensidade: 1 })).img, mat)
  assert.ok(meia > 0.3 * cheia && meia < 0.7 * cheia, `meia ${meia}, cheia ${cheia}`)
})

test('mesma cena com o look: a LUT chega perto do look', () => {
  const mat = cena(3)
  const alvo = aplicarEmImagem(mat, lookConhecido)
  const antes = distanciaMedia(mat, alvo)
  const depois = distanciaMedia(comLut(mat, criarLook(alvo, mat)).img, alvo)
  assert.ok(antes > 0.04, `look de teste fraco demais (${antes})`)
  assert.ok(depois < 0.35 * antes, `antes ${antes}, depois ${depois}`)
})

// cenas diferentes: a LUT não sabe o que é conteúdo e o que é grade, então chega perto, não igual
const DUPLAS = [
  [4, 40],
  [7, 6],
  [12, 13],
  [20, 21],
]

test('cena diferente com o look: sempre aproxima; na média a cor chega perto', () => {
  const razoes = []
  const cores = []
  const sats = []
  for (const [m, r] of DUPLAS) {
    const mat = cena(m)
    const ref = aplicarEmImagem(cena(r), lookConhecido)
    const alvo = aplicarEmImagem(mat, lookConhecido)
    const look = criarLook(ref, mat)
    const depois = comLut(mat, look).img
    const razao = distanciaMedia(depois, alvo) / distanciaMedia(mat, alvo)
    assert.ok(razao < 0.85, `dupla ${m}/${r}: razão ${razao}`)
    razoes.push(razao)
    cores.push(distanciaMedia(depois, alvo, { soCor: true }) / distanciaMedia(mat, alvo, { soCor: true }))
    sats.push(look.resumo.faixas[3].saturacao)
  }
  const media = (v) => v.reduce((x, y) => x + y, 0) / v.length
  assert.ok(media(razoes) < 0.65, `média ${media(razoes)}`)
  // cor: a dupla 12/13 piora (a referência quase não tem o que a cena do material tem); a média ainda melhora
  assert.ok(media(cores) < 0.8, `cor ${cores.map((c) => c.toFixed(2))}`)
  const mediana = sats.sort()[Math.floor(sats.length / 2)]
  assert.ok(mediana > 0.7 && mediana < 0.95, `saturação ${sats} (o look tira 20%)`)
})

test('um objeto saturado grande na referência não tinge os neutros', () => {
  const mat = cena(5)
  // referência = o mesmo material + um bloco vermelho forte do tamanho de 40% do quadro final, sem look nenhum
  const extra = Math.round((mat.altura * 2) / 3)
  const ref = { largura: mat.largura, altura: mat.altura + extra, pixels: new Float32Array(mat.largura * (mat.altura + extra) * 3) }
  ref.pixels.set(mat.pixels)
  for (let i = mat.pixels.length; i < ref.pixels.length; i += 3) {
    const luz = 0.25 + (0.6 * ((i / 3) % mat.largura)) / mat.largura
    ref.pixels[i] = Math.min(1, luz * 1.4)
    ref.pixels[i + 1] = luz * 0.2
    ref.pixels[i + 2] = luz * 0.18
  }
  const look = criarLook(ref, mat)
  for (const v of [0.2, 0.35, 0.5, 0.65]) {
    const [, a, b] = codigoParaOklab(...look.aplicar(v, v, v))
    assert.ok(Math.hypot(a, b) < 0.012, `cinza ${v} ganhou cor (${a.toFixed(4)}, ${b.toFixed(4)})`)
  }
})

test('a LUT é suave e o eixo neutro sobe sem inverter', () => {
  const look = criarLook(aplicarEmImagem(cena(6), lookConhecido), cena(7))
  const lut = assar(look.aplicar, 33)
  const n = 33
  let anterior = -1
  for (let k = 0; k < n; k++) {
    const i = ((k * n + k) * n + k) * 3
    const L = codigoParaOklab(lut.dados[i], lut.dados[i + 1], lut.dados[i + 2])[0]
    assert.ok(L >= anterior - 1e-6, `eixo neutro desce em ${k}`)
    anterior = L
  }
  // salto entre vizinhos da grade: nunca maior que 4× o passo da grade
  let pior = 0
  for (let i = 0; i < lut.dados.length; i += 3) {
    if ((i / 3) % n === n - 1) continue
    for (let c = 0; c < 3; c++) pior = Math.max(pior, Math.abs(lut.dados[i + 3 + c] - lut.dados[i + c]))
  }
  assert.ok(pior < 4 / (n - 1), `salto ${pior}`)
  assert.ok(lut.dados.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
})

test('material chapado (uma cor só) não quebra', () => {
  const chapado = { largura: 4, altura: 4, pixels: new Float32Array(48).fill(0.4) }
  const look = criarLook(cena(8), chapado)
  const o = look.aplicar(0.4, 0.4, 0.4)
  assert.ok(o.every(Number.isFinite))
})

test('resumo em português por faixa de luz', () => {
  const frases = descrever(criarLook(aplicarEmImagem(cena(9), lookConhecido), cena(9)).resumo)
  assert.equal(frases.length, 7)
  assert.match(frases[1], /^Sombras: .*mais frio/)
  assert.match(frases[5], /^Altos: .*mais quente/)
  assert.match(descreverSaturacao(criarLook(aplicarEmImagem(cena(9), lookConhecido), cena(9)).resumo), /^Saturação: \d+% menos$/)
})
