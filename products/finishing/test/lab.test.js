import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AJUSTES, GRUPOS, analisarFrame, criarLab, escreverReceita, lerReceita } from '../src/cor/lab.js'
import { codigoParaOklab } from '../src/cor/oklab.js'

const distancia = (x, y) => Math.hypot(...x.map((v, i) => v - y[i]))

test('Lab: intensidade 0 sem ajustes devolve o still como veio (ida e volta da tela)', () => {
  const f = criarLab({ base: 'revela', intensidade: 0 }).aplicar
  for (const c of [
    [0.02, 0.02, 0.02],
    [0.5, 0.4, 0.3],
    [0.9, 0.9, 0.9],
    [0.2, 0.7, 0.9],
  ])
    assert.ok(distancia(f(...c), c) < 2e-3, `${c.join()} → ${f(...c).join()}`)
})

test('Lab: cada base tem nome, id único e muda o frame', () => {
  const ids = GRUPOS.flatMap((g) => g.looks.map((l) => l.id))
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(
    GRUPOS.map((g) => g.id),
    ['revela', 'pelicula', 'classicos'],
  )
  for (const id of ids) {
    const o = criarLab({ base: id }).aplicar(0.55, 0.45, 0.35)
    assert.ok(o.every((v) => v >= 0 && v <= 1))
    assert.ok(distancia(o, [0.55, 0.45, 0.35]) > 0.01, id)
  }
})

test('Lab: Luz sobe o meio-tom, Temperatura esquenta, Cor -100 vira cinza, Desbotar abre o preto', () => {
  const L = (c) => codigoParaOklab(...c)[0]
  const base = { base: 'revela', intensidade: 0 }
  const cinza = [0.4, 0.4, 0.4]
  assert.ok(L(criarLab({ ...base, ajustes: { luz: 100 } }).aplicar(...cinza)) > L(cinza) + 0.05)
  assert.ok(codigoParaOklab(...criarLab({ base: 'pb', intensidade: 1, ajustes: {} }).aplicar(...cinza))[2] < 0.005)
  const quente = codigoParaOklab(...criarLab({ ...base, intensidade: 1, base: 'suave', ajustes: { temperatura: 100 } }).aplicar(...cinza))
  const neutro = codigoParaOklab(...criarLab({ ...base, intensidade: 1, base: 'suave' }).aplicar(...cinza))
  assert.ok(quente[2] > neutro[2] + 0.01, 'Temperatura devia esquentar')
  const sem = criarLab({ base: 'suave', ajustes: { cor: -100 } }).aplicar(0.7, 0.3, 0.2)
  assert.ok(Math.max(...sem) - Math.min(...sem) < 0.02, sem.join())
  const preto = criarLab({ base: 'suave' }).aplicar(0, 0, 0)[1]
  assert.ok(criarLab({ base: 'suave', ajustes: { desbotar: 100 } }).aplicar(0, 0, 0)[1] > preto + 0.02)
})

test('Lab: Pele protegida devolve a cor da pele de antes do look', () => {
  const pele = [0.78, 0.58, 0.47]
  const antes = codigoParaOklab(...pele)
  const com = codigoParaOklab(...criarLab({ base: 'nordico', ajustes: { pele: 100 } }).aplicar(...pele))
  const sem = codigoParaOklab(...criarLab({ base: 'nordico' }).aplicar(...pele))
  const hue = (o) => Math.atan2(o[2], o[1])
  const croma = (o) => Math.hypot(o[1], o[2])
  assert.ok(Math.abs(croma(com) - croma(antes)) < Math.abs(croma(sem) - croma(antes)) || Math.abs(hue(com) - hue(antes)) < Math.abs(hue(sem) - hue(antes)))
})

test('Analisar e corrigir: frame escuro e azulado → sobe exposição e esquenta o branco', () => {
  const px = new Float32Array(3 * 4000)
  for (let i = 0; i < px.length; i += 3) {
    const v = 0.1 + ((i / 3) % 50) / 250
    px[i] = v * 0.9
    px[i + 1] = v
    px[i + 2] = v * 1.12
  }
  const c = analisarFrame(px, { passo: 1 })
  assert.ok(c.exposicao > 0.5, `exposição ${c.exposicao}`)
  assert.ok(c.ganhos && c.ganhos[0] > c.ganhos[2], 'branco devia esquentar')
  assert.match(c.leitura, /stop.*branco mais quente/)
  // corrigido, o cinza azulado do frame fica mais neutro
  const f = criarLab({ base: 'revela', intensidade: 0, correcao: c }).aplicar
  const [, a, b] = codigoParaOklab(...f(0.3 * 0.9, 0.3, 0.3 * 1.12))
  const [, a0, b0] = codigoParaOklab(0.3 * 0.9, 0.3, 0.3 * 1.12)
  assert.ok(Math.hypot(a, b) < Math.hypot(a0, b0))
})

test('Lab: frame em log de câmera entra pela câmera (S-Log3 cinza → cinza na tela)', () => {
  // cinza 18% em S-Log3 é o código 0,41; com o look neutro (intensidade 0) a tela mostra o cinza da curva (≈0,38)
  const o = criarLab({ base: 'revela', intensidade: 0, entrada: 'sony-slog3-cine' }).aplicar(0.41, 0.41, 0.41)
  assert.ok(Math.abs(o[0] - 0.383) < 0.02 && Math.max(...o) - Math.min(...o) < 0.01, o.join())
})

test('Receita .revela: ida e volta, valores fora do limite voltam para o limite, lixo é recusado, versão 1 abre', () => {
  const r = lerReceita(
    escreverReceita({ nome: 'Meu filme', entrada: 'arri-logc4', base: 'negativo-500t', intensidade: 0.8, ajustes: { calor: 60, luz: 999 } }),
  )
  assert.equal(r.nome, 'Meu filme')
  assert.equal(r.entrada, 'arri-logc4')
  assert.equal(r.base, 'negativo-500t')
  assert.equal(r.intensidade, 0.8)
  assert.equal(r.ajustes.calor, 60)
  assert.equal(r.ajustes.luz, 100)
  assert.equal(Object.keys(r.ajustes).length, AJUSTES.length)
  assert.equal(lerReceita(escreverReceita({ base: 'nao-existe' })).base, 'revela')
  assert.throws(() => lerReceita('{"a":1}'), /Não é uma receita/)
  assert.throws(() => lerReceita('oi'), /Não é uma receita/)
  assert.throws(() => lerReceita('{"revela":"lab","versao":99}'), /mais nova/)
  const v1 = lerReceita('{"revela":"lab","versao":1,"nome":"Antiga","base":"anos-70","correcao":{"exposicao":0.5,"branco":[0.01,0.02]},"ajustes":{"cor":20}}')
  assert.deepEqual([v1.base, v1.entrada, v1.ajustes.cor, v1.correcao.exposicao, v1.correcao.ganhos], ['anos-70', 'still', 20, 0.5, null])
})
