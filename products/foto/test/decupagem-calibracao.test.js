// Decupagem · calibração em 30 segundos (src/decupagem/calibracao.js) e os limiares da pessoa na nota
// (src/decupagem/nota.js). Respostas fabricadas mudam o limiar no sentido certo, respeitando o limite; respostas
// contraditórias não mexem; as perguntas saem perto dos cortes; e cada limiar muda o balde de verdade.

import test from 'node:test'
import assert from 'node:assert/strict'

import { ajustarLimiares, cortes, earDaFoto, explicarLimiares, medidaDe, perguntas } from '../src/decupagem/calibracao.js'
import {
  avaliar,
  avaliarEnsaio,
  calibrar,
  corteDeFoco,
  excessoDeExposicao,
  limiaresMexidos,
  limiaresPadrao,
  normalizarLimiares,
  olhosComLimiar,
  PARAMETROS,
  pesosPadrao,
} from '../src/decupagem/nota.js'
import { LIMIARES_ROSTO } from '../src/decupagem/rostos.js'
import { CALIBRACAO } from '../src/decupagem/textos.js'
import { medidas, rosto } from './apoio-magnitude.js'

const PADRAO = limiaresPadrao()
const corteQ = corteDeFoco(null, PADRAO)

test('limiares: padrão não mexe, valores fora do limite são presos, lixo vira o padrão', () => {
  assert.deepEqual(normalizarLimiares(undefined), PADRAO)
  assert.deepEqual(normalizarLimiares({ nitidez: 1, olhos: -1, exposicao: 99 }), { nitidez: 0.05, olhos: -0.04, exposicao: 4 })
  assert.deepEqual(normalizarLimiares({ nitidez: 'x', olhos: NaN }), PADRAO)
  assert.equal(limiaresMexidos(PADRAO), false)
  assert.equal(limiaresMexidos({ olhos: 0.01 }), true)
  // o corte de foco de fábrica é onde o componente cruza 35: 0,52 + 0,35 × (0,75 − 0,52)
  assert.ok(Math.abs(corteQ - (PARAMETROS.qPiso + 0.35 * (PARAMETROS.qTopo - PARAMETROS.qPiso))) < 1e-9)
})

test('cada limiar muda a nota no sentido certo', () => {
  // nitidez: q um pouco abaixo do corte leva teto; com o limiar −0,02, passa
  const borrada = { medidas: medidas({ q: corteQ - 0.01 }), rostos: [] }
  assert.ok(avaliar(borrada).detalhe.tetos.includes('foraDeFoco'))
  assert.ok(!avaliar(borrada, { limiares: { nitidez: -0.02 } }).detalhe.tetos.includes('foraDeFoco'))
  // olhos: EAR 0,16 é "parcial" de fábrica; exigente (+0,02) vira fechado, com teto
  const semi = { medidas: medidas(), rostos: [rosto({ olhos: 'parcial', ear: 0.16 })] }
  assert.equal(olhosComLimiar(semi.rostos[0], 0), 'parcial')
  assert.equal(olhosComLimiar(semi.rostos[0], 0.02), 'fechados')
  assert.ok(avaliar(semi, { limiares: { olhos: 0.02 } }).detalhe.tetos.includes('olhosFechados'))
  // tolerante (−0,04): EAR 0,13 fechado vira parcial; riso forte segue riso
  assert.equal(olhosComLimiar({ ...rosto({ olhos: 'fechados', ear: 0.13 }), piscada: 0.3 }, -0.04), 'parcial')
  assert.equal(olhosComLimiar(rosto({ olhos: 'fechados', ear: 0.13 }), -0.04), 'fechados', 'a piscada do blendshape ainda decide na faixa de dúvida')
  assert.equal(olhosComLimiar({ ...rosto({ olhos: 'sorrindo', ear: 0.1 }), sorriso: 0.9 }, 0.04), 'sorrindo')
  // exposição: 3% estourado desconta; com folga 4, não
  const clara = { medidas: medidas({ altas: 0.03 }), rostos: [], tipo: 'imagem' }
  assert.equal(excessoDeExposicao(clara), 3)
  assert.ok(avaliar(clara).componentes.exposicao < 100)
  assert.equal(avaliar(clara, { limiares: { exposicao: 4 } }).componentes.exposicao, 100)
})

const serve = (dimensao, valor, s) => ({ tipo: 'serve', dimensao, valor, serve: s })

test('respostas fabricadas mudam o limiar no sentido certo, até o limite', () => {
  // aceitou uma foto abaixo do corte de foco → o corte desce (limiar negativo, mais tolerante)
  let r = ajustarLimiares(PADRAO, [serve('nitidez', corteQ - 0.02, true)])
  assert.ok(r.limiares.nitidez < 0 && r.limiares.nitidez >= -0.05, JSON.stringify(r.limiares))
  assert.deepEqual(r.mudou, ['nitidez'])
  assert.match(r.explicacao[0], /mais suave/)
  // recusou uma acima do corte → sobe (mais exigente); aceitou outra ainda mais acima → o corte fica entre as duas
  r = ajustarLimiares(PADRAO, [serve('nitidez', corteQ + 0.02, false), serve('nitidez', corteQ + 0.04, true)])
  assert.ok(Math.abs(r.limiares.nitidez - 0.03) < 1e-3, JSON.stringify(r.limiares))
  // olhos: recusou EAR 0,17 (semicerrado) → o corte de olho fechado passa de 0,17
  r = ajustarLimiares(PADRAO, [serve('olhos', 0.17, false)])
  assert.ok(LIMIARES_ROSTO.earFechado + r.limiares.olhos > 0.17, JSON.stringify(r.limiares))
  assert.match(r.explicacao[0], /mais exigente/)
  // aceitou EAR 0,13 → mais tolerante
  r = ajustarLimiares(PADRAO, [serve('olhos', 0.13, true)])
  assert.ok(r.limiares.olhos < 0)
  // exposição: aceitou 2,5× a tolerância e recusou 6× → k entre os dois (média geométrica)
  r = ajustarLimiares(PADRAO, [serve('exposicao', 2.5, true), serve('exposicao', 6, false)])
  assert.ok(Math.abs(r.limiares.exposicao - Math.sqrt(15)) < 0.01, JSON.stringify(r.limiares))
  assert.match(r.explicacao[0], /tolera mais/)
  // recusou 0,8× → mais contida
  r = ajustarLimiares(PADRAO, [serve('exposicao', 0.8, false)])
  assert.ok(r.limiares.exposicao < 1)
  // o limite segura: aceitou uma muito borrada
  r = ajustarLimiares(PADRAO, [serve('nitidez', corteQ - 0.3, true)])
  assert.equal(r.limiares.nitidez, -0.05)
  assert.ok(r.explicacao.includes(CALIBRACAO.limite))
})

test('respostas contraditórias não mexem; respostas que batem com o padrão também não', () => {
  // aceitou a pior e recusou a melhor
  let r = ajustarLimiares(PADRAO, [serve('nitidez', corteQ - 0.03, true), serve('nitidez', corteQ + 0.03, false)])
  assert.deepEqual(r.limiares, PADRAO)
  assert.deepEqual(r.contraditorias, ['nitidez'])
  assert.equal(r.explicacao[0], CALIBRACAO.contraditorio('nitidez'))
  r = ajustarLimiares(PADRAO, [serve('olhos', 0.2, false), serve('olhos', 0.14, true)])
  assert.deepEqual(r.limiares, PADRAO)
  r = ajustarLimiares(PADRAO, [serve('exposicao', 5, true), serve('exposicao', 2, false)])
  assert.deepEqual(r.limiares, PADRAO)
  // concordou com o padrão dos dois lados
  r = ajustarLimiares(PADRAO, [
    serve('nitidez', corteQ + 0.02, true),
    serve('nitidez', corteQ - 0.02, false),
    serve('exposicao', 0.5, true),
    serve('exposicao', 2, false),
  ])
  assert.deepEqual(r.limiares, PADRAO)
  assert.deepEqual(r.explicacao, [CALIBRACAO.igual])
  // a contradição numa dimensão não impede a outra de andar
  r = ajustarLimiares(PADRAO, [serve('nitidez', corteQ - 0.03, true), serve('nitidez', corteQ + 0.03, false), serve('olhos', 0.13, true)])
  assert.deepEqual(r.mudou, ['olhos'])
  assert.equal(r.limiares.nitidez, 0)
})

test('"qual das duas?" passa por ajustarPesos: preferir a de olhos melhores dá mais peso a pessoas', () => {
  const a = { componentes: { foco: 70, pessoas: 95, exposicao: 90, ruido: 90 }, detalhe: { olhos: 1, nitidezDoRosto: 0.7, expressao: 0.6 } }
  const b = { componentes: { foco: 95, pessoas: 60, exposicao: 90, ruido: 90 }, detalhe: { olhos: 0.5, nitidezDoRosto: 0.95, expressao: 0.6 } }
  const r = ajustarLimiares(PADRAO, [{ tipo: 'qual', preferida: a, preterida: b }], { pesos: pesosPadrao() })
  assert.ok(r.pesos.pessoas.pessoas > pesosPadrao().pessoas.pessoas)
  assert.ok(r.pesos.pessoas.foco < pesosPadrao().pessoas.foco)
  assert.deepEqual(r.limiares, PADRAO)
  assert.ok(
    r.explicacao.some((f) => /mais valor a pessoas/.test(f)),
    JSON.stringify(r.explicacao),
  )
})

test('perguntas: perto dos cortes, uma de cada lado por dimensão, e só fotos sem problema nas outras', () => {
  const fotos = []
  const q = (i, v, extra = {}) => fotos.push({ id: `q${i}`, medidas: medidas({ q: v }), rostos: [], tipo: 'imagem', ...extra })
  // nitidez: longe e perto do corte; uma perto, mas estourada (não serve de pergunta de foco)
  q(1, 0.9)
  q(2, corteQ + 0.01)
  q(3, corteQ - 0.015)
  q(4, 0.4)
  q(5, corteQ - 0.005, { medidas: medidas({ q: corteQ - 0.005, altas3: 0.2 }) })
  // olhos: EAR perto de 0,15
  fotos.push({ id: 'o1', medidas: medidas(), rostos: [rosto({ olhos: 'parcial', ear: 0.17 })], tipo: 'imagem' })
  fotos.push({ id: 'o2', medidas: medidas(), rostos: [rosto({ olhos: 'fechados', ear: 0.13 })], tipo: 'imagem' })
  fotos.push({ id: 'o3', medidas: medidas(), rostos: [rosto({ olhos: 'abertos', ear: 0.3 })], tipo: 'imagem' })
  // exposição: 1,5× e 0,6× a tolerância (perto de 1); 10× fica fora da janela
  fotos.push({ id: 'e1', medidas: medidas({ altas: 0.015 }), rostos: [], tipo: 'imagem' })
  fotos.push({ id: 'e2', medidas: medidas({ altas: 0.006 }), rostos: [], tipo: 'imagem' })
  fotos.push({ id: 'e3', medidas: medidas({ altas: 0.1 }), rostos: [], tipo: 'imagem' })
  const lista = perguntas(fotos)
  const ids = lista.map((p) => p.id)
  assert.ok(lista.length >= 6, JSON.stringify(lista))
  assert.deepEqual(
    lista.slice(0, 6).map((p) => p.dimensao),
    ['nitidez', 'olhos', 'exposicao', 'nitidez', 'olhos', 'exposicao'],
  )
  for (const id of ['q2', 'q3', 'o1', 'o2', 'e1', 'e2']) assert.ok(ids.includes(id), `${id} devia ser pergunta: ${ids}`)
  for (const id of ['q1', 'q4', 'q5', 'e3', 'o3']) assert.ok(!ids.includes(id), `${id} não devia ser pergunta`)
  for (const p of lista) {
    const c = cortes(PADRAO, null)[p.dimensao]
    assert.equal(p.corte, c)
    assert.equal(
      p.valor,
      medidaDe(
        fotos.find((f) => f.id === p.id),
        p.dimensao,
      ),
    )
  }
  assert.equal(earDaFoto(fotos.find((f) => f.id === 'o2')), 0.13)
})

test('de ponta a ponta: as respostas tornam o ensaio mais tolerante com foco, e a foto aceita muda de balde', () => {
  const fotos = Array.from({ length: 14 }, (_, i) => ({
    id: `f${i}`,
    medidas: medidas({ q: 0.56 + i * 0.015 }),
    rostos: [],
    tipo: 'imagem',
    exif: { data: `2026-11-13T10:${String(i * 2).padStart(2, '0')}:00` },
  }))
  const referencia = calibrar(fotos)
  const lista = perguntas(fotos, { referencia }).filter((p) => p.dimensao === 'nitidez')
  assert.ok(lista.length >= 2)
  const abaixo = lista.filter((p) => p.valor < p.corte).sort((a, b) => b.valor - a.valor)[0]
  const antes = avaliarEnsaio(fotos, { referencia }).magnitudes.get(abaixo.id)
  assert.ok(antes.detalhe.tetos.includes('foraDeFoco'))
  const r = ajustarLimiares(
    PADRAO,
    lista.map((p) => ({ ...p, serve: true })),
    { referencia },
  )
  const depois = avaliarEnsaio(fotos, { referencia, limiares: r.limiares }).magnitudes.get(abaixo.id)
  assert.ok(!depois.detalhe.tetos.includes('foraDeFoco'))
  assert.ok(depois.total > antes.total)
  assert.deepEqual(explicarLimiares(r.limiares), [CALIBRACAO.mudancas.nitidez(r.limiares.nitidez)])
})
