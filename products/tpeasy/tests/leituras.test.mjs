// Registro de leituras (app/js/leituras.js, contrato tpeasy.leituras/1): cada leitura no TP vira uma linha com a hora do
// bip e os blocos que passaram. Sem DOM: as funções puras que o app usa.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { CONTRATO, MAX_LEITURAS, MIN_MS, acrescentar, comecar, isoLocal, nomeDoArquivo, paraJsonl, passarBloco, roteiroDaLeitura, terminar, usouVoz } from '../app/js/leituras.js'

const P = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'

describe('registro de leituras (tpeasy.leituras/1)', () => {
  const rot = { id: `maestro-${P}-todas`, title: 'Lançamento', body: '', origem: { app: 'maestro', item: `maestro-${P}-todas`, versao: 3 } }
  const t0 = Date.UTC(2026, 9, 29, 17, 3, 12, 345)

  test('hora do aparelho com fuso', () => {
    assert.equal(isoLocal(t0, -180), '2026-10-29T14:03:12.345-03:00')
    assert.equal(isoLocal(t0, 330), '2026-10-29T22:33:12.345+05:30')
    assert.equal(nomeDoArquivo(t0, -180), 'TPeasy-leituras-2026-10-29.jsonl')
  })

  test('o roteiro leva a origem e a versão só quando veio do Maestro', () => {
    assert.deepEqual(roteiroDaLeitura(rot), { id: `maestro-${P}-todas`, titulo: 'Lançamento', origem: 'maestro', versao: 3 })
    assert.deepEqual(roteiroDaLeitura({ id: 'abc', title: '' }), { id: 'abc', titulo: 'Sem título', origem: null, versao: null })
    assert.deepEqual(roteiroDaLeitura({ id: 'x', title: 'y', origem: { app: 'outro', versao: 2 } }), { id: 'x', titulo: 'y', origem: null, versao: null })
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
      roteiro: { id: `maestro-${P}-todas`, titulo: 'Lançamento', origem: 'maestro', versao: 3 },
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
