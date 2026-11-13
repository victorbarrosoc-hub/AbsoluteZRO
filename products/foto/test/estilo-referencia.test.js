// Extrair o estilo de uma referência (src/estilo/referencia.js). A régua: aplicar um estilo conhecido da casa numa cena
// sintética, extrair de volta e medir quanto do erro some na foto da pessoa (ΔE Oklab médio, pixel a pixel, entre a
// revelação com os controles extraídos e a revelação com o estilo verdadeiro).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mexidos } from '../src/motor/ajustes.js'
import { ErroReferencia, extrairEstilo } from '../src/estilo/referencia.js'
import { estilosDaCasa } from '../src/estilo/biblioteca.js'
import { ajustesDe } from '../src/estilo/predefinicao.js'
import { lookDaPredefinicao } from '../src/estilo/look.js'
import { baseDe, cenaDeSessao, deltaEMedio, emBytes } from './apoio-estilo.js'

const estilo = (id) => ajustesDe(estilosDaCasa().find((p) => p.id === id))
// a foto da pessoa (A) e outra foto da mesma sessão (B), 360 × 240
const A = baseDe(cenaDeSessao(11, 360, 240, { tamanho: 0.015 }))
const B = baseDe(cenaDeSessao(23, 360, 240, { tamanho: 0.015 }))
const C = baseDe(cenaDeSessao(37, 360, 240, { tamanho: 0.015 }))
const neutraA = emBytes(A)

// quanto do erro sumiu na foto A: 1 − ΔE(extraído, verdade) / ΔE(neutro, verdade)
function reducao(ajustesExtraidos, verdade) {
  const alvo = emBytes(A, verdade)
  return 1 - deltaEMedio(emBytes(A, ajustesExtraidos), alvo) / deltaEMedio(neutraA, alvo)
}

test('mesma cena: a referência é a foto da pessoa tratada; os controles devolvem a maior parte do estilo', () => {
  // limite escrito: pelo menos 50% do erro some em cada estilo (medido: 62% a 96%)
  for (const id of ['casa-retrato-dourado', 'casa-casamento-terra', 'casa-palco-e-show-led-domado', 'casa-preto-e-branco-prata']) {
    const verdade = estilo(id)
    const r = extrairEstilo(emBytes(A, verdade), { alvo: neutraA })
    assert.equal(r.pareado, true, id)
    const red = reducao(r.ajustes, verdade)
    assert.ok(red >= 0.5, `${id}: só ${(red * 100).toFixed(0)}% do erro sumiu`)
    assert.ok(r.erro.pareado.depois < r.erro.pareado.antes)
    assert.ok(r.erro.aderencia > 0.5 && r.erro.aderencia <= 1)
    assert.ok(r.erro.alcance >= 0 && r.erro.alcance <= 1)
    // o que é da foto não entra no estilo
    assert.equal(r.predefinicao.ajustes.luz.exposicao, undefined)
    assert.equal(r.predefinicao.ajustes.branco, undefined)
    assert.equal(r.predefinicao.origem.tipo, 'referencia')
    for (const g of ['tom', 'neutro', 'cor', 'misturador', 'vizinhanca']) assert.ok(['alta', 'media', 'baixa'].includes(r.confianca[g]))
  }
})

test('cena diferente: a referência é outra foto da mesma sessão; os controles ainda chegam mais perto', () => {
  // limite escrito: cada um reduz pelo menos 30% e a média pelo menos 45% (medido: 54% a 81%)
  const reducoes = []
  for (const id of ['casa-casamento-terra', 'casa-palco-e-show-led-domado', 'casa-preto-e-branco-prata']) {
    const verdade = estilo(id)
    const r = extrairEstilo(emBytes(B, verdade), { alvo: neutraA })
    assert.equal(r.pareado, false, id)
    const red = reducao(r.ajustes, verdade)
    assert.ok(red >= 0.3, `${id}: só ${(red * 100).toFixed(0)}% do erro sumiu`)
    reducoes.push(red)
    // sem pares, o que depende do conteúdo não sai com confiança alta
    assert.notEqual(r.confianca.tom, 'alta')
    assert.notEqual(r.confianca.misturador, 'alta')
  }
  assert.ok(reducoes.reduce((s, v) => s + v, 0) / reducoes.length >= 0.45)
})

test('várias referências: a média das impressões digitais funciona', () => {
  const verdade = estilo('casa-casamento-terra')
  const r = extrairEstilo([emBytes(B, verdade), emBytes(C, verdade)], { alvo: neutraA })
  assert.ok(reducao(r.ajustes, verdade) >= 0.3)
  assert.throws(
    () => extrairEstilo(new Array(11).fill(neutraA)),
    (e) => e instanceof ErroReferencia && e.codigo === 'referencias-demais',
  )
})

test('referência neutra devolve quase neutro', () => {
  const igual = extrairEstilo(neutraA, { alvo: neutraA })
  assert.ok(deltaEMedio(emBytes(A, igual.ajustes), neutraA) < 0.3, mexidos(igual.ajustes).join(', '))
  const outra = extrairEstilo(emBytes(B), { alvo: neutraA })
  assert.ok(deltaEMedio(emBytes(A, outra.ajustes), neutraA) < 1.5, mexidos(outra.ajustes).join(', '))
})

test('preto e branco: detectado, cor e misturador zerados, aviso; o P&B tonalizado leva o tom', () => {
  const r = extrairEstilo(emBytes(B, estilo('casa-preto-e-branco-prata')), { alvo: neutraA })
  assert.equal(r.pb, true)
  assert.equal(r.ajustes.pb.ativo, true)
  assert.ok(r.avisos.some((a) => a.includes('preto e branco')))
  assert.equal(r.ajustes.cor.saturacao, 0)
  assert.ok(r.ajustes.misturador.saturacao.every((v) => v === 0))
  const sepia = extrairEstilo(emBytes(B, estilo('casa-preto-e-branco-sepia')), { alvo: neutraA })
  assert.equal(sepia.pb, true)
  const tom = ['sombras', 'altas', 'global'].map((z) => sepia.ajustes.tonalizacao[z]).filter((z) => z.saturacao > 0)
  assert.ok(tom.length > 0, 'o tom quente do sépia não veio')
  // quente: matiz entre o vermelho e o amarelo
  for (const z of tom.filter((x) => x.saturacao >= 5)) assert.ok(z.matiz <= 80 || z.matiz >= 340, `matiz ${z.matiz}`)
})

test('sem alvo: só a tonalização sai, com confiança baixa e o aviso', () => {
  const r = extrairEstilo(emBytes(B, estilo('casa-filme-negativo-frio')))
  assert.ok(r.avisos.some((a) => a.includes('mande também uma foto sua')))
  assert.equal(r.confianca.tom, 'baixa')
  assert.equal(r.confianca.cor, 'baixa')
  for (const c of mexidos(r.ajustes)) assert.ok(/^(tonalizacao|look)/.test(c), c)
})

test('resíduo em LUT 17: só entra quando melhora, e vai dentro da predefinição', () => {
  const verdade = estilo('casa-filme-vencido')
  const r = extrairEstilo(emBytes(A, verdade), { alvo: neutraA, residuo: true })
  if (r.look) {
    assert.equal(r.look.lado, 17)
    assert.ok(r.erro.pareado.comResiduo < r.erro.pareado.depois)
    assert.equal(r.predefinicao.look.lado, 17)
    assert.ok(lookDaPredefinicao(r.predefinicao))
  } else assert.ok(r.avisos.some((a) => a.includes('resíduo')))
})

test('entradas ruins viram erro claro', () => {
  const casos = [
    [[], 'sem-referencia'],
    [{ largura: 4, altura: 4, dados: new Uint8Array(64) }, 'imagem'],
    [{ largura: 20, altura: 20, dados: new Uint8Array(10) }, 'imagem'],
    [{ largura: 20, altura: 20, dados: new Uint8Array(1600), espaco: 'cmyk' }, 'espaco'],
  ]
  for (const [entrada, codigo] of casos)
    assert.throws(
      () => extrairEstilo(entrada),
      (e) => e instanceof ErroReferencia && e.codigo === codigo,
      codigo,
    )
})

test('tempo: uma referência de 512 px, com alvo, abaixo da meta', (t) => {
  // meta: 3 s por referência em 512 px; o teste dá folga de 1,5× porque a máquina de teste é dividida
  const grande = baseDe(cenaDeSessao(51, 512, 341, { tamanho: 0.015 }))
  const verdade = estilo('casa-palco-e-show-noite-de-show')
  const inicio = performance.now()
  const r = extrairEstilo(emBytes(grande, verdade), { alvo: emBytes(grande) })
  const ms = performance.now() - inicio
  t.diagnostic(`512 px, pareado: ${ms.toFixed(0)} ms, ${r.renders} revelações`)
  assert.ok(ms < 4500, `${ms.toFixed(0)} ms`)
  const outra = performance.now()
  extrairEstilo(emBytes(grande, verdade), { alvo: neutraA })
  t.diagnostic(`512 px, cena diferente: ${(performance.now() - outra).toFixed(0)} ms`)
})
