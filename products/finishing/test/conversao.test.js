import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { destino } from '../src/entrega/destinos.js'
import { DESTINOS_CONVERSAO, nomeSaida, planejar, tamanhoLegivel } from '../src/conversao/plano.js'
import { prores } from '../scripts/vendor.mjs'

const master4k = {
  largura: 3840,
  altura: 2160,
  fps: 24,
  duracao: 60,
  temAudio: true,
  cor: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709' },
  codec: 'prores',
}

test('destinos do conversor: só MP4 em 8 bits (HDR fica para o Resolve)', () => {
  assert.deepEqual(
    DESTINOS_CONVERSAO.map((d) => d.id),
    ['youtube', 'vimeo', 'reels', 'tiktok'],
  )
})

test('YouTube a partir de master 4K: H.264, bitrate de 2160p, tags BT.709, AAC com Opus de reserva', () => {
  const p = planejar(master4k, destino('youtube'))
  assert.deepEqual(p.video, { codec: 'avc', largura: 3840, altura: 2160, bitrate: 45_000_000 })
  assert.deepEqual(p.audio.codecs, ['aac', 'opus'])
  assert.equal(p.audio.bitrate, 384_000)
  assert.equal(p.cor.matrix, 'bt709')
  assert.equal(p.avisos.length, 0)
  // (45 000 + 384) kbit/s × 60 s ÷ 8
  assert.equal(p.tamanhoEstimado, Math.round(((45000 + 384) * 1000 * 60) / 8))
})

test('reduz sem ampliar e mantém dimensões pares', () => {
  assert.deepEqual(planejar(master4k, destino('youtube'), { resolucao: 1080 }).video, { codec: 'avc', largura: 1920, altura: 1080, bitrate: 8_000_000 })
  const pequeno = planejar({ ...master4k, largura: 1280, altura: 720 }, destino('youtube'), { resolucao: 2160 })
  assert.deepEqual([pequeno.video.largura, pequeno.video.altura], [1280, 720])
  assert.match(pequeno.avisos[0], /não amplio/)
  const impar = planejar({ ...master4k, largura: 1998, altura: 1080 }, destino('youtube'), { resolucao: 720 })
  assert.equal(impar.video.largura % 2, 0)
})

test('vertical: 9:16 vai a 1080×1920; horizontal avisa e não corta', () => {
  const vertical = planejar({ ...master4k, largura: 2160, altura: 3840 }, destino('reels'))
  assert.deepEqual([vertical.video.largura, vertical.video.altura, vertical.video.bitrate], [1080, 1920, 12_000_000])
  const horizontal = planejar(master4k, destino('tiktok'))
  assert.deepEqual([horizontal.video.largura, horizontal.video.altura], [1920, 1080])
  assert.match(horizontal.avisos[0], /horizontal/)
})

test('HDR, outro espaço de cor e cadência alta geram aviso; sem áudio não pede codec de áudio', () => {
  assert.match(planejar({ ...master4k, cor: { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl' } }, destino('youtube')).avisos[0], /HDR/)
  assert.match(planejar({ ...master4k, cor: { primaries: 'smpte432', transfer: 'bt709', matrix: 'bt709' } }, destino('vimeo')).avisos[0], /smpte432/)
  assert.match(planejar({ ...master4k, fps: 120 }, destino('youtube')).avisos[0], /120 fps/)
  assert.equal(planejar({ ...master4k, temAudio: false }, destino('youtube')).audio, null)
})

test('nome e tamanho legíveis', () => {
  assert.equal(nomeSaida('Filme Master v3.mov', destino('youtube')), 'Filme Master v3-youtube.mp4')
  assert.equal(tamanhoLegivel(1_234_000_000), '1,2 GB')
  assert.equal(tamanhoLegivel(350_400_000), '350 MB')
})

test('vendor/ bate com os pacotes instalados (só o import do ProRes muda)', () => {
  const vendor = (p) => readFileSync(new URL(`../vendor/${p}`, import.meta.url))
  const nm = (p) => readFileSync(new URL(`../node_modules/${p}`, import.meta.url))
  assert.ok(vendor('mediabunny.min.mjs').equals(nm('mediabunny/dist/bundles/mediabunny.min.mjs')))
  assert.equal(vendor('mediabunny-prores.min.mjs').toString(), prores())
  assert.match(vendor('LICENSE-mediabunny.txt').toString(), /Mozilla Public License/)
})
