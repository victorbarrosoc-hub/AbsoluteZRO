// Decupagem · agrupar por pessoa (src/decupagem/pessoas.js), só com vetores FABRICADOS: cada "pessoa" é uma semente,
// e os rostos dela são vetores com cosseno escolhido em torno dela (0,55 a 0,8, a faixa medida em fotos reais para a
// mesma pessoa de frente). Pessoas diferentes ficam perto de 0 entre si (até 0,2). Nada de rosto de verdade aqui: a
// prova com fotos reais roda fora da suíte e só deixa números.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  agruparPessoas,
  chaveDosRostos,
  coberturaDe,
  LIMIARES_PESSOA,
  manterIds,
  protegerPessoas,
  rostoBom,
  rostoParaAssinar,
  rostosDoEnsaio,
} from '../src/decupagem/pessoas.js'
import { avaliarEnsaio, meta } from '../src/decupagem/nota.js'
import { cosseno } from '../src/decupagem/grupos.js'
import { MOTIVOS } from '../src/decupagem/textos.js'
import { int8, medidas, rosto, vetorBase, vetorPerto } from './apoio-magnitude.js'

const PESSOAS = { noiva: vetorBase(11), noivo: vetorBase(22), tia: vetorBase(33), padrinho: vetorBase(44) }

/** Um rosto de entrada de agruparPessoas. */
const r = (foto, i, pessoa, cos, semente, extra = {}) => ({
  foto,
  i,
  v: vetorPerto(PESSOAS[pessoa], cos, semente),
  largura: 120,
  bom: true,
  chave: true,
  peso: 0.1,
  quem: pessoa,
  ...extra,
})

function ensaioFabricado() {
  const rostos = []
  let s = 100
  // noiva em 12 fotos, noivo em 9 (7 com a noiva), padrinho em 4, tia em 1
  for (let f = 0; f < 12; f++) rostos.push(r(`f${f}`, 0, 'noiva', 0.55 + (f % 6) * 0.05, s++))
  for (let f = 0; f < 9; f++) rostos.push(r(`f${f < 7 ? f : 20 + f}`, 1, 'noivo', 0.55 + (f % 5) * 0.06, s++))
  for (let f = 0; f < 4; f++) rostos.push(r(`f${30 + f}`, 0, 'padrinho', 0.6 + f * 0.04, s++))
  rostos.push(r('f40', 0, 'tia', 0.7, s++))
  // rostos fracos: pequenos e de perfil (não entram no centroide)
  rostos.push(r('f41', 0, 'noiva', 0.62, s++, { bom: false, largura: 40 }))
  rostos.push(r('f42', 0, 'padrinho', 0.3, s++, { bom: false, largura: 50 })) // perfil, longe demais: fica solto
  return rostos
}

test('os vetores fabricados têm a forma da pesquisa: mesma pessoa 0,55–0,8 com a base, pessoas diferentes perto de 0', () => {
  const v = vetorPerto(PESSOAS.noiva, 0.7, 5)
  assert.ok(Math.abs(cosseno(v, PESSOAS.noiva) - 0.7) < 1e-4)
  for (const a of Object.keys(PESSOAS))
    for (const b of Object.keys(PESSOAS)) if (a < b) assert.ok(Math.abs(cosseno(PESSOAS[a], PESSOAS[b])) < 0.25, `${a}×${b}`)
})

test('agrupar: uma pessoa por grupo, ninguém junto de outro, dois rostos da mesma foto nunca na mesma pessoa', () => {
  const rostos = ensaioFabricado()
  const { pessoas, soltos } = agruparPessoas(rostos)
  assert.equal(pessoas.length, 4, JSON.stringify(pessoas.map((p) => p.fotos.length)))
  const quem = new Map(rostos.map((x) => [`${x.foto}|${x.i}`, x.quem]))
  for (const p of pessoas) {
    const nomes = new Set(p.rostos.map((x) => quem.get(`${x.foto}|${x.i}`)))
    assert.equal(nomes.size, 1, `grupo misturado: ${[...nomes]}`)
    assert.equal(new Set(p.rostos.map((x) => x.foto)).size, p.rostos.length, 'duas vezes a mesma foto')
  }
  assert.deepEqual(
    pessoas.map((p) => p.fotos.length),
    [13, 9, 4, 1],
  )
  assert.equal(soltos, 1, 'o perfil distante fica solto')
  assert.equal(pessoas[0].capa.foto !== 'f41', true, 'a capa é um rosto bom')
  assert.deepEqual(
    pessoas.map((p) => p.id),
    ['p1', 'p2', 'p3', 'p4'],
  )
})

test('rosto fraco não cria pessoa nem mexe no centroide; grupos parecidos se fundem no fim', () => {
  const so = agruparPessoas([r('a', 0, 'tia', 0.9, 1, { bom: false })])
  assert.equal(so.pessoas.length, 0)
  assert.equal(so.soltos, 1)
  // dois rostos bons da mesma pessoa, com 0,42 entre si: entram separados (régua 0,40 contra o centroide de um só rosto
  // pode falhar) e a fusão de 0,45 junta os centroides que convergiram
  const base = PESSOAS.noivo
  const rostos = [r('a', 0, 'noivo', 0.62, 7), r('b', 0, 'noivo', 0.62, 8), r('c', 0, 'noivo', 0.8, 9), r('d', 0, 'noivo', 0.8, 10)]
  const { pessoas } = agruparPessoas(rostos)
  assert.equal(pessoas.length, 1)
  assert.ok(cosseno(pessoas[0].centroide, base) > 0.85)
  // nunca funde duas pessoas que aparecem na mesma foto
  const juntos = agruparPessoas([r('x', 0, 'noiva', 0.9, 1), r('x', 1, 'noiva', 0.9, 2)])
  assert.equal(juntos.pessoas.length, 2)
})

test('rostoBom: 60 px, nítido, olho visível, de frente e não colado', () => {
  const ok = rosto({ largura: 80 })
  assert.equal(rostoBom(ok, [ok]), true)
  assert.equal(rostoBom(rosto({ largura: 50 })), false)
  assert.equal(rostoBom(rosto({ nitidez: 0.5 })), false)
  assert.equal(rostoBom(rosto({ olhos: 'fechados' })), false)
  assert.equal(rostoBom(rosto({ olhos: null })), false)
  assert.equal(rostoBom(rosto({ guinada: 45 })), false)
  assert.equal(rostoBom(rosto({ duvidoso: true })), false)
  const a = rosto({ x: 100, largura: 100 })
  const b = rosto({ x: 150, largura: 100 })
  assert.equal(rostoBom(a, [a, b]), false, 'colado (beijo)')
  assert.equal(LIMIARES_PESSOA.juntar, 0.4)
  assert.equal(LIMIARES_PESSOA.fundir, 0.45)
})

test('rostoParaAssinar e rostosDoEnsaio: só rosto de 24 px ou mais, e assinatura de outra leitura não vale', () => {
  const foto = { id: 'f', rostos: [rosto({ largura: 20 }), rosto({ largura: 90 }), rosto({ largura: 40, duvidoso: true })] }
  assert.deepEqual(
    rostoParaAssinar(foto).map((x) => x.i),
    [1],
  )
  const v = int8(vetorPerto(PESSOAS.tia, 0.7, 3))
  const certa = { f: { chave: chaveDosRostos(foto.rostos), rostos: [{ i: 1, v }] } }
  const lidos = rostosDoEnsaio([foto], certa)
  assert.equal(lidos.length, 1)
  assert.ok(Math.abs(cosseno(lidos[0].v, PESSOAS.tia) - 0.7) < 0.02, 'int8 guarda o vetor')
  assert.equal(rostosDoEnsaio([foto], { f: { chave: 'outra', rostos: [{ i: 1, v }] } }).length, 0)
})

test('manterIds: o grupo de agora herda id e nome do de antes; o novo ganha id depois do maior', () => {
  const { pessoas } = agruparPessoas(ensaioFabricado())
  const antes = manterIds(pessoas, [])
  const nomeado = antes.map((p, k) => ({ id: p.id, nome: k === 3 ? 'Tia' : null, rostos: p.rostos.map((x) => `${x.foto}|${x.i}`) }))
  // na rodada seguinte entra um rosto novo da noiva e a ordem muda
  const mais = [...ensaioFabricado(), r('f50', 0, 'noiva', 0.7, 999)]
  const depois = manterIds(agruparPessoas(mais).pessoas.reverse(), nomeado)
  const tia = depois.find((p) => p.fotos.includes('f40'))
  assert.equal(tia.nome, 'Tia')
  assert.equal(tia.id, antes[3].id)
  const novo = manterIds([...agruparPessoas(mais).pessoas, { rostos: [{ foto: 'zz', i: 0 }], fotos: ['zz'] }], nomeado)
  assert.equal(novo.at(-1).id, 'p5')
})

test('cobertura por pessoa: a única foto da tia não vai para Fora sozinha; a meta garante uma de cada pessoa-chave', () => {
  const fotos = Array.from({ length: 20 }, (_, i) => ({
    id: `f${i}`,
    medidas: medidas({ q: i === 7 ? 0.45 : 0.85 - (i % 5) * 0.02 }),
    rostos: [rosto({ nitidez: i === 7 ? 0.45 : 0.85 })],
    exif: { data: `2026-11-13T10:${String(i).padStart(2, '0')}:00` },
  }))
  // a f7 (borrada, a única da tia) está num momento com a f8: a cobertura do momento não a salva (a f8 fica)
  const r0 = avaliarEnsaio(fotos, { grupos: [{ id: 'g', fotos: ['f7', 'f8'], tipo: 'sequencia' }] })
  assert.equal(r0.magnitudes.get('f7').balde, 'fora')
  const pessoas = [
    { id: 'p1', fotos: fotos.filter((f) => f.id !== 'f7').map((f) => f.id), chave: true },
    { id: 'p2', fotos: ['f7'], chave: true },
  ]
  const m = protegerPessoas(r0.magnitudes, pessoas)
  assert.equal(m.get('f7').balde, 'talvez')
  assert.equal(m.get('f7').motivos[0], MOTIVOS.unicaDaPessoa())
  assert.equal(m.get('f7').total, r0.magnitudes.get('f7').total, 'a nota não muda')
  const fotoDe = (id) => ({ id, magnitude: m.get(id) })
  assert.deepEqual(coberturaDe(pessoas[1], fotoDe), { fotos: 1, boas: 0, protegida: true })
  // meta de 5: sem pessoas, a f7 não entra; com pessoas, entra garantida
  const lista = fotos.map((f) => ({ id: f.id, magnitude: m.get(f.id) }))
  assert.equal(meta(lista, 5).ficam.includes('f7'), false)
  const comPessoas = meta(lista, 5, { pessoas })
  assert.equal(comPessoas.ficam.length, 5)
  assert.ok(comPessoas.ficam.includes('f7'))
  assert.deepEqual(comPessoas.garantidas.sort(), ['f0', 'f7'].sort())
  // pessoa que não é chave (só aparece no fundo) não é protegida
  const fundo = protegerPessoas(r0.magnitudes, [{ id: 'p3', fotos: ['f7'], chave: false }])
  assert.equal(fundo.get('f7').balde, 'fora')
})
