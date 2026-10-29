import { test } from 'node:test'
import assert from 'node:assert/strict'
import { especificacaoDe, exportar, importar, presetPersonalizado } from '../src/personalizado.js'
import { preset } from '../src/presets.js'
import { planejar } from '../src/plano.js'
import { argsFfmpeg } from '../src/ffmpeg.js'

const origem = { largura: 3840, altura: 2160, fps: 59.94, duracao: 30, temVideo: true, temAudio: true, canais: 2, taxa: 48000, cor: null }

test('parte de um preset do Relay e muda o que a pessoa quer', () => {
  const e = { ...especificacaoDe(preset('youtube-1080')), nome: 'Cliente X', kbps: 25000, fps: 30, gop: 1 }
  const p = presetPersonalizado(e)
  assert.match(p.id, /^meu-/)
  assert.equal(p.grupo, 'Meus')
  assert.equal(p.base, 'youtube-1080')
  const plano = planejar(origem, p)
  assert.deepEqual([plano.video.largura, plano.video.altura], [1920, 1080])
  assert.equal(plano.video.bitrate, 25_000_000) // literal, sem ajuste pela área
  assert.equal(plano.video.fps, 29.97)
  assert.equal(plano.video.gop, 1)
  assert.equal(p.resumo, 'H.264 · 1080p · 25 Mbit/s')
})

test('bitrate da pessoa no computador = duas passadas', () => {
  const p = presetPersonalizado({ ...especificacaoDe(preset('vimeo')), nome: 'Arquivo', kbps: 12000 })
  const plano = planejar(origem, p, { motor: 'computador' })
  assert.equal(argsFfmpeg(plano, { input: 'a', output: 'b.mp4', origem, log: '/tmp/l' }).length, 2)
})

test('tela fixa, tamanho máximo, sem áudio e limites', () => {
  const p = presetPersonalizado({ nome: 'Story leve', formato: 'mp4', codec: 'hevc', tamanho: 'tela', largura: 721, altura: 99999, qualidade: 'tamanho', mb: 0, audio: 'nenhum' })
  assert.deepEqual(p.video.quadro, { largura: 722, altura: 8192 })
  assert.equal(p.tamanhoMax, 1e6)
  const plano = planejar({ ...origem, duracao: 5 }, p)
  assert.equal(plano.audio, null)
  assert.throws(() => presetPersonalizado({ nome: '   ' }), (e) => e.campo === 'nome')
})

test('só áudio: MP3 192, WAV 16 bits', () => {
  const mp3 = presetPersonalizado({ nome: 'Podcast', formato: 'mp3', audioKbps: 192, canais: 1 })
  const plano = planejar(origem, mp3)
  assert.equal(plano.audio.bitrate, 192_000)
  assert.equal(plano.audio.canais, 1)
  const wav = presetPersonalizado({ nome: 'Edição', formato: 'wav', audio: 'pcm-s16' })
  assert.equal(planejar(origem, wav).audio.codec, 'pcm-s16')
})

test('levar e trazer (.relay.json): ida e volta igual, lixo recusado', () => {
  const a = presetPersonalizado({ ...especificacaoDe(preset('reels')), nome: 'Reels da marca', kbps: 9000 })
  const b = presetPersonalizado({ nome: 'Voz', formato: 'm4a', audioKbps: 128 })
  const json = JSON.parse(JSON.stringify(exportar([a, b])))
  const { presets, recusados } = importar(json)
  assert.equal(recusados, 0)
  assert.deepEqual(presets.map((p) => p.id), [a.id, b.id])
  assert.deepEqual(planejar(origem, presets[0]), planejar(origem, a))
  assert.equal(importar([{ nome: '' }, { nome: 'ok', id: '<script>' }]).recusados, 1)
  assert.match(importar([{ nome: 'ok', id: '<script>' }]).presets[0].id, /^meu-/)
  assert.throws(() => importar({ outra: 'coisa' }))
})
