// "Preparar no Synquei" (desktop/link-organizar.cjs): o link synquei://organizar que o SOBEDESCE abre.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { TIPOS as TIPOS_APP } from '../app/js/tipos.js'

const require = createRequire(import.meta.url)
const { TIPOS, lerLinkOrganizar, linkNoArgv } = require('../desktop/link-organizar.cjs')

const abs = path.resolve('/Volumes/HD/Casamento Ana')

test('lê a pasta e o tipo do link', () => {
  const link = `synquei://organizar?${new URLSearchParams({ pasta: abs, tipo: 'casamento' })}`
  assert.deepEqual(lerLinkOrganizar(link), { pasta: abs, tipo: 'casamento', op: null })
})

test('tipo desconhecido vira null; pasta relativa, outro host ou outro esquema são recusados', () => {
  assert.deepEqual(lerLinkOrganizar(`synquei://organizar?${new URLSearchParams({ pasta: abs, tipo: 'constructor' })}`), { pasta: abs, tipo: null, op: null })
  assert.equal(lerLinkOrganizar('synquei://organizar?pasta=relativa/pasta'), null)
  assert.equal(lerLinkOrganizar(`synquei://app/?${new URLSearchParams({ pasta: abs })}`), null)
  assert.equal(lerLinkOrganizar(`https://organizar/?${new URLSearchParams({ pasta: abs })}`), null)
  assert.equal(lerLinkOrganizar('synquei://organizar'), null)
  assert.equal(lerLinkOrganizar('não é link'), null)
})

test('op do download do Drive: só letras, números, _ e -; estranho = link recusado', () => {
  const link = (op) => `synquei://organizar?${new URLSearchParams({ pasta: abs, op })}`
  assert.deepEqual(lerLinkOrganizar(link('bLote_01-x')), { pasta: abs, tipo: null, op: 'bLote_01-x' })
  for (const ruim of ['../etc', 'a b c d e', 'curto', 'x'.repeat(101), 'ok123\u0000', 'lote&pasta=/']) assert.equal(lerLinkOrganizar(link(ruim)), null, ruim)
  // acentos, espaço, #, &, % e emoji na pasta passam inteiros
  const pasta = path.resolve('/Volumes/HD 1/Gravação #2 & 50% 🎬')
  assert.equal(lerLinkOrganizar(`synquei://organizar?${new URLSearchParams({ pasta, op: 'bLote00001' })}`).pasta, pasta)
})

test('acha o link no argv do Windows', () => {
  assert.equal(linkNoArgv(['Synquei.exe', '--x', 'synquei://organizar?pasta=C%3A%5CP']), 'synquei://organizar?pasta=C%3A%5CP')
  assert.equal(linkNoArgv(['Synquei.exe']), null)
})

test('os tipos do link são os mesmos do app (id e nome)', () => {
  assert.deepEqual(TIPOS, Object.fromEntries(TIPOS_APP.map((t) => [t.id, t.label])))
})
