// "Abrir do SOBEDESCE": lê o resumo das descargas (ou as pastas com o relatório de conferência) sem mexer em nada.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const { lerProjeto } = createRequire(import.meta.url)('../desktop/sobedesce.cjs')

function arquivo(...partes) {
  const f = join(...partes)
  mkdirSync(join(f, '..'), { recursive: true })
  writeFileSync(f, 'x'.repeat(16))
  return f
}

test('pelo descargas.jsonl: cartões com mídia, conferidos ou não, a segunda leva substitui a primeira', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'aiedit-sbd-'))
  try {
    const c1 = 'Diária 01/Cenas/Ana - FX30/Cartão 01'
    const c2 = 'Diária 01/Cenas/Bia - ZV-E10/Cartão 01'
    arquivo(raiz, c1, 'PRIVATE/M4ROOT/CLIP/C0001.MP4')
    arquivo(raiz, c1, 'PRIVATE/M4ROOT/CLIP/C0001M01.XML')
    arquivo(raiz, c2, 'DCIM/100MSDCF/C0002.MP4')
    arquivo(raiz, c2, 'Audio/ZOOM0001.WAV')
    const linha = (o) => JSON.stringify({ v: 1, app: 'sobedesce', ...o })
    mkdirSync(join(raiz, '.sobedesce'))
    writeFileSync(
      join(raiz, '.sobedesce', 'descargas.jsonl'),
      [
        linha({ id: 'a', quando: '2026-10-26T10:00:00Z', diaria: { n: 1, nome: 'Diária 01' }, dono: { nome: 'Ana', camera: 'FX30' }, cartao: { n: 1, nome: 'SD', pasta: c1 }, resultado: 'falta', arquivos: [{ rel: 'PRIVATE/M4ROOT/CLIP/C0001.MP4' }] }),
        linha({ id: 'b', quando: '2026-10-26T11:00:00Z', diaria: { n: 1, nome: 'Diária 01' }, dono: { nome: 'Ana', camera: 'FX30' }, cartao: { n: 1, nome: 'SD', pasta: c1 }, resultado: 'ok', arquivos: [{ rel: 'PRIVATE/M4ROOT/CLIP/C0001.MP4' }, { rel: 'PRIVATE/M4ROOT/CLIP/C0001M01.XML' }] }),
        linha({ id: 'c', diaria: { n: 1 }, dono: { nome: 'Bia', camera: 'ZV-E10' }, cartao: { n: 1, pasta: c2 }, resultado: 'erro', arquivos: [{ rel: 'DCIM/100MSDCF/C0002.MP4' }, { rel: 'Audio/ZOOM0001.WAV' }, { rel: '../../fora.mp4' }] }),
        linha({ id: 'd', cartao: { n: 2, pasta: 'Diária 01/Cenas/Ana - FX30/Cartão 02' }, resultado: 'cancelado', arquivos: [] }),
        '{ linha estragada',
        '',
      ].join('\n'),
    )
    const antes = readdirSync(raiz).sort()
    const p = await lerProjeto(raiz)
    assert.equal(p.origem, 'resumo')
    assert.equal(p.cartoes.length, 2)
    const [ana, bia] = p.cartoes
    assert.equal(ana.id, 'b')
    assert.equal(ana.conferido, true)
    assert.deepEqual(ana.dono, { nome: 'Ana', camera: 'FX30' })
    assert.deepEqual(
      ana.midias.map((m) => m.nome),
      ['C0001.MP4'],
    )
    assert.equal(bia.conferido, false)
    assert.deepEqual(
      bia.midias.map((m) => [m.nome, m.audio]),
      [
        ['ZOOM0001.WAV', true],
        ['C0002.MP4', false],
      ],
    )
    assert.ok(bia.midias.every((m) => m.abs.startsWith(raiz)))
    assert.deepEqual(readdirSync(raiz).sort(), antes, 'nada criado na pasta do projeto')
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})

test('sem o resumo: só os cartões com relatório de conferência', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'aiedit-sbd-'))
  try {
    arquivo(raiz, 'Diária 02/Cenas/Caio - A7S3/Cartão 01/C0010.MP4')
    arquivo(raiz, 'Diária 02/Cenas/Caio - A7S3/Cartão 01/SOBEDESCE_copia_20261026.xxh64')
    arquivo(raiz, 'Diária 02/Cenas/Caio - A7S3/Cartão 02/C0011.MP4')
    const p = await lerProjeto(raiz)
    assert.equal(p.origem, 'pastas')
    assert.equal(p.cartoes.length, 1)
    assert.deepEqual(p.cartoes[0].dono, { nome: 'Caio', camera: 'A7S3' })
    assert.equal(p.cartoes[0].midias[0].rel, 'Diária 02/Cenas/Caio - A7S3/Cartão 01/C0010.MP4')
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})

test('pasta que não é do SOBEDESCE', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'aiedit-sbd-'))
  try {
    await assert.rejects(lerProjeto(raiz), /Não achei um projeto do SOBEDESCE/)
    await assert.rejects(lerProjeto(join(raiz, 'nada')), /não existe/)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})
