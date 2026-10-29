import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkMaxima } from '../src/link.js'
import { especificacaoDe, presetPersonalizado } from '../src/personalizado.js'
import { preset } from '../src/presets.js'

test('máxima qualidade: ids do Relay no link, "Tamanho exato" fica de fora, fichas da pessoa em base64url', () => {
  const meu = presetPersonalizado({ ...especificacaoDe(preset('reels')), nome: 'Reels da marca', kbps: 9000 })
  const { link, levados, fora } = linkMaxima(['youtube-1080', 'tamanho', meu.id, 'mp3'], [meu])
  const u = new URL(link)
  assert.equal(u.protocol, 'sobedesce:')
  assert.equal(u.hostname, 'relay')
  assert.equal(u.searchParams.get('presets'), 'youtube-1080,mp3')
  const fichas = JSON.parse(Buffer.from(u.searchParams.get('meus').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  assert.equal(fichas[0].nome, 'Reels da marca')
  assert.equal(fichas[0].kbps, 9000)
  assert.deepEqual(levados, ['YouTube 1080p', 'Reels da marca', 'MP3 320'])
  assert.deepEqual(fora, ['Tamanho exato'])
})

test('no máximo 8 destinos; acentos e símbolos no nome passam inteiros', () => {
  const muitos = ['youtube-1080', 'youtube-1440', 'youtube-4k', 'shorts', 'reels', 'feed', 'tiktok', 'whatsapp', 'vimeo', 'hevc']
  const { levados, fora } = linkMaxima(muitos)
  assert.equal(levados.length, 8)
  assert.deepEqual(fora, ['Vimeo', 'Apple HEVC'])
  const meu = presetPersonalizado({ nome: 'Ação & Ç/ã ✓', formato: 'mp3', audioKbps: 192 })
  const u = new URL(linkMaxima([meu.id], [meu]).link)
  const f = JSON.parse(Buffer.from(u.searchParams.get('meus').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  assert.equal(f[0].nome, 'Ação & Ç/ã ✓')
})
