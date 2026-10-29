// "Abrir no TPeasy" (app/js/hub.js) e o registro de leituras (app/js/leituras.js, contrato tpeasy.leituras/1).
// Sem DOM: as funções puras que o app usa.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { marcaDoTexto, mesclarDoHub, projetoDoHash } from '../app/js/hub.js'
import { CONTRATO, MAX_LEITURAS, MIN_MS, acrescentar, comecar, isoLocal, nomeDoArquivo, paraJsonl, passarBloco, roteiroDaLeitura, terminar, usouVoz } from '../app/js/leituras.js'

const P = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'
const DOC1 = '11111111-2222-4333-8444-555555555555'
const DOC2 = '11111111-2222-4333-8444-666666666666'
const resp = (body, versao = 1, documento = DOC1) => ({ projeto: P, versao, documento, roteiro: { id: `zro-${P}`, title: 'Lançamento', body, updated: 1 } })
let n = 0
const novoId = () => `copia-${++n}`

describe('Abrir no TPeasy', () => {
  test('só #hub/<uuid> vira projeto', () => {
    assert.equal(projetoDoHash(`#hub/${P.toUpperCase()}`), P)
    for (const h of ['', '#hub/', '#hub/123', `#hub/${P}/x`, `#roteiros`, `hub/${P}`, `#hub/${P}?a=1`]) assert.equal(projetoDoHash(h), null, h)
  })

  test('primeira vez: o roteiro entra com a versão e a marca do texto', () => {
    const m = mesclarDoHub([{ id: 'a', title: 'Meu', body: 'oi' }], resp('# Gancho\nOlá'), { agora: 10, novoId })
    assert.equal(m.mudou, true)
    assert.equal(m.copia, null)
    const s = m.lista.find((x) => x.id === `zro-${P}`)
    assert.deepEqual(s.zro, { projeto: P, versao: 1, documento: DOC1, marca: marcaDoTexto('# Gancho\nOlá') })
    assert.equal(s.body, '# Gancho\nOlá')
    assert.equal(m.lista.length, 2)
  })

  test('mesma versão: nada muda (nem a posição de leitura)', () => {
    const a = mesclarDoHub([], resp('texto'), { agora: 10, novoId }).lista
    a[0].pos = 0.4
    const m = mesclarDoHub(a, resp('texto'), { agora: 20, novoId })
    assert.equal(m.mudou, false)
    assert.equal(m.lista[0].pos, 0.4)
  })

  test('versão nova: troca o texto e volta ao começo; favorito e meta ficam', () => {
    const a = mesclarDoHub([], resp('v1'), { agora: 10, novoId }).lista
    Object.assign(a[0], { pos: 0.5, fav: true, target: 60 })
    const m = mesclarDoHub(a, resp('v2', 2, DOC2), { agora: 20, novoId })
    assert.equal(m.mudou, true)
    assert.equal(m.copia, null, 'ninguém mexeu no aparelho: sem cópia')
    assert.deepEqual([m.lista[0].body, m.lista[0].pos, m.lista[0].fav, m.lista[0].target, m.lista[0].zro.versao], ['v2', 0, true, 60, 2])
  })

  test('mexeu no aparelho e chegou versão nova: a mudança vira cópia, nada se perde', () => {
    const a = mesclarDoHub([], resp('v1'), { agora: 10, novoId }).lista
    a[0].body = 'v1 com ajuste meu'
    const m = mesclarDoHub(a, resp('v2', 2, DOC2), { agora: 20, novoId })
    const copia = m.lista.find((x) => x.id === m.copia)
    assert.equal(copia.body, 'v1 com ajuste meu')
    assert.equal(copia.title, 'Lançamento (do aparelho)')
    assert.equal(copia.zro, undefined, 'a cópia é do aparelho, não da Absolute ZRO')
    assert.equal(m.lista.find((x) => x.id === `zro-${P}`).body, 'v2')
  })

  test('roteiro apagado no aparelho volta; backup antigo com o mesmo texto não vira cópia', () => {
    const apagado = [{ id: `zro-${P}`, title: '', body: '', deleted: true, updated: 5 }]
    const m = mesclarDoHub(apagado, resp('v1'), { agora: 10, novoId })
    assert.equal(m.lista.length, 1)
    assert.equal(m.lista[0].deleted, undefined)
    const antigo = [{ id: `zro-${P}`, title: 'Lançamento', body: 'v1', updated: 5 }]
    const r = mesclarDoHub(antigo, resp('v1'), { agora: 10, novoId })
    assert.equal(r.copia, null)
    assert.equal(r.lista[0].zro.versao, 1, 'ganha a versão sem mexer no texto')
  })
})

describe('registro de leituras (tpeasy.leituras/1)', () => {
  const rot = { id: `zro-${P}`, title: 'Lançamento', body: '', zro: { versao: 3 } }
  const t0 = Date.UTC(2026, 9, 29, 17, 3, 12, 345)

  test('hora do aparelho com fuso', () => {
    assert.equal(isoLocal(t0, -180), '2026-10-29T14:03:12.345-03:00')
    assert.equal(isoLocal(t0, 330), '2026-10-29T22:33:12.345+05:30')
    assert.equal(nomeDoArquivo(t0, -180), 'TPeasy-leituras-2026-10-29.jsonl')
  })

  test('o roteiro leva o projeto e a versão só quando veio da Absolute ZRO', () => {
    assert.deepEqual(roteiroDaLeitura(rot), { id: `zro-${P}`, titulo: 'Lançamento', projeto: P, versao: 3 })
    assert.deepEqual(roteiroDaLeitura({ id: 'abc', title: '' }), { id: 'abc', titulo: 'Sem título', projeto: null, versao: null })
  })

  test('uma leitura com bip, passando por blocos, até o fim', () => {
    const l = comecar({ roteiro: rot, agora: t0, fusoMin: -180, bip: true, contagem: 3, bloco: null })
    passarBloco(l, { i: 0, nome: 'Gancho' }, t0 + 400)
    passarBloco(l, { i: 0, nome: 'Gancho' }, t0 + 900)
    passarBloco(l, { i: 1, nome: 'Oferta' }, t0 + 12_000)
    usouVoz(l)
    const linha = terminar(l, { agora: t0 + 20_000, completo: true })
    assert.deepEqual(linha, {
      contrato: CONTRATO,
      id: l.id,
      roteiro: { id: `zro-${P}`, titulo: 'Lançamento', projeto: P, versao: 3 },
      inicio: '2026-10-29T14:03:12.345-03:00',
      fim: '2026-10-29T14:03:32.345-03:00',
      fuso_min: -180,
      duracao_ms: 20_000,
      bip: true,
      contagem_s: 3,
      voz: true,
      completo: true,
      blocos: [
        { i: null, nome: null, em_ms: 0 },
        { i: 0, nome: 'Gancho', em_ms: 400 },
        { i: 1, nome: 'Oferta', em_ms: 12_000 },
      ],
    })
    assert.match(l.id, /^l[0-9a-f]{18}$/)
  })

  test('toque sem querer (menos de 1,5 s) não entra', () => {
    const l = comecar({ roteiro: rot, agora: t0 })
    assert.equal(terminar(l, { agora: t0 + MIN_MS - 1 }), null)
  })

  test('guarda só as últimas e exporta uma por linha', () => {
    let lista = []
    for (let i = 0; i < MAX_LEITURAS + 5; i++) lista = acrescentar(lista, { n: i })
    assert.equal(lista.length, MAX_LEITURAS)
    assert.equal(lista[0].n, 5)
    assert.equal(paraJsonl([{ a: 1 }, { b: 2 }]), '{"a":1}\n{"b":2}\n')
    assert.equal(paraJsonl([]), '')
  })
})
