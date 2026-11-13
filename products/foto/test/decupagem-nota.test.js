// Decupagem · Magnitude: a nota explicável. A maior parte dos casos usa medidas e rostos fabricados (para acionar
// cada regra de propósito, uma por vez); o fim do arquivo roda o ensaio inteiro sobre imagens sintéticas medidas de
// verdade, e trava a variação da medida que justifica a margem de erro.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ajustarPesos,
  avaliar,
  avaliarEnsaio,
  calibrar,
  focoDaFoto,
  meta,
  pesosPadrao,
  protegerCobertura,
  ENSAIOS,
  PARAMETROS,
  RIGORES,
  TETOS,
} from '../src/decupagem/nota.js'
import { FOLGA_DE_NITIDEZ, MARGEM_DE_ERRO } from '../src/decupagem/grupos.js'
import { medir } from '../src/decupagem/medidas.js'
import * as TEXTOS from '../src/decupagem/textos.js'
import { exposicao as clarear, folhas, fotografar, gauss, movimento, quadro } from './apoio-decupagem.js'

/** Medidas fabricadas: uma foto nítida, bem exposta e limpa, salvo o que for pedido. */
function medidas({
  q = 0.85,
  tremido = null,
  altas = 0,
  altas3 = 0,
  baixas = 0,
  p1 = 12,
  p50 = 110,
  p99 = 235,
  ruido = 1,
  horizonte = null,
  semCepstro = false,
  dhash = '0000000000000000',
  phash = '0000000000000000',
} = {}) {
  const cepstro = semCepstro ? null : { z: tremido ? -25 : -4, comprimento: tremido ?? 20, angulo: 30, anel: 0.1, lado: 512 }
  const borrao = tremido
    ? { tipo: 'movimento', grau: tremido >= 12 ? 'forte' : 'leve', comprimento: tremido, angulo: 30, cepstro }
    : q >= 0.7
      ? { tipo: 'nenhum', grau: 'nenhum', cepstro }
      : { tipo: 'foco', grau: q >= 0.6 ? 'leve' : 'forte', cepstro }
  return {
    largura: 1024,
    altura: 683,
    nitidez: { q, s0: 2, s1: 2 / q, qLocal: q, mapa: null },
    borrao,
    exposicao: { altas, altas3, baixas, p1, p50, p99, media: p50 },
    ruido,
    dhash,
    phash,
    horizonte,
  }
}

/** Rosto fabricado, como analisarRostos devolve. */
function rosto({ olhos = 'abertos', q = 0.85, sorriso = 0.1, peso = 0.3, chave = true, principal = false, cortado = false, focoErrado = false } = {}) {
  return {
    caixa: { x: 400, y: 200, largura: 200, altura: 240 },
    confianca: 0.95,
    olhos,
    ear: 0.3,
    sorriso,
    nitidezOlhos: q,
    nitidezRosto: q,
    razaoFundo: 1,
    focoErrado,
    tamanho: peso,
    peso,
    chave,
    principal,
    cortado,
  }
}
const retrato = (opcoes) => [rosto({ principal: true, ...opcoes })]

// ───────────────────────────── a conta ─────────────────────────────

test('nota: foto nítida, bem exposta e limpa, sem gente, leva 100, cinco estrelas e fica', () => {
  const a = avaliar({ medidas: medidas(), rostos: [] })
  assert.deepEqual(a.componentes, { foco: 100, pessoas: null, exposicao: 100, ruido: 100 })
  assert.equal(a.total, 100)
  assert.equal(a.estrelas, 5)
  assert.equal(a.balde, 'fica')
  assert.deepEqual(a.motivos, ['Nítida'])
  assert.equal(a.confianca, 'alta')
  assert.deepEqual(a.incertezas, [])
  assert.deepEqual(a.dicas, [])
  assert.deepEqual(a.detalhe.tetos, [])
})

test('nota: os pesos por cena (com gente: foco 35, pessoas 35, exposição 15, ruído 5; sem gente: 55, 30, 15)', () => {
  assert.deepEqual(pesosPadrao(), {
    pessoas: { foco: 35, pessoas: 35, exposicao: 15, ruido: 5 },
    demais: { foco: 55, exposicao: 30, ruido: 15 },
    rosto: { olhos: 0.6, nitidez: 0.25, expressao: 0.15 },
  })
  // sem gente: foco em q = 0,635 (metade da régua de 0,52 a 0,75) → 50; ruído σ = 7 → 50; exposição 100
  const sem = avaliar({ medidas: medidas({ q: 0.635, ruido: 7 }), rostos: [] })
  assert.deepEqual(sem.componentes, { foco: 50, pessoas: null, exposicao: 100, ruido: 50 })
  assert.equal(sem.total, Math.round((55 * 50 + 30 * 100 + 15 * 50) / 100))
  // com gente: os mesmos sinais, olhos abertos e sem sorriso (expressão neutra = 0,5 + 0,5 · 0,1)
  const com = avaliar({ medidas: medidas({ q: 0.635, ruido: 7 }), rostos: retrato({ q: 0.635 }) })
  const pessoas = (100 * (0.6 * 1 + 0.25 * 0.5 + 0.15 * 0.55)) / 1
  assert.equal(com.componentes.pessoas, Math.round(pessoas))
  assert.equal(com.total, Math.round((35 * 50 + 35 * pessoas + 15 * 100 + 5 * 50) / 90))
})

test('nota: estrelas pelos cortes 85, 70, 55, 40 e 20', () => {
  // sem gente, o foco é 55% da nota: q escolhe o total
  const com = (q, ruido = 1) => avaliar({ medidas: medidas({ q, ruido }), rostos: [] })
  assert.deepEqual([com(0.75).estrelas, com(0.75).total], [5, 100])
  assert.deepEqual([com(0.63).estrelas, com(0.63).total], [4, 71])
  assert.deepEqual([com(0.62, 7).estrelas, com(0.62, 7).total], [3, 61])
  // abaixo de 0,60 entra o teto de fora de foco (35): uma estrela
  assert.deepEqual([com(0.59).estrelas, com(0.59).total], [1, 35])
  // duas estrelas: o teto de altas luzes perdidas (50)
  assert.equal(avaliar({ medidas: medidas({ altas: 0.3, altas3: 0.2 }), rostos: [] }).estrelas, 2)
  // zero: nada se salva (borrada, estourada e ruidosa ao mesmo tempo)
  const nada = avaliar({ medidas: medidas({ q: 0.5, ruido: 14, altas: 0.5, altas3: 0.4 }), rostos: [] })
  assert.deepEqual([nada.estrelas, nada.total, nada.balde], [0, 0, 'fora'])
})

// ───────────────────────────── tetos ─────────────────────────────

test('teto: tremida forte limita a nota em 30 e é o primeiro motivo, com o comprimento', () => {
  const a = avaliar({ medidas: medidas({ q: 0.68, tremido: 12.3 }), rostos: [] })
  assert.equal(a.total, TETOS.tremida)
  assert.equal(a.motivos[0], 'Tremida, cerca de 12 px')
  assert.deepEqual(a.detalhe.tetos, ['tremida'])
  assert.equal(a.balde, 'fora')
  assert.equal(a.estrelas, 1)
  // sem o teto, a mesma foto teria nota bem maior: é o teto que explica
  assert.ok(avaliar({ medidas: medidas({ q: 0.68 }), rostos: [] }).total > 70)
})

test('teto: tremido leve (menos de 12 px) não tem teto, só o motivo e o desconto do foco', () => {
  const a = avaliar({ medidas: medidas({ q: 0.66, tremido: 9 }), rostos: [] })
  assert.deepEqual(a.detalhe.tetos, [])
  assert.equal(a.motivos[0], 'Leve tremido, cerca de 9 px')
  assert.ok(a.total > 70 && a.total < 90, `total ${a.total}`)
})

test('teto: tremido no quadro com o rosto medido nítido é panorâmica, não defeito', () => {
  const a = avaliar({ medidas: medidas({ q: 0.66, tremido: 20 }), rostos: retrato({ q: 0.85 }) })
  assert.deepEqual(a.detalhe.tetos, [])
  assert.ok(!a.motivos.some((m) => m.startsWith('Tremida')))
  // rosto também borrado: aí é tremida
  assert.deepEqual(avaliar({ medidas: medidas({ q: 0.66, tremido: 20 }), rostos: retrato({ q: 0.63 }) }).detalhe.tetos, ['tremida'])
})

test('teto: fora de foco limita a nota em 35, e diz se foi o rosto ou se o foco caiu no fundo', () => {
  const quadroBorrado = avaliar({ medidas: medidas({ q: 0.56 }), rostos: [] })
  assert.equal(quadroBorrado.total, TETOS.foraDeFoco)
  assert.equal(quadroBorrado.motivos[0], 'Fora de foco')
  assert.equal(quadroBorrado.balde, 'fora')
  // com gente, quem manda é o rosto: quadro nítido, rosto borrado
  const rostoBorrado = avaliar({ medidas: medidas({ q: 0.85 }), rostos: retrato({ q: 0.55 }) })
  assert.equal(rostoBorrado.total, 35)
  assert.equal(rostoBorrado.motivos[0], 'Rosto fora de foco')
  assert.equal(rostoBorrado.detalhe.origemDoFoco, 'olhos')
  const noFundo = avaliar({ medidas: medidas({ q: 0.85 }), rostos: retrato({ q: 0.55, focoErrado: true }) })
  assert.equal(noFundo.motivos[0], 'O foco caiu no fundo')
  // o contrário: quadro "borrado" (fundo desfocado), rosto nítido: nada de teto
  const retratoDeVerdade = avaliar({ medidas: medidas({ q: 0.56 }), rostos: retrato({ q: 0.85 }) })
  assert.deepEqual(retratoDeVerdade.detalhe.tetos, [])
  assert.ok(retratoDeVerdade.total >= 90)
  assert.equal(retratoDeVerdade.motivos[0], 'Olhos nítidos')
})

test('teto: olhos fechados limitam a nota em 40', () => {
  const a = avaliar({ medidas: medidas(), rostos: retrato({ olhos: 'fechados' }) })
  assert.equal(a.total, TETOS.olhosFechados)
  assert.equal(a.motivos[0], 'Olhos fechados')
  assert.deepEqual(a.detalhe.tetos, ['olhosFechados'])
  assert.equal(a.balde, 'talvez', 'no rigor equilibrado, olho fechado é dúvida: quem decide é a pessoa')
  assert.equal(avaliar({ medidas: medidas(), rostos: retrato({ olhos: 'fechados' }) }, { rigor: 'estrito' }).balde, 'fora')
  // piscada parcial e riso de olho apertado não têm teto
  const parcial = avaliar({ medidas: medidas(), rostos: retrato({ olhos: 'parcial' }) })
  assert.deepEqual(parcial.detalhe.tetos, [])
  assert.ok(parcial.motivos.includes('Piscando'))
  assert.ok(parcial.total < 100 && parcial.total > 80)
  const rindo = avaliar({ medidas: medidas(), rostos: retrato({ olhos: 'sorrindo', sorriso: 0.9 }) })
  assert.equal(rindo.total, 100)
  assert.ok(rindo.motivos.includes('Sorrindo'))
})

test('teto: altas luzes perdidas em mais de 10% limitam a nota em 50', () => {
  const a = avaliar({ medidas: medidas({ altas: 0.3, altas3: 0.22, p99: 255 }), rostos: [], tipo: 'imagem' })
  assert.equal(a.total, TETOS.estourada)
  assert.equal(a.motivos[0], 'Altas luzes perdidas em 22%')
  assert.equal(a.balde, 'talvez')
  assert.equal(a.componentes.exposicao, 0)
  // abaixo de 10% não tem teto, mas desconta: 4 pontos por ponto percentual de um canal acima de 1%, 20 por ponto de
  // três canais acima de 0,5%
  const pouco = avaliar({ medidas: medidas({ altas: 0.03, altas3: 0.01 }), rostos: [] })
  assert.deepEqual(pouco.detalhe.tetos, [])
  assert.equal(pouco.componentes.exposicao, 100 - 4 * 2 - 20 * 0.5)
  assert.ok(pouco.motivos.includes('Altas luzes perdidas em 1%'))
})

test('tetos: com dois defeitos vale o mais baixo, e os dois aparecem nos motivos, o pior primeiro', () => {
  const a = avaliar({ medidas: medidas({ q: 0.66, tremido: 18, altas: 0.3, altas3: 0.2 }), rostos: retrato({ olhos: 'fechados', q: 0.6 }) })
  // a soma ponderada (26) já está abaixo do teto mais baixo (30): o teto limita, não levanta
  assert.equal(a.total, 26)
  assert.deepEqual(a.motivos, ['Tremida, cerca de 18 px', 'Olhos fechados', 'Altas luzes perdidas em 20%'])
  assert.deepEqual(a.detalhe.tetos, ['tremida', 'olhosFechados', 'estourada'])
  assert.equal(a.motivos.length, 3, 'no máximo três motivos')
})

test('rigor: o mesmo defeito cai em baldes diferentes conforme o rigor', () => {
  assert.deepEqual(RIGORES, { relaxado: { fica: 60, fora: 35 }, equilibrado: { fica: 70, fora: 40 }, estrito: { fica: 78, fora: 50 } })
  const balde = (sinais, rigor) => avaliar(sinais, { rigor }).balde
  const tremida = { medidas: medidas({ q: 0.66, tremido: 16 }), rostos: [] } // 30
  const borrada = { medidas: medidas({ q: 0.56 }), rostos: [] } // 35
  const fechados = { medidas: medidas(), rostos: retrato({ olhos: 'fechados' }) } // 40
  const estourada = { medidas: medidas({ altas: 0.3, altas3: 0.2 }), rostos: [] } // 50
  const suave = { medidas: medidas({ q: 0.63 }), rostos: [] } // 71
  assert.deepEqual(
    ['relaxado', 'equilibrado', 'estrito'].map((r) => balde(tremida, r)),
    ['fora', 'fora', 'fora'],
  )
  assert.deepEqual(
    ['relaxado', 'equilibrado', 'estrito'].map((r) => balde(borrada, r)),
    ['talvez', 'fora', 'fora'],
  )
  assert.deepEqual(
    ['relaxado', 'equilibrado', 'estrito'].map((r) => balde(fechados, r)),
    ['talvez', 'talvez', 'fora'],
  )
  assert.deepEqual(
    ['relaxado', 'equilibrado', 'estrito'].map((r) => balde(estourada, r)),
    ['talvez', 'talvez', 'talvez'],
  )
  assert.deepEqual(
    ['relaxado', 'equilibrado', 'estrito'].map((r) => balde(suave, r)),
    ['fica', 'fica', 'talvez'],
  )
  // rigor desconhecido vale como equilibrado
  assert.equal(balde(borrada, 'qualquer'), 'fora')
  assert.equal(balde(borrada), 'fora')
})

// ───────────────────────────── pessoas ─────────────────────────────

test('pessoas: nos olhos vale a pior pessoa-chave, não a média', () => {
  const grupo = [rosto({ principal: true }), rosto(), rosto({ olhos: 'fechados' }), rosto(), rosto()]
  const a = avaliar({ medidas: medidas(), rostos: grupo })
  assert.equal(a.total, 40, 'uma pessoa-chave de olhos fechados em cinco já dá o teto')
  assert.equal(a.motivos[0], 'Olhos fechados (1 de 5)')
  assert.equal(a.detalhe.olhos, 0)
  // todas de olhos abertos
  const abertos = avaliar({ medidas: medidas(), rostos: grupo.map((r) => ({ ...r, olhos: 'abertos' })) })
  assert.ok(abertos.total >= 95)
  assert.ok(abertos.motivos.includes('Olhos abertos (5 de 5)'))
  // uma piscando: sem teto, mas a pior manda (olhos = 0,5)
  const piscando = avaliar({ medidas: medidas(), rostos: [rosto({ principal: true }), rosto({ olhos: 'parcial' }), rosto()] })
  assert.equal(piscando.detalhe.olhos, 0.5)
  assert.ok(piscando.motivos.includes('Piscando (1 de 3)'))
})

test('pessoas: rosto secundário de olho fechado ou desfocado não derruba a foto', () => {
  const principal = rosto({ principal: true, peso: 0.4 })
  const fundo = rosto({ olhos: 'fechados', q: 0.5, peso: 0.1, chave: false })
  const a = avaliar({ medidas: medidas(), rostos: [principal, fundo] })
  assert.deepEqual(a.detalhe.tetos, [])
  assert.equal(a.total, 97)
  assert.equal(a.total, avaliar({ medidas: medidas(), rostos: [principal] }).total, 'a mesma nota de quando o secundário não existe')
  assert.ok(a.motivos.includes('Olhos abertos'))
})

test('pessoas: o foco vem dos olhos, senão do rosto, senão do quadro', () => {
  const m = medidas({ q: 0.9 })
  assert.deepEqual(focoDaFoto({ medidas: m, rostos: retrato({ q: 0.8 }) }), { q: 0.8, origem: 'olhos' })
  assert.deepEqual(focoDaFoto({ medidas: m, rostos: [{ ...rosto({ principal: true }), nitidezOlhos: null, nitidezRosto: 0.74 }] }), {
    q: 0.74,
    origem: 'rosto',
  })
  assert.deepEqual(focoDaFoto({ medidas: m, rostos: [{ ...rosto({ principal: true }), nitidezOlhos: null, nitidezRosto: null }] }), {
    q: 0.9,
    origem: 'quadro',
  })
  assert.deepEqual(focoDaFoto({ medidas: m, rostos: [] }), { q: 0.9, origem: 'quadro' })
  assert.deepEqual(focoDaFoto({ medidas: m }), { q: 0.9, origem: 'quadro' })
  // quando o rosto é pequeno demais para medir, a certeza cai e a nota avisa
  const a = avaliar({ medidas: m, rostos: [{ ...rosto({ principal: true }), nitidezOlhos: null, nitidezRosto: null }] })
  assert.ok(a.incertezas.includes('Foco medido no quadro inteiro, não no rosto'))
  assert.equal(a.confianca, 'media')
})

test('pessoas: rosto sem olhos lidos não vira olho aberto: o componente sai do que há, e a certeza cai', () => {
  const semOlhos = [{ ...rosto({ principal: true }), olhos: null, ear: null, sorriso: null }]
  const a = avaliar({ medidas: medidas(), rostos: semOlhos })
  assert.equal(a.detalhe.olhos, null)
  assert.equal(a.detalhe.expressao, null)
  assert.equal(a.componentes.pessoas, 100, 'só a nitidez do rosto entrou')
  assert.ok(!a.motivos.some((m) => m.startsWith('Olhos abertos')))
  assert.ok(a.incertezas.includes('Rosto pequeno demais para ler os olhos'))
  assert.equal(a.confianca, 'media')
})

// ───────────────────────────── beijo, oração, recém-nascido ─────────────────────────────

test('beijo: olho fechado não reprova quando todas as fotos da sequência têm os olhos fechados', () => {
  const casal = [rosto({ principal: true, olhos: 'fechados' }), rosto({ olhos: 'fechados' })]
  const sozinha = avaliar({ medidas: medidas(), rostos: casal })
  assert.equal(sozinha.total, 40, 'sem o contexto do grupo, é teto')
  const noBeijo = avaliar({ medidas: medidas(), rostos: casal, grupo: { tamanho: 4, olhosFechadosEmTodas: true } })
  assert.deepEqual(noBeijo.detalhe.tetos, [])
  assert.ok(noBeijo.total >= 95, `total ${noBeijo.total}`)
  assert.ok(noBeijo.motivos.includes('Olhos fechados em toda a sequência: é do momento'))
  assert.equal(noBeijo.balde, 'fica')
})

test('beijo: o ensaio inteiro acha o contexto sozinho (e não perdoa a piscada no meio de uma sequência de olhos abertos)', () => {
  const casal = (olhos) => [rosto({ principal: true, olhos }), rosto({ olhos })]
  const em = (segundos) => ({ data: `2026-03-07T16:00:${String(segundos).padStart(2, '0')}` })
  // três quadros do beijo em 1 s, todos de olhos fechados
  const beijo = ['b1', 'b2', 'b3'].map((id, i) => ({ id, exif: { ...em(10), subsegundo: i * 0.3 }, medidas: medidas(), rostos: casal('fechados') }))
  // três quadros posados em 1 s; no do meio, alguém piscou
  const posada = ['p1', 'p2', 'p3'].map((id, i) => ({
    id,
    exif: { ...em(40), subsegundo: i * 0.3 },
    medidas: medidas({ dhash: 'ffffffffffffffff', phash: 'ffffffffffffffff' }),
    rostos: casal(i === 1 ? 'fechados' : 'abertos'),
  }))
  const r = avaliarEnsaio([...beijo, ...posada])
  assert.deepEqual(
    r.grupos.map((g) => g.fotos),
    [
      ['b1', 'b2', 'b3'],
      ['p1', 'p2', 'p3'],
    ],
  )
  for (const id of ['b1', 'b2', 'b3']) {
    assert.deepEqual(r.magnitudes.get(id).detalhe.tetos, [], id)
    assert.equal(r.magnitudes.get(id).balde, 'fica')
  }
  assert.deepEqual(r.magnitudes.get('p2').detalhe.tetos, ['olhosFechados'])
  assert.equal(r.magnitudes.get('p2').total, 40)
  assert.equal(r.magnitudes.get('p1').balde, 'fica')
  assert.ok(['p1', 'p3'].includes(r.grupos[1].escolhida))
  // uma foto só de olhos fechados, fora de qualquer grupo, pode ser piscada: o teto vale
  const avulsa = avaliarEnsaio([{ id: 'x', exif: em(5), medidas: medidas(), rostos: casal('fechados') }])
  assert.equal(avulsa.magnitudes.get('x').total, 40)
})

test('ensaio: recém-nascido, boudoir e esporte não reprovam olho fechado', () => {
  assert.deepEqual(Object.keys(ENSAIOS), ['geral', 'recem-nascido', 'boudoir', 'esporte'])
  const bebe = { medidas: medidas(), rostos: retrato({ olhos: 'fechados' }) }
  assert.equal(avaliar(bebe, { ensaio: 'geral' }).total, 40)
  for (const ensaio of ['recem-nascido', 'boudoir', 'esporte']) {
    const a = avaliar(bebe, { ensaio })
    assert.deepEqual(a.detalhe.tetos, [], ensaio)
    assert.ok(a.total >= 95, `${ensaio}: ${a.total}`)
    assert.ok(a.motivos.includes('Olhos fechados não contam neste ensaio'))
    assert.ok(ensaio in TEXTOS.ENSAIOS, 'todo ensaio tem nome de tela')
  }
  assert.equal(avaliar(bebe, { ensaio: 'desconhecido' }).total, 40, 'ensaio desconhecido vale como geral')
})

// ───────────────────────────── exposição julgada pelo RAW ─────────────────────────────

const latitude = (cortado, margem = {}) => ({ cortado, margem: { altas: [1, 1, 1], sombras: null, ...margem }, confianca: 'alta' })

test('RAW: canal estourado que o sensor ainda tem vira aviso, não desconto nem teto', () => {
  // a prévia embutida está estourada em 30% (22% nos três canais)...
  const previa = medidas({ altas: 0.3, altas3: 0.22, p99: 255 })
  // ...mas no sensor só 0,2% perdeu os três canais; 26% tem um ou dois canais cortados (o motor reconstrói)
  const a = avaliar({ medidas: previa, rostos: [], tipo: 'raw', latitude: latitude({ um: 0.2, dois: 0.06, tres: 0.002 }) })
  assert.deepEqual(a.detalhe.tetos, [])
  assert.equal(a.componentes.exposicao, 100)
  assert.equal(a.total, 100)
  assert.equal(a.balde, 'fica')
  assert.ok(a.motivos.includes('Altas luzes estouradas em 26%, recuperáveis no RAW'))
  assert.equal(a.motivos[0], 'Nítida', 'o aviso vem depois do que pesa na nota')
  assert.equal(a.detalhe.exposicaoPeloRaw, true)
  assert.equal(a.confianca, 'alta')
})

test('RAW: só reprova quando o dado do sensor está perdido (três canais)', () => {
  const previa = medidas({ altas: 0.3, altas3: 0.22, p99: 255 })
  const perdida = avaliar({ medidas: previa, rostos: [], tipo: 'raw', latitude: latitude({ um: 0.05, dois: 0.05, tres: 0.15 }) })
  assert.equal(perdida.total, 50)
  assert.deepEqual(perdida.detalhe.tetos, ['estourada'])
  assert.equal(perdida.motivos[0], 'Altas luzes perdidas em 15%')
  // perdido abaixo de 10%: desconta 20 pontos de exposição por ponto percentual acima de 0,5%, sem teto
  const pouco = avaliar({ medidas: previa, rostos: [], tipo: 'raw', latitude: latitude({ um: 0.1, dois: 0.05, tres: 0.02 }) })
  assert.deepEqual(pouco.detalhe.tetos, [])
  assert.equal(pouco.componentes.exposicao, 100 - 20 * 1.5)
  assert.ok(pouco.motivos.includes('Altas luzes perdidas em 2%'))
  // e a prévia limpa não salva um sensor cortado
  const limpa = avaliar({ medidas: medidas(), rostos: [], tipo: 'raw', latitude: latitude({ um: 0, dois: 0, tres: 0.12 }) })
  assert.equal(limpa.total, 50)
})

test('RAW ainda não lido: estouro visto só na prévia não dá teto, e a nota diz que não tem certeza', () => {
  const previa = medidas({ altas: 0.3, altas3: 0.22, p99: 255 })
  const jpeg = avaliar({ medidas: previa, rostos: [], tipo: 'imagem' })
  // (rigor relaxado só para a nota de 70 não cair em cima de um corte de balde, que é outra incerteza)
  const raw = avaliar({ medidas: previa, rostos: [], tipo: 'raw' }, { rigor: 'relaxado' })
  assert.equal(jpeg.total, 50, 'na imagem pronta, o que estourou não volta')
  assert.deepEqual(raw.detalhe.tetos, [])
  assert.equal(raw.total, 70, 'desconta a exposição (30% da nota), sem teto')
  assert.ok(raw.motivos.includes('Altas luzes estouradas na prévia em 30%'))
  assert.ok(raw.incertezas.includes('Exposição vista só na prévia: o RAW ainda não foi lido'))
  assert.equal(raw.confianca, 'media')
  // só um canal estourado na prévia de um RAW: aviso, sem desconto
  const umCanal = avaliar({ medidas: medidas({ altas: 0.08 }), rostos: [], tipo: 'raw' })
  assert.equal(umCanal.componentes.exposicao, 100)
  assert.ok(umCanal.motivos.includes('Altas luzes estouradas na prévia em 8%'))
  // a mesma área numa imagem pronta desconta
  assert.equal(avaliar({ medidas: medidas({ altas: 0.08 }), rostos: [], tipo: 'imagem' }).componentes.exposicao, 100 - 4 * 7)
})

test('RAW: foto escura com folga nas sombras do sensor não é descontada', () => {
  const escura = medidas({ p1: 3, p50: 30, p99: 60 })
  const jpeg = avaliar({ medidas: escura, rostos: [], tipo: 'imagem' })
  assert.equal(jpeg.componentes.exposicao, 100 - 0.5 * (110 - 60))
  assert.ok(jpeg.motivos.includes('Escura'))
  // falta clarear 2,2 · log2(110 / 60) ≈ 1,9 EV; o sensor tem 4 EV de folga acima do ruído
  const comFolga = avaliar({ medidas: escura, rostos: [], tipo: 'raw', latitude: latitude({ um: 0, dois: 0, tres: 0 }, { sombras: 4 }) })
  assert.equal(comFolga.componentes.exposicao, 100)
  assert.ok(comFolga.motivos.includes('Escura, mas o RAW aguenta clarear'))
  // sem folga (ou sem a medida), desconta
  const semFolga = avaliar({ medidas: escura, rostos: [], tipo: 'raw', latitude: latitude({ um: 0, dois: 0, tres: 0 }, { sombras: 1 }) })
  assert.equal(semFolga.componentes.exposicao, 75)
  assert.equal(avaliar({ medidas: escura, rostos: [], tipo: 'raw', latitude: latitude({ um: 0, dois: 0, tres: 0 }) }).componentes.exposicao, 75)
})

test('exposição: cena de noite não é chamada de escura; lavada e sombras fechadas descontam', () => {
  const noite = medidas({ p1: 1, p50: 20, p99: 100, altas: 0.003, baixas: 0.2 })
  assert.equal(avaliar({ medidas: noite, rostos: [] }).componentes.exposicao, 100)
  assert.equal(avaliar({ medidas: medidas({ p1: 1, p50: 60, p99: 100 }), rostos: [], cena: { cena: 'noturna', noite: true } }).componentes.exposicao, 100)
  const lavada = avaliar({ medidas: medidas({ p1: 80 }), rostos: [] })
  assert.equal(lavada.componentes.exposicao, 90)
  assert.ok(lavada.motivos.includes('Lavada, sem preto'))
  const fechada = avaliar({ medidas: medidas({ baixas: 0.07 }), rostos: [] })
  assert.equal(fechada.componentes.exposicao, 100 - 3 * 5)
  assert.ok(fechada.motivos.includes('Sombras fechadas em 7%'))
})

// ───────────────────────────── sem modelo de visão ─────────────────────────────

test('sem a camada de rostos a nota sai só com o medido, e a certeza cai (nunca finge rosto)', () => {
  const sem = avaliar({ medidas: medidas() })
  const comZero = avaliar({ medidas: medidas(), rostos: [] })
  assert.equal(sem.total, comZero.total)
  assert.equal(sem.componentes.pessoas, null)
  assert.equal(sem.confianca, 'media')
  assert.deepEqual(sem.incertezas, ['Sem leitura de rostos'])
  assert.equal(comZero.confianca, 'alta')
  assert.ok(!sem.motivos.some((m) => /olho|rosto|sorri/i.test(m)), 'nenhum motivo fala de gente')
  // duas coisas por ler: certeza baixa
  const duas = avaliar({ medidas: medidas({ semCepstro: true }) })
  assert.equal(duas.confianca, 'baixa')
  assert.deepEqual(duas.incertezas, ['Sem leitura de rostos', 'Prévia pequena demais para medir tremido'])
})

test('certeza: nota a menos de 3 pontos de um corte de balde é marcada como incerta', () => {
  const noLimite = avaliar({ medidas: medidas({ q: 0.63 }), rostos: [] }) // 71, corte em 70
  assert.equal(noLimite.total, 71)
  assert.ok(noLimite.incertezas.includes('Nota no limite entre dois baldes'))
  assert.equal(noLimite.confianca, 'media')
  // teto decide com certeza: 35 está perto do corte de 40, mas o defeito é claro
  assert.deepEqual(avaliar({ medidas: medidas({ q: 0.56 }), rostos: [] }).incertezas, [])
})

test('miniatura sem medida de nitidez: a nota sai sem o foco e avisa', () => {
  const m = medidas()
  m.nitidez = { q: null, s0: null, s1: null, qLocal: null, mapa: null }
  m.borrao = null
  m.ruido = null
  const a = avaliar({ medidas: m, rostos: [] })
  assert.deepEqual(a.componentes, { foco: null, pessoas: null, exposicao: 100, ruido: null })
  assert.equal(a.total, 100)
  assert.ok(a.incertezas.includes('Prévia pequena demais para medir nitidez'))
  assert.throws(() => avaliar({}), /sinais\.medidas/)
  assert.throws(() => avaliar(null), /sinais\.medidas/)
})

// ───────────────────────────── calibração dentro do ensaio ─────────────────────────────

test('calibração: a régua da nitidez é a das mais nítidas do próprio ensaio', () => {
  // ensaio de lente suave: 20 fotos com q de 0,58 a 0,675
  const ensaio = Array.from({ length: 20 }, (_, i) => ({ medidas: medidas({ q: 0.58 + i * 0.005 }), rostos: [] }))
  const ref = calibrar(ensaio)
  assert.equal(ref.n, 20)
  assert.equal(ref.calibrada, true)
  assert.ok(Math.abs(ref.p90 - 0.6655) < 1e-9, `p90 ${ref.p90}`)
  assert.equal(ref.topo, ref.p90)
  // a mais nítida do ensaio: 43 na régua de fábrica, 100 na régua do ensaio
  const melhor = { medidas: medidas({ q: 0.67 }), rostos: [] }
  assert.equal(avaliar(melhor).componentes.foco, 65)
  assert.equal(avaliar(melhor, { referencia: ref }).componentes.foco, 100)
  assert.equal(avaliar(melhor, { referencia: ref }).motivos[0], 'Nítida')
  // a pior continua embaixo: a régua não transforma borrada em nítida
  const pior = { medidas: medidas({ q: 0.58 }), rostos: [] }
  assert.ok(avaliar(pior, { referencia: ref }).componentes.foco < 45)
  // posto relativo
  assert.equal(ref.posto(0.58), 0)
  assert.equal(ref.posto(0.63), 0.5)
  assert.equal(ref.posto(0.9), 1)
  assert.equal(ref.posto(null), null)
})

test('calibração: nunca fica mais exigente que a de fábrica, nem aceita ensaio todo borrado; com poucas fotos, não calibra', () => {
  const de = (valores) => calibrar(valores.map((q) => ({ medidas: medidas({ q }), rostos: [] })))
  const nitido = de(Array.from({ length: 30 }, (_, i) => 0.8 + i * 0.01))
  assert.equal(nitido.topo, PARAMETROS.qTopo, 'ensaio todo nítido: a régua continua em 0,75')
  const borrado = de(Array.from({ length: 30 }, (_, i) => 0.52 + i * 0.001))
  assert.equal(borrado.topo, PARAMETROS.qTopoMinimo, 'ensaio todo borrado: o topo não desce de 0,65')
  assert.equal(PARAMETROS.qTopoMinimo, 0.65)
  assert.ok(avaliar({ medidas: medidas({ q: 0.55 }), rostos: [] }, { referencia: borrado }).detalhe.tetos.includes('foraDeFoco'))
  const pouco = de([0.6, 0.61, 0.62])
  assert.equal(pouco.calibrada, false)
  assert.equal(pouco.topo, PARAMETROS.qTopo)
  assert.equal(calibrar([]).n, 0)
  assert.equal(calibrar(undefined).topo, PARAMETROS.qTopo)
  // com gente, o que entra na régua é o foco do rosto, não o do quadro
  const comGente = calibrar(Array.from({ length: 12 }, () => ({ medidas: medidas({ q: 0.55 }), rostos: retrato({ q: 0.7 }) })))
  assert.ok(Math.abs(comGente.p50 - 0.7) < 1e-12)
})

// ───────────────────────────── cobertura ─────────────────────────────

test('cobertura: a única foto de um momento nunca vai para "fora" sozinha', () => {
  const borrada = { medidas: medidas({ q: 0.56 }), rostos: [] }
  assert.equal(avaliar(borrada).balde, 'fora')
  const unica = avaliar({ ...borrada, unica: true })
  assert.equal(unica.balde, 'talvez')
  assert.equal(unica.total, 35, 'a nota não muda: só o balde')
  assert.equal(unica.motivos[0], 'Única foto deste momento')
  assert.equal(unica.motivos[1], 'Fora de foco')
  assert.equal(unica.detalhe.protegida, true)
  // foto boa não precisa de proteção
  assert.equal(avaliar({ medidas: medidas(), rostos: [], unica: true }).detalhe.protegida, false)
})

test('cobertura: no ensaio, o grupo todo reprovado mantém a melhor; grupo com uma boa deixa as ruins saírem', () => {
  const em = (s, sub) => ({ data: `2026-03-07T11:00:${String(s).padStart(2, '0')}`, subsegundo: sub })
  const fotos = [
    // momento A: três quadros, todos tremidos ou borrados
    { id: 'a1', exif: em(0, 0), medidas: medidas({ q: 0.66, tremido: 20 }), rostos: [] },
    { id: 'a2', exif: em(0, 0.3), medidas: medidas({ q: 0.57 }), rostos: [] },
    { id: 'a3', exif: em(0, 0.6), medidas: medidas({ q: 0.66, tremido: 14 }), rostos: [] },
    // momento B: uma boa e uma borrada
    { id: 'b1', exif: em(30, 0), medidas: medidas({ dhash: 'ffffffffffffffff', phash: 'ffffffffffffffff' }), rostos: [] },
    { id: 'b2', exif: em(30, 0.4), medidas: medidas({ q: 0.55, dhash: 'ffffffffffffffff', phash: 'ffffffffffffffff' }), rostos: [] },
    // momento C: uma foto só, borrada
    { id: 'c1', exif: em(50, 0), medidas: medidas({ q: 0.55, dhash: '00000000ffffffff', phash: '00000000ffffffff' }), rostos: [] },
  ]
  const r = avaliarEnsaio(fotos)
  assert.deepEqual(
    r.grupos.map((g) => g.fotos),
    [
      ['a1', 'a2', 'a3'],
      ['b1', 'b2'],
    ],
  )
  const balde = (id) => r.magnitudes.get(id).balde
  assert.deepEqual(['a1', 'a2', 'a3'].map(balde), ['fora', 'talvez', 'fora'], 'a2 (35) é a melhor que há do momento A')
  assert.equal(r.magnitudes.get('a2').motivos[0], 'A melhor que há deste momento')
  assert.equal(r.magnitudes.get('a2').total, 35)
  assert.deepEqual(['b1', 'b2'].map(balde), ['fica', 'fora'], 'o momento B está coberto pela b1')
  assert.equal(balde('c1'), 'talvez')
  assert.equal(r.magnitudes.get('c1').motivos[0], 'Única foto deste momento')
  assert.equal(r.grupos[0].escolhida, 'a2')
  // todo momento tem pelo menos uma foto fora do balde "fora"
  for (const g of [...r.grupos.map((g) => g.fotos), ['c1']]) assert.ok(g.some((id) => balde(id) !== 'fora'))
})

test('cobertura: protegerCobertura não mexe na nota nem no que não é "fora", e aceita objeto simples', () => {
  const mag = (total, balde) => ({ total, balde, motivos: ['Fora de foco'], detalhe: { protegida: false } })
  const entrada = { x: mag(35, 'fora'), y: mag(30, 'fora'), z: mag(90, 'fica'), w: mag(20, 'fora') }
  const saida = protegerCobertura(entrada, [{ id: 'g', fotos: ['x', 'y'], tipo: 'repetidas' }])
  assert.equal(saida.get('x').balde, 'talvez')
  assert.equal(saida.get('y').balde, 'fora')
  assert.equal(saida.get('z').balde, 'fica')
  assert.equal(saida.get('w').balde, 'talvez', 'foto fora de grupo é um momento de uma foto só')
  assert.equal(saida.get('x').total, 35)
  assert.equal(entrada.x.balde, 'fora', 'a entrada não é alterada')
})

// ───────────────────────────── meta ao vivo ─────────────────────────────

test('meta: reordena por nota × novidade; cada momento entra antes de qualquer repetida', () => {
  const f = (id, total) => ({ id, magnitude: { total } })
  const fotos = [f('a1', 95), f('a2', 93), f('a3', 90), f('b1', 80), f('b2', 60), f('c', 70), f('d', 40)]
  const grupos = [
    { id: 'A', fotos: ['a1', 'a2', 'a3'], tipo: 'repetidas' },
    { id: 'B', fotos: ['b1', 'b2'], tipo: 'sequencia' },
  ]
  const r = meta(fotos, 4, { grupos })
  // a1 95; b1 80; c 70; d 40; b2 60 · 0,5 = 30; a2 93 · 0,25 = 23,25; a3 90 · 0,0625 = 5,6
  assert.deepEqual(r.ordem, ['a1', 'b1', 'c', 'd', 'b2', 'a2', 'a3'])
  assert.deepEqual(r.ficam, ['a1', 'b1', 'c', 'd'])
  assert.deepEqual(r.saem, ['b2', 'a2', 'a3'])
  assert.equal(r.corte, 40)
  // mudar a meta só corta em outro lugar: a ordem é a mesma (nada é reanalisado)
  assert.deepEqual(meta(fotos, 2, { grupos }).ficam, ['a1', 'b1'])
  assert.deepEqual(meta(fotos, 6, { grupos }).ficam, ['a1', 'b1', 'c', 'd', 'b2', 'a2'])
  assert.deepEqual(meta(fotos, 99, { grupos }).ficam.length, 7)
  assert.deepEqual(meta(fotos, 0, { grupos }), { ficam: [], saem: r.ordem, ordem: r.ordem, corte: null })
  // sem grupos, vale só a nota
  assert.deepEqual(meta(fotos, 3).ficam, ['a1', 'a2', 'a3'])
  assert.deepEqual(PARAMETROS.novidade, { repetidas: 0.25, sequencia: 0.5 })
})

test('meta: empate fica na ordem de entrada, foto sem nota fica de fora, e 5.000 fotos reordenam na hora', (t) => {
  const f = (id, total) => ({ id, magnitude: { total } })
  assert.deepEqual(meta([f('x', 80), f('y', 80), { id: 'sem' }, f('z', 81)], 2).ficam, ['z', 'x'])
  const fotos = Array.from({ length: 5000 }, (_, i) => f(`f${i}`, (i * 37) % 101))
  const grupos = Array.from({ length: 800 }, (_, g) => ({
    id: `g${g}`,
    tipo: g % 2 ? 'repetidas' : 'sequencia',
    fotos: [0, 1, 2, 3, 4].map((k) => `f${g * 5 + k}`),
  }))
  const t0 = performance.now()
  const r = meta(fotos, 500, { grupos })
  const ms = performance.now() - t0
  t.diagnostic(`meta com 5.000 fotos e 800 grupos: ${ms.toFixed(1)} ms`)
  assert.equal(r.ficam.length, 500)
  assert.ok(ms < 200, `${ms} ms`)
})

// ───────────────────────────── aprendizado ─────────────────────────────

test('aprendizado: trocar a escolhida move os pesos, explica em palavras e diz como zerar', () => {
  const fabrica = pesosPadrao()
  // a pessoa prefere, três vezes, a foto de expressão melhor à que era mais nítida
  const troca = {
    preferida: { foco: 70, pessoas: 95, exposicao: 100, ruido: 100 },
    preterida: { foco: 100, pessoas: 75, exposicao: 100, ruido: 100 },
    preferidaRosto: { olhos: 1, nitidez: 0.6, expressao: 0.95 },
    preteridaRosto: { olhos: 1, nitidez: 1, expressao: 0.55 },
  }
  const r = ajustarPesos(fabrica, [troca, troca, troca])
  assert.ok(r.pesos.pessoas.pessoas > fabrica.pessoas.pessoas, 'pessoas ganhou peso')
  assert.ok(r.pesos.pessoas.foco < fabrica.pessoas.foco, 'foco perdeu peso')
  assert.ok(r.pesos.rosto.expressao > fabrica.rosto.expressao && r.pesos.rosto.nitidez < fabrica.rosto.nitidez)
  assert.deepEqual(r.pesos.demais, fabrica.demais, 'a troca foi em foto com gente: os pesos das fotos sem gente não mudam')
  assert.deepEqual(r.explicacao, ['Você tem dado mais valor a pessoas do que a nitidez.', 'Você tem dado mais valor a expressão do que a nitidez do rosto.'])
  assert.equal(r.zerar, 'Zerar o aprendizado volta aos pesos de fábrica.')
  // a soma de cada conjunto continua a mesma, e a entrada não é alterada
  const soma = (o) => Object.values(o).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(soma(r.pesos.pessoas) - 90) < 1e-9)
  assert.ok(Math.abs(soma(r.pesos.rosto) - 1) < 1e-9)
  assert.deepEqual(fabrica, pesosPadrao())
  // o passo de uma troca: e^(0,15 × diferença), antes de devolver a soma
  const uma = ajustarPesos(fabrica, [troca]).pesos.pessoas
  assert.ok(Math.abs(uma.pessoas / uma.foco - Math.exp(0.15 * 0.2) / Math.exp(0.15 * -0.3)) < 1e-9)
  // os pesos novos mudam a nota no sentido da preferência
  const nitidaSeria = { medidas: medidas(), rostos: retrato({ q: 0.9, sorriso: 0 }) }
  const suaveRindo = { medidas: medidas(), rostos: retrato({ q: 0.66, sorriso: 1 }) }
  const diferenca = (pesos) => avaliar(suaveRindo, { pesos }).total - avaliar(nitidaSeria, { pesos }).total
  assert.ok(diferenca(r.pesos) > diferenca(fabrica))
})

test('aprendizado: nenhum peso passa de metade ou do dobro do de fábrica; sem troca, nada muda; zerar é pesosPadrao()', () => {
  const troca = { preferida: { foco: 0, exposicao: 100, ruido: 100 }, preterida: { foco: 100, exposicao: 0, ruido: 100 } }
  const muitas = ajustarPesos(
    pesosPadrao(),
    Array.from({ length: 200 }, () => troca),
  ).pesos.demais
  const fabrica = pesosPadrao().demais
  // o limite vale antes de a soma voltar ao que era; depois dela, a razão entre dois pesos não passa de 4 vezes a de fábrica
  assert.ok(muitas.exposicao / muitas.foco <= (4 * fabrica.exposicao) / fabrica.foco + 1e-9)
  assert.ok(muitas.foco > 0 && muitas.exposicao > fabrica.exposicao)
  assert.ok(Math.abs(muitas.foco + muitas.exposicao + muitas.ruido - 100) < 1e-9)
  const nada = ajustarPesos(pesosPadrao(), [])
  assert.deepEqual(nada.pesos, pesosPadrao())
  assert.deepEqual(nada.explicacao, ['Suas trocas ainda não apontam uma preferência.'])
  assert.deepEqual(ajustarPesos(undefined, undefined).pesos, pesosPadrao())
  assert.deepEqual(ajustarPesos(pesosPadrao(), [null, {}, { preferida: {} }]).pesos, pesosPadrao(), 'troca incompleta é ignorada')
  // troca em foto sem gente mexe só no conjunto "demais"
  const semGente = ajustarPesos(pesosPadrao(), [troca])
  assert.deepEqual(semGente.pesos.pessoas, pesosPadrao().pessoas)
  assert.deepEqual(semGente.explicacao, ['Você tem dado mais valor a exposição do que a nitidez.'])
})

// ───────────────────────────── motivos e dicas ─────────────────────────────

test('motivos: no máximo três frases curtas, a de maior peso primeiro', () => {
  // foco suave (perde 55 · 0,35 = 19 pontos), ruído alto (perde 15 · 0,8 = 12), exposição (perde 30 · 0,12 = 3,6)
  const a = avaliar({ medidas: medidas({ q: 0.67, ruido: 10, altas: 0.04 }), rostos: [] })
  assert.deepEqual(a.motivos, ['Foco suave', 'Muito ruído', 'Altas luzes estouradas em 4%'])
  // "A mais nítida de 7" quando o grupo diz
  const melhor = avaliar({ medidas: medidas(), rostos: [], grupo: { tamanho: 7, maisNitida: true } })
  assert.equal(melhor.motivos[0], 'A mais nítida de 7')
  assert.equal(avaliar({ medidas: medidas(), rostos: [], grupo: { tamanho: 7, maisNitida: false } }).motivos[0], 'Nítida')
  for (const m of [...a.motivos, ...melhor.motivos]) assert.ok(m.length <= 60 && !m.endsWith('.'), m)
  // os exemplos do contrato saem exatamente assim
  assert.equal(TEXTOS.MOTIVOS.olhosFechados(1, 1), 'Olhos fechados')
  assert.equal(TEXTOS.MOTIVOS.maisNitida(7), 'A mais nítida de 7')
  assert.equal(TEXTOS.MOTIVOS.tremida(12.4), 'Tremida, cerca de 12 px')
  assert.equal(TEXTOS.MOTIVOS.altasPerdidas(0.03), 'Altas luzes perdidas em 3%')
})

test('dicas: horizonte torto só em cena com horizonte, com linha comprida e ângulo que vale consertar; não mexe na nota', () => {
  const com = (horizonte, cena) => avaliar({ medidas: medidas({ horizonte }), rostos: [], cena })
  const torto = com({ angulo: 2.5, forca: 1.8 }, 'paisagem')
  assert.deepEqual(torto.dicas, ['Horizonte torto, cerca de 3°'])
  assert.equal(torto.total, 100)
  assert.deepEqual(com({ angulo: -1.5, forca: 1.8 }, { cena: 'arquitetura', noite: false }).dicas, ['Horizonte torto, cerca de 1,5°'])
  assert.deepEqual(com({ angulo: 2.5, forca: 0.8 }, 'paisagem').dicas, [], 'linha curta')
  assert.deepEqual(com({ angulo: 0.5, forca: 2 }, 'paisagem').dicas, [], 'menos de 0,7°')
  assert.deepEqual(com({ angulo: 12, forca: 2 }, 'paisagem').dicas, [], 'mais de 10° é de propósito')
  assert.deepEqual(com({ angulo: 2.5, forca: 1.8 }, 'retrato').dicas, [], 'retrato não tem horizonte')
  assert.deepEqual(com({ angulo: 2.5, forca: 1.8 }).dicas, [], 'sem cena, sem dica')
  // rosto principal cortado na borda
  const cortado = avaliar({ medidas: medidas(), rostos: retrato({ cortado: true }) })
  assert.deepEqual(cortado.dicas, ['Rosto cortado na borda'])
})

test('textos: tudo em português curto, num lugar só; números com vírgula', () => {
  assert.equal(TEXTOS.porcento(0.031), '3%')
  assert.equal(TEXTOS.porcento(0.007), '0,7%')
  assert.equal(TEXTOS.porcento(0.224), '22%')
  assert.equal(TEXTOS.porcento(0.0001), 'menos de 0,1%')
  assert.equal(TEXTOS.numero(1.5, 1), '1,5')
  assert.deepEqual(TEXTOS.BALDES, { fica: 'Ficam', talvez: 'Talvez', fora: 'Fora' })
  assert.deepEqual(Object.keys(TEXTOS.RIGORES), Object.keys(RIGORES))
  assert.deepEqual(Object.keys(TEXTOS.CENAS), [
    'retrato',
    'grupo',
    'pessoas',
    'animal',
    'natureza',
    'paisagem',
    'comida',
    'arquitetura',
    'produto',
    'documento',
    'noturna',
    'outra',
  ])
  assert.deepEqual(Object.keys(TEXTOS.COMPONENTES), ['foco', 'pessoas', 'exposicao', 'ruido'])
  assert.deepEqual(Object.keys(TEXTOS.GRUPOS), ['repetidas', 'sequencia'])
  assert.deepEqual(Object.keys(TEXTOS.CONFIANCAS), ['alta', 'media', 'baixa'])
  assert.equal(TEXTOS.EMPATE.equivalentes(3), '3 equivalentes')
  // toda frase de motivo, dica e incerteza é curta e sem ponto final
  const frases = [
    ...Object.values(TEXTOS.MOTIVOS).map((f) => f(0.12, 3)),
    ...Object.values(TEXTOS.DICAS).map((f) => f(2)),
    ...Object.values(TEXTOS.INCERTEZAS).map((f) => f()),
  ]
  for (const frase of frases) {
    assert.equal(typeof frase, 'string')
    assert.ok(frase.length > 3 && frase.length <= 60, frase)
    assert.ok(!/[.!]$/.test(frase), frase)
    assert.ok(!/undefined|NaN|null/.test(frase), frase)
  }
})

// ───────────────────────────── de ponta a ponta, em imagens medidas ─────────────────────────────

test('ensaio de ponta a ponta: uma rajada sintética com um quadro tremido e um borrado', () => {
  const cena = folhas(91, 860, 580, { raioMin: 2.5 })
  const em = (s, sub) => ({ data: `2026-03-07T09:00:${String(s).padStart(2, '0')}`, subsegundo: sub })
  const fotos = [
    { id: 'boa', exif: em(0, 0), medidas: medir(fotografar(quadro(cena), 1)), rostos: [], tipo: 'imagem' },
    { id: 'borrada', exif: em(0, 0.25), medidas: medir(fotografar(gauss(quadro(cena, 0.005, 0), 2.5), 2)), rostos: [], tipo: 'imagem' },
    { id: 'tremida', exif: em(0, 0.5), medidas: medir(fotografar(movimento(quadro(cena, 0.01, 0.005), 17, 30), 3)), rostos: [], tipo: 'imagem' },
    { id: 'outra', exif: em(0, 0.75), medidas: medir(fotografar(quadro(cena, 0.01, 0.01), 4)), rostos: [], tipo: 'imagem' },
    {
      id: 'estourada',
      exif: em(40, 0),
      medidas: medir(fotografar(clarear(quadro(folhas(92, 860, 580, { raioMin: 2.5 })), 2.5), 5)),
      rostos: [],
      tipo: 'imagem',
    },
  ]
  const r = avaliarEnsaio(fotos)
  assert.deepEqual(
    r.grupos.map((g) => [g.tipo, ...g.fotos]),
    [['repetidas', 'boa', 'borrada', 'tremida', 'outra']],
  )
  const m = (id) => r.magnitudes.get(id)
  assert.equal(m('boa').balde, 'fica')
  assert.equal(m('outra').balde, 'fica')
  assert.equal(m('borrada').balde, 'fora')
  assert.equal(m('borrada').motivos[0], 'Fora de foco')
  assert.equal(m('tremida').balde, 'fora')
  assert.match(m('tremida').motivos[0], /^Tremida, cerca de 1[5-8] px$/)
  assert.equal(m('estourada').total, 50)
  assert.match(m('estourada').motivos[0], /^Altas luzes perdidas em \d+%$/)
  assert.equal(m('estourada').balde, 'talvez')
  // as duas boas estão dentro da margem de erro: equivalentes, com desempate declarado
  assert.ok(['boa', 'outra'].includes(r.grupos[0].escolhida))
  assert.deepEqual(r.grupos[0].equivalentes.sort(), ['boa', 'outra'])
  assert.ok(['nitidez', 'ordem'].includes(r.grupos[0].desempate))
  // a meta de 2 fica com um quadro de cada momento
  assert.deepEqual(
    meta(
      fotos.map((f) => ({ id: f.id, magnitude: m(f.id) })),
      2,
      { grupos: r.grupos },
    ).ficam.sort(),
    [r.grupos[0].escolhida, 'estourada'].sort(),
  )
})

test('margem de erro: quadros igualmente nítidos da mesma cena medem q a até 0,05 um do outro', (t) => {
  let pior = 0
  const tipicos = []
  for (const semente of [31, 32, 33]) {
    const base = folhas(semente, 860, 580, { raioMin: 2.5 })
    const qs = [
      [0, 0],
      [0.01, 0.005],
      [-0.01, 0.01],
      [0.03, 0.01],
      [0.02, -0.02],
    ].map(([fx, fy], i) => medir(fotografar(quadro(base, fx, fy), 100 + i), { horizonte: false }).nitidez.qLocal)
    const faixa = Math.max(...qs) - Math.min(...qs)
    tipicos.push(faixa)
    pior = Math.max(pior, faixa)
  }
  t.diagnostic(`variação de q entre quadros da mesma cena (andando 1% a 3%): ${tipicos.map((v) => v.toFixed(3)).join(', ')}`)
  assert.ok(pior <= 0.05, `pior variação ${pior}`)
  assert.ok(pior <= FOLGA_DE_NITIDEZ + 0.01, 'a folga de nitidez do desempate cobre a variação medida')
  // 0,02 de q, na parte da régua que não saturou, são perto de 5 pontos da nota sem gente: é a margem de erro
  const a = avaliar({ medidas: medidas({ q: 0.64 }), rostos: [] }).total
  const b = avaliar({ medidas: medidas({ q: 0.66 }), rostos: [] }).total
  assert.ok(Math.abs(b - a - MARGEM_DE_ERRO) <= 1, `0,02 de q = ${b - a} pontos`)
})
