import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aplicar, assar, escreverCube, lerCube } from '../src/cor/cube.js'
import { criarRevelaLook, curvaDeFilme } from '../src/cor/looks.js'
import { codigoParaOklab } from '../src/cor/oklab.js'

const matiz = ([, a, b]) => (Math.atan2(b, a) * 180) / Math.PI
const croma = ([, a, b]) => Math.hypot(a, b)

test('Revela Look: intensidade 0 não mexe', () => {
  const look = criarRevelaLook()
  for (const c of [
    [0, 0, 0],
    [0.5, 0.5, 0.5],
    [0.8, 0.4, 0.2],
    [0.1, 0.6, 0.3],
  ]) {
    look.aplicar(...c, 0).forEach((v, i) => assert.ok(Math.abs(v - c[i]) < 2e-3, `${c} mudou`))
  }
})

test('Revela Look: curva de filme monótona, preto aberto e branco que deita', () => {
  let antes = -1
  for (let i = 0; i <= 100; i++) {
    const L = curvaDeFilme(i / 100)
    assert.ok(L > antes, `curva desce em ${i}`)
    antes = L
  }
  assert.ok(curvaDeFilme(0) > 0.02 && curvaDeFilme(0) < 0.08)
  assert.ok(curvaDeFilme(1) < 0.98 && curvaDeFilme(1) > 0.93)
  // contraste no meio: inclinação maior que 1 perto do pivô
  assert.ok((curvaDeFilme(0.55) - curvaDeFilme(0.45)) / 0.1 > 1)
})

test('Revela Look: sombras frias, altas quentes, verde para oliva, pele no lugar', () => {
  const look = criarRevelaLook()
  const sombra = codigoParaOklab(...look.aplicar(0.12, 0.12, 0.12))
  const alta = codigoParaOklab(...look.aplicar(0.85, 0.85, 0.85))
  assert.ok(sombra[2] < 0, 'sombra devia puxar para o azul')
  assert.ok(alta[2] > 0, 'alta devia puxar para o amarelo')

  const verde = [0.25, 0.55, 0.2]
  const v0 = codigoParaOklab(...verde)
  const v1 = codigoParaOklab(...look.aplicar(...verde))
  assert.ok(matiz(v1) < matiz(v0) - 5, 'verde devia girar para o amarelo')
  assert.ok(croma(v1) < croma(v0), 'verde devia perder um pouco de croma')

  const pele = [0.78, 0.58, 0.47]
  const p0 = codigoParaOklab(...pele)
  const p1 = codigoParaOklab(...look.aplicar(...pele))
  assert.ok(Math.abs(matiz(p1) - matiz(p0)) < 8, 'pele mudou de matiz demais')
})

test('Revela Look: só a curva ou só a cor', () => {
  const soTom = criarRevelaLook({ cor: false })
  const cinza = codigoParaOklab(...soTom.aplicar(0.3, 0.3, 0.3))
  assert.ok(croma(cinza) < 1e-3, 'sem cor o cinza fica neutro')
  const soCor = criarRevelaLook({ tom: false })
  const L0 = codigoParaOklab(0.5, 0.5, 0.5)[0]
  assert.ok(Math.abs(codigoParaOklab(...soCor.aplicar(0.5, 0.5, 0.5))[0] - L0) < 0.01, 'sem tom a luz do cinza fica')
})

test('Revela Look: vira .cube válido e a LUT segue o look', () => {
  const look = criarRevelaLook()
  const lut = assar(look.aplicar, 33)
  const lido = lerCube(escreverCube(lut, 'Revela Look - 100%'))
  assert.equal(lido.tamanho, 33)
  for (const c of [
    [0.2, 0.3, 0.4],
    [0.7, 0.5, 0.3],
  ]) {
    const a = aplicar(lido, ...c)
    const b = look.aplicar(...c)
    a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 0.01))
  }
})
