import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aplicar, assar, escreverCube, lerCube } from '../src/cor/cube.js'
import { LOOKS, criarRevelaLook, curvaDeFilme } from '../src/cor/looks.js'
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

test('Revela Look: meio-tom claro e dourado, branco quase neutro, sombra neutra, verde para oliva, pele quente', () => {
  const look = criarRevelaLook()
  const sombra = codigoParaOklab(...look.aplicar(0.12, 0.12, 0.12))
  const meio = codigoParaOklab(...look.aplicar(0.5, 0.5, 0.5))
  const branco = codigoParaOklab(...look.aplicar(1, 1, 1))
  assert.ok(Math.abs(sombra[2]) < 0.01 && Math.abs(sombra[1]) < 0.01, 'sombra devia ficar neutra')
  assert.ok(meio[2] > 0.015, 'meio-tom devia ficar dourado')
  assert.ok(meio[0] > codigoParaOklab(0.5, 0.5, 0.5)[0] + 0.05, 'meio-tom devia subir')
  assert.ok(Math.hypot(branco[1], branco[2]) < 0.015, 'branco devia ficar quase neutro')

  const verde = [0.25, 0.55, 0.2]
  const v0 = codigoParaOklab(...verde)
  const v1 = codigoParaOklab(...look.aplicar(...verde))
  assert.ok(matiz(v1) < matiz(v0) - 5, 'verde devia girar para o amarelo')
  // o meio-tom mais claro abre um pouco a cor do verde; ele não pode gritar
  assert.ok(croma(v1) < croma(v0) * 1.1, 'verde ganhou croma demais')

  const pele = [0.78, 0.58, 0.47]
  const p0 = codigoParaOklab(...pele)
  const p1 = codigoParaOklab(...look.aplicar(...pele))
  // pele vai para o dourado, como no grade de produção estudado, sem virar verde
  assert.ok(matiz(p1) >= matiz(p0) && matiz(p1) < 80, `pele foi para ${matiz(p1).toFixed(0)}°`)
  // os outros looks continuam na base: pele no lugar e sombra fria no Petróleo
  const suave = criarRevelaLook({ look: 'suave' })
  assert.ok(Math.abs(matiz(codigoParaOklab(...suave.aplicar(...pele))) - matiz(p0)) < 8, 'Suave mudou a pele')
  assert.ok(codigoParaOklab(...criarRevelaLook({ look: 'petroleo' }).aplicar(0.12, 0.12, 0.12))[2] < 0, 'Petróleo perdeu a sombra fria')
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

test('looks da Revela: cinco, com ids e nomes únicos, cada um diferente dos outros', () => {
  assert.equal(LOOKS.length, 5)
  assert.equal(new Set(LOOKS.map((l) => l.id)).size, 5)
  assert.equal(new Set(LOOKS.map((l) => l.nome)).size, 5)
  const amostras = [
    [0.12, 0.12, 0.12],
    [0.5, 0.45, 0.4],
    [0.85, 0.85, 0.85],
    [0.2, 0.55, 0.3],
    [0.25, 0.35, 0.65],
  ]
  const saida = (id) => amostras.flatMap((c) => criarRevelaLook({ look: id }).aplicar(...c))
  for (const a of LOOKS)
    for (const b of LOOKS) {
      if (a.id >= b.id) continue
      const d = saida(a.id).reduce((s, v, i) => s + Math.abs(v - saida(b.id)[i]), 0) / (amostras.length * 3)
      assert.ok(d > 0.01, `${a.nome} e ${b.nome} estão iguais demais (${d.toFixed(4)})`)
    }
})

test('looks da Revela: cinza continua subindo, P&B sem cor, id desconhecido cai no Revela Look', () => {
  for (const l of LOOKS) {
    const look = criarRevelaLook({ look: l.id })
    let antes = -1
    for (let i = 0; i <= 20; i++) {
      const [L] = codigoParaOklab(...look.aplicar(i / 20, i / 20, i / 20))
      assert.ok(L > antes, `${l.nome}: cinza desce em ${i}`)
      antes = L
    }
  }
  const pb = criarRevelaLook({ look: 'pb' })
  for (const c of [
    [0.8, 0.2, 0.1],
    [0.1, 0.6, 0.3],
    [0.2, 0.3, 0.9],
  ])
    assert.ok(croma(codigoParaOklab(...pb.aplicar(...c))) < 0.004, `P&B com cor em ${c}`)
  assert.deepEqual(criarRevelaLook({ look: 'nao-existe' }).aplicar(0.4, 0.5, 0.6), criarRevelaLook().aplicar(0.4, 0.5, 0.6))
  assert.equal(criarRevelaLook({ look: 'petroleo' }).nome, 'Petróleo')
})
