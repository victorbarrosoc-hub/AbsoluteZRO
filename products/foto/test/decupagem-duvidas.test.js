// Decupagem · fila de dúvidas (src/decupagem/duvidas.js). Um ensaio fabricado com casos claros (nítida e certa,
// borrada com teto, reserva de um momento que já tem escolhida) e casos duvidosos (nota no limite, certeza baixa,
// empate, pessoa-chave em Fora, única do momento em Talvez, a única de uma pessoa): só os duvidosos entram, na ordem.

import test from 'node:test'
import assert from 'node:assert/strict'

import { filaDeDuvidas, FILA } from '../src/decupagem/duvidas.js'
import { avaliarEnsaio, RIGORES } from '../src/decupagem/nota.js'
import { protegerPessoas } from '../src/decupagem/pessoas.js'
import { DUVIDAS } from '../src/decupagem/textos.js'
import { medidas, rosto } from './apoio-magnitude.js'

/** Uma Magnitude pronta, sem passar pela nota (para escolher cada caso de propósito). */
function mg(total, { balde, confianca = 'alta', tetos = [], protegida = false, motivos = ['Nítida'] } = {}) {
  const c = RIGORES.equilibrado
  return {
    total,
    estrelas: 3,
    balde: balde ?? (total >= c.fica ? 'fica' : total < c.fora ? 'fora' : 'talvez'),
    motivos,
    componentes: { foco: total, pessoas: null, exposicao: 100, ruido: 100 },
    confianca,
    incertezas: [],
    dicas: [],
    detalhe: { tetos, protegida },
  }
}

const ensaio = () => [
  // claras
  { id: 'clara-fica', magnitude: mg(92) },
  { id: 'clara-fora', magnitude: mg(30, { tetos: ['foraDeFoco'] }) },
  { id: 'clara-talvez', magnitude: mg(55) },
  { id: 'reserva-fora', magnitude: mg(20, { tetos: ['olhosFechados'] }), rostos: [rosto()], grupo: 'g1' },
  { id: 'escolhida-g1', magnitude: mg(88), grupo: 'g1', escolha: { escolhida: true, equivalentes: 0 } },
  { id: 'ja-marcada', magnitude: mg(71), marca: 'escolhida' },
  { id: 'teto-no-limite', magnitude: mg(40, { balde: 'talvez', tetos: ['olhosFechados'] }) },
  // duvidosas
  { id: 'limite-fica', magnitude: mg(71) },
  { id: 'limite-fora', magnitude: mg(38) },
  { id: 'certeza', magnitude: mg(60, { confianca: 'baixa' }) },
  { id: 'empate', magnitude: mg(84), grupo: 'g2', escolha: { escolhida: true, equivalentes: 3 } },
  { id: 'empate-reserva', magnitude: mg(83), grupo: 'g2', escolha: { escolhida: false, equivalentes: 3 } },
  { id: 'chave-fora', magnitude: mg(25, { tetos: ['olhosFechados'] }), rostos: [rosto({ olhos: 'fechados' })] },
  { id: 'unica', magnitude: mg(30, { balde: 'talvez', tetos: ['foraDeFoco'], protegida: true }) },
]

test('só os casos duvidosos entram; o que já foi marcado e o que é claro ficam de fora', () => {
  const fila = filaDeDuvidas(ensaio())
  const ids = fila.map((d) => d.id).sort()
  assert.deepEqual(ids, ['certeza', 'chave-fora', 'empate', 'limite-fica', 'limite-fora', 'unica'].sort())
  for (const d of fila) assert.ok(d.texto && d.motivos.length && ['fica', 'fora'].includes(d.sugestao), JSON.stringify(d))
})

test('ordem por importância: pessoa-chave em Fora, única do momento, empate, limite (o mais perto antes), certeza', () => {
  const fila = filaDeDuvidas(ensaio())
  assert.deepEqual(
    fila.map((d) => d.id),
    ['chave-fora', 'unica', 'empate', 'limite-fica', 'limite-fora', 'certeza'],
  )
  const porId = Object.fromEntries(fila.map((d) => [d.id, d]))
  assert.equal(porId['chave-fora'].texto, DUVIDAS.chaveFora())
  assert.equal(porId['chave-fora'].sugestao, 'fora')
  assert.equal(porId.unica.sugestao, 'fica', 'a protegida sugere ficar: tirar é decisão da pessoa')
  assert.equal(porId['limite-fica'].sugestao, 'fica')
  assert.equal(porId['limite-fora'].sugestao, 'fora')
  assert.equal(porId.empate.texto, DUVIDAS.empate(3))
})

test('a fila encolhe quando a pessoa responde, e chega a zero', () => {
  let fotos = ensaio()
  let n = filaDeDuvidas(fotos).length
  while (n) {
    const [primeira] = filaDeDuvidas(fotos)
    fotos = fotos.map((f) => (f.id === primeira.id ? { ...f, marca: primeira.sugestao === 'fica' ? 'escolhida' : 'rejeitada' } : f))
    const agora = filaDeDuvidas(fotos).length
    assert.equal(agora, n - 1)
    n = agora
  }
})

test('o rigor muda o que está no limite; a fila é curta (máximo)', () => {
  const fotos = Array.from({ length: 200 }, (_, i) => ({ id: `f${i}`, magnitude: mg(60 + (i % 25)) }))
  const equilibrado = filaDeDuvidas(fotos)
  assert.ok(equilibrado.length <= FILA.maximo)
  assert.ok(equilibrado.every((d) => Math.abs(d.distancia) < FILA.limite))
  const estrito = filaDeDuvidas(fotos, { rigor: 'estrito', maximo: 1000 })
  for (const d of estrito) assert.ok(Math.abs(fotos.find((f) => f.id === d.id).magnitude.total - RIGORES.estrito.fica) < FILA.limite || Math.abs(fotos.find((f) => f.id === d.id).magnitude.total - RIGORES.estrito.fora) < FILA.limite)
})

test('pessoa-chave cujas fotos caíram todas em Fora: a melhor sobe a Talvez e encabeça a fila', () => {
  const fotos = [
    { id: 'a', medidas: medidas({ q: 0.5 }), rostos: [rosto({ x: 100, nitidez: 0.5 })], exif: { data: '2026-11-13T10:00:00' } },
    { id: 'b', medidas: medidas({ q: 0.45, dhash: 'ffffffffffffffff', phash: 'ffffffffffffffff' }), rostos: [rosto({ x: 300, nitidez: 0.45 })], exif: { data: '2026-11-13T11:00:00' } },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, medidas: medidas({ q: 0.86 }), rostos: [], exif: { data: `2026-11-13T12:${String(i).padStart(2, '0')}:00` } })),
  ]
  // as duas da tia são de momentos diferentes: cada uma sozinha já subiria pela cobertura do momento; num grupo só
  // (a mesma cena), a cobertura do momento sobe uma, e a da pessoa garante que é a melhor dela
  const r = avaliarEnsaio(fotos, { grupos: [{ id: 'g', fotos: ['a', 'b'], tipo: 'sequencia' }] })
  const pessoas = [{ id: 'p1', fotos: ['a', 'b'], chave: true }]
  const magnitudes = protegerPessoas(r.magnitudes, pessoas)
  const catalogo = fotos.map((f) => ({ ...f, grupo: ['a', 'b'].includes(f.id) ? 'g' : undefined, magnitude: magnitudes.get(f.id) }))
  const fila = filaDeDuvidas(catalogo, { pessoas })
  const daTia = fila.filter((d) => ['a', 'b'].includes(d.id))
  assert.equal(daTia.length >= 1, true, JSON.stringify(fila))
  assert.equal(fila[0].id, 'a', 'a melhor da pessoa vem primeiro')
  assert.ok(fila[0].motivos.includes('pessoa-sozinha'), JSON.stringify(fila[0]))
})
