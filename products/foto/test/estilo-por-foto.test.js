// Tratar em lote (src/estilo/por-foto.js): corrigir o que é da foto, depois o estilo; série sem piscar.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { neutro, normalizar } from '../src/motor/ajustes.js'
import { autoExposicao } from '../src/motor/auto.js'
import { MARGENS } from '../src/motor/tela.js'
import { estilosDaCasa } from '../src/estilo/biblioteca.js'
import { MODOS, SERIE, tratarEmLote, tratarFoto } from '../src/estilo/por-foto.js'
import { baseDe, cenaDeSessao } from './apoio-estilo.js'

const palco = estilosDaCasa().find((p) => p.id === 'casa-palco-e-show-palco')

// uma foto da sessão com ganho de luz e dominante de cor (ganho por canal, como uma luz mais quente)
function foto(semente, { ganho = 1, cor = [1, 1, 1], latitude = null } = {}) {
  const img = cenaDeSessao(semente, 120, 80, { tamanho: 0.02 })
  for (let i = 0; i < img.dados.length; i += 3) for (let c = 0; c < 3; c++) img.dados[i + c] *= ganho * cor[c]
  const base = baseDe(img)
  base.latitude = latitude
  return base
}

test('corrigir e estilo: clareia a foto escura, corrige o branco, depois entra o estilo', () => {
  const [r] = tratarEmLote([{ id: 'a', base: foto(1, { ganho: 0.3, cor: [1.06, 1, 0.94] }) }], palco)
  assert.equal(r.id, 'a')
  assert.ok(r.correcao.exposicao > 0.4, `exposição ${r.correcao.exposicao}`)
  assert.ok(r.explicacao[0].startsWith('Clareei'), r.explicacao[0])
  assert.equal(r.correcao.brancoMudou, true)
  assert.equal(r.ajustes.branco.modo, 'manual')
  assert.ok(r.explicacao.some((f) => f.startsWith('Branco mais')))
  // o estilo entrou inteiro
  assert.equal(r.ajustes.luz.contraste, palco.ajustes.luz.contraste)
  assert.equal(r.ajustes.luz.exposicao, r.correcao.exposicao)
  assert.equal(r.explicacao.at(-1), `${palco.nome}.`)
})

test('foto já no ponto: exposição e branco mantidos', () => {
  const r = tratarFoto({ id: 'b', base: foto(2) }, palco)
  assert.equal(r.ajustes.branco.modo, 'original')
  assert.ok(r.explicacao.includes('Branco mantido.'))
  assert.ok(Math.abs(r.correcao.exposicao) < 0.5)
})

test('só estilo: o que a foto tem fica; manter o que já mexi: o da pessoa fica, o resto é corrigido', () => {
  const mexida = normalizar({ luz: { exposicao: 0.3 }, branco: { modo: 'manual', temperatura: 5000, tinta: 2 } })
  const so = tratarFoto({ id: 'c', base: foto(3, { ganho: 0.3 }), ajustes: mexida }, palco, { modo: 'so-estilo' })
  assert.equal(so.ajustes.luz.exposicao, 0.3)
  assert.equal(so.ajustes.branco.temperatura, 5000)
  assert.deepEqual(so.explicacao, [`${palco.nome}.`])
  const soExposicao = normalizar({ luz: { exposicao: -0.2 } })
  const [manteve, corrigiu] = tratarEmLote(
    [
      { id: 'd', base: foto(4, { ganho: 0.3 }), ajustes: soExposicao },
      { id: 'e', base: foto(5, { ganho: 0.3 }) },
    ],
    palco,
    { modo: 'manter-o-que-ja-mexi' },
  )
  assert.equal(manteve.ajustes.luz.exposicao, -0.2)
  assert.deepEqual(manteve.correcao.manteve, ['exposição'])
  assert.ok(manteve.explicacao.includes('Exposição como você deixou.'))
  assert.ok(corrigiu.ajustes.luz.exposicao > 0.4)
  assert.deepEqual(MODOS, ['so-estilo', 'corrigir-e-estilo', 'manter-o-que-ja-mexi'])
  assert.throws(() => tratarEmLote([], palco, { modo: 'tudo' }))
})

test('intensidade: o estilo entra na força pedida; sem predefinição, só a correção', () => {
  const r = tratarFoto({ id: 'f', base: foto(6) }, palco, { intensidade: 50 })
  assert.equal(r.ajustes.luz.contraste, palco.ajustes.luz.contraste / 2)
  assert.ok(r.explicacao.at(-1).includes('a 50%'))
  const so = tratarFoto({ id: 'g', base: foto(6, { ganho: 0.3 }) }, null)
  assert.equal(so.ajustes.luz.contraste, 0)
  assert.ok(so.ajustes.luz.exposicao > 0)
  const semImagem = tratarFoto({ id: 'h' }, palco)
  assert.ok(semImagem.explicacao.includes('Sem a imagem: só o estilo.'))
})

test('a Latitude manda: a correção não passa do que o arquivo aguenta', () => {
  // só 5,6 EV abaixo do cinza até o ruído: o automático pode subir no máximo 5,6 − piso das sombras
  const latitude = { margem: { abaixoDoCinza: MARGENS.sombras.piso + 0.3, acimaDoCinza: 4 } }
  const r = tratarFoto({ id: 'i', base: foto(7, { ganho: 0.2, latitude }) }, palco)
  assert.ok(r.correcao.exposicao <= 0.3 + 1e-9, `${r.correcao.exposicao}`)
  assert.equal(r.correcao.exposicao, autoExposicao(foto(7, { ganho: 0.2, latitude })).exposicao)
})

test('série sem piscar: fotos seguidas da mesma cena ficam parecidas; mudança grande de verdade não é arrastada', () => {
  // seis fotos da mesma cena com a exposição oscilando ±0,25 EV, e uma sétima 2 EV mais escura (o flash não disparou)
  const ganhos = [0.5, 0.42, 0.56, 0.45, 0.53, 0.47, 0.12]
  const fotos = ganhos.map((g, i) => ({ id: `s${i}`, base: foto(20 + i, { ganho: g, cor: [1.06, 1, 0.94] }), grupo: 'palco-1' }))
  const solto = tratarEmLote(fotos, palco, { suavizar: false })
  const serie = tratarEmLote(fotos, palco)
  // a exposição FINAL da cena (ganho × 2^correção) varia menos com a suavização
  const final = (lista) => lista.slice(0, 6).map((r, i) => Math.log2(ganhos[i]) + r.correcao.exposicao)
  const desvio = (v) => Math.sqrt(v.reduce((s, x) => s + (x - v.reduce((a, b) => a + b, 0) / v.length) ** 2, 0) / v.length)
  // a correção suavizada fica mais parecida entre vizinhas (é o que não pisca na tela)
  const correcoes = (lista) => lista.slice(0, 6).map((r) => r.correcao.exposicao)
  assert.ok(desvio(correcoes(serie)) < desvio(correcoes(solto)), `${desvio(correcoes(serie))} × ${desvio(correcoes(solto))}`)
  assert.ok(Number.isFinite(desvio(final(serie))))
  assert.ok(serie.slice(0, 6).some((r) => r.correcao.suavizada))
  assert.ok(serie.some((r) => r.explicacao.includes('Igualei com as vizinhas da mesma cena.')))
  // a foto 2 EV mais escura continua com a correção dela (o peso cai com a diferença: σ = 0,5 EV)
  assert.ok(Math.abs(serie[6].correcao.exposicao - solto[6].correcao.exposicao) < 0.15)
  // grupos diferentes não se misturam
  const separados = tratarEmLote(
    fotos.map((f, i) => ({ ...f, grupo: `g${i}` })),
    palco,
  )
  assert.deepEqual(
    separados.map((r) => r.correcao.exposicao),
    solto.map((r) => r.correcao.exposicao),
  )
  assert.ok(SERIE.sigmaEv > 0 && SERIE.janela >= 1)
})

test('puro: não mexe no que recebe', () => {
  const ajustes = neutro()
  const entrada = [{ id: 'p', base: foto(9), ajustes }]
  const antes = JSON.stringify(ajustes)
  tratarEmLote(entrada, palco)
  assert.equal(JSON.stringify(ajustes), antes)
})
