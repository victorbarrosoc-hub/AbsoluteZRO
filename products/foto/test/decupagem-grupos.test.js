// Decupagem · grupos: a cascata de repetidas e sequências sobre fotos fabricadas (datas, impressões digitais e vetores
// escritos à mão, com distâncias conhecidas), a escolha dentro do grupo e o empate declarado.

import test from 'node:test'
import assert from 'node:assert/strict'

import { agrupar, cosseno, escolherNoGrupo, instante, ligar, FOLGA_DE_NITIDEZ, LIMIARES_GRUPO, MARGEM_DE_ERRO } from '../src/decupagem/grupos.js'
import { hamming } from '../src/decupagem/medidas.js'

const BASE_D = 'a9496be891135c59'
const BASE_P = '1b06b7f8ba17488c'

/** Vira os `quantos` primeiros bits (a partir de `inicio`) de uma impressão de 64 bits. */
function virar(hex, quantos, inicio = 0) {
  const bits = [...hex].flatMap((d) => [...parseInt(d, 16).toString(2).padStart(4, '0')].map(Number))
  for (let i = 0; i < quantos; i++) bits[(inicio + i) % 64] ^= 1
  let saida = ''
  for (let i = 0; i < 64; i += 4) saida += parseInt(bits.slice(i, i + 4).join(''), 2).toString(16)
  return saida
}

/** Foto fabricada: `t` em segundos a partir das 10:00:00; `d` e `p` = bits de diferença para a impressão de base. */
function foto(id, t, { d = 0, p = d, inicio = 0, vetor, total, detalhe, semData = false } = {}) {
  const inteiro = Math.floor(t)
  const hora = `2026-03-07T10:${String(Math.floor(inteiro / 60)).padStart(2, '0')}:${String(inteiro % 60).padStart(2, '0')}`
  return {
    id,
    exif: semData ? {} : { data: hora, subsegundo: +(t - inteiro).toFixed(3) },
    medidas: { dhash: virar(BASE_D, d, inicio), phash: virar(BASE_P, p, inicio) },
    ...(vetor ? { vetor } : {}),
    ...(total != null ? { magnitude: { total, detalhe: detalhe ?? {} } } : {}),
  }
}

// vetor unitário de 8 dimensões com cosseno `c` em relação ao eixo 0 (em float32, como sai de um modelo: os casos
// usam valores afastados dos limiares para o arredondamento não decidir o teste)
const vetor = (c) => Float32Array.from([c, Math.sqrt(1 - c * c), 0, 0, 0, 0, 0, 0])
const EIXO = vetor(1)

test('apoio: virar bits dá a distância de Hamming pedida', () => {
  for (const k of [0, 1, 7, 10, 11, 20, 21, 40]) assert.equal(hamming(BASE_D, virar(BASE_D, k)), k)
})

test('instante: data da câmera mais a fração de segundo; sem data, null', () => {
  const a = instante({ exif: { data: '2026-03-07T10:00:00', subsegundo: 0.25 } })
  const b = instante({ exif: { data: '2026-03-07T10:00:01' } })
  assert.equal(b - a, 0.75)
  assert.equal(instante({ exif: { data: '2026-03-08T00:00:00' } }) - instante({ exif: { data: '2026-03-07T23:59:59' } }), 1, 'virada do dia')
  assert.equal(instante({ exif: {} }), null)
  assert.equal(instante({}), null)
  assert.equal(instante({ exif: { data: 'ontem' } }), null)
  // subsegundo fora da faixa é ignorado
  assert.equal(instante({ exif: { data: '2026-03-07T10:00:00', subsegundo: 37 } }), instante({ exif: { data: '2026-03-07T10:00:00' } }))
})

test('cosseno: vetores iguais, opostos, ortogonais e inválidos', () => {
  assert.equal(cosseno([1, 0], [1, 0]), 1)
  assert.equal(cosseno([1, 0], [0, 1]), 0)
  assert.equal(cosseno([1, 0], [-2, 0]), -1)
  assert.ok(Math.abs(cosseno(EIXO, vetor(0.9)) - 0.9) < 1e-6)
  assert.equal(cosseno([1, 0], [1, 0, 0]), null)
  assert.equal(cosseno(null, [1]), null)
  assert.equal(cosseno([0, 0], [1, 0]), null)
})

test('ligar: a regra de cada par da cascata', () => {
  const a = foto('a', 0)
  const par = (opcoes, dt) => ligar(a, foto('b', dt ?? 0, opcoes), dt)
  // 1. até 2 s e Hamming ≤ 10 em dHash OU pHash
  assert.equal(par({ d: 10, p: 30 }, 2), 'repetidas')
  assert.equal(par({ d: 30, p: 10 }, 0.2), 'repetidas')
  assert.equal(par({ d: 0, p: 0 }, 0), 'repetidas')
  // a mesma distância depois de 2 s não é mais rajada: sem vetor, é a mesma cena em outro instante
  assert.equal(par({ d: 10, p: 30 }, 2.5), 'sequencia')
  assert.equal(par({ d: 10, p: 30 }, 30), 'sequencia')
  assert.equal(par({ d: 10, p: 30 }, 30.5), null, 'passou de 30 s')
  // 2. zona cinza (11 a 20) em até 2 s: decide o vetor, com cosseno ≥ 0,90
  const com = (c) => ({ a: { ...a, vetor: EIXO }, v: vetor(c) })
  const cinza = (c, dt, d = 15, p = 18) => ligar(com(c).a, foto('b', dt, { d, p, vetor: com(c).v }), dt)
  assert.equal(cinza(0.93, 1), 'repetidas')
  assert.equal(cinza(0.905, 1), 'repetidas')
  assert.equal(cinza(0.88, 1), 'sequencia', 'zona cinza com cosseno entre 0,86 e 0,90: mesma cena, não repetida')
  assert.equal(cinza(0.8, 1), null)
  // 3. até 30 s: sequência com cosseno ≥ 0,86, qualquer que seja a impressão
  assert.equal(cinza(0.865, 20, 40, 40), 'sequencia')
  assert.equal(cinza(0.95, 20, 40, 40), 'sequencia')
  assert.equal(cinza(0.85, 20, 5, 5), null, 'com vetor, quem decide a sequência é o vetor')
  assert.equal(cinza(0.99, 31, 0, 0), null)
  // vetor não transforma em repetida o que passou da zona cinza
  assert.equal(cinza(0.97, 1, 21, 25), 'sequencia')
  // sem vetor, zona cinza em até 2 s só entra (como sequência) se as DUAS impressões estiverem na zona
  assert.equal(par({ d: 15, p: 18 }, 1), 'sequencia')
  assert.equal(par({ d: 15, p: 22 }, 1), null)
  assert.equal(par({ d: 21, p: 22 }, 1), null, 'fotos diferentes começam em 21')
  // sem data: só o quadro quase idêntico
  assert.equal(par({ d: 4, p: 9 }, null), 'repetidas')
  assert.equal(par({ d: 15, p: 15 }, null), null)
  // sem impressão digital não há como ligar
  assert.equal(ligar({ id: 'x', exif: {} }, { id: 'y', exif: {} }, 0.5), null)
  assert.deepEqual([LIMIARES_GRUPO.repetidaSegundos, LIMIARES_GRUPO.repetidaHamming, LIMIARES_GRUPO.cinzaHamming, LIMIARES_GRUPO.cinzaCosseno, LIMIARES_GRUPO.sequenciaSegundos, LIMIARES_GRUPO.sequenciaCosseno], [2, 10, 20, 0.9, 30, 0.86])
})

test('agrupar: uma rajada vira um grupo de repetidas; a foto diferente no meio fica de fora', () => {
  const fotos = [
    foto('r1', 0),
    foto('r2', 0.2, { d: 3 }),
    foto('outra', 0.3, { d: 34, inicio: 20 }),
    foto('r3', 0.4, { d: 6 }),
    foto('r4', 0.6, { d: 9 }),
    foto('longe', 50, { d: 2 }),
  ]
  const grupos = agrupar(fotos)
  assert.equal(grupos.length, 1)
  assert.deepEqual(grupos[0].fotos, ['r1', 'r2', 'r3', 'r4'])
  assert.equal(grupos[0].tipo, 'repetidas')
  assert.equal(grupos[0].id, 'grupo:r1', 'o id vem da foto mais antiga')
  assert.equal(grupos[0].escolhida, null, 'sem nota não se escolhe')
  assert.deepEqual(grupos[0].reservas, ['r1', 'r2', 'r3', 'r4'])
})

test('agrupar: ordena por data e fração de segundo, venham as fotos na ordem que vierem', () => {
  const fotos = [foto('c', 1.1, { d: 4 }), foto('a', 0.3), foto('b', 0.7, { d: 2 })]
  const [g] = agrupar(fotos)
  assert.deepEqual(g.fotos, ['a', 'b', 'c'])
  assert.equal(g.id, 'grupo:a')
  // a fração de segundo separa quadros do mesmo segundo
  const mesmoSegundo = agrupar([foto('y', 5.9, { d: 3 }), foto('x', 5.1)])
  assert.deepEqual(mesmoSegundo[0].fotos, ['x', 'y'])
})

test('agrupar: união de conjuntos junta a cadeia (A com B, B com C) mesmo se A e C sozinhas não ligariam', () => {
  // a rajada vai andando: cada quadro está a 8 bits do anterior, mas o primeiro e o último a 24
  const fotos = [foto('a', 0), foto('b', 0.5, { d: 8 }), foto('c', 1, { d: 16 }), foto('d', 1.5, { d: 24 })]
  assert.equal(ligar(fotos[0], fotos[3], 1.5), null)
  const [g] = agrupar(fotos)
  assert.deepEqual(g.fotos, ['a', 'b', 'c', 'd'])
  assert.equal(g.tipo, 'repetidas')
})

test('agrupar: sequência é a mesma cena em até 30 s, decidida pelo vetor; grupo com ligação de sequência é sequência', () => {
  const fotos = [
    foto('s1', 0, { vetor: EIXO }),
    foto('s2', 0.3, { d: 5, vetor: vetor(0.98) }), // repetida de s1
    foto('s3', 12, { d: 40, vetor: vetor(0.9) }), // outro instante da mesma cena
    foto('s4', 28, { d: 45, inicio: 10, vetor: vetor(0.87) }),
    foto('s5', 45, { d: 45, inicio: 10, vetor: vetor(0.87) }), // 17 s depois de s4, mesmo vetor: entra pela cadeia
    foto('nada', 50, { d: 30, inicio: 40, vetor: Float32Array.from([0, 0, 1, 0, 0, 0, 0, 0]) }),
  ]
  const grupos = agrupar(fotos)
  assert.equal(grupos.length, 1)
  assert.deepEqual(grupos[0].fotos, ['s1', 's2', 's3', 's4', 's5'])
  assert.equal(grupos[0].tipo, 'sequencia')
  // só as duas primeiras: repetidas
  assert.equal(agrupar(fotos.slice(0, 2))[0].tipo, 'repetidas')
  // sem vetor a mesma lista é mais conservadora: só a rajada
  const semVetor = agrupar(fotos.map(({ vetor: _, ...f }) => f))
  assert.deepEqual(semVetor.map((g) => g.fotos), [['s1', 's2'], ['s4', 's5']])
})

test('agrupar: zona cinza em rajada vira repetida com o vetor; sem ele, vira sequência', () => {
  const comVetor = agrupar([foto('a', 0, { vetor: EIXO }), foto('b', 0.5, { d: 14, p: 16, vetor: vetor(0.94) })])
  assert.equal(comVetor[0].tipo, 'repetidas')
  const sem = agrupar([foto('a', 0), foto('b', 0.5, { d: 14, p: 16 })])
  assert.equal(sem[0].tipo, 'sequencia')
  const diferente = agrupar([foto('a', 0, { vetor: EIXO }), foto('b', 0.5, { d: 14, p: 16, vetor: vetor(0.5) })])
  assert.deepEqual(diferente, [])
})

test('agrupar: fotos sem data vão para o fim e só ligam com a vizinha quase idêntica', () => {
  const fotos = [foto('x1', 0, { semData: true }), foto('d1', 3), foto('x2', 0, { semData: true, d: 4 }), foto('x3', 0, { semData: true, d: 30, inicio: 30 }), foto('d2', 3.5, { d: 2 })]
  const grupos = agrupar(fotos)
  assert.deepEqual(grupos.map((g) => g.fotos), [['d1', 'd2'], ['x1', 'x2']])
  // foto com data nunca liga com foto sem data, por mais parecida
  assert.deepEqual(agrupar([foto('a', 1), foto('b', 0, { semData: true })]), [])
})

test('agrupar: lista vazia, uma foto só e entrada torta não dão grupo nem erro', () => {
  assert.deepEqual(agrupar([]), [])
  assert.deepEqual(agrupar(undefined), [])
  assert.deepEqual(agrupar([foto('a', 0)]), [])
  assert.deepEqual(agrupar([{ id: 'sem-nada' }, { id: 'tambem' }]), [])
})

test('agrupar: 3.000 fotos em rajadas agrupam depressa', (t) => {
  const fotos = []
  for (let i = 0; i < 3000; i++) {
    const cena = Math.floor(i / 6)
    // cada cena: 6 quadros em 1,5 s, a 40 s da cena seguinte; cenas diferentes ficam a 32 bits (blocos diferentes)
    fotos.push(foto(`f${i}`, cena * 40 + (i % 6) * 0.3, { d: (i % 6) + 32 * (cena % 2), inicio: (cena * 7) % 64 }))
  }
  const t0 = performance.now()
  const grupos = agrupar(fotos)
  const ms = performance.now() - t0
  t.diagnostic(`agrupar 3.000 fotos: ${ms.toFixed(1)} ms, ${grupos.length} grupos`)
  assert.equal(grupos.length, 500)
  assert.ok(grupos.every((g) => g.fotos.length === 6 && g.tipo === 'repetidas'))
  assert.ok(ms < 1500, `${ms} ms`)
})

// ───────────────────────────── a escolhida e o empate ─────────────────────────────

test('escolha: a de maior nota é a escolhida e as outras são reserva', () => {
  const r = escolherNoGrupo([foto('a', 0, { total: 71 }), foto('b', 1, { total: 88 }), foto('c', 2, { total: 64 })])
  assert.deepEqual(r, { escolhida: 'b', reservas: ['a', 'c'], equivalentes: [], desempate: null })
  const grupos = agrupar([foto('a', 0, { total: 71 }), foto('b', 0.4, { d: 3, total: 88 }), foto('c', 0.8, { d: 5, total: 64 })])
  assert.equal(grupos[0].escolhida, 'b')
  assert.deepEqual(grupos[0].reservas, ['a', 'c'])
  assert.deepEqual(grupos[0].equivalentes, [])
})

test('empate: diferença dentro da margem de erro é declarada "equivalentes", com desempate fixo', () => {
  assert.equal(MARGEM_DE_ERRO, 5)
  const d = (olhos, expressao, qFoco) => ({ olhos, expressao, qFoco })
  // 88, 86 e 84 estão a menos de 5 pontos da maior; 80 não
  const fotos = [
    foto('a', 0, { total: 86, detalhe: d(1, 0.6, 0.8) }),
    foto('b', 1, { total: 88, detalhe: d(0.5, 0.9, 0.9) }),
    foto('c', 2, { total: 84, detalhe: d(1, 0.8, 0.7) }),
    foto('d', 3, { total: 80, detalhe: d(1, 1, 1) }),
  ]
  const r = escolherNoGrupo(fotos)
  assert.deepEqual(r.equivalentes, ['a', 'b', 'c'])
  // 1º os olhos: b (piscando) sai; 2º a expressão: c (0,8) ganha de a (0,6)
  assert.equal(r.escolhida, 'c')
  assert.equal(r.desempate, 'expressao')
  assert.deepEqual(r.reservas, ['a', 'b', 'd'])
})

test('empate: a ordem fixa é olhos, depois expressão, depois nitidez, depois a captura', () => {
  const d = (olhos, expressao, qFoco) => ({ olhos, expressao, qFoco })
  const par = (da, db) => escolherNoGrupo([foto('a', 0, { total: 80, detalhe: da }), foto('b', 1, { total: 82, detalhe: db })])
  assert.deepEqual([par(d(1, 0.5, 0.7), d(0, 1, 0.9)).escolhida, par(d(1, 0.5, 0.7), d(0, 1, 0.9)).desempate], ['a', 'olhos'])
  assert.deepEqual([par(d(1, 0.9, 0.7), d(1, 0.6, 0.9)).escolhida, par(d(1, 0.9, 0.7), d(1, 0.6, 0.9)).desempate], ['a', 'expressao'])
  assert.deepEqual([par(d(1, 0.7, 0.8), d(1, 0.72, 0.7)).escolhida, par(d(1, 0.7, 0.8), d(1, 0.72, 0.7)).desempate], ['a', 'nitidez'])
  // nada separa (diferenças menores que a folga de cada critério): fica a primeira na ordem de captura
  const igual = par(d(1, 0.7, 0.8), d(1, 0.72, 0.8 + FOLGA_DE_NITIDEZ / 2))
  assert.deepEqual([igual.escolhida, igual.desempate], ['a', 'ordem'])
  // sem rosto (olhos e expressão null) o desempate cai direto na nitidez
  const semGente = par(d(null, null, 0.72), d(null, null, 0.8))
  assert.deepEqual([semGente.escolhida, semGente.desempate], ['b', 'nitidez'])
  // sem detalhe nenhum: ordem de captura
  const semDetalhe = escolherNoGrupo([foto('a', 0, { total: 80 }), foto('b', 1, { total: 82 })])
  assert.deepEqual([semDetalhe.escolhida, semDetalhe.desempate, semDetalhe.equivalentes], ['a', 'ordem', ['a', 'b']])
})

test('empate: fora da margem não há empate, por menor que seja a folga', () => {
  const r = escolherNoGrupo([foto('a', 0, { total: 80, detalhe: { olhos: 1 } }), foto('b', 1, { total: 85, detalhe: { olhos: 0 } })])
  assert.deepEqual(r, { escolhida: 'b', reservas: ['a'], equivalentes: [], desempate: null })
  // a margem é parâmetro
  assert.equal(escolherNoGrupo([foto('a', 0, { total: 80, detalhe: { olhos: 1 } }), foto('b', 1, { total: 85, detalhe: { olhos: 0 } })], { margem: 6 }).escolhida, 'a')
})

test('escolha: grupo com foto sem nota não escolhe ninguém', () => {
  const r = escolherNoGrupo([foto('a', 0, { total: 80 }), foto('b', 1)])
  assert.deepEqual(r, { escolhida: null, reservas: ['a', 'b'], equivalentes: [], desempate: null })
})
