// Textura, clareza, neblina e nitidez extraídas de uma referência (src/estilo/vizinhanca.js). A régua: paisagens
// sintéticas com textura natural em todas as escalas (test/apoio-estilo.js, cenaNatural: ruído 1/f, folhagem, tijolo,
// morros com névoa), reveladas pelo nosso motor com um valor conhecido de cada controle e lidas de volta como um JPEG
// de 8 bits. As tolerâncias escritas abaixo têm folga sobre o que foi medido (entre parênteses).

import { before, test } from 'node:test'
import assert from 'node:assert/strict'

import { neutro } from '../src/motor/ajustes.js'
import { estimarVizinhanca, VIZINHANCA } from '../src/estilo/vizinhanca.js'
import { extrairEstilo } from '../src/estilo/referencia.js'
import { baseDe, cenaNatural, deltaEMedio, emBytes } from './apoio-estilo.js'

// 2048 px no lado maior: o raio da textura do motor é 1 px e o da nitidez também (o caso em que as duas se encostam)
const W = 2048
const H = 1365
let A
let B
let neutraA
let neutraB

const com = (valores) => {
  const a = neutro()
  for (const [caminho, v] of Object.entries(valores)) {
    const [g, c] = caminho.split('.')
    a[g][c] = v
  }
  return a
}
const NOMES = { 'presenca.textura': 'textura', 'presenca.clareza': 'clareza', 'presenca.neblina': 'neblina', 'detalhe.nitidez': 'nitidez' }

before(() => {
  A = baseDe(cenaNatural(1, W, H))
  B = baseDe(cenaNatural(2, W, H))
  neutraA = emBytes(A)
  neutraB = emBytes(B)
})

test('mesma cena: cada controle sozinho volta perto do valor verdadeiro; os outros ficam de fora', () => {
  // tolerância escrita (medido): textura ±12 (40 → 40, −40 → −36), nitidez ±12 (60 → 62), clareza ±8 (40 → 42,
  // −30 → −31), neblina ±8 (40 → 41)
  const casos = [
    ['presenca.textura', 40, 12],
    ['presenca.textura', -40, 12],
    ['detalhe.nitidez', 60, 12],
    ['presenca.clareza', 40, 8],
    ['presenca.clareza', -30, 8],
    ['presenca.neblina', 40, 8],
  ]
  for (const [caminho, valor, tolerancia] of casos) {
    const r = estimarVizinhanca([emBytes(A, com({ [caminho]: valor }))], neutraA, neutro(), { pareado: true })
    const nome = NOMES[caminho]
    const c = r.controles[nome]
    assert.equal(c.sai, true, `${nome} ${valor}: não saiu (${c.razao})`)
    assert.ok(Math.abs(c.valor - valor) <= tolerancia, `${nome} ${valor}: saiu ${c.valor}`)
    for (const [outro, o] of Object.entries(r.controles)) {
      if (outro === nome) continue
      assert.ok(!o.sai || Math.abs(o.valor) <= 8, `${nome} ${valor}: ${outro} saiu ${o.valor}`)
    }
  }
})

test('referência sem o efeito: nada sai (mesma cena e cena diferente)', () => {
  const par = estimarVizinhanca([neutraA], neutraA, neutro(), { pareado: true })
  for (const [nome, c] of Object.entries(par.controles)) assert.ok(!c.sai, `pareado: ${nome} saiu ${c.valor}`)
  const outra = estimarVizinhanca([neutraB], neutraA, neutro(), { pareado: false })
  for (const [nome, c] of Object.entries(outra.controles)) assert.ok(!c.sai, `outra cena: ${nome} saiu ${c.valor}`)
})

test('cena diferente: a incerteza declarada cobre o valor verdadeiro e nada sai com o sinal trocado', () => {
  // Sem par, a medida muda com o conteúdo muito mais que com o controle: em 23 fotos reais de um mesmo ensaio, sem o
  // efeito, a medida da clareza varia 0,197 (contra 0,15 de 0 a +100 de clareza), a da textura 0,198, a da nitidez 1,03
  // (VIZINHANCA.erroCena). Então a tolerância escrita, sem par, é a incerteza que a extração declara: o valor verdadeiro
  // cai a até 3 incertezas (+ o mínimo de 5) do estimado, em cada controle, e o que sai tem o sinal certo.
  for (const [caminho, valor] of [
    ['presenca.neblina', 60],
    ['presenca.clareza', -50],
    ['detalhe.nitidez', 120],
  ]) {
    const r = estimarVizinhanca([emBytes(B, com({ [caminho]: valor }))], neutraA, neutro(), { pareado: false })
    for (const [nome, c] of Object.entries(r.controles)) {
      const verdade = NOMES[caminho] === nome ? valor : 0
      if (c.incerteza == null) continue
      assert.ok(Math.abs(c.valor - verdade) <= 3 * c.incerteza + VIZINHANCA.minimo, `${caminho} ${valor}, ${nome}: ${c.valor} ± ${c.incerteza}`)
      if (c.sai) assert.ok(Math.sign(c.valor) === Math.sign(verdade), `${nome} saiu com o sinal trocado`)
    }
  }
})

test('refino conjunto: com tom e vizinhança juntos, o tom não engole a neblina e o resultado reproduz a referência', () => {
  // medido: clareza 39, neblina 35, nitidez 57 (verdade 35, 30, 50); ΔE para a referência 0,27 (neutro: 3,2)
  const verdade = com({
    'presenca.clareza': 35,
    'presenca.neblina': 30,
    'presenca.textura': 30,
    'detalhe.nitidez': 50,
    'luz.contraste': 20,
    'cor.saturacao': 15,
    'luz.altas': -30,
  })
  const ref = emBytes(A, verdade)
  const r = extrairEstilo(ref, { alvo: neutraA })
  assert.equal(r.pareado, true)
  assert.ok(Math.abs(r.ajustes.presenca.clareza - 35) <= 12, `clareza ${r.ajustes.presenca.clareza}`)
  assert.ok(Math.abs(r.ajustes.presenca.neblina - 30) <= 12, `neblina ${r.ajustes.presenca.neblina}`)
  assert.ok(Math.abs(r.ajustes.detalhe.nitidez - 50) <= 15, `nitidez ${r.ajustes.detalhe.nitidez}`)
  const antes = deltaEMedio(neutraA, ref)
  const depois = deltaEMedio(emBytes(A, r.ajustes), ref)
  assert.ok(depois < 0.25 * antes, `ΔE ${depois.toFixed(2)} (neutro ${antes.toFixed(2)})`)
  // o relatório diz, por controle, o valor, a incerteza e a razão
  for (const nome of ['textura', 'clareza', 'neblina', 'nitidez']) {
    const c = r.predefinicao.origem.relatorio.vizinhanca[nome]
    assert.ok(c && typeof c.razao === 'string', nome)
  }
  // e a neblina só de neblina não vira sombras e curva
  const so = extrairEstilo(emBytes(A, com({ 'presenca.neblina': 40 })), { alvo: neutraA })
  assert.ok(Math.abs(so.ajustes.presenca.neblina - 40) <= 8, `neblina ${so.ajustes.presenca.neblina}`)
  assert.ok(Math.abs(so.ajustes.luz.sombras) <= 10, `sombras ${so.ajustes.luz.sombras}`)
})

test('tempo: a vizinhança de uma referência de 2048 px, pareada, abaixo de 3 s', (t) => {
  const ref = emBytes(A, com({ 'presenca.clareza': 20 }))
  const inicio = performance.now()
  const r = estimarVizinhanca([ref], neutraA, neutro(), { pareado: true })
  const ms = performance.now() - inicio
  t.diagnostic(`2048 px, pareado: ${ms.toFixed(0)} ms, ${r.renders} revelações`)
  assert.ok(ms < 3000, `${ms.toFixed(0)} ms`)
})
