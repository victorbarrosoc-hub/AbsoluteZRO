// Carrossel por slide (public/lib/montagens-carrossel.js): cada slide com o próprio modelo, slides emendados viram um
// panorama, até 20 slides, e as fotos ficam no slide delas quando o modelo ou o número de slides muda.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const C = await import('../public/lib/montagens-carrossel.js')
const L = await import('../public/lib/montagens.js')

test('carrossel: até 20 slides, lado a lado e numerados', () => {
  const t = C.telaCarrossel('4x5', 20)
  assert.equal(t.fatias.length, 20)
  assert.equal(t.w, 1080 * 20)
  assert.deepEqual(t.fatias.at(-1), { x: 1080 * 19, y: 0, w: 1080, h: 1350, n: 20 })
  assert.equal(C.telaCarrossel('4x5', 99).fatias.length, C.MAX_SLIDES)
  assert.equal(C.telaCarrossel('4x5', 1).fatias.length, C.MIN_SLIDES)
})

test('montagem de antes (sem páginas) continua um panorama só, igual ao que saía', () => {
  const ps = C.paginasDe({ slides: 4, modelo: 'quatro' })
  const g = C.gruposDe(ps)
  assert.deepEqual(g.map((x) => [x.de, x.ate, x.modelo]), [[0, 3, 'quatro']])
  const antes = L.caixasDe('quatro', { w: 4320, h: 1350, espaco: 20 })
  const agora = C.caixasCarrossel(g, { w: 4320, h: 1350, espaco: 20, slides: 4 })
  assert.deepEqual(agora.map(({ x, y, w, h }) => ({ x, y, w, h })), antes)
})

test('cada slide com o próprio modelo e a própria borda; emendados viram um grupo', () => {
  const ps = [{ modelo: 'uma' }, { modelo: 'duas-lado' }, { modelo: 'uma' }, { emenda: true }]
  const g = C.gruposDe(C.paginasDe({ slides: 4, paginas: ps }))
  assert.deepEqual(g.map((x) => [x.de, x.ate, x.modelo, x.inicio]), [[0, 0, 'uma', 0], [1, 1, 'duas-lado', 1], [2, 3, 'uma', 3]])
  assert.equal(C.quadrosDe(g), 4)
  const cx = C.caixasCarrossel(g, { w: 4320, h: 1350, espaco: 30, slides: 4 })
  // slide 1: borda de 30 px dos dois lados, dentro dele
  assert.deepEqual([cx[0].x, cx[0].w], [30, 1020])
  // slide 2: duas fotos, começando na borda do slide 2
  assert.equal(cx[1].x, 1080 + 30)
  assert.ok(cx[2].x > cx[1].x + cx[1].w)
  // slides 3 e 4 emendados: uma foto passando pelo corte
  assert.deepEqual([cx[3].x, cx[3].w], [2160 + 30, 2160 - 60])
  assert.deepEqual(C.slideDosQuadros(g, { w: 4320, h: 1350, espaco: 30, slides: 4 }), [0, 1, 1, 2])
  assert.equal(C.quadroNoCarrossel(g, { w: 4320, h: 1350, espaco: 30, slides: 4 }, 3240, 600), 3)
  assert.equal(C.quadroNoCarrossel(g, { w: 4320, h: 1350, espaco: 30, slides: 4 }, 1080, 600), -1)
  assert.match(C.nomeCarrossel(g), /Um modelo por slide/)
})

test('trocar o modelo de um slide não tira as fotos dos outros', () => {
  const antes = C.gruposDe(C.paginasDe({ slides: 3, paginas: [{ modelo: 'uma' }, { modelo: 'uma' }, { modelo: 'uma' }] }))
  const depois = C.gruposDe(C.paginasDe({ slides: 3, paginas: [{ modelo: 'uma' }, { modelo: 'duas-pilha' }, { modelo: 'uma' }] }))
  assert.deepEqual(C.remapear(antes, depois, ['a', 'b', 'c']), ['a', 'b', null, 'c'])
  // menos slides: o que sobra sai do carrossel; mais slides: os novos vêm vazios (e recebem as fotos que sobram)
  const dois = C.gruposDe(C.paginasDe({ slides: 2, paginas: [{ modelo: 'uma' }, { modelo: 'duas-pilha' }] }))
  assert.deepEqual(C.remapear(depois, dois, ['a', 'b', 'x', 'c']), ['a', 'b', 'x'])
  const cinco = C.gruposDe(C.paginasDe({ slides: 5, paginas: [{ modelo: 'uma' }, { modelo: 'duas-pilha' }, { modelo: 'uma' }] }))
  assert.deepEqual(C.remapear(depois, cinco, ['a', 'b', 'x', 'c']), ['a', 'b', 'x', 'c', null, null])
  assert.deepEqual(L.preencher(C.remapear(depois, cinco, ['a', 'b', 'x', 'c']), 6, ['a', 'b', 'c', 'd', 'e', 'x']), ['a', 'b', 'x', 'c', 'd', 'e'])
})
