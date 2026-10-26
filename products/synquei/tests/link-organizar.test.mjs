// "Abrir no Synquei" (desktop/link-organizar.cjs): o link synquei://organizar que o SOBEDESCE abre.

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
  assert.deepEqual(lerLinkOrganizar(link), { pasta: abs, tipo: 'casamento' })
})

test('tipo desconhecido vira null; pasta relativa, outro host ou outro esquema são recusados', () => {
  assert.deepEqual(lerLinkOrganizar(`synquei://organizar?${new URLSearchParams({ pasta: abs, tipo: 'constructor' })}`), { pasta: abs, tipo: null })
  assert.equal(lerLinkOrganizar('synquei://organizar?pasta=relativa/pasta'), null)
  assert.equal(lerLinkOrganizar(`synquei://app/?${new URLSearchParams({ pasta: abs })}`), null)
  assert.equal(lerLinkOrganizar(`https://organizar/?${new URLSearchParams({ pasta: abs })}`), null)
  assert.equal(lerLinkOrganizar('synquei://organizar'), null)
  assert.equal(lerLinkOrganizar('não é link'), null)
})

test('acha o link no argv do Windows', () => {
  assert.equal(linkNoArgv(['Synquei.exe', '--x', 'synquei://organizar?pasta=C%3A%5CP']), 'synquei://organizar?pasta=C%3A%5CP')
  assert.equal(linkNoArgv(['Synquei.exe']), null)
})

test('os tipos do link são os mesmos do app (id e nome)', () => {
  assert.deepEqual(TIPOS, Object.fromEntries(TIPOS_APP.map((t) => [t.id, t.label])))
})
