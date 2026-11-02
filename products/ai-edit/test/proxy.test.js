import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ACCEPT_RAW, baseDe, ehRaw, parear, proxiesNaPasta } from '../src/proxy.js'
import { paraFcpxml } from '../src/exportar/fcpxml.js'
import { novoProjeto } from '../src/projeto.js'

const e = (nome, relativo = '') => ({ nome, relativo })

test('RAW de câmera pelo nome; arquivo de controle do Mac não conta', () => {
  for (const n of ['B001_08180431_C001.braw', 'A.R3D', 'x.ari', 'y.crm', 'z.NEV']) assert.ok(ehRaw(n), n)
  for (const n of ['._B001_C001.braw', 'B001.mov', 'B001.braw.txt']) assert.ok(!ehRaw(n), n)
  assert.equal(baseDe('B001_C001_Proxy.mp4'), 'b001_c001')
  assert.equal(baseDe('B001_C001.BRAW'), 'b001_c001')
})

test('parear: o RAW encontra o proxy de mesmo nome (subpasta Proxy primeiro) e o proxy não entra solto', () => {
  const r = parear([
    e('B001_C001.braw', 'Cartao/B001_C001.braw'),
    e('B001_C001.mov', 'Cartao/B001_C001.mov'),
    e('B001_C001.mp4', 'Cartao/Proxy/B001_C001.mp4'),
    e('B001_C002.braw'),
    e('._B001_C002.braw'),
    e('musica.wav'),
    e('B-roll.mp4'),
  ])
  assert.deepEqual(r.pares.map((x) => [x.original.nome, x.proxy.relativo]), [['B001_C001.braw', 'Cartao/Proxy/B001_C001.mp4']])
  assert.deepEqual(r.semProxy.map((x) => x.nome), ['B001_C002.braw'])
  // o .mov de mesmo nome que não foi escolhido como proxy segue como mídia; o pareado não
  assert.deepEqual(r.outras.map((x) => x.nome), ['B001_C001.mov', 'musica.wav', 'B-roll.mp4'])
})

test('proxiesNaPasta: da pasta do cartão só sai o proxy dos RAW que faltavam', () => {
  const faltam = [e('B001_C001.braw'), e('B001_C002.braw')]
  const pasta = [e('B001_C001.mp4', 'Cartao/Proxy/B001_C001.mp4'), e('B001_C009.mp4', 'Cartao/Proxy/B001_C009.mp4'), e('B001_C001.braw', 'Cartao/B001_C001.braw')]
  const r = proxiesNaPasta(faltam, pasta)
  assert.deepEqual(r.pares.map((x) => x.original.nome), ['B001_C001.braw'])
  assert.deepEqual(r.faltam.map((x) => x.nome), ['B001_C002.braw'])
})

test('o seletor aceita RAW e a pasta do cartão; o FCPXML aponta para o original, não para o proxy', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  const accept = /id="arquivo" accept="([^"]+)"/.exec(html)[1].split(',')
  for (const x of ACCEPT_RAW.split(',')) assert.ok(accept.includes(x), x)
  assert.match(html, /id="pastaProxy" webkitdirectory/)
  const m = { id: 'm1', nome: 'B001_C001.braw', caminho: '/Volumes/Cartao/B001_C001.braw', proxy: { nome: 'B001_C001.mp4', caminho: null }, duracao: 2, quadros: 48, temVideo: true, temAudio: true, largura: 1920, altura: 1080, fps: 24 }
  const x = paraFcpxml(novoProjeto({ midias: [m] }))
  assert.match(x, /B001_C001\.braw/)
  assert.doesNotMatch(x, /B001_C001\.mp4/)
})
